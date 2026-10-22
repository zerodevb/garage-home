/* Garage Player UI. Fixed 1920x1080, remote navigation. ES2017 only: Tizen 6 is Chromium 76. */
(function () {
  'use strict';

  var D = GP.data, P = GP.player, L = D.library;
  var hasTizen = typeof tizen !== 'undefined';
  var CONFIG = window.GARAGE_CONFIG || {};
  var TV_LAN_IP = CONFIG.tvIp || '';   // only a fallback: the TV normally reports its own address
  var VETRO = hasTizen ? 'http://127.0.0.1:8099' : 'http://' + (TV_LAN_IP || '127.0.0.1') + ':8099';
  var ROWS = 9, ROW_H = 88, FOLDER_PAGE = 12;
  var PREVIEW_RECT = [1176, 156, 648, 364];

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function settings() { return D.get('settings', {preview: true, hideWeb: true, mode: 'fit'}); }
  function saveSettings(s) { D.set('settings', s); }

  /* ---------- state ---------- */
  var info = {channels: [], epg: [], playlist: null}, epg = {}, byId = {}, numIndex = {};
  var folders = [], folderIndex = 0, channels = [], chIndex = 0, focusArea = 'folders', query = '';
  var watching = false, previewTimer = null, loading = true;
  var unlocked = {};   // folder keys opened with the PIN until Garage Player is left

  /* ---------- loading ---------- */
  function load(refresh) {
    status(refresh ? 'Refreshing playlist…' : 'Loading…');
    return D.loadChannels(refresh).then(function (res) {
      info = res;
      loading = false;
      byId = {}; numIndex = {};
      res.channels.forEach(function (c) { byId[c.id] = c; numIndex[c.num] = c; });
      buildFolders();
      var last = D.get('lastFolder', null);
      var at = folders.map(function (f) { return f.key; }).indexOf(last);
      folderIndex = at >= 0 ? at : 0;
      showFolder();
      status(res.playlist ? res.playlist.name + ' · ' + res.channels.length + ' channels' : '');
      if (!res.playlist) { openSettings(); return; }
      loadGuide(false);
    }).catch(function (e) {
      loading = false;
      status('');
      toast("The playlist didn't load: " + e.message);
      buildFolders(); showFolder();
    });
  }
  function loadGuide(refresh) {
    if (!info.playlist) return;
    D.loadEpg(info, refresh).then(function (data) {
      epg = data || {};
      renderList(); renderDetail();
      if (refresh) toast('Programme guide updated');
    }).catch(function () {});
  }

  /* ---------- folders ---------- */
  function visibleChannel(c) {
    if (settings().hideWeb && c.web) return false;
    return L.hiddenChannels().indexOf(c.id) < 0;
  }
  function channelLocked(c) { return L.isGroupLocked(c.group) && !unlocked['g:' + c.group]; }
  function folderLocked(f) {
    if (!f) return false;
    if (f.group !== undefined) return L.isGroupLocked(f.group) && !unlocked[f.key];
    if (f.custom) { var own = L.folders().filter(function (x) { return x.id === f.custom; })[0]; return !!(own && own.locked) && !unlocked[f.key]; }
    return false;
  }
  function lockIcon(f) {
    if (f.group !== undefined) return L.isGroupLocked(f.group);
    if (f.custom) { var own = L.folders().filter(function (x) { return x.id === f.custom; })[0]; return !!(own && own.locked); }
    return false;
  }
  function buildFolders() {
    var prefs = L.groupPrefs(), groups = [], seen = {};
    info.channels.forEach(function (c) { if (!seen[c.group]) { seen[c.group] = true; groups.push(c.group); } });
    groups.sort(function (a, b) {
      var ia = prefs.order.indexOf(a), ib = prefs.order.indexOf(b);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    folders = [];
    if (query) folders.push({key: 'search', name: 'Search: ' + query, icon: 'search'});
    folders.push({key: 'fav', name: 'Favorites', icon: 'star'});
    folders.push({key: 'recent', name: 'Recent', icon: 'clock'});
    L.folders().forEach(function (f) { folders.push({key: 'f:' + f.id, name: f.name, icon: 'folder', custom: f.id}); });
    folders.push({key: 'all', name: 'All channels', icon: 'list'});
    groups.filter(function (g) { return prefs.hidden.indexOf(g) < 0; }).forEach(function (g) { folders.push({key: 'g:' + g, name: g, icon: 'tv', group: g}); });
    folders.push({key: 'settings', name: 'Settings', icon: 'gear'});
    renderFolders();
  }
  function channelsFor(f) {
    var list;
    if (!f || folderLocked(f)) return [];
    if (f.key === 'search') {
      var q = query.toLowerCase();
      list = info.channels.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0 || c.group.toLowerCase().indexOf(q) >= 0 || String(c.num) === q; });
    } else if (f.key === 'fav') list = L.favorites().map(function (id) { return byId[id]; });
    else if (f.key === 'recent') list = L.recent().map(function (id) { return byId[id]; });
    else if (f.custom) list = ((L.folders().filter(function (x) { return x.id === f.custom; })[0] || {}).ids || []).map(function (id) { return byId[id]; });
    else if (f.key === 'all') list = info.channels;
    else if (f.group !== undefined) list = info.channels.filter(function (c) { return c.group === f.group; });
    else list = [];
    var mixed = f.group === undefined;   // search, favorites, recent, all, own folders
    return list.filter(function (c) { return c && visibleChannel(c) && !(mixed && channelLocked(c)); });
  }

  var ICONS = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    tv: '<rect x="2.5" y="6.5" width="19" height="13" rx="2.5"/><path d="M8 2.5l4 4 4-4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'
  };
  function icon(name) { return '<svg class="ico" viewBox="0 0 24 24">' + ICONS[name] + '</svg>'; }

  function renderFolders() {
    $('folders').innerHTML = folders.map(function (f, i) {
      return '<div class="folder' + (f.key === 'settings' ? ' gear' : '') + '" data-i="' + i + '">' + icon(f.icon) + '<span>' + esc(f.name) + '</span>' +
        (lockIcon(f) ? '<i class="lock">' + (unlocked[f.key] ? '' : icon('lock')) + '</i>' : '') + '</div>';
    }).join('');
    paintFolderFocus();
  }
  function paintFolderFocus() {
    var items = $('folders').children;
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('selected', i === folderIndex);
      items[i].classList.toggle('focused', i === folderIndex && focusArea === 'folders' && !watching);
    }
    var top = Math.max(0, folderIndex - 6) * 66;
    $('folders').style.transform = 'translateY(' + (-top) + 'px)';
  }
  function showFolder() {
    var f = folders[folderIndex];
    if (f && f.key === 'settings') {
      $('folderTitle').textContent = 'Settings';
      channels = [];
      chIndex = 0;
      renderList();
      $('empty').hidden = false;
      $('empty').textContent = 'Press OK to open settings: playlists, folders, hidden channels and more.';
      return;
    }
    channels = channelsFor(f);
    chIndex = Math.min(chIndex, Math.max(0, channels.length - 1));
    if (folderLocked(f)) {
      $('folderTitle').textContent = f.name;
      renderList(); renderDetail();
      $('empty').hidden = false;
      $('empty').textContent = 'This folder is locked. Press OK and enter the PIN to open it.';
      return;
    }
    if (f) D.set('lastFolder', f.key);
    $('folderTitle').textContent = f ? f.name + ' (' + channels.length + ')' : '';
    renderList();
    renderDetail();
  }

  /* ---------- channel list (only visible rows are drawn) ---------- */
  function renderList() {
    var empty = $('empty');
    var f = folders[folderIndex];
    if (f && f.key === 'settings') { $('list').innerHTML = ''; return; }
    if (!channels.length) {
      $('list').innerHTML = '';
      empty.hidden = false;
      if (folderLocked(f)) { empty.textContent = 'This folder is locked. Press OK and enter the PIN to open it.'; return; }
      empty.textContent = loading ? 'Loading channels…' : !info.playlist ? 'Add a playlist in Settings to start watching.'
        : f && f.key === 'fav' ? 'No favorites yet. Hold OK on a channel and choose Add to favorites.'
        : f && f.key === 'recent' ? 'Channels you watch appear here.'
        : f && f.custom ? 'This folder is empty. Hold OK on a channel and choose Add to folder.'
        : f && f.key === 'search' ? 'No channels match "' + query + '".' : 'No channels here.';
      return;
    }
    empty.hidden = true;
    var start = Math.max(0, Math.min(chIndex - Math.floor(ROWS / 2), channels.length - ROWS));
    var html = '';
    for (var i = start; i < Math.min(channels.length, start + ROWS); i++) {
      var c = channels[i], nn = D.nowNext(epg, c), now = nn[0];
      var pct = now ? Math.round(100 * (Date.now() - now[0]) / (now[1] - now[0])) : 0;
      html += '<div class="row' + (i === chIndex ? ' selected' : '') + (i === chIndex && focusArea === 'list' && !watching ? ' focused' : '') + '">' +
        '<span class="num">' + c.num + '</span>' +
        '<span class="logo">' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="" onerror="this.remove()">' : '') + '</span>' +
        '<span class="main"><b>' + esc(c.name) + (L.isFavorite(c.id) ? ' <i class="fav">★</i>' : '') + '</b>' +
        (now ? '<em>' + esc(now[2]) + '</em><span class="bar"><i style="width:' + pct + '%"></i></span>' : '<em class="muted">' + esc(c.group) + '</em>') +
        '</span></div>';
    }
    $('list').innerHTML = html;
  }

  function renderDetail() {
    var c = channels[chIndex];
    if (!c) { $('dName').textContent = ''; $('dGroup').textContent = ''; $('dNow').innerHTML = ''; $('dNext').innerHTML = ''; $('dDesc').textContent = ''; $('dLogo').style.visibility = 'hidden'; return; }
    var nn = D.nowNext(epg, c);
    $('dLogo').src = c.logo || '';
    $('dLogo').style.visibility = c.logo ? 'visible' : 'hidden';
    $('dName').textContent = c.num + '  ' + c.name;
    $('dGroup').textContent = c.group + (c.web ? ' · web link, may not play' : '');
    $('dNow').innerHTML = nn[0] ? '<span>' + hhmm(nn[0][0]) + '–' + hhmm(nn[0][1]) + '</span><b>' + esc(nn[0][2]) + '</b>' : '<span>Now</span><b class="muted">No programme information</b>';
    $('dNext').innerHTML = nn[1] ? '<span>' + hhmm(nn[1][0]) + '</span>' + esc(nn[1][2]) : '';
    $('dDesc').textContent = nn[0] ? nn[0][3] : '';
  }

  // Preview the focused channel after a short pause, so scrolling stays smooth.
  function schedulePreview() {
    clearTimeout(previewTimer);
    var c = channels[chIndex];
    if (!c || !settings().preview || watching) return;
    $('previewMsg').textContent = P.available ? '' : 'Video plays on the TV';
    previewTimer = setTimeout(function () {
      if (watching || channels[chIndex] !== c) return;
      if (P.current() !== c) { P.place(PREVIEW_RECT); P.play(c, info.playlist && info.playlist.ua); }
    }, 900);
  }

  /* ---------- watching ---------- */
  var infoTimer = null, lastChannel = null;
  function watch(c) {
    if (!c) return;
    var prev = P.current();
    if (prev && prev !== c) lastChannel = prev;
    watching = true;
    document.body.classList.add('watching');
    $('browse').hidden = true;
    $('watch').hidden = false;
    P.place([0, 0, 1920, 1080]);
    if (P.current() !== c) P.play(c, info.playlist && info.playlist.ua);
    L.pushRecent(c.id);
    D.set('lastChannel', c.id);
    showInfo(c);
  }
  function showInfo(c) {
    c = c || P.current();
    if (!c) return;
    var nn = D.nowNext(epg, c), now = nn[0];
    $('iLogo').src = c.logo || '';
    $('iLogo').style.visibility = c.logo ? 'visible' : 'hidden';
    $('iNum').textContent = c.num;
    $('iName').textContent = c.name;
    $('iNow').textContent = now ? now[2] : c.group;
    $('iBar').style.width = now ? Math.round(100 * (Date.now() - now[0]) / (now[1] - now[0])) + '%' : '0';
    $('iTime').textContent = now ? hhmm(now[0]) + '–' + hhmm(now[1]) : hhmm(Date.now());
    $('iNext').textContent = nn[1] ? 'Next ' + hhmm(nn[1][0]) + '  ' + nn[1][2] : '';
    $('infobar').classList.add('show');
    clearTimeout(infoTimer);
    infoTimer = setTimeout(function () { $('infobar').classList.remove('show'); }, 5000);
  }
  function zapStep(step) {
    if (!channels.length) return;
    var at = channels.indexOf(P.current());
    chIndex = ((at < 0 ? chIndex : at) + step + channels.length) % channels.length;
    watch(channels[chIndex]);
  }
  function leaveWatch() {
    closeZap();
    watching = false;
    document.body.classList.remove('watching');
    $('watch').hidden = true;
    $('browse').hidden = false;
    $('subs').textContent = '';
    if (settings().preview) P.place(PREVIEW_RECT); else P.stop();
    focusArea = 'list';
    var at = channels.indexOf(P.current());
    if (at >= 0) chIndex = at;
    renderList(); renderDetail(); paintFolderFocus();
  }

  P.on('buffering', function (on) { $('buffer').classList.toggle('show', !!on && watching); $('preview').classList.toggle('loading', !!on); });
  P.on('playing', function () { $('previewMsg').textContent = ''; });
  P.on('failed', function (c) {
    $('previewMsg').textContent = "This channel isn't playing right now.";
    if (watching) toast(c.name + " isn't playing right now. Try another channel.");
  });
  P.on('subtitle', function (text) { $('subs').textContent = text || ''; });

  // Number entry: digits jump to that channel number.
  var numBuf = '', numTimer = null;
  function digit(d) {
    numBuf = (numBuf + d).slice(-4);
    $('numentry').textContent = numBuf;
    $('numentry').classList.add('show');
    clearTimeout(numTimer);
    numTimer = setTimeout(function () {
      var c = numIndex[+numBuf];
      $('numentry').classList.remove('show');
      numBuf = '';
      if (!c) return toast('No channel with that number');
      if (channelLocked(c)) return askPin('Enter PIN to watch ' + c.name, function () { unlocked['g:' + c.group] = true; renderFolders(); jumpTo(c); });
      jumpTo(c);
    }, 1400);
  }
  function jumpTo(c) {
    folderIndex = folders.map(function (f) { return f.key; }).indexOf('all');
    showFolder();
    chIndex = Math.max(0, channels.indexOf(c));
    watch(c);
  }

  /* ---------- sheets (menus, forms, settings) ---------- */
  var sheet = null;
  // items: [{label, sub, action, input:{value, type, placeholder}}]
  function openSheet(title, items, opts) {
    opts = opts || {};
    closeSheet(true);
    var el = $('sheet');
    el.innerHTML = '<div class="panel ' + (opts.cls || '') + '"><h3>' + esc(title) + '</h3>' + (opts.html || '') + '<div class="items">' + items.map(function (it) {
      if (it.input) {
        return '<label class="item field"><span>' + esc(it.label) + '</span><input type="' + (it.input.type || 'text') + '" value="' + esc(it.input.value || '') +
          '" placeholder="' + esc(it.input.placeholder || '') + '" autocomplete="off"></label>';
      }
      return '<div class="item' + (it.on ? ' on' : '') + '"><span>' + esc(it.label) + '</span>' + (it.sub ? '<em>' + esc(it.sub) + '</em>' : '') + '</div>';
    }).join('') + '</div></div>';
    el.classList.add('show');
    sheet = {items: items, index: opts.index || 0, onBack: opts.onBack, onClose: opts.onClose, cols: opts.cols || 1, digit: opts.digit};
    paintSheet();
  }
  function closeSheet(silent) {
    if (!sheet) return;
    var cb = sheet.onClose;
    $('sheet').classList.remove('show');
    $('sheet').innerHTML = '';
    sheet = null;
    if (!silent && cb) cb();
  }
  function sheetEls() { return Array.prototype.slice.call($('sheet').querySelectorAll('.item')); }
  function paintSheet() {
    var els = sheetEls();
    sheet.index = Math.max(0, Math.min(sheet.index, els.length - 1));
    els.forEach(function (e, i) { e.classList.toggle('focused', i === sheet.index); });
    var box = $('sheet').querySelector('.items'), f = els[sheet.index];
    if (f && box.scrollHeight > box.clientHeight) box.scrollTop = Math.max(0, f.offsetTop - box.clientHeight / 2);
  }
  function sheetValues() { return sheetEls().map(function (e) { var i = e.querySelector('input'); return i ? i.value.trim() : null; }); }
  function sheetKey(code) {
    var els = sheetEls(), it = sheet.items[sheet.index], cols = sheet.cols;
    if (code >= 48 && code <= 57 && sheet.digit) return sheet.digit(String(code - 48));
    if (code === 38) { if (sheet.index - cols >= 0) sheet.index -= cols; }
    else if (code === 40) { if (sheet.index + cols < els.length) sheet.index += cols; }
    else if (code === 37 && cols > 1) { if (sheet.index % cols > 0) sheet.index--; }
    else if (code === 39 && cols > 1) { if (sheet.index % cols < cols - 1) sheet.index++; }
    else if (code === 13) {
      if (it && it.input) { var input = els[sheet.index].querySelector('input'); input.focus(); return; }
      if (it && it.action) return it.action(sheetValues());
    } else if (isBack(code)) { var back = sheet.onBack; closeSheet(); if (back) back(); return; }
    paintSheet();
  }
  function isBack(code) { return code === 10009 || code === 27 || code === 8; }

  /* ---------- parental PIN ---------- */
  function pinPad(title, done, onBack) {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'], pin = '';
    function paint() {
      var dots = $('sheet').querySelectorAll('.dots i');
      for (var i = 0; i < dots.length; i++) dots[i].className = i < pin.length ? 'on' : '';
    }
    function add(k) {
      if (pin.length >= 4) return;
      pin += k; paint();
      if (pin.length === 4) setTimeout(function () { closeSheet(true); done(pin); }, 150);
    }
    openSheet(title, keys.map(function (k) {
      return {label: k, action: function () {
        if (k === '⌫') { pin = pin.slice(0, -1); paint(); }
        else if (k === '✓') { if (pin.length === 4) { closeSheet(true); done(pin); } }
        else add(k);
      }};
    }), {cls: 'pin', cols: 3, index: 4, digit: add, onBack: onBack, html: '<div class="dots"><i></i><i></i><i></i><i></i></div>'});
  }
  function choosePin(done) {
    pinPad('Choose a 4-digit PIN', function (a) {
      pinPad('Enter the same PIN again', function (b) {
        if (a !== b) { toast("The PINs didn't match. Try again."); return choosePin(done); }
        L.setPin(a); toast('PIN saved'); done();
      });
    });
  }
  // Runs ok() after the right PIN; asks to create a PIN first if there is none.
  function askPin(title, ok, onBack) {
    if (!L.pinHash()) return choosePin(ok);
    pinPad(title, function (pin) {
      if (L.checkPin(pin)) return ok();
      toast('Wrong PIN');
      if (onBack) onBack();
    }, onBack);
  }

  /* ---------- channel menu (hold OK) ---------- */
  function channelMenu(c) {
    if (!c) return;
    var fav = L.isFavorite(c.id), f = folders[folderIndex], items = [
      {label: 'Watch', action: function () { closeSheet(); watch(c); }},
      {label: fav ? 'Remove from favorites' : 'Add to favorites', action: function () {
        L.setFavorite(c.id, !fav); closeSheet(); toast(fav ? c.name + ' removed from favorites' : c.name + ' added to favorites'); refreshCurrent();
      }},
      {label: 'Add to folder…', action: function () { folderPicker(c); }}
    ];
    if (f && f.custom) items.push({label: 'Remove from this folder', action: function () {
      var all = L.folders(); all.forEach(function (x) { if (x.id === f.custom) x.ids = x.ids.filter(function (id) { return id !== c.id; }); });
      L.saveFolders(all); closeSheet(); refreshCurrent();
    }});
    items.push({label: 'Hide this channel', sub: 'Bring it back in Settings → Hidden channels', action: function () {
      L.setHiddenChannel(c.id, true); closeSheet(); toast(c.name + ' hidden'); refreshCurrent();
    }});
    // Shortcut: with a long playlist, Settings is far down the folder list.
    items.push({label: 'Settings', action: openSettings});
    openSheet(c.num + '  ' + c.name, items);
  }
  function folderPicker(c) {
    var all = L.folders();
    openSheet('Add ' + c.name + ' to', all.map(function (f) {
      return {label: f.name, sub: f.ids.indexOf(c.id) >= 0 ? 'Already here' : f.ids.length + ' channels', action: function () {
        if (f.ids.indexOf(c.id) < 0) f.ids.push(c.id);
        L.saveFolders(all); closeSheet(); toast(c.name + ' added to ' + f.name); refreshCurrent();
      }};
    }).concat([{label: 'New folder…', action: function () { newFolder(function (f) { f.ids.push(c.id); var list = L.folders(); list.push(f); L.saveFolders(list); toast(c.name + ' added to ' + f.name); buildFolders(); }); }}]));
  }
  function newFolder(done) {
    openSheet('New folder', [
      {label: 'Name', input: {placeholder: 'e.g. Sports'}},
      {label: 'Create folder', action: function (v) {
        if (!v[0]) return toast('Type a name for the folder first');
        closeSheet();
        done({id: D.hash(v[0] + Date.now()), name: v[0], ids: []});
      }}
    ]);
  }
  function refreshCurrent() {
    var keep = folders[folderIndex] && folders[folderIndex].key;
    buildFolders();
    var at = folders.map(function (f) { return f.key; }).indexOf(keep);
    folderIndex = at >= 0 ? at : 0;
    showFolder();
  }

  /* ---------- watching options (OK while watching) ---------- */
  function watchMenu() {
    var c = P.current();
    if (!c) return;
    var fav = L.isFavorite(c.id), mode = settings().mode || 'fit', now = D.nowNext(epg, c)[0];
    var items = [
      {label: 'Programme guide', sub: now ? 'Now: ' + now[2] : 'No programme information', action: function () { channelGuide(c); }},
      {label: fav ? 'Remove from favorites' : 'Add to favorites', action: function () { L.setFavorite(c.id, !fav); closeSheet(); toast(fav ? 'Removed from favorites' : 'Added to favorites'); }},
      {label: 'Picture', sub: {fit: 'Fit', fill: 'Fill screen', zoom: 'Original'}[mode], action: function () {
        var next = {fit: 'fill', fill: 'zoom', zoom: 'fit'}[mode], s = settings(); s.mode = next; saveSettings(s); P.setMode(next); closeSheet(); watchMenu();
      }}
    ];
    var tracks = P.tracks();
    tracks.filter(function (t) { return t.type === 'AUDIO'; }).forEach(function (t) {
      items.push({label: 'Audio: ' + t.label, action: function () { P.selectTrack(t); closeSheet(); toast('Audio: ' + t.label); }});
    });
    var subs = tracks.filter(function (t) { return t.type === 'TEXT'; });
    subs.forEach(function (t) { items.push({label: 'Subtitles: ' + t.label, action: function () { P.selectTrack(t); closeSheet(); }}); });
    if (subs.length) items.push({label: 'Subtitles off', action: function () { P.subtitlesOff(); closeSheet(); }});
    if (lastChannel) items.push({label: 'Previous channel', sub: lastChannel.name, action: function () { closeSheet(); watch(lastChannel); }});
    items.push({label: 'Back to channel list', action: function () { closeSheet(); leaveWatch(); }});
    openSheet(c.num + '  ' + c.name, items);
  }
  // The next hours for one channel; OK on a programme shows its description, Back returns.
  function channelGuide(c, index) {
    var list = D.schedule(epg, c);
    if (!list.length) return toast('No programme information for ' + c.name);
    openSheet('Guide · ' + c.name, list.map(function (p, i) {
      return {label: hhmm(p[0]) + '  ' + p[2], sub: i === 0 && p[0] <= Date.now() ? 'Now, until ' + hhmm(p[1]) : '', action: function () {
        openSheet(p[2], [{label: 'Back to guide', action: function () { channelGuide(c, i); }}], {
          html: '<p class="hint">' + hhmm(p[0]) + '–' + hhmm(p[1]) + (p[3] ? '<br><br>' + esc(p[3]) : '') + '</p>',
          onBack: function () { channelGuide(c, i); }
        });
      }};
    }), {index: index || 0, onBack: watchMenu});
  }

  /* ---------- channel list overlay (OK while watching) ---------- */
  var zap = null, zapTimer = null;   // {fi: folder index, list, idx}
  function zapFolders() {
    return folders.map(function (f, i) { return i; }).filter(function (i) {
      var f = folders[i];
      return f.key !== 'settings' && !folderLocked(f) && channelsFor(f).length;
    });
  }
  function openZap() {
    var cur = P.current(), fi = folderIndex;
    if (!channelsFor(folders[fi]).length || folderLocked(folders[fi])) fi = folders.map(function (f) { return f.key; }).indexOf('all');
    var list = channelsFor(folders[fi]);
    zap = {fi: fi, list: list, idx: Math.max(0, list.indexOf(cur))};
    $('infobar').classList.remove('show');
    renderZap();
  }
  function closeZap() {
    zap = null;
    clearTimeout(zapTimer);
    $('zap').classList.remove('show');
  }
  function renderZap() {
    clearTimeout(zapTimer);
    zapTimer = setTimeout(closeZap, 8000);
    var f = folders[zap.fi], rows = 10, list = zap.list;
    var start = Math.max(0, Math.min(zap.idx - 4, list.length - rows)), cur = P.current(), html = '';
    for (var i = start; i < Math.min(list.length, start + rows); i++) {
      var c = list[i], now = D.nowNext(epg, c)[0];
      html += '<div class="zrow' + (i === zap.idx ? ' focused' : '') + (c === cur ? ' playing' : '') + '">' +
        '<span class="num">' + c.num + '</span><span class="logo">' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="" onerror="this.remove()">' : '') + '</span>' +
        '<span class="main"><b>' + esc(c.name) + '</b><em>' + esc(now ? now[2] : c.group) + '</em></span></div>';
    }
    $('zap').innerHTML = '<div class="zhead"><span>◀</span><b>' + esc(f.name) + '</b><span>▶</span></div><div class="zlist">' + html + '</div>' +
      '<div class="zhint">OK watch · hold OK options · Back close</div>';
    $('zap').classList.add('show');
  }
  function zapKey(code) {
    if (code === 38) zap.idx = Math.max(0, zap.idx - 1);
    else if (code === 40) zap.idx = Math.min(zap.list.length - 1, zap.idx + 1);
    else if (code === 37 || code === 39) {
      var order = zapFolders(), at = order.indexOf(zap.fi);
      if (!order.length) return;
      zap.fi = order[((at < 0 ? 0 : at) + (code === 39 ? 1 : -1) + order.length) % order.length];
      zap.list = channelsFor(folders[zap.fi]);
      zap.idx = Math.max(0, zap.list.indexOf(P.current()));
    } else if (isBack(code)) return closeZap();
    else return;
    renderZap();
  }
  function zapPick() {
    var c = zap.list[zap.idx];
    folderIndex = zap.fi;
    showFolder();
    chIndex = Math.max(0, channels.indexOf(c));
    closeZap();
    watch(c);
  }

  /* ---------- settings ---------- */
  function openSettings() {
    var list = D.playlists(), active = D.activePlaylist(), s = settings();
    var items = list.map(function (p) {
      return {label: p.name, sub: (p === active || active && p.id === active.id ? 'In use · ' : '') + (p.type === 'xtream' ? 'Xtream login' : 'M3U playlist'),
        on: active && p.id === active.id, action: function () { playlistMenu(p); }};
    });
    items.push(
      {label: 'Add playlist from phone', sub: 'Scan a QR code and paste the link on your phone', action: addFromPhone},
      {label: 'Add M3U playlist', sub: 'Type the address with the TV keyboard', action: addM3U},
      {label: 'Add Xtream login', sub: 'Server, username and password', action: addXtream},
      {label: 'Manage folders', sub: 'Show, hide and order groups; your own folders', action: manageFolders},
      {label: 'Hidden channels', sub: L.hiddenChannels().length + ' hidden', action: hiddenChannels},
      {label: 'Preview on focus', sub: s.preview ? 'On' : 'Off', action: function () { s.preview = !s.preview; saveSettings(s); if (!s.preview) P.stop(); openSettings(); }},
      {label: 'Hide web-only links', sub: s.hideWeb ? 'On (YouTube, Twitch… can\'t play here)' : 'Off', action: function () { s.hideWeb = !s.hideWeb; saveSettings(s); refreshCurrent(); openSettings(); }},
      {label: 'Update programme guide', sub: 'Download the EPG again', action: function () { closeSheet(); toast('Updating the programme guide…'); loadGuide(true); }},
      {label: 'Parental PIN', sub: L.pinHash() ? 'Set · OK to change' : 'Not set', action: function () {
        if (!L.pinHash()) return choosePin(openSettings);
        askPin('Enter your current PIN', function () { choosePin(openSettings); }, openSettings);
      }},
      {label: 'Lock adult folders automatically', sub: s.autoLockAdult !== false ? 'On (Adult, XXX, 18+ …)' : 'Off', action: function () {
        var flip = function () { s.autoLockAdult = s.autoLockAdult === false; saveSettings(s); unlocked = {}; refreshCurrent(); openSettings(); };
        if (s.autoLockAdult !== false) askPin('Enter PIN to turn this off', flip, openSettings); else flip();
      }},
      {label: 'Reset folders', sub: 'Order, hidden and locked folders, hidden channels', action: function () {
        confirmAction('Reset folders?', 'Your own folders stay; their locks are removed.', function () { L.resetFolders(); unlocked = {}; refreshCurrent(); toast('Folders reset'); });
      }},
      {label: 'Reset Garage Player', sub: 'Remove all playlists, favorites, folders and settings', action: function () {
        confirmAction('Reset Garage Player?', 'Everything is removed. You will need to add your playlist again.', function () {
          P.stop(); L.resetAll(); location.reload();
        });
      }}
    );
    openSheet('Settings', items, {cls: 'wide'});
  }
  // Destructive settings ask twice; if a PIN exists it guards them too.
  function confirmAction(title, detail, run) {
    var go = function () {
      openSheet(title, [{label: 'Yes, reset', sub: detail, action: function () { closeSheet(true); run(); }}, {label: 'Cancel', action: openSettings}], {onBack: openSettings});
    };
    if (L.pinHash()) askPin('Enter PIN to continue', go, openSettings); else go();
  }
  function playlistMenu(p) {
    openSheet(p.name, [
      {label: 'Use this playlist', action: function () { D.set('active', p.id); closeSheet(); P.stop(); load(false); }},
      {label: 'Refresh channels', sub: 'Download the playlist again', action: function () { D.set('active', p.id); closeSheet(); load(true); }},
      {label: 'EPG address', input: {value: p.epg || '', placeholder: 'Leave empty to use the playlist\'s own'}},
      {label: 'User agent', input: {value: p.ua || '', placeholder: 'Only if your provider asks for one'}},
      {label: 'Save', action: function (v) {
        var all = D.playlists(); all.forEach(function (x) { if (x.id === p.id) { x.epg = v[2]; x.ua = v[3]; } });
        D.savePlaylists(all); D.dropCache(p.id); closeSheet(); toast('Saved'); if (D.activePlaylist().id === p.id) load(true);
      }},
      {label: 'Delete playlist', action: function () {
        openSheet('Delete ' + p.name + '?', [
          {label: 'Delete', action: function () {
            D.savePlaylists(D.playlists().filter(function (x) { return x.id !== p.id; })); D.dropCache(p.id); closeSheet(); P.stop(); load(false);
          }},
          {label: 'Cancel', action: function () { playlistMenu(p); }}
        ]);
      }}
    ], {onBack: openSettings});
  }
  function savePlaylist(p) {
    var all = D.playlists();
    p.id = D.hash(p.name + Date.now());
    all.push(p);
    D.savePlaylists(all);
    D.set('active', p.id);
    closeSheet();
    toast('Playlist added. Loading channels…');
    P.stop();
    load(true);
  }
  function addM3U() {
    openSheet('Add M3U playlist', [
      {label: 'Name', input: {placeholder: 'e.g. My TV'}},
      {label: 'Playlist address', input: {type: 'url', placeholder: 'https://…/playlist.m3u'}},
      {label: 'EPG address (optional)', input: {type: 'url', placeholder: 'https://…/guide.xml.gz'}},
      {label: 'Add playlist', action: function (v) {
        if (!/^https?:\/\//i.test(v[1])) return toast('The address must start with http:// or https://');
        savePlaylist({type: 'm3u', name: v[0] || 'Playlist', url: v[1], epg: v[2]});
      }}
    ], {onBack: openSettings});
  }
  function addXtream() {
    openSheet('Add Xtream login', [
      {label: 'Name', input: {placeholder: 'e.g. My provider'}},
      {label: 'Server', input: {type: 'url', placeholder: 'http://server:port'}},
      {label: 'Username', input: {}},
      {label: 'Password', input: {type: 'password'}},
      {label: 'Add login', action: function (v) {
        if (!/^https?:\/\//i.test(v[1]) || !v[2] || !v[3]) return toast('Fill in the server (with http://), username and password');
        savePlaylist({type: 'xtream', name: v[0] || 'Xtream', server: v[1], user: v[2], pass: v[3]});
      }}
    ], {onBack: openSettings});
  }

  // Phone setup: Vetro serves a small form; we poll its inbox for a playlist carrying our code.
  var inboxTimer = null;
  function addFromPhone() {
    var code = String(1000 + Math.floor(Math.random() * 9000));
    tvIp(function (ip) {
      if (!ip) return toast("Couldn't find the TV's network address. Use Add M3U playlist instead.");
      var url = 'http://' + ip + ':8099/garage/setup?code=' + code;
      openSheet('Add playlist from phone', [{label: 'Cancel', action: function () { closeSheet(); }}], {
        cls: 'qr-panel',
        html: '<div class="qr">' + qrSvg(url) + '</div><p class="hint">Scan with your phone camera, paste the playlist link and send it.<br>Code <b>' + code + '</b> · ' + esc(ip) + ':8099/garage/setup</p>',
        onClose: function () { clearInterval(inboxTimer); }, onBack: openSettings
      });
      clearInterval(inboxTimer);
      inboxTimer = setInterval(function () {
        fetch(VETRO + '/garage/inbox?code=' + code, {headers: {'X-Garage-App': '1'}}).then(function (r) { return r.json(); }).then(function (d) {
          if (!d.item) return;
          clearInterval(inboxTimer);
          var p = d.item;
          openSheet('Add "' + (p.name || 'Playlist') + '"?', [
            {label: 'Add playlist', sub: p.type === 'xtream' ? p.server : p.url, action: function () { savePlaylist(p); }},
            {label: 'Cancel', action: function () { closeSheet(); }}
          ]);
        }).catch(function () {});
      }, 2000);
    });
  }
  function qrSvg(text) {
    var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#0f2326"/></svg>';
  }
  function tvIp(cb) {
    if (!hasTizen || !tizen.systeminfo) return cb(TV_LAN_IP);
    var tried = 0, done = false;
    ['ETHERNET_NETWORK', 'WIFI_NETWORK'].forEach(function (prop) {
      var miss = function () { tried++; if (tried === 2 && !done) cb(TV_LAN_IP); };
      try {
        tizen.systeminfo.getPropertyValue(prop, function (v) {
          if (!done && v && v.ipAddress && v.ipAddress !== '0.0.0.0') { done = true; tried++; cb(v.ipAddress); } else miss();
        }, miss);
      } catch (e) { miss(); }
    });
  }

  function manageFolders() {
    var prefs = L.groupPrefs(), groups = [], seen = {};
    info.channels.forEach(function (c) { if (!seen[c.group]) { seen[c.group] = true; groups.push(c.group); } });
    groups.sort(function (a, b) {
      var ia = prefs.order.indexOf(a), ib = prefs.order.indexOf(b);
      return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
    });
    var own = L.folders();
    var items = [{label: 'New folder…', action: function () { newFolder(function (f) { var l = L.folders(); l.push(f); L.saveFolders(l); buildFolders(); manageFolders(); }); }}];
    own.forEach(function (f) { items.push({label: f.name, sub: 'Your folder · ' + f.ids.length + ' channels' + (f.locked ? ' · Locked' : ''), action: function () { ownFolderMenu(f); }}); });
    groups.forEach(function (g, i) {
      var hidden = prefs.hidden.indexOf(g) >= 0;
      items.push({label: g, sub: (hidden ? 'Hidden' : 'Shown') + (L.isGroupLocked(g) ? ' · Locked' : ''), action: function () { groupMenu(g, groups, i); }});
    });
    openSheet('Manage folders', items, {cls: 'wide', onBack: openSettings, onClose: refreshCurrent});
  }
  function groupMenu(g, groups, i) {
    var prefs = L.groupPrefs(), hidden = prefs.hidden.indexOf(g) >= 0;
    function move(step) {
      var order = groups.slice(), j = i + step;
      if (j < 0 || j >= order.length) return manageFolders();
      order.splice(i, 1); order.splice(j, 0, g);
      prefs.order = order; L.saveGroupPrefs(prefs); manageFolders();
    }
    var locked = L.isGroupLocked(g);
    openSheet(g, [
      {label: locked ? 'Remove PIN lock' : 'Lock with PIN', sub: locked && L.isAdultName(g) ? 'Locked automatically: adult content' : '', action: function () {
        askPin(locked ? 'Enter PIN to unlock ' + g : 'Enter PIN to lock ' + g, function () {
          L.setGroupLocked(g, !locked); delete unlocked['g:' + g]; toast(locked ? g + ' unlocked' : g + ' locked'); manageFolders();
        }, manageFolders);
      }},
      {label: hidden ? 'Show this folder' : 'Hide this folder', action: function () {
        prefs.hidden = prefs.hidden.filter(function (x) { return x !== g; });
        if (!hidden) prefs.hidden.push(g);
        L.saveGroupPrefs(prefs); manageFolders();
      }},
      {label: 'Move up', action: function () { move(-1); }},
      {label: 'Move down', action: function () { move(1); }},
      {label: 'Move to top', action: function () { move(-i); }}
    ], {onBack: manageFolders});
  }
  function ownFolderMenu(f) {
    openSheet(f.name, [
      {label: 'Name', input: {value: f.name}},
      {label: 'Rename', action: function (v) {
        if (!v[0]) return toast('Type a name first');
        var all = L.folders(); all.forEach(function (x) { if (x.id === f.id) x.name = v[0]; }); L.saveFolders(all); manageFolders();
      }},
      {label: f.locked ? 'Remove PIN lock' : 'Lock with PIN', action: function () {
        askPin((f.locked ? 'Enter PIN to unlock ' : 'Enter PIN to lock ') + f.name, function () {
          var all = L.folders(); all.forEach(function (x) { if (x.id === f.id) x.locked = !f.locked; }); L.saveFolders(all);
          delete unlocked['f:' + f.id]; toast(f.locked ? f.name + ' unlocked' : f.name + ' locked'); manageFolders();
        }, manageFolders);
      }},
      {label: 'Delete folder', sub: 'Channels stay in the playlist', action: function () {
        L.saveFolders(L.folders().filter(function (x) { return x.id !== f.id; })); manageFolders();
      }}
    ], {onBack: manageFolders});
  }
  function hiddenChannels() {
    var ids = L.hiddenChannels();
    openSheet('Hidden channels', ids.length ? ids.map(function (id) {
      var c = byId[id];
      return {label: c ? c.name : 'Channel from another playlist', sub: 'OK to show it again', action: function () { L.setHiddenChannel(id, false); refreshCurrent(); hiddenChannels(); }};
    }) : [{label: 'No hidden channels', action: openSettings}], {onBack: openSettings});
  }

  /* ---------- search ---------- */
  var input = $('searchInput');
  input.addEventListener('input', function () {
    query = input.value.trim();
    buildFolders();
    folderIndex = 0;
    chIndex = 0;
    showFolder();
  });
  function finishSearch() {
    input.blur();
    focusArea = channels.length ? 'list' : 'folders';
    paintAll();
  }

  /* ---------- focus & keys ---------- */
  function paintAll() {
    $('searchBox').classList.toggle('focused', focusArea === 'search' && !watching);
    paintFolderFocus();
    renderList();
  }
  function move(dx, dy) {
    if (focusArea === 'search') {
      if (dy > 0) { focusArea = 'folders'; paintAll(); }
      return;
    }
    if (focusArea === 'folders') {
      if (dx) dy = dx * FOLDER_PAGE;   // ◀ ▶ jump a page of folders; OK opens the list
      if (dy) {
        if (dy === -1 && folderIndex === 0) { focusArea = 'search'; paintAll(); return; }
        folderIndex = Math.max(0, Math.min(folders.length - 1, folderIndex + dy));
        chIndex = 0;
        paintFolderFocus();
        showFolder();
      }
      return;
    }
    if (focusArea === 'list') {
      if (dx < 0) { focusArea = 'folders'; paintAll(); return; }
      if (dy) {
        if (dy < 0 && chIndex === 0) { focusArea = 'search'; paintAll(); return; }
        chIndex = Math.max(0, Math.min(channels.length - 1, chIndex + dy));
        renderList(); renderDetail(); schedulePreview();
      }
    }
  }
  function ok() {
    if (focusArea === 'search') { input.focus(); return; }
    if (focusArea === 'folders') {
      if (folders[folderIndex] && folders[folderIndex].key === 'settings') return openSettings();
      var lf = folders[folderIndex];
      if (folderLocked(lf)) return askPin('Enter PIN to open ' + lf.name, function () {
        unlocked[lf.key] = true; renderFolders(); showFolder();
        if (channels.length) { focusArea = 'list'; paintAll(); schedulePreview(); }
      });
      if (channels.length) { focusArea = 'list'; paintAll(); schedulePreview(); }
      return;
    }
    if (focusArea === 'list') watch(channels[chIndex]);
  }
  // While watching: OK opens the channel list (or plays the highlighted channel); holding OK opens options.
  function pressOk() {
    if (!watching) return ok();
    if (zap) zapPick(); else openZap();
  }
  function holdOk() {
    if (!watching) return longOk();
    if (zap) { var c = zap.list[zap.idx]; closeZap(); channelMenu(c); } else watchMenu();
  }
  function longOk() {
    if (focusArea === 'list') channelMenu(channels[chIndex]);
    else if (focusArea === 'folders') {
      var f = folders[folderIndex];
      if (f && f.custom) ownFolderMenu((L.folders().filter(function (x) { return x.id === f.custom; })[0]));
      else if (f && f.group !== undefined) manageFolders();
    }
  }
  var backArmed = 0;
  function back() {
    if (focusArea === 'list') { focusArea = 'folders'; paintAll(); return; }
    if (Date.now() - backArmed < 2500) { P.stop(); if (hasTizen) tizen.application.getCurrentApplication().exit(); return; }
    backArmed = Date.now();
    toast('Press Back again to close Garage Player');
  }

  var okDown = 0, okLong = false, okTimer = null, lastKey = 0;
  document.addEventListener('keydown', function (e) {
    var code = e.keyCode, now = Date.now();
    // While typing, the TV keyboard owns the keys; Done/Cancel/Enter end typing.
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      if (code === 13 || code === 65376 || code === 65385 || isBack(code)) {
        document.activeElement.blur();
        if (document.activeElement === input || !sheet) finishSearch();
        e.preventDefault();
      }
      return;
    }
    if (sheet) { if (!(e.repeat && now - lastKey < 110)) { lastKey = now; sheetKey(code); } e.preventDefault(); return; }
    if (code >= 48 && code <= 57) { digit(String(code - 48)); e.preventDefault(); return; }
    if (watching && zap && code !== 13) { zapKey(code); e.preventDefault(); return; }
    if (watching && code !== 13) {
      if (code === 38 || code === 427) zapStep(1);
      else if (code === 40 || code === 428) zapStep(-1);
      else if (code === 37 && lastChannel) watch(lastChannel);
      else if (code === 39 || code === 457) showInfo();
      else if (isBack(code)) {
        // Back first hides the info bar (a common reflex); the next Back leaves full screen.
        if ($('infobar').classList.contains('show')) { clearTimeout(infoTimer); $('infobar').classList.remove('show'); }
        else leaveWatch();
      }
      else return;
      e.preventDefault();
      return;
    }
    if (code === 13) {
      e.preventDefault();
      if (!e.repeat) {
        okDown = now; okLong = false; clearTimeout(okTimer);
        okTimer = setTimeout(function () { if (okDown && !okLong) { okLong = true; holdOk(); } }, 1500);
      } else if (okDown && !okLong && now - okDown > 550) { okLong = true; clearTimeout(okTimer); holdOk(); }
      return;
    }
    if (e.repeat && now - lastKey < 90) { e.preventDefault(); return; }
    lastKey = now;
    if (code === 37) move(-1, 0);
    else if (code === 39) move(1, 0);
    else if (code === 38) move(0, -1);
    else if (code === 40) move(0, 1);
    else if (code === 427 || code === 428) { if (channels[chIndex]) watch(channels[chIndex]); }
    else if (isBack(code)) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== 13 || !okDown) return;
    clearTimeout(okTimer);
    // Remotes that don't repeat a held key: judge the hold by how long OK stayed down.
    if (!okLong && !sheet) { if (Date.now() - okDown >= 550) holdOk(); else pressOk(); }
    okDown = 0;
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { P.stop(); if (Object.keys(unlocked).length) { unlocked = {}; if (watching && P.current() && channelLocked(P.current())) leaveWatch(); refreshCurrent(); } }
    else if (watching && channels[chIndex]) { P.place([0, 0, 1920, 1080]); P.play(channels[chIndex], info.playlist && info.playlist.ua); }
  });

  /* ---------- misc ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function status(s) { $('status').textContent = s; }
  function tick() { $('clock').textContent = hhmm(Date.now()); }

  if (hasTizen && tizen.tvinputdevice) {
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'ChannelUp', 'ChannelDown', 'Info'].forEach(function (k) {
      try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
    });
  }
  if (!P.available) document.body.classList.add('no-av');
  P.setMode(settings().mode || 'fit');
  P.place(PREVIEW_RECT);
  tick();
  setInterval(tick, 15000);
  setInterval(function () { if (!watching) { renderList(); renderDetail(); } }, 60000);
  load(false).then(function () {
    var last = byId[D.get('lastChannel', null)];
    if (last && visibleChannel(last) && !channelLocked(last)) {
      var at = channels.indexOf(last);
      if (at < 0) { folderIndex = folders.map(function (f) { return f.key; }).indexOf('all'); showFolder(); at = channels.indexOf(last); }
      chIndex = Math.max(0, at);
      focusArea = 'list';
      watch(last);
    } else { paintAll(); }
  });
  GP.debug = {folder: function (key) { refreshCurrent(); folderIndex = Math.max(0, folders.map(function (f) { return f.key; }).indexOf(key)); focusArea = 'folders'; showFolder(); paintAll(); }, watch: watch, leaveWatch: leaveWatch, openSettings: openSettings, channelMenu: function () { channelMenu(channels[chIndex]); }, manageFolders: manageFolders, addFromPhone: addFromPhone};
})();
