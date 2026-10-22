/* Garage Player data layer: settings, playlists (M3U / Xtream), channel cache, favorites, folders, EPG.
   ES2017 only: Tizen 6 is Chromium 76. */
var GP = window.GP || {};
(function () {
  'use strict';

  var hasTizen = typeof tizen !== 'undefined';
  // Vetro on the TV fetches for us when a provider blocks cross-origin requests.
  // Vetro on the TV fetches for providers that block apps; the desktop preview sets GP_PROXY.
  // Standalone builds (GARAGE_CONFIG.standalone, e.g. without Vetro) load everything directly.
  function proxyBase() {
    if (window.GP_PROXY) return window.GP_PROXY;
    return (window.GARAGE_CONFIG || {}).standalone ? null : 'http://127.0.0.1:8099/proxy?url=';
  }
  var WEB_LINK = /(twitch\.tv|youtube\.com|youtu\.be|facebook\.com|dailymotion\.com)\//i;
  var EPG_HOURS = 12;
  var ADULT = /(^|[^a-z])(adult|adults|xxx|18\+|porn|erotic|for adults|\+18|sex)([^a-z]|$)/i;

  /* ---------- small key/value store ---------- */
  function get(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem('gp.' + key)); return v === null || v === undefined ? fallback : v; }
    catch (e) { return fallback; }
  }
  function set(key, value) { try { localStorage.setItem('gp.' + key, JSON.stringify(value)); } catch (e) {} }

  /* ---------- IndexedDB for big things (channel lists, EPG) ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, ko) {
      var req = indexedDB.open('garageplayer', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('blobs'); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { ko(req.error); };
    });
    return dbp;
  }
  function dbGet(key) {
    return db().then(function (d) {
      return new Promise(function (ok) {
        var r = d.transaction('blobs').objectStore('blobs').get(key);
        r.onsuccess = function () { ok(r.result || null); };
        r.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }
  function dbSet(key, value) {
    return db().then(function (d) {
      return new Promise(function (ok) {
        var t = d.transaction('blobs', 'readwrite');
        t.objectStore('blobs').put(value, key);
        t.oncomplete = ok; t.onerror = ok;
      });
    }).catch(function () {});
  }
  function dbDelete(key) {
    return db().then(function (d) { d.transaction('blobs', 'readwrite').objectStore('blobs').delete(key); }).catch(function () {});
  }

  /* ---------- fetching (direct first, then through Vetro) ---------- */
  // Vetro's own failures come back as {"error": "..."}; turn the common ones into something a viewer can act on.
  function proxyError(r, url) {
    return r.text().then(function (body) {
      var msg = '';
      try { msg = JSON.parse(body).error || ''; } catch (e) {}
      if (/WRONG_VERSION_NUMBER|EPROTO/i.test(msg) && /^https:/i.test(url)) return new Error('This server does not support https. Add the playlist again with http:// instead');
      if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return new Error('Server not found. Check the address');
      if (/ECONNREFUSED/i.test(msg)) return new Error('The server refused the connection. Check the address and port');
      if (r.status === 504) return new Error('The server did not answer');
      return new Error('HTTP ' + r.status + (msg ? ': ' + msg.split('\n')[0].slice(0, 80) : ''));
    }, function () { return new Error('HTTP ' + r.status); });
  }
  function fetchResponse(url, ua) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }).catch(function (direct) {
      var PROXY = proxyBase();
      if (!PROXY) throw /fetch/i.test(direct.message) ? new Error("Couldn't reach this server. Check the address, or try http:// instead of https://") : direct;
      return fetch(PROXY + encodeURIComponent(url) + (ua ? '&ua=' + encodeURIComponent(ua) : ''), {headers: {'X-Garage-App': '1'}}).then(function (r) {
        if (!r.ok) return proxyError(r, url).then(function (e) { throw e; });
        return r;
      }, function () {
        // The provider blocks cross-origin requests and Vetro isn't answering: say that, not "Failed to fetch".
        throw /fetch/i.test(direct.message) ? new Error('Vetro is not running (needed for this provider). Press Home, then Refresh channels') : direct;
      });
    });
  }

  /* ---------- playlists ---------- */
  function playlists() { return get('playlists', []); }
  function savePlaylists(list) { set('playlists', list); }
  function activePlaylist() {
    var list = playlists(), id = get('active', null);
    return list.filter(function (p) { return p.id === id; })[0] || list[0] || null;
  }
  function playlistUrl(p) {
    if (p.type !== 'xtream') return p.url;
    return p.server.replace(/\/+$/, '') + '/get.php?username=' + encodeURIComponent(p.user) +
      '&password=' + encodeURIComponent(p.pass) + '&type=m3u_plus&output=ts';
  }
  function xtreamEpg(p) {
    return p.server.replace(/\/+$/, '') + '/xmltv.php?username=' + encodeURIComponent(p.user) + '&password=' + encodeURIComponent(p.pass);
  }

  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36); }

  // Parses #EXTM3U text into channels. Group comes from group-title or a preceding #EXTGRP.
  function parseM3U(text) {
    var lines = text.split(/\r?\n/), out = [], meta = null, header = {}, seen = {};
    var first = lines[0] || '';
    var tvg = /(?:x-tvg-url|url-tvg)="([^"]*)"/i.exec(first);
    if (tvg) header.epg = tvg[1].split(',').map(function (u) { return u.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTINF') === 0) {
        var comma = line.lastIndexOf('",') >= 0 ? line.indexOf(',', line.lastIndexOf('"')) : line.indexOf(',');
        var attrs = {}, re = /([\w-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line))) attrs[m[1].toLowerCase()] = m[2];
        meta = {
          name: (comma >= 0 ? line.slice(comma + 1) : attrs['tvg-name'] || '').replace(/\s*[ⓈⓉⓎⒼⓋⒷ]+\s*$/, '').trim() || attrs['tvg-name'] || 'Channel',
          logo: attrs['tvg-logo'] || '', tvgId: attrs['tvg-id'] || '', group: attrs['group-title'] || meta && meta.group || ''
        };
      } else if (line.indexOf('#EXTGRP:') === 0) {
        if (meta) meta.group = line.slice(8).trim();
      } else if (line[0] !== '#' && meta) {
        var id = hash(line);
        if (!seen[id]) {
          seen[id] = true;
          out.push({id: id, name: meta.name, logo: meta.logo, tvgId: meta.tvgId, group: meta.group || 'Other', url: line, web: WEB_LINK.test(line)});
        }
        meta = null;
      }
    }
    out.forEach(function (c, i) { c.num = i + 1; });
    return {channels: out, epg: header.epg || []};
  }

  // Loads the active playlist's channels: from cache unless `refresh`, else downloads and caches.
  function loadChannels(refresh) {
    var p = activePlaylist();
    if (!p) return Promise.resolve({channels: [], epg: [], playlist: null});
    var key = 'pl:' + p.id;
    var cached = refresh ? Promise.resolve(null) : dbGet(key);
    return cached.then(function (c) {
      if (c && c.channels && c.channels.length) return Object.assign({playlist: p, cached: true}, c);
      return fetchResponse(playlistUrl(p), p.ua).then(function (r) { return r.text(); }).then(function (text) {
        if (text.indexOf('#EXTINF') < 0) throw new Error('This address does not return an M3U playlist');
        var parsed = parseM3U(text);
        var record = {at: Date.now(), channels: parsed.channels, epg: parsed.epg};
        return dbSet(key, record).then(function () { return Object.assign({playlist: p}, record); });
      });
    });
  }

  /* ---------- favorites, folders, recent, hidden ---------- */
  function toggleIn(key, id, on) {
    var list = get(key, []).filter(function (x) { return x !== id; });
    if (on) list.push(id);
    set(key, list);
    return on;
  }
  var library = {
    favorites: function () { return get('fav', []); },
    isFavorite: function (id) { return get('fav', []).indexOf(id) >= 0; },
    setFavorite: function (id, on) { return toggleIn('fav', id, on); },
    recent: function () { return get('recent', []); },
    pushRecent: function (id) {
      var list = get('recent', []).filter(function (x) { return x !== id; });
      list.unshift(id); set('recent', list.slice(0, 30));
    },
    hiddenChannels: function () { return get('hiddenCh', []); },
    setHiddenChannel: function (id, on) { return toggleIn('hiddenCh', id, on); },
    folders: function () { return get('folders', []); },
    saveFolders: function (f) { set('folders', f); },
    groupPrefs: function () {
      var g = get('groups', {});
      return {hidden: g.hidden || [], order: g.order || [], locked: g.locked || [], adultOpen: g.adultOpen || []};
    },
    saveGroupPrefs: function (g) { set('groups', g); },
    // Parental lock: explicit locks, plus adult-looking groups unless the owner removed that lock.
    isAdultName: function (name) { return ADULT.test(name || ''); },
    isGroupLocked: function (g) {
      var p = library.groupPrefs();
      if (p.locked.indexOf(g) >= 0) return true;
      return get('settings', {}).autoLockAdult !== false && ADULT.test(g) && p.adultOpen.indexOf(g) < 0;
    },
    setGroupLocked: function (g, on) {
      var p = library.groupPrefs();
      p.locked = p.locked.filter(function (x) { return x !== g; });
      p.adultOpen = p.adultOpen.filter(function (x) { return x !== g; });
      if (on) p.locked.push(g); else if (ADULT.test(g)) p.adultOpen.push(g);
      set('groups', p);
    },
    pinHash: function () { return get('pin', null); },
    setPin: function (pin) { set('pin', hash('gp-pin:' + pin)); },
    checkPin: function (pin) { return get('pin', null) === hash('gp-pin:' + pin); },
    resetFolders: function () { set('groups', {}); set('hiddenCh', []); var f = get('folders', []); f.forEach(function (x) { x.locked = false; }); set('folders', f); },
    resetAll: function () {
      Object.keys(localStorage).filter(function (k) { return k.indexOf('gp.') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
      try { indexedDB.deleteDatabase('garageplayer'); } catch (e) {}
    }
  };

  /* ---------- EPG (XMLTV, optionally gzip), kept for the next few hours ---------- */
  // XMLTV time "20261022183000 +0200" -> ms
  function xmltvTime(s) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(s || '');
    if (!m) return 0;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (m[7]) { var sign = m[7][0] === '-' ? -1 : 1; t -= sign * (+m[7].slice(1, 3) * 60 + +m[7].slice(3)) * 60000; }
    return t;
  }
  function unescapeXml(s) {
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&');
  }

  // EPG ids rarely match playlist ids exactly ("News24.al" vs "News.24.al"): compare letters and digits only.
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // Streams one XMLTV source and adds programmes for `wanted` keys (normalised ids or names) to `into`.
  function readEpg(url, wanted, into, ua) {
    var names = {};   // epg channel id -> normalised display name
    var now = Date.now(), until = now + EPG_HOURS * 3600000, buffer = '', decoder = new TextDecoder('utf-8');
    var inflater = null, gz = null;
    function scan(text, final) {
      buffer += text;
      var end;
      var cend;
      while ((cend = buffer.indexOf('</channel>')) >= 0 && (buffer.indexOf('<programme') < 0 || cend < buffer.indexOf('<programme'))) {
        var cblock = buffer.slice(buffer.lastIndexOf('<channel', cend), cend);
        var cid = /id="([^"]*)"/.exec(cblock), dn = /<display-name[^>]*>([\s\S]*?)<\/display-name>/.exec(cblock);
        if (cid && dn) names[cid[1]] = norm(unescapeXml(dn[1]));
        buffer = buffer.slice(cend + 10);
      }
      while ((end = buffer.indexOf('</programme>')) >= 0) {
        var startIdx = buffer.lastIndexOf('<programme', end);
        var block = startIdx >= 0 ? buffer.slice(startIdx, end) : '';
        buffer = buffer.slice(end + 12);
        if (!block) continue;
        var ch = /channel="([^"]*)"/.exec(block);
        if (!ch) continue;
        var key = wanted[norm(ch[1])] ? norm(ch[1]) : wanted[names[ch[1]]] ? names[ch[1]] : null;
        if (!key) continue;
        var st = xmltvTime((/start="([^"]*)"/.exec(block) || [])[1]);
        var sp = xmltvTime((/stop="([^"]*)"/.exec(block) || [])[1]);
        if (sp < now || st > until) continue;
        var title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block);
        var desc = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(block);
        (into[key] = into[key] || []).push([st, sp, title ? unescapeXml(title[1]) : '', desc ? unescapeXml(desc[1]).slice(0, 400) : '']);
      }
      // Keep memory flat: drop text that cannot contain a programme we still need.
      if (buffer.length > 200000) buffer = buffer.slice(buffer.lastIndexOf('<programme') >= 0 ? buffer.lastIndexOf('<programme') : buffer.length - 1000);
      if (final) buffer = '';
    }
    return fetchResponse(url, ua).then(function (r) {
      var reader = r.body.getReader();
      function pump() {
        return reader.read().then(function (step) {
          if (step.done) { if (!inflater) scan(decoder.decode(), true); return; }
          var chunk = step.value;
          if (gz === null) gz = chunk[0] === 0x1f && chunk[1] === 0x8b;
          if (gz) {
            if (!inflater) {
              inflater = new pako.Inflate();
              inflater.onData = function (out) { scan(decoder.decode(out, {stream: true}), false); };
            }
            inflater.push(chunk, false);
            if (inflater.err) throw new Error('EPG could not be unpacked');
          } else {
            scan(decoder.decode(chunk, {stream: true}), false);
          }
          return pump();
        });
      }
      return pump();
    });
  }

  function epgSources(info) {
    var p = info.playlist, custom = (p && p.epg || '').split(/[\s,]+/).filter(Boolean);
    if (custom.length) return custom;
    if (p && p.type === 'xtream') return [xtreamEpg(p)];
    if (info.epg && info.epg.length) return info.epg.slice(0, 2);   // big multi-source headers: only the first two
    // An Xtream server's M3U link (…/get.php?username=…&password=…) has its guide next to it at xmltv.php.
    var x = p && /^(https?:\/\/[^?#]+\/)get\.php\?(.*)$/i.exec(p.url || '');
    if (x && /(^|&)username=/.test(x[2]) && /(^|&)password=/.test(x[2])) {
      return [x[1] + 'xmltv.php?' + x[2].split('&').filter(function (kv) { return /^(username|password)=/.test(kv); }).join('&')];
    }
    return [];
  }

  // Returns {tvgId: [[start, stop, title, desc], ...]}; cached for 6 hours.
  function loadEpg(info, refresh) {
    var sources = epgSources(info);
    if (!sources.length) return Promise.resolve({});
    var key = 'epg:' + info.playlist.id;
    return (refresh ? Promise.resolve(null) : dbGet(key)).then(function (c) {
      if (c && Date.now() - c.at < 6 * 3600000 && c.src === sources.join(',')) return c.data;
      var wanted = {};
      info.channels.forEach(function (ch) { [norm(ch.tvgId), norm(ch.name)].forEach(function (k) { if (k) wanted[k] = true; }); });
      var data = {}, loaded = 0;
      return sources.reduce(function (chain, url) {
        return chain.then(function () { return readEpg(url, wanted, data, info.playlist.ua).then(function () { loaded++; }, function () {}); });
      }, Promise.resolve()).then(function () {
        Object.keys(data).forEach(function (k) { data[k].sort(function (a, b) { return a[0] - b[0]; }); });
        if (!loaded) return c ? c.data : data;   // nothing downloaded: keep the old guide, don't cache an empty one
        return dbSet(key, {at: Date.now(), src: sources.join(','), data: data}).then(function () { return data; });
      });
    });
  }

  // The channel's programmes that haven't ended yet, current one first.
  function schedule(epg, channel) {
    var list = channel && ((channel.tvgId && epg[norm(channel.tvgId)]) || epg[norm(channel.name)]), now = Date.now();
    return (list || []).filter(function (p) { return p[1] > now; });
  }

  function nowNext(epg, channel) {
    var list = channel && ((channel.tvgId && epg[norm(channel.tvgId)]) || epg[norm(channel.name)]), now = Date.now();
    if (!list) return [null, null];
    for (var i = 0; i < list.length; i++) {
      if (list[i][1] > now) return list[i][0] <= now ? [list[i], list[i + 1] || null] : [null, list[i]];
    }
    return [null, null];
  }

  GP.data = {
    get: get, set: set, playlists: playlists, savePlaylists: savePlaylists, activePlaylist: activePlaylist,
    loadChannels: loadChannels, parseM3U: parseM3U, loadEpg: loadEpg, nowNext: nowNext, schedule: schedule, library: library,
    dropCache: function (id) { dbDelete('pl:' + id); dbDelete('epg:' + id); }, hash: hash
  };
  window.GP = GP;
})();
