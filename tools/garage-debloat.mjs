#!/usr/bin/env node
// Garage debloat: turns off ads, tracking, voice assistants, hotel/demo parts and other extras on a
// Samsung Tizen TV through Vetro (root). Uses Vetro's own catalogue roles (from the firmware manifests).
//
//   node tools/garage-debloat.mjs                 dry run: show what the "clean" profile would turn off
//   node tools/garage-debloat.mjs --extras        dry run including the optional extras
//   node tools/garage-debloat.mjs --apply [--extras]   do it (saves a restore file first)
//   node tools/garage-debloat.mjs --restore tools/debloat-restore-<time>.json   turn everything back on
//
// Only "disable" (pkgcmd -D, reversible with -A) and "stop" are used; nothing is uninstalled.
// Never touched: components Vetro marks Keep or protected, your own apps, Vetro and Garage apps.

import fs from 'node:fs';
import path from 'node:path';
import {vetroUrl, vetroHeaders} from './vetro-key.mjs';

const VETRO = vetroUrl();   // needs a paired key: run tools/vetro-key.mjs once
const TV = new URL(VETRO).hostname;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply'), EXTRAS = args.includes('--extras');
const RESTORE = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : null;
const SWITCHES_ONLY = args.includes('--switches-only');   // apply only the Samsung off switches

// Never disable these, whatever the catalogue says.
const NEVER = [/^vetrotvapp/, /^GarageHome/, /^GaragePlay/, /coba\.adagent/, /^org\.tizen\.tv-viewer/, /^com\.samsung\.tv\.csfs$/,
  /^org\.tizen\.menu$/, /coba\.(setting|source|livetv)/, /^com\.samsung\.tv\.store$/, /lightweight-node-service/,
  /privacychoice/i, /PrivacyChoices/,   // needed to withdraw the viewing-data consent in Settings
  /tts-engine/];                         // Voice Guide (accessibility) speech

// Voice is switched off as Vetro's quick-setting groups (disables the group and stops what runs).
const VOICE_GROUPS = ['alexa', 'google', 'bixby', 'voice'];

// Extra Samsung services worth turning off on an old TV (only with --extras, after a look at the list).
const EXTRA_IDS = [
  'com.samsung.tv.mde-framework',        // multi-device experience (phone ↔ TV continuity)
  'org.tizen.easysetup-daemon',          // first-time setup over the phone app
  'com.samsung.tv.multiscreen',          // multi view / screen sharing UI
];
const EXTRA_AREAS = ['ambient'];         // Ambient / art mode content

// Built-in services Vetro won't disable ("not supported for this system component") but that start or
// restart themselves and use memory: switch off their start-at-boot / auto-restart flags and stop them.
// Original flags are backed up on the TV in /home/owner/share/vetro/startup-backups/<id>.garage.
const NO_AUTOSTART = ['com.samsung.tv.cis-api-service-app'];          // ACR content-information service
const NO_AUTOSTART_EXTRAS = ['org.tizen.easysetup-daemon'];           // phone-app setup daemon
const DB = '/opt/dbspace/.pkgmgr_parser.db', BK = '/home/owner/share/vetro/startup-backups';

// Samsung's own off switches: these systemd services carry
// ConditionPathExists=!/opt/usr/share/systemd/system/<name>, so an empty file with that name stops them
// starting at boot. Deleting the file turns them back on. (Left alone: AirPlay, slive-provider, pisa/adagent.)
const OFF_SWITCH_DIR = '/opt/usr/share/systemd/system';
const OFF_SWITCHES = ['canalysis-daemon', 'com.samsung.tv.context-aware-agent', 'com.samsung.tv.context-aware-service', 'bms',
  'com.samsung.tv.ghdaemon', 'com.samsung.tv.ondevice-voice', 'org.tizen.voice-app', 'samsunghealth-service-tv'];
const offSwitchCmd = names => `mkdir -p ${OFF_SWITCH_DIR} && for n in ${names.join(' ')}; do [ -e ${OFF_SWITCH_DIR}/$n ] && echo "$n already off" || { : > ${OFF_SWITCH_DIR}/$n && echo "$n off"; }; done`;
const onSwitchCmd = names => `for n in ${names.join(' ')}; do rm -f ${OFF_SWITCH_DIR}/$n && echo "$n on"; done`;
const exec = cmd => post('/exec', {cmd});
const noAutostartCmd = ids => `mkdir -p ${BK} && for id in ${ids.join(' ')}; do [ -f ${BK}/$id.garage ] || sqlite3 -readonly ${DB} "SELECT app_onboot,app_autorestart FROM package_app_info WHERE app_id='$id';" > ${BK}/$id.garage; ` +
  `sqlite3 -bail ${DB} "UPDATE package_app_info SET app_onboot='false', app_autorestart='false' WHERE app_id='$id';"; app_launcher -k $id >/dev/null 2>&1; echo "$id off"; done`;
const restoreAutostartCmd = ids => `for id in ${ids.join(' ')}; do f=${BK}/$id.garage; [ -f $f ] || continue; ob=$(cut -d'|' -f1 $f); ar=$(cut -d'|' -f2 $f); ` +
  `sqlite3 -bail ${DB} "UPDATE package_app_info SET app_onboot='$ob', app_autorestart='$ar' WHERE app_id='$id';"; echo "$id restored ($ob/$ar)"; done`;

function check(p, r) {
  if (r.status === 401) throw new Error('Vetro wants this computer paired first:  TV=<tv-ip> node tools/vetro-key.mjs');
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
}
async function get(p) { const r = await fetch(VETRO + p, {headers: vetroHeaders()}); check(p, r); return r.json(); }
async function post(p, body) {
  const r = await fetch(VETRO + p, {method: 'POST', headers: {'Content-Type': 'application/json', ...vetroHeaders()}, body: JSON.stringify(body)});
  if (r.status === 401) check(p, r);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
const mb = b => Math.round((b || 0) / 1048576);

async function memoryByApp() {
  const m = await get('/monitor?scope=full').catch(() => null);
  const procs = (m && (m.data || m).processes) || [], mem = {};
  for (const p of procs) if (p.appId) mem[p.appId] = (mem[p.appId] || 0) + (p.rssBytes || 0);
  return mem;
}

function plan(apps) {
  const byId = Object.fromEntries(apps.map(a => [a.appId, a]));
  const safe = a => a && !a.protected && !NEVER.some(re => re.test(a.appId)) && a.role !== 'keep'
    && !(a.origin === 'installed' && a.category === 'user');           // your own store apps
  const clean = apps.filter(a => safe(a) && (a.role === 'tracking' || a.role === 'unused'));
  const extras = EXTRAS ? apps.filter(a => safe(a) && (EXTRA_IDS.includes(a.appId) || EXTRA_AREAS.includes(a.area))) : [];
  const voice = apps.filter(a => safe(a) && a.area === 'voice');
  // Skip anything a still-enabled Keep component depends on.
  const blocked = a => (a.dependents || []).some(id => byId[id] && byId[id].role === 'keep' && !byId[id].disabled);
  const list = [...new Map([...clean, ...extras].map(a => [a.appId, a])).values()];
  return {
    disable: list.filter(a => !a.disabled && !blocked(a)),
    skipped: list.filter(a => !a.disabled && blocked(a)),
    already: list.filter(a => a.disabled),
    voice
  };
}

async function main() {
  if (RESTORE) return restore(RESTORE);
  if (SWITCHES_ONLY) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(path.dirname(new URL(import.meta.url).pathname), `debloat-restore-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify({tv: TV, at: new Date().toISOString(), offSwitches: OFF_SWITCHES}, null, 2));
    const d = await exec(offSwitchCmd(OFF_SWITCHES));
    console.log((d.output || '').trim());
    console.log(`Restore: node tools/garage-debloat.mjs --restore ${path.relative(process.cwd(), file)}`);
    return;
  }
  const status = await get('/status');
  if (!status.agent || !status.agent.connected) throw new Error("Vetro has no root. Set the TV's Host PC IP to 127.0.0.1 first.");
  const [{apps}, mem] = await Promise.all([get('/apps'), memoryByApp()]);
  const p = plan(apps);
  const row = a => `  ${String(mb(mem[a.appId]) || '').padStart(4)} MB  ${a.appId.padEnd(52)} ${a.role}/${a.area}  ${a.purpose ? '— ' + String(a.purpose).slice(0, 60) : ''}`;
  console.log(`\nProfile: ${EXTRAS ? 'clean + extras' : 'clean'}   (TV ${TV})\n`);
  console.log(`Voice assistants (Vetro groups ${VOICE_GROUPS.join(', ')}): ${p.voice.filter(a => !a.disabled).length} components on`);
  p.voice.filter(a => !a.disabled).forEach(a => console.log(row(a)));
  console.log(`\nWill disable and stop (${p.disable.length}):`); p.disable.forEach(a => console.log(row(a)));
  if (p.skipped.length) { console.log(`\nSkipped, a Keep component needs them (${p.skipped.length}):`); p.skipped.forEach(a => console.log(row(a))); }
  console.log(`\nNo autostart (built-in, can't be disabled): ${NO_AUTOSTART.concat(EXTRAS ? NO_AUTOSTART_EXTRAS : []).join(', ')}`);
  console.log(`Samsung off switches (systemd): ${OFF_SWITCHES.join(', ')}`);
  console.log(`\nAlready off: ${p.already.length}`);
  const saving = [...p.disable, ...p.voice].reduce((s, a) => s + (mem[a.appId] || 0), 0);
  console.log(`Running now in this list: ~${mb(saving)} MB of RAM\n`);
  if (!APPLY) { console.log('Dry run only. Add --apply to do it.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), `debloat-restore-${stamp}.json`);
  const autostartOff = NO_AUTOSTART.concat(EXTRAS ? NO_AUTOSTART_EXTRAS : []);
  fs.writeFileSync(file, JSON.stringify({tv: TV, at: new Date().toISOString(), voiceGroups: VOICE_GROUPS,
    disabled: p.disable.map(a => a.appId), autostartOff, offSwitches: OFF_SWITCHES}, null, 2));
  console.log(`Restore file: ${file}\n`);

  for (const g of VOICE_GROUPS) {
    try { await post('/quick', {id: g, off: true}); console.log(`  voice group ${g}: off`); }
    catch (e) { console.log(`  voice group ${g}: ${e.message}`); }
  }
  for (const a of p.disable) {
    try {
      await post('/debloat', {action: 'disable', appIds: [a.appId]});
      await post('/components/action', {action: 'stop', appId: a.appId}).catch(() => {});
      console.log(`  disabled ${a.appId}`);
    } catch (e) { console.log(`  could not disable ${a.appId}: ${e.message}`); }
  }
  try { const d = await exec(noAutostartCmd(autostartOff)); console.log((d.output || '').trim().split('\n').map(l => '  ' + l + ' (no autostart)').join('\n')); }
  catch (e) { console.log(`  could not change autostart flags: ${e.message}`); }
  try { const d = await exec(offSwitchCmd(OFF_SWITCHES)); console.log((d.output || '').trim().split('\n').map(l => '  ' + l + ' (Samsung off switch)').join('\n')); }
  catch (e) { console.log(`  could not set Samsung off switches: ${e.message}`); }
  console.log('\nDone. Restart the TV to free everything; restore with:');
  console.log(`  node tools/garage-debloat.mjs --restore ${path.relative(process.cwd(), file)}`);
}

async function restore(file) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const g of r.voiceGroups || []) {
    try { await post('/quick', {id: g, off: false}); console.log(`  voice group ${g}: on`); } catch (e) { console.log(`  voice group ${g}: ${e.message}`); }
  }
  if ((r.autostartOff || []).length) {
    try { const d = await exec(restoreAutostartCmd(r.autostartOff)); console.log((d.output || '').trim()); }
    catch (e) { console.log(`  could not restore autostart flags: ${e.message}`); }
  }
  if ((r.offSwitches || []).length) {
    try { const d = await exec(onSwitchCmd(r.offSwitches)); console.log((d.output || '').trim()); }
    catch (e) { console.log(`  could not remove Samsung off switches: ${e.message}`); }
  }
  for (const id of r.disabled || []) {
    try { await post('/debloat', {action: 'enable', appIds: [id]}); console.log(`  enabled ${id}`); }
    catch (e) { console.log(`  could not enable ${id}: ${e.message}`); }
  }
  console.log('Done. Restart the TV.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
