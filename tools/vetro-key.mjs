#!/usr/bin/env node
// Pair this computer with Vetro's sign-in (garage-auth) and keep the key for the other tools.
//
//   TV=192.168.1.50 node tools/vetro-key.mjs          the TV shows a 6-digit code; type it here
//   TV=192.168.1.50 node tools/vetro-key.mjs 123456   finish a pairing started without a terminal
//
// The key is saved in tools/.vetro-key (git-ignored, readable only by you), or set VETRO_KEY instead.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {fileURLToPath} from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.join(DIR, '.vetro-key');
const PENDING_FILE = path.join(DIR, '.vetro-pairing');

export function vetroUrl() {
  const tv = (process.env.TV || '').replace(/:\d+$/, '');
  if (!tv) { console.error('Set TV to your TV\'s IP, e.g.  TV=192.168.1.50'); process.exit(1); }
  return `http://${tv}:8099`;
}
export function vetroHeaders() {
  const key = process.env.VETRO_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '');
  return key ? {Authorization: 'Bearer ' + key} : {};
}

async function post(p, body) {
  const r = await fetch(vetroUrl() + p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
async function confirm(id, code) {
  const d = await post('/auth/confirm', {id, code});
  fs.writeFileSync(KEY_FILE, d.token + '\n', {mode: 0o600});
  fs.rmSync(PENDING_FILE, {force: true});
  console.log('Paired. Key saved in tools/.vetro-key');
}

export async function pair() {
  const code = process.argv.slice(2).find(a => /^\d{6}$/.test(a));
  if (code) {
    if (!fs.existsSync(PENDING_FILE)) throw new Error('No pairing in progress; run without a code first');
    return confirm(fs.readFileSync(PENDING_FILE, 'utf8').trim(), code);
  }
  const {id} = await post('/auth/pair', {name: 'Garage tools'});
  if (!process.stdin.isTTY) {
    fs.writeFileSync(PENDING_FILE, id, {mode: 0o600});
    console.log('The TV now shows a 6-digit code (2 minutes). Finish with:  node tools/vetro-key.mjs <code>');
    return;
  }
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  const typed = (await rl.question('Code shown on the TV: ')).replace(/\D/g, '');
  rl.close();
  return confirm(id, typed);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  pair().catch(e => { console.error('Pairing failed: ' + e.message); process.exit(1); });
}
