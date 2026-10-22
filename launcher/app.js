/* Garage Home: a TV launcher for Samsung Tizen. ES2017 only: Tizen 6 is Chromium 76. */
(function () {
  'use strict';

  var SELF = 'GarageHome';
  var STORE_ID = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/;
  var EXTRA_APPS = ['org.tizen.netflix-app', 'org.tizen.primevideo'];
  var HIDDEN = /Service$|SecurityCenter|emanual|primevideo-dummy|^vetrotvapp/;
  // Row order: these first, in this order, then the rest.
  var ORDER = [/digitalb/i, /netflix/i, /disney/i, /prime/i, /youtube/i, /klani/i, /spotify/i, /skyshowtime/i];

  var hasTizen = typeof tizen !== 'undefined';
  // Vetro's local service (root). Garage Home uses it for keys, brightness and launching system apps.
  // Optional overrides (e.g. from the desktop preview): window.GARAGE_CONFIG = {tvIp: '…'}.
  var CONFIG = window.GARAGE_CONFIG || {};
  var TV_LAN_IP = CONFIG.tvIp || '';   // only a fallback: the TV normally reports its own address
  var VETRO = hasTizen ? 'http://127.0.0.1:8099' : 'http://' + (TV_LAN_IP || '127.0.0.1') + ':8099';
  var IDLE_MINUTES = window.PREVIEW_IDLE_MINUTES || 5;

  // [match, glow rgb, one-line description]
  var BRANDS = [
    [/digitalb/i, '225, 35, 35', 'Live channels and TV on demand'],
    [/netflix/i, '229, 9, 20', 'Series, films and documentaries'],
    [/disney/i, '30, 70, 200', 'Disney, Pixar, Marvel and Star Wars'],
    [/prime/i, '0, 168, 225', 'Prime originals, films and live sport'],
    [/youtube/i, '235, 30, 30', 'Videos, music and live streams'],
    [/spotify/i, '30, 215, 96', 'Music and podcasts'],
    [/skyshowtime/i, '130, 70, 230', 'Films and series from Sky and Paramount'],
    [/rakuten|wuaki/i, '191, 0, 30', 'Films to rent, buy or watch free'],
    [/sweet/i, '255, 70, 120', 'Live channels and films'],
    [/iptv|smarters/i, '110, 60, 170', 'Your IPTV channels'],
    [/klani/i, '227, 27, 35', 'Live TV and on demand'],
    [/garageplay/i, '14, 150, 138', 'Your IPTV channels, folders and favorites']
  ];

  // One line style for every drawn icon (24px grid, 1.75 stroke, round joins).
  var ICONS = {
    tv: '<rect x="2.5" y="6.5" width="19" height="13" rx="2.5"/><path d="M8 2.5l4 4 4-4M8 22h8"/>',
    source: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/><path d="M9.5 8.5l2.5 2.5 2.5-2.5"/>',
    gallery: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.75"/><path d="M21 16l-5-5-8 9"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    store: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.5v7M13.5 17h7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    voldown: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 12h5"/>',
    volup: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 12h5M18.5 9.5v5"/>',
    dim: '<circle cx="12" cy="12" r="3.5"/><path d="M12 4.5v1M12 18.5v1M4.5 12h1M18.5 12h1M6.7 6.7l.7.7M16.6 16.6l.7.7M6.7 17.3l.7-.7M16.6 7.4l.7-.7"/>',
    bright: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    sleep: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/><path d="M15 3.5h4l-4 4h4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    flag: '<path d="M5 21V4M5 4.5c3-1.5 5.5 1.5 8.5 0S18 3.5 19 4v9c-1 .5-2.5 1.5-5.5 0S8 12.5 5 14"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.9-2.7 2s1 1.6 2.8 2 2.8 1 2.8 2.1-1.2 2-2.8 2c-1.2 0-2.2-.5-2.8-1.3M12 6.5V8M12 16v1.5"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    tasks: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M7 8.5h3M7 12h3M7 15.5h3M13 8.5h4M13 12h4M13 15.5h4"/>',
    news: '<rect x="3" y="4.5" width="15" height="15" rx="2"/><path d="M18 8.5h2.5V18a1.5 1.5 0 0 1-3 0M6.5 8.5h8M6.5 12h8M6.5 15.5h5"/>'
  };
  function icon(name) { return '<svg class="ico" viewBox="0 0 24 24">' + ICONS[name] + '</svg>'; }

  // Artwork for apps whose installed icon is missing or a placeholder.
  // {icon} is replaced with the app's installed icon (an <img> without one is left out).
  var ART = [
    [/smarters/i, 'linear-gradient(135deg, #1d2b64, #5b2a86)', '<img class="art-wide" src="{icon}" alt="">'],
    [/digitalb/i, '#e60004', '<div class="art-logo"><img src="{icon}" alt=""><span>DigitAlb</span></div>'],
    [/spotify/i, '#121212', '<div class="art-logo"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6.2 9.2c3.9-1.2 8.3-.8 11.6 1.1M6.8 12.5c3.2-.9 6.7-.6 9.5 1M7.4 15.6c2.6-.7 5.2-.4 7.4.8" fill="none" stroke="#121212" stroke-width="1.7" stroke-linecap="round"/></svg><span>Spotify</span></div>'],
    [/youtube/i, '#0f0f0f', '<div class="art-yt"><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="5" fill="#ff0033"/><path d="M11 5.5v9l7.8-4.5z" fill="#fff"/></svg><span>YouTube</span></div>'],
    [/primevideo|prime video/i, '#0f171e', '<div class="art-pv"><span>prime video</span><svg viewBox="0 0 60 12"><path d="M2 3c16 9 38 9 54 0" fill="none" stroke="#1399ff" stroke-width="3" stroke-linecap="round"/><path d="M50 1l7 2-4 6" fill="none" stroke="#1399ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>']
  ];
  function artOf(app) {
    var key = app.id + ' ' + app.name;
    for (var i = 0; i < ART.length; i++) if (ART[i][0].test(key)) return ART[i];
    return null;
  }

  var TV_ROW = [
    {id: 'com.samsung.tv.coba.livetv', name: 'Live TV', icon: 'tv'},
    {id: 'key:KEY_SOURCE', name: 'Sources', icon: 'source'},
    {id: 'com.samsung.tv.gallery', name: 'Gallery', icon: 'gallery'},
    {id: 'org.tizen.browser', name: 'Internet', icon: 'web'},
    {id: 'com.samsung.tv.store', name: 'App store', icon: 'store'},
    {id: 'org.tizen.menu', name: 'Settings', icon: 'settings'}
  ];

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function store(key, value) {
    try {
      if (arguments.length > 1) localStorage.setItem(key, JSON.stringify(value));
      else return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) { return null; }
  }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  /* ---------- Vetro (local root service) ---------- */
  function vetro(path, body) {
    var opts = body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {};
    return fetch(VETRO + path, opts).then(function (r) {
      return r.json().then(function (d) { if (!r.ok || d.ok === false) throw new Error(d.error || r.status); return d; });
    });
  }
  function pressKey(key) { return vetro('/control', {key: key}); }

  // With our certificate Vetro's service does not start at boot. If it is down, start it:
  // directly if the TV allows it, otherwise by opening Vetro's app, which starts it and closes again.
  function ensureVetro() {
    if (!hasTizen) return;
    var last = store('gh.vetroKick') || 0;
    if (Date.now() - last < 2 * 60000) return;
    fetch(VETRO + '/status').catch(function () {
      store('gh.vetroKick', Date.now());
      var viaApp = function () {
        var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null,
          [new tizen.ApplicationControlData('action', ['start-service'])]);
        try { tizen.application.launchAppControl(ctrl, 'vetrotvapp.app', function () {}, function () {}); } catch (e) {}
      };
      try { tizen.application.launch('vetrotvapp.svc', function () {}, viaApp); } catch (e) { viaApp(); }
    });
  }
  // Plain-language reason a Vetro request failed.
  function vetroProblem(e) {
    return /root agent/.test(e && e.message) ? "Vetro isn't connected to root. Set the TV's Host PC IP to 127.0.0.1."
      : "Vetro isn't reachable right now.";
  }

  /* ---------- app list ---------- */
  function iconUrl(path) {
    if (!path) return '';
    return /^(file|https?):/.test(path) ? path : 'file://' + path;
  }
  function getApps(cb) {
    if (hasTizen) {
      tizen.application.getAppsInfo(function (list) {
        cb(list.map(function (a) { return {id: a.id, name: a.name, icon: iconUrl(a.iconPath), show: a.show}; }));
      }, function () { cb([]); });
    } else {
      cb((window.PREVIEW_APPS || []).slice());
    }
  }
  function brandOf(app) {
    var key = app.id + ' ' + app.name;
    for (var i = 0; i < BRANDS.length; i++) if (BRANDS[i][0].test(key)) return BRANDS[i];
    return [null, '14, 150, 138', ''];
  }
  function orderOf(app) {
    var key = app.id + ' ' + app.name;
    for (var i = 0; i < ORDER.length; i++) if (ORDER[i].test(key)) return i;
    return ORDER.length;
  }
  function cleanName(name) { return name.replace(/ - .*$/, ''); }
  function pickUserApps(all) {
    var seen = {};
    return all.filter(function (a) {
      if (!a.show || HIDDEN.test(a.id) || a.id.indexOf(SELF) === 0) return false;
      if (!STORE_ID.test(a.id) && EXTRA_APPS.indexOf(a.id) < 0) return false;
      var key = a.name.toLowerCase();
      if (seen[key]) return false;
      return (seen[key] = true);
    }).sort(function (a, b) {
      // Your own order (Move in the app menu) wins; apps you haven't placed follow in the default order.
      var mine = store('gh.order') || [], ia = mine.indexOf(a.id), ib = mine.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
      return orderOf(a) - orderOf(b) || a.name.localeCompare(b.name);
    });
  }

  function withIcon(html, icon) {
    return icon ? html.replace('{icon}', icon) : html.replace(/<img[^>]*\{icon\}[^>]*>/, '');
  }

  /* ---------- tiles ---------- */
  function tileFor(app, opts) {
    var el = document.createElement('div');
    el.className = 'tile focusable';
    el.dataset.launch = app.id;
    el.dataset.name = cleanName(app.name);
    if (app.icon && !app.svg) {
      var brand = brandOf(app);
      el.style.background = 'linear-gradient(150deg, rgba(' + brand[1] + ', .28), var(--deep) 80%)';
    }
    var art = !app.svg && artOf(app);
    if (art) {
      el.style.background = art[1];
      el.innerHTML = withIcon(art[2], app.icon);
    } else if (app.svg) {
      el.innerHTML = icon(app.svg) + '<div class="name">' + esc(app.name) + '</div>';
    } else if (app.icon) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        // Tiny icons are usually the generic Tizen placeholder: show the name instead.
        if (img.naturalWidth < 130) el.replaceChild(fallback(app), img);
        else if (img.naturalWidth >= 250) img.className = 'cover';
      };
      img.onerror = function () { el.replaceChild(fallback(app), img); };
      img.src = app.icon;
      el.appendChild(img);
    } else {
      el.appendChild(fallback(app));
    }
    if (opts && opts.label) {
      var l = document.createElement('div'); l.className = 'label'; l.textContent = cleanName(app.name); el.appendChild(l);
    }
    if (!app.svg) {
      var badge = document.createElement('div'); badge.className = 'lock-badge'; badge.innerHTML = icon('lock'); el.appendChild(badge);
      el.classList.toggle('locked', isLocked(app.id));
    }
    return el;
  }
  function fallback(app) {
    var d = document.createElement('div'); d.className = 'fallback'; d.textContent = cleanName(app.name); return d;
  }
  // A widget tile: drawn icon + label, runs `action` on OK.
  function actionTile(iconName, label, action) {
    var el = document.createElement('div');
    el.className = 'tile focusable';
    el.innerHTML = icon(iconName) + '<div class="name">' + esc(label) + '</div>';
    el._action = action;
    return el;
  }

  /* ---------- gear gate ---------- */
  // H-pattern: 1 3 5 on top, 2 4 below. Featured app n sits in gear n.
  var GEARS = [[16, 10], [16, 62], [66, 10], [66, 62], [116, 10]];
  function drawGate(count) {
    var g = GEARS.slice(0, count), svg = '';
    if (count) {
      var cols = [16, 66, 116].filter(function (x) { return g.some(function (p) { return p[0] === x; }); });
      svg += '<path class="rail" d="M' + cols[0] + ' 36H' + cols[cols.length - 1] + '"/>';
      g.forEach(function (p) { svg += '<path class="rail" d="M' + p[0] + ' 36V' + p[1] + '"/>'; });
      g.forEach(function (p, i) {
        svg += '<text x="' + (p[0] + 14) + '" y="' + (p[1] + 4) + '">' + (i + 1) + '</text>';
      });
      svg += '<g class="knob"><circle r="9"/></g>';
    }
    $('gate').innerHTML = svg;
  }
  function shiftGate(i) {
    var knob = document.querySelector('#gate .knob');
    if (!knob) return;
    knob.style.transform = 'translate(' + GEARS[i][0] + 'px,' + GEARS[i][1] + 'px)';
    var labels = document.querySelectorAll('#gate text');
    for (var t = 0; t < labels.length; t++) labels[t].setAttribute('class', t === i ? 'on' : '');
  }

  /* ---------- rendering ---------- */
  var userApps = [], allApps = [], featured = [], heroIndex = 0, heroTimer = null;

  function render(all) {
    var installed = {};
    all.forEach(function (a) { installed[a.id] = a; });
    userApps = pickUserApps(all);
    allApps = all;

    var row = $('appsRow'); row.innerHTML = '';
    userApps.forEach(function (a) { row.appendChild(tileFor(a)); });

    var tv = $('tvRow'); tv.innerHTML = '';
    TV_ROW.filter(function (t) { return !hasTizen || installed[t.id] || /^key:/.test(t.id); })
      .forEach(function (t) { tv.appendChild(tileFor({id: t.id, name: t.name, svg: t.icon})); });

    // The Apps grid repeats every tile (and decodes every icon again): build it only while it's open.
    if (state.page === 'apps') buildGrid(); else $('appsGrid').innerHTML = '';

    featured = userApps.slice(0, GEARS.length);
    drawGate(featured.length);
    showHero(Math.min(heroIndex, Math.max(0, featured.length - 1)), true);
    refocus();
  }

  function showHero(i, instant) {
    if (!featured.length) {
      $('heroTitle').textContent = 'Welcome home';
      $('heroLine').textContent = 'Apps you install from the App store show up here.';
      return;
    }
    heroIndex = (i + featured.length) % featured.length;
    shiftGate(heroIndex);
    var app = featured[heroIndex], brand = brandOf(app), card = $('heroCard');
    var apply = function () {
      $('heroTitle').textContent = cleanName(app.name);
      $('heroLine').textContent = brand[2] || 'Open ' + cleanName(app.name);
      var box = $('heroArtBox'), custom = artOf(app);
      box.style.background = custom ? custom[1] : '';
      if (custom) {
        box.innerHTML = withIcon(custom[2], app.icon);
      } else {
        box.innerHTML = '<img alt="">';
        var art = box.firstChild;
        art.onload = function () {
          if (art.naturalWidth < 130) box.innerHTML = '<div class="art-name">' + esc(cleanName(app.name)) + '</div>';
          else if (art.naturalWidth < 250) art.className = 'small';
        };
        art.src = app.icon || '';
      }
      card.dataset.launch = app.id;
      card.dataset.name = cleanName(app.name);
      card.classList.remove('swap');
    };
    paintHeroBg(brand[1]);
    if (instant) apply(); else { card.classList.add('swap'); setTimeout(apply, 200); }
  }

  // Each app gets a deep shade of its own colour, never a blend with teal (that goes muddy).
  // Two layers cross-fade on opacity, which the TV composites cheaply.
  var heroBgFront = 'heroBgA';
  function paintHeroBg(rgb) {
    var c = rgb.split(',').map(Number);
    var deep = c.map(function (v, k) { return Math.round(v * .2 + [10, 16, 18][k] * .8); }).join(',');
    var mid = c.map(function (v, k) { return Math.round(v * .34 + [10, 16, 18][k] * .66); }).join(',');
    heroBgFront = heroBgFront === 'heroBgA' ? 'heroBgB' : 'heroBgA';
    var front = $(heroBgFront), back = $(heroBgFront === 'heroBgA' ? 'heroBgB' : 'heroBgA');
    front.style.background =
      'radial-gradient(620px 460px at 79% 50%, rgba(' + rgb + ', .42), transparent 72%),' +
      'linear-gradient(100deg, rgb(' + deep + ') 0%, rgb(' + deep + ') 45%, rgb(' + mid + ') 100%)';
    front.classList.add('on');
    back.classList.remove('on');
  }
  function startHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(function () {
      if (state.page === 'home' && rowName() !== 'hero' && !ambientOn && !document.hidden) showHero(heroIndex + 1);
    }, 9000);
  }

  /* ---------- focus ---------- */
  var ROWS = {home: ['top', 'hero', 'apps', 'today', 'tv', 'controls'], apps: ['top', 'grid']};
  var ROW_EL = {apps: 'appsRow', tv: 'tvRow', controls: 'ctrlRow', today: 'todayRow', grid: 'appsGrid'};
  var GRID_COLS = 5;
  var PAGE_HEIGHT = 948;
  var state = {page: 'home', row: 1, cols: {top: 0, hero: 0, apps: 0, tv: 0, controls: 0, today: 0, grid: 0}};

  function rowName() { return ROWS[state.page][state.row]; }
  function children(id) { return Array.prototype.slice.call($(id).children); }
  function items(name) {
    if (name === 'top') {
      return Array.prototype.slice.call(document.querySelectorAll('#topbar .focusable')).filter(function (e) { return !e.hidden; });
    }
    if (name === 'hero') return featured.length ? [$('heroCard')] : [];
    return ROW_EL[name] ? children(ROW_EL[name]) : [];
  }
  function current() { var list = items(rowName()); return list[Math.min(state.cols[rowName()], list.length - 1)]; }

  function refocus() {
    var prev = document.querySelector('.focused');
    if (prev) prev.classList.remove('focused');
    var name = rowName(), list = items(name);
    if (!list.length) {
      if (state.row > 0) { state.row--; return refocus(); }
      return;
    }
    state.cols[name] = Math.max(0, Math.min(state.cols[name], list.length - 1));
    var el = list[state.cols[name]];
    el.classList.add('focused');
    scrollInto(name, el);
    showLabel(name === 'apps' ? el : null);
    $('wxPanel').classList.toggle('show', el === $('weather'));
  }

  function scrollInto(name, el) {
    if (name !== 'top' && name !== 'hero' && name !== 'grid') {
      // Keep one tile of context on the left once the row starts scrolling.
      var row = el.parentNode, max = Math.max(0, row.scrollWidth - 1920);
      var x = Math.max(0, Math.min(el.offsetLeft - 96 - el.offsetWidth - 28, max));
      setTransform(row, 'translateX(' + (-x) + 'px)');
    }
    if (state.page === 'home' && name !== 'top') {
      // Scroll the page just enough to show the focused shelf (rows below the TV row).
      var shelf = el.parentNode.parentNode, bottom = name === 'hero' ? 0 : shelf.offsetTop + shelf.offsetHeight;
      setTransform($('homeScroll'), 'translateY(' + (-Math.max(0, bottom - PAGE_HEIGHT + 24)) + 'px)');
    }
    if (name === 'grid') {
      var r = Math.floor(state.cols.grid / GRID_COLS);
      setTransform($('appsGrid'), 'translateY(' + (-Math.max(0, r - 2) * 216) + 'px)');
    }
  }

  function setTransform(el, t) {
    if (el._t !== t) { el._t = t; el.style.transform = t; }
  }

  var labelTimer;
  function showLabel(el) {
    var label = $('focusLabel');
    label.classList.remove('show');
    clearTimeout(labelTimer);
    if (!el) return;
    labelTimer = setTimeout(function () {
      var r = el.getBoundingClientRect(), base = $('homeScroll').getBoundingClientRect();
      label.textContent = el.dataset.name;
      label.style.left = (r.left - base.left) + 'px';
      label.style.top = (r.bottom - base.top + 14) + 'px';
      label.classList.add('show');
    }, 240);
  }

  function move(dx, dy) {
    var name = rowName(), list = items(name);
    if (name === 'grid') {
      var i = state.cols.grid;
      if (dx) { state.cols.grid = Math.max(0, Math.min(list.length - 1, i + dx)); return refocus(); }
      if (dy < 0 && i < GRID_COLS) { state.row = 0; return refocus(); }
      state.cols.grid = Math.max(0, Math.min(list.length - 1, i + dy * GRID_COLS));
      return refocus();
    }
    if (dx) {
      if (name === 'hero') { showHero(heroIndex + dx); return; }
      state.cols[name] = Math.max(0, Math.min(list.length - 1, state.cols[name] + dx));
      return refocus();
    }
    var rows = ROWS[state.page], next = state.row + dy;
    while (next >= 0 && next < rows.length && !items(rows[next]).length) next += dy;
    if (next < 0 || next >= rows.length) return;
    state.row = next;
    refocus();
  }

  function buildGrid() {
    var grid = $('appsGrid'); grid.innerHTML = '';
    userApps.forEach(function (a) { grid.appendChild(tileFor(a, {label: true})); });
  }
  function setPage(page) {
    state.page = page;
    if (page === 'apps') buildGrid(); else $('appsGrid').innerHTML = '';
    document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === page); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === page); });
  }

  function activate() {
    var el = current();
    if (!el) return;
    if (el.dataset.tab) {
      setPage(el.dataset.tab);
      state.row = 0;
      state.cols.top = items('top').indexOf(el);
      return refocus();
    }
    if (el._action) return el._action(el);
    if (el.dataset.launch) openApp(el.dataset.launch, el.dataset.name);
  }

  // Long-press OK on an app opens its menu (lock / unlock).
  function longPress() {
    var el = current();
    if (el && el.dataset.launch && el.parentNode.id !== 'tvRow') appMenu(el.dataset.launch, el.dataset.name, rowName() === 'apps' || rowName() === 'grid');
  }

  /* ---------- launching ---------- */
  function openApp(id, name) {
    if (isLocked(id)) return askPin('Enter PIN to open ' + name, function () { launch(id, name); });
    launch(id, name);
  }
  // Samsung's system apps (Settings, Live TV...) ignore launches from a Public-certificate app, often while
  // reporting success, so they go through Vetro (root) first. "key:NAME" ids press a remote key instead.
  var SYSTEM_APP = /^(org\.tizen\.|com\.samsung\.tv\.)/;
  function launch(id, name) {
    if (/^key:/.test(id)) return remoteKey(id.slice(4), name);
    if (!hasTizen) return toast('Opening ' + (name || id));
    var viaTizen = function (fallback) {
      try { tizen.application.launch(id, function () {}, fallback); } catch (e) { fallback(); }
    };
    var viaVetro = function (fallback) {
      vetro('/apps/launch', {appId: id}).catch(function (e) {
        if (fallback) fallback(); else toast((name || 'This app') + " didn't open. " + vetroProblem(e));
      });
    };
    if (SYSTEM_APP.test(id)) viaVetro(function () { viaTizen(function () { toast((name || 'This app') + " didn't open."); }); });
    else viaTizen(function () { viaVetro(); });
  }

  // Presses a remote key through the TV's own remote-control API (port 8001), like a phone remote.
  // The TV asks once to allow "Garage Home"; the pairing token is kept.
  function remoteKey(key, name) {
    if (!hasTizen) return toast('Pressing ' + (name || key));
    var token = store('gh.remoteToken'), done = false;
    var url = 'ws://127.0.0.1:8001/api/v2/channels/samsung.remote.control?name=' + btoa('Garage Home') +
      (token ? '&token=' + encodeURIComponent(token) : '');
    var ws;
    try { ws = new WebSocket(url); } catch (e) { return toast((name || key) + " didn't work."); }
    var finish = function (msg) { if (done) return; done = true; if (msg) toast(msg); try { ws.close(); } catch (e) {} };
    var timer = setTimeout(function () {
      finish((name || key) + " didn't work. Allow Garage Home on the TV, or turn on IP Remote in Settings → General → Network → Expert settings.");
    }, 12000);
    ws.onmessage = function (m) {
      var d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (d.event === 'ms.channel.connect') {
        if (d.data && d.data.token) store('gh.remoteToken', d.data.token);
        ws.send(JSON.stringify({method: 'ms.remote.control', params: {Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey'}}));
        clearTimeout(timer);
        setTimeout(function () { finish(); }, 600);
      } else if (d.event === 'ms.channel.unauthorized') {
        clearTimeout(timer);
        finish('The TV blocked Garage Home. Allow it in Settings → General → External Device Manager → Device Connection Manager.');
      }
    };
    ws.onerror = function () { clearTimeout(timer); finish((name || key) + " didn't work. The TV's remote control service isn't available."); };
  }

  /* ---------- pairing code: Vetro asks the TV to show it when a browser or script signs in ---------- */
  var pairShown = null;
  function checkPairing() {
    if (!hasTizen || document.hidden) return;
    vetro('/auth/pending').then(function (d) {
      if (d.code && d.code !== pairShown) {
        pairShown = d.code;
        openModal('<h3>Pair with Vetro</h3><p class="m-text">' + esc(d.name) + ' wants to control this TV. Enter this code there:</p>' +
          '<div class="pair-code">' + esc(d.code.slice(0, 3) + ' ' + d.code.slice(3)) + '</div>' +
          '<p class="m-text">Didn\'t ask for this? Press Back and the code expires in 2 minutes.</p><div class="m-item m-row"><span>Close</span></div>', {cls: 'pair'});
        bindItems([closeModal]);
      } else if (!d.code && pairShown) {
        pairShown = null;
        if (modal && modal.el.querySelector('.pair-code')) { closeModal(); toast('Pairing finished'); }
      }
    }).catch(function () {});
  }

  /* ---------- modal sheets (PIN pad, app menu, news) ---------- */
  var modal = null;
  function openModal(html, opts) {
    closeModal();
    var el = $('modal');
    el.innerHTML = '<div class="sheet ' + (opts.cls || '') + '">' + html + '</div>';
    el.classList.add('show');
    modal = {el: el, cols: opts.cols || 1, index: opts.index || 0, onBack: opts.onBack};
    modalFocus();
  }
  function closeModal() {
    if (!modal) return;
    modal.el.classList.remove('show');
    modal.el.innerHTML = '';
    modal = null;
  }
  function modalItems() { return Array.prototype.slice.call(modal.el.querySelectorAll('.m-item')); }
  function modalFocus() {
    var list = modalItems();
    modal.index = Math.max(0, Math.min(modal.index, list.length - 1));
    list.forEach(function (x, i) { x.classList.toggle('focused', i === modal.index); });
    var f = list[modal.index];
    if (f && f.scrollIntoView && f.parentNode.classList.contains('m-scroll')) f.scrollIntoView({block: 'nearest'});
  }
  function modalKey(code) {
    var list = modalItems(), c = modal.cols, i = modal.index;
    if (code === 37 && i % c > 0) modal.index--;
    else if (code === 39 && i % c < c - 1 && i + 1 < list.length) modal.index++;
    else if (code === 38 && i - c >= 0) modal.index -= c;
    else if (code === 40 && i + c < list.length) modal.index += c;
    else if (code === 13 && list[i]) return list[i]._action();
    else if (code >= 48 && code <= 57 && modal.digit) return modal.digit(String(code - 48));
    else if (code === 10009 || code === 27 || code === 8) { var cb = modal.onBack; closeModal(); if (cb) cb(); return; }
    modalFocus();
  }
  function bindItems(actions) {
    modalItems().forEach(function (x, i) { x._action = actions[i]; });
  }

  /* ---------- kids lock ---------- */
  function lockedIds() { return store('gh.locked') || []; }
  function isLocked(id) { return lockedIds().indexOf(id) >= 0; }
  function hashPin(pin) { var h = 5381; for (var i = 0; i < pin.length; i++) h = (h * 33 + pin.charCodeAt(i)) >>> 0; return 'p' + h; }
  function setLocked(id, on) {
    var ids = lockedIds().filter(function (x) { return x !== id; });
    if (on) ids.push(id);
    store('gh.locked', ids);
    document.querySelectorAll('.tile[data-launch="' + id + '"]').forEach(function (t) { t.classList.toggle('locked', on); });
  }
  function appMenu(id, name, movable) {
    var locked = isLocked(id), html = '<h3>' + esc(name) + '</h3>', actions = [];
    if (movable) {
      html += '<div class="m-item m-row">' + icon('move') + '<span>Move</span></div>';
      actions.push(function () { closeModal(); startMove(id); });
    }
    html += '<div class="m-item m-row">' + icon('lock') + '<span>' + (locked ? 'Remove PIN lock' : 'Lock with PIN') + '</span></div>';
    actions.push(function () {
      closeModal();
      if (!store('gh.pin')) return choosePin(function () { setLocked(id, true); toast(name + ' is locked'); });
      askPin(locked ? 'Enter PIN to unlock ' + name : 'Enter PIN to lock ' + name, function () {
        setLocked(id, !locked);
        toast(locked ? name + ' is unlocked' : name + ' is locked');
      });
    });
    if (store('gh.order')) {
      html += '<div class="m-item m-row"><span>Reset app order</span></div>';
      actions.push(function () { closeModal(); store('gh.order', null); render(allApps); toast('App order reset'); });
    }
    html += '<div class="m-item m-row"><span>Cancel</span></div>';
    actions.push(closeModal);
    openModal(html, {cls: 'menu'});
    bindItems(actions);
  }

  /* ---------- arranging apps (Move / Arrange apps) ---------- */
  var moving = null, arranging = false;
  // Arrange mode: OK picks an app, ◀ ▶ move it, OK drops it; pick another or press Back to finish.
  function startArrange() {
    if (state.page !== 'home') setPage('home');
    arranging = true;
    state.row = ROWS.home.indexOf('apps');
    state.cols.apps = 0;
    refocus();
    document.body.classList.add('arranging');
    toast('Arrange apps: OK picks an app, ◀ ▶ moves it, OK drops it. Back when done.');
  }
  function stopArrange() {
    arranging = false;
    moving = null;
    paintMoving();
    document.body.classList.remove('arranging');
    toast('App order saved');
  }
  function startMove(id) {
    moving = id;
    paintMoving();
    var nm = cleanName((userApps.filter(function (a) { return a.id === id; })[0] || {}).name || '');
    toast(arranging ? 'Moving ' + nm + ': ◀ ▶ then OK to drop it' : 'Use ◀ ▶ to move ' + nm + ', then OK');
  }
  function paintMoving() {
    document.querySelectorAll('.tile.moving').forEach(function (t) { t.classList.remove('moving'); });
    if (moving) document.querySelectorAll('.tile[data-launch="' + moving + '"]').forEach(function (t) { t.classList.add('moving'); });
  }
  function moveBy(step) {
    var ids = userApps.map(function (a) { return a.id; }), i = ids.indexOf(moving), j = i + step;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(i, 1); ids.splice(j, 0, moving);
    store('gh.order', ids);
    render(allApps);
    state.cols[rowName()] = j;
    refocus();
    paintMoving();
  }
  function endMove() {
    moving = null;
    paintMoving();
    if (!arranging) toast('App order saved');
  }
  function choosePin(done) {
    pinPad('Choose a 4-digit PIN', function (first) {
      pinPad('Enter the same PIN again', function (second) {
        if (first !== second) { toast("The PINs didn't match. Try again."); return choosePin(done); }
        store('gh.pin', hashPin(first));
        done();
      });
    });
  }
  function askPin(title, ok) {
    pinPad(title, function (pin) {
      if (hashPin(pin) === store('gh.pin')) return ok();
      toast('Wrong PIN');
    });
  }
  function pinPad(title, done) {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'], pin = '';
    openModal('<h3>' + esc(title) + '</h3><div class="dots"><i></i><i></i><i></i><i></i></div><div class="pad">' +
      keys.map(function (k) {
        return '<div class="m-item key">' + (k === 'del' ? '⌫' : k === 'ok' ? '✓' : k) + '</div>';
      }).join('') + '</div>', {cls: 'pin', cols: 3, index: 4});
    var paint = function () {
      var dots = modal.el.querySelectorAll('.dots i');
      for (var d = 0; d < dots.length; d++) dots[d].className = d < pin.length ? 'on' : '';
    };
    var digit = function (k) {
      if (pin.length >= 4) return;
      pin += k; paint();
      if (pin.length === 4) setTimeout(function () { closeModal(); done(pin); }, 150);
    };
    bindItems(keys.map(function (k) {
      if (k === 'del') return function () { pin = pin.slice(0, -1); paint(); };
      if (k === 'ok') return function () { if (pin.length === 4) { closeModal(); done(pin); } };
      return function () { digit(k); };
    }));
    modal.digit = digit;
  }

  /* ---------- quick controls ---------- */
  var backlight = null;
  function changeBrightness(step) {
    var read = backlight === null
      ? vetro('/tv-settings').then(function (d) {
          var item = d.items.filter(function (x) { return x.id === 'backlight'; })[0];
          if (!item) throw new Error('no brightness');
          return item.value;
        })
      : Promise.resolve(backlight);
    read.then(function (value) {
      var next = Math.max(0, Math.min(50, value + step));
      return vetro('/tv-settings', {id: 'backlight', value: next, expected: value}).then(function (r) {
        backlight = r.value;
        toast('Brightness ' + Math.round(backlight * 2) + '%');
      });
    }).catch(function (e) { backlight = null; toast("Brightness didn't change. " + vetroProblem(e)); });
  }
  function key(name, label) {
    return function () { pressKey(name).catch(function (e) { toast(label + " didn't work. " + vetroProblem(e)); }); };
  }

  // Sleep timer: a Tizen alarm relaunches Garage Home, which then turns the TV off through Vetro.
  var SLEEP_STEPS = [0, 15, 30, 60, 90];
  function sleepState() { var s = store('gh.sleep'); return s && s.at > Date.now() ? s : null; }
  function sleepLabel() {
    var s = sleepState();
    return s ? 'Off in ' + Math.max(1, Math.round((s.at - Date.now()) / 60000)) + ' min' : 'Sleep timer';
  }
  function cycleSleep(el) {
    var s = sleepState(), mins = s ? Math.round((s.at - Date.now()) / 60000) : 0;
    var next = SLEEP_STEPS.filter(function (m) { return m > mins + 1; })[0] || 0;
    if (s && hasTizen && s.id) { try { tizen.alarm.remove(s.id); } catch (e) {} }
    if (!next) { store('gh.sleep', null); toast('Sleep timer off'); }
    else {
      var id = null;
      if (hasTizen) {
        var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null,
          [new tizen.ApplicationControlData('action', ['sleep'])]);
        var alarm = new tizen.AlarmRelative(next * 60);
        tizen.alarm.add(alarm, tizen.application.getCurrentApplication().appInfo.id, ctrl);
        id = alarm.id;
      }
      store('gh.sleep', {id: id, at: Date.now() + next * 60000});
      toast('The TV turns off in ' + next + ' minutes');
    }
    el.querySelector('.name').textContent = sleepLabel();
  }
  function checkSleepRequest() {
    if (!hasTizen) return;
    try {
      var req = tizen.application.getCurrentApplication().getRequestedAppControl();
      var data = req && req.appControl.data || [];
      var asked = data.some(function (d) { return d.key === 'action' && d.value[0] === 'sleep'; });
      var s = store('gh.sleep');
      if (asked && s && Math.abs(s.at - Date.now()) < 5 * 60000) { store('gh.sleep', null); sleepCountdown(); }
    } catch (e) {}
  }
  function sleepCountdown() {
    var left = 15;
    openModal('<h3>Sleep timer</h3><p class="m-text" id="sleepText"></p><div class="m-item m-row"><span>Keep watching</span></div>',
      {cls: 'menu'});
    var tickDown = setInterval(function () {
      if (!modal) return clearInterval(tickDown);
      $('sleepText').textContent = 'The TV turns off in ' + left + ' seconds.';
      if (left-- <= 0) { clearInterval(tickDown); closeModal(); pressKey('XF86PowerOff'); }
    }, 1000);
    $('sleepText').textContent = 'The TV turns off in 15 seconds.';
    bindItems([function () { clearInterval(tickDown); closeModal(); toast('Sleep timer cancelled'); }]);
    modal.onBack = function () { clearInterval(tickDown); };
  }

  function renderControls() {
    var row = $('ctrlRow');
    row.innerHTML = '';
    [
      actionTile('mute', 'Mute', key('XF86AudioMute', 'Mute')),
      actionTile('voldown', 'Volume down', key('XF86AudioLowerVolume', 'Volume')),
      actionTile('volup', 'Volume up', key('XF86AudioRaiseVolume', 'Volume')),
      actionTile('dim', 'Dimmer', function () { changeBrightness(-5); }),
      actionTile('bright', 'Brighter', function () { changeBrightness(5); }),
      actionTile('sleep', sleepLabel(), cycleSleep),
      actionTile('tasks', 'Running apps', openTasks),
      actionTile('move', 'Arrange apps', startArrange)
    ].forEach(function (t) { row.appendChild(t); });
  }

  /* ---------- task manager: running apps through Vetro ---------- */
  // Only apps you could open yourself are listed; system services stay hidden, and Vetro refuses protected parts.
  function openTasks() {
    openModal('<h3>Running apps</h3><p class="m-text" id="taskNote">Checking what is running…</p><div class="m-scroll" id="taskList"></div>', {cls: 'news tasks'});
    vetro('/monitor?scope=full').then(function (d) {
      if (!modal || !$('taskList')) return;
      var known = {}, mem = {};
      allApps.forEach(function (a) { known[a.id] = a; });
      ((d.data && d.data.processes) || d.processes || []).forEach(function (p) {
        if (p.appId) mem[p.appId] = (mem[p.appId] || 0) + (p.rssBytes || 0);
      });
      var ids = Object.keys(mem), shown = ids.filter(function (id) {
        var a = known[id];
        return a && a.show && id.indexOf(SELF) !== 0 && !/^vetrotvapp/.test(id);
      }).sort(function (a, b) { return mem[b] - mem[a]; });
      var hidden = ids.length - shown.length;
      $('taskNote').textContent = shown.length
        ? 'Choose an app to close it. ' + hidden + ' system services are hidden.'
        : 'No apps are running besides Garage Home. ' + hidden + ' system services are hidden.';
      $('taskList').innerHTML = shown.map(function (id) {
        return '<div class="m-item m-news"><b>' + esc(cleanName(known[id].name)) + '</b><span>' + Math.round(mem[id] / 1048576) + ' MB memory</span></div>';
      }).join('');
      modal.index = 0;
      bindItems(shown.map(function (id) { return function () { confirmClose(id, cleanName(known[id].name)); }; }));
      modalFocus();
    }).catch(function (e) { if ($('taskNote')) $('taskNote').textContent = "Can't read running apps. " + vetroProblem(e); });
  }
  function confirmClose(id, name) {
    openModal('<h3>Close ' + esc(name) + '?</h3><p class="m-text">Unsaved progress in the app may be lost.</p>' +
      '<div class="m-item m-row"><span>Close app</span></div><div class="m-item m-row"><span>Cancel</span></div>', {cls: 'menu', onBack: openTasks});
    bindItems([function () {
      closeModal();
      vetro('/components/action', {action: 'stop', appId: id}).then(function () {
        toast(name + ' closed');
        setTimeout(openTasks, 600);
      }).catch(function (e) { toast(name + " didn't close. " + (/protected/i.test(e.message) ? 'It is a protected system app.' : vetroProblem(e))); });
    }, openTasks]);
  }

  /* ---------- Today row: news, holiday, exchange rate, phone remote ---------- */
  var news = [], newsIndex = 0;
  function todayCard(cls, iconName, kicker, action) {
    var el = document.createElement('div');
    el.className = 'tile card focusable ' + cls;
    el.innerHTML = '<div class="card-head">' + icon(iconName) + '<span>' + esc(kicker) + '</span></div><div class="card-body"></div>';
    if (action) el._action = action;
    $('todayRow').appendChild(el);
    return el.querySelector('.card-body');
  }
  function renderToday() {
    $('todayRow').innerHTML = '';
    var newsBody = todayCard('news-card', 'news', 'World news', openNews);
    var holidayBody = todayCard('holiday-card', 'flag', 'Next holiday');
    var fxBody = todayCard('fx-card', 'coin', 'Exchange rate');
    var qrBody = todayCard('qr-card', 'phone', 'Phone remote', showQrLarge);

    getJson('https://ok.surf/api/v1/cors/news-feed').then(function (d) {
      news = (d.World || []).filter(function (n) { return n.title; }).slice(0, 12);
      paintNews(newsBody);
    }).catch(function () { newsBody.innerHTML = '<p class="muted">News is unavailable right now.</p>'; });

    getJson('https://date.nager.at/api/v3/NextPublicHolidays/AL').then(function (list) {
      var h = list[0], days = Math.ceil((new Date(h.date + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5);
      holidayBody.innerHTML = '<b>' + esc(h.localName) + '</b><p>' + esc(h.name) + '</p><p class="muted">' +
        new Date(h.date + 'T12:00:00').toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'}) +
        (days > 0 ? ', in ' + days + (days === 1 ? ' day' : ' days') : ', today') + '</p>';
    }).catch(function () { holidayBody.innerHTML = '<p class="muted">Holidays are unavailable right now.</p>'; });

    getJson('https://open.er-api.com/v6/latest/EUR').then(function (d) {
      var all = d.rates.ALL, usd = all / d.rates.USD;
      fxBody.innerHTML = '<b>1 € = ' + all.toFixed(2) + ' L</b><p>1 $ = ' + usd.toFixed(2) + ' L</p>' +
        '<p class="muted">Updated ' + new Date(d.time_last_update_unix * 1000).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}) + '</p>';
    }).catch(function () { fxBody.innerHTML = '<p class="muted">Rates are unavailable right now.</p>'; });

    tvIp(function (ip) {
      if (!ip) { qrBody.innerHTML = '<p class="muted">Open http://&lt;TV IP&gt;:8099 on your phone (Settings → General → Network shows the IP).</p>'; return; }
      qrUrl = 'http://' + ip + ':8099/';
      qrBody.innerHTML = '<div class="qr">' + qrSvg(qrUrl) + '</div><p>Scan to control the TV from your phone</p>';
    });
  }
  function paintNews(body) {
    if (!news.length) { body.innerHTML = '<p class="muted">No headlines right now.</p>'; return; }
    var n = news[newsIndex % news.length];
    body.innerHTML = (n.og ? '<img class="news-img" src="' + esc(n.og) + '" alt="">' : '') +
      '<div class="news-text"><b>' + esc(n.title) + '</b><p class="muted">' + esc(n.source || '') + '</p></div>';
  }
  function rotateNews() {
    if (!news.length || ambientOn || document.hidden) return;
    newsIndex++;
    var body = document.querySelector('.news-card .card-body');
    if (body) paintNews(body);
  }
  function openNews() {
    if (!news.length) return;
    openModal('<h3>World news</h3><div class="m-scroll">' + news.map(function (n) {
      return '<div class="m-item m-news"><b>' + esc(n.title) + '</b><span>' + esc(n.source || '') + '</span></div>';
    }).join('') + '</div>', {cls: 'news'});
    bindItems(news.map(function (n) { return function () { openLink(n.link); }; }));
  }
  function openLink(url) {
    if (!hasTizen) return toast('Opening the article');
    var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', url);
    tizen.application.launchAppControl(ctrl, null, function () {}, function () { toast("The browser didn't open."); });
  }

  var qrUrl = '';
  function qrSvg(text) {
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#0f2326"/></svg>';
  }
  function showQrLarge() {
    if (!qrUrl) return;
    openModal('<h3>Phone remote</h3><div class="qr big">' + qrSvg(qrUrl) + '</div><p class="m-text">Scan with your phone camera to open Vetro.<br>' +
      esc(qrUrl.replace(/^http:\/\//, '').replace(/\/$/, '')) + '</p><div class="m-item m-row"><span>Close</span></div>', {cls: 'menu qr-sheet'});
    bindItems([closeModal]);
  }
  function tvIp(cb) {
    if (!hasTizen || !tizen.systeminfo) return cb(TV_LAN_IP);
    var tried = 0, done = false;
    ['ETHERNET_NETWORK', 'WIFI_NETWORK'].forEach(function (prop) {
      try {
        tizen.systeminfo.getPropertyValue(prop, function (v) {
          tried++;
          if (!done && v && v.ipAddress && v.ipAddress !== '0.0.0.0') { done = true; cb(v.ipAddress); }
          else if (tried === 2 && !done) cb(TV_LAN_IP);
        }, function () { tried++; if (tried === 2 && !done) cb(TV_LAN_IP); });
      } catch (e) { tried++; if (tried === 2 && !done) cb(TV_LAN_IP); }
    });
  }

  /* ---------- ambient mode ---------- */
  var ambientOn = false, idleTimer = null, photos = [], photoIndex = 0, photoTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startAmbient, IDLE_MINUTES * 60000);
  }
  function loadPhotos() {
    var cached = store('gh.photos');
    if (cached && Date.now() - cached.at < 6 * 36e5) { photos = cached.list; return Promise.resolve(); }
    return getJson('https://peapix.com/bing/feed?country=us').then(function (list) {
      photos = list.map(function (p) { return {url: p.fullUrl, title: p.title}; }).filter(function (p) { return p.url; });
      store('gh.photos', {at: Date.now(), list: photos});
    });
  }
  function startAmbient() {
    if (ambientOn || document.hidden || modal) return;
    loadPhotos().then(function () {
      if (!photos.length) return;
      ambientOn = true;
      closeModal();
      $('ambient-mode').classList.add('show');
      showPhoto();
      photoTimer = setInterval(showPhoto, 45000);
    }).catch(function () {});
  }
  var photoFront = 'photoA';
  function showPhoto() {
    var p = photos[photoIndex++ % photos.length], img = new Image();
    img.onload = function () {
      photoFront = photoFront === 'photoA' ? 'photoB' : 'photoA';
      var front = $(photoFront), back = $(photoFront === 'photoA' ? 'photoB' : 'photoA');
      front.style.backgroundImage = 'url("' + p.url + '")';
      front.classList.add('on');
      back.classList.remove('on');
      $('amTitle').textContent = p.title || '';
    };
    img.src = p.url;
    $('amTime').textContent = $('time').textContent;
    $('amDate').textContent = $('date').textContent;
    $('amWx').innerHTML = $('weather').hidden ? '' : $('wxIco').innerHTML + '<span>' + esc($('wxTemp').textContent) + ' ' + esc($('wxCity').textContent) + '</span>';
  }
  function stopAmbient() {
    ambientOn = false;
    clearInterval(photoTimer);
    $('ambient-mode').classList.remove('show');
    // Two full-screen photos are ~16 MB decoded: let them go once the fade-out is done.
    setTimeout(function () {
      if (ambientOn) return;
      ['photoA', 'photoB'].forEach(function (id) { $(id).style.backgroundImage = ''; $(id).classList.remove('on'); });
    }, 900);
    resetIdle();
  }

  /* ---------- back, toast, clock ---------- */
  var backArmed = 0;
  function back() {
    if (state.page !== 'home') { setPage('home'); state.row = 1; return refocus(); }
    if (rowName() !== 'hero') { state.row = 1; return refocus(); }
    if (Date.now() - backArmed < 2500) {
      if (hasTizen) tizen.application.getCurrentApplication().hide();
      return;
    }
    backArmed = Date.now();
    toast('Press Back again to leave Garage Home');
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function tick() {
    var d = new Date();
    $('time').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    $('date').textContent = d.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'});
    if (ambientOn) { $('amTime').textContent = $('time').textContent; $('amDate').textContent = $('date').textContent; }
    var sleepTile = document.querySelector('#ctrlRow .tile:nth-child(6) .name');
    if (sleepTile) sleepTile.textContent = sleepLabel();
  }

  /* ---------- weather (Open-Meteo, no key; location from ipwho.is, cached a day) ---------- */
  var FIXED_PLACE = CONFIG.place || null;   // {city, lat, lon} from garage.env; otherwise located by IP
  var WX = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    partly: '<path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1"/><path d="M5.6 10.5a3 3 0 0 1 5.3-2.9"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1A3 3 0 0 0 8.5 19.5z"/>',
    cloud: '<path d="M7 19h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 12.4 3.3 3.3 0 0 0 7 19z"/>',
    fog: '<path d="M7 13.5h10.5a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 8a2.8 2.8 0 0 0 0 5.5zM4 17h16M6 20.5h12"/>',
    rain: '<path d="M7 14.5h10.5a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 9a2.8 2.8 0 0 0 0 5.5zM8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
    snow: '<path d="M7 14.5h10.5a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 9a2.8 2.8 0 0 0 0 5.5z"/><path d="M8 18.5h.01M12 18.5h.01M16 18.5h.01M10 21h.01M14 21h.01" stroke-width="2.5"/>',
    storm: '<path d="M7 14.5h10.5a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 9a2.8 2.8 0 0 0 0 5.5z"/><path d="M12.5 14.5l-2 3.5h3l-2 3.5"/>'
  };
  function wxKind(code, day) {
    if (code === 0 || code === 1) return day ? 'sun' : 'moon';
    if (code === 2) return day ? 'partly' : 'cloud';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'rain';
  }
  function wxIcon(kind) { return '<svg class="ico" viewBox="0 0 24 24">' + WX[kind] + '</svg>'; }
  function place() {
    if (FIXED_PLACE) return Promise.resolve(FIXED_PLACE);
    var c = store('gh.place');
    if (c && Date.now() - c.at < 864e5) return Promise.resolve(c);
    return getJson('https://ipwho.is/?fields=success,city,latitude,longitude').then(function (d) {
      if (!d.success) throw new Error('no location');
      var p = {city: d.city.replace(/^Bashkia\s+/, ''), lat: d.latitude, lon: d.longitude, at: Date.now()};
      store('gh.place', p);
      return p;
    }).catch(function () { return null; });
  }
  function weather() {
    place().then(function (p) {
      if (!p) throw new Error('no location');
      return getJson('https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
        '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto')
        .then(function (d) {
          $('wxIco').innerHTML = wxIcon(wxKind(d.current.weather_code, d.current.is_day));
          $('wxTemp').textContent = Math.round(d.current.temperature_2m) + '°';
          $('wxCity').textContent = p.city;
          $('wxRange').textContent = Math.round(d.daily.temperature_2m_max[0]) + '° / ' + Math.round(d.daily.temperature_2m_min[0]) + '°';
          $('wxPanel').innerHTML = d.daily.time.map(function (day, i) {
            var name = i === 0 ? 'Today' : new Date(day + 'T12:00:00').toLocaleDateString(undefined, {weekday: 'short'});
            return '<div class="wx-day"><span>' + esc(name) + '</span>' + wxIcon(wxKind(d.daily.weather_code[i], 1)) +
              '<b>' + Math.round(d.daily.temperature_2m_max[i]) + '°</b><em>' + Math.round(d.daily.temperature_2m_min[i]) + '°</em></div>';
          }).join('');
          $('weather').hidden = false;
        });
    }).catch(function () { $('weather').hidden = true; });
  }

  /* ---------- input ---------- */
  document.querySelectorAll('.chip').forEach(function (c) { c.innerHTML = icon(c.dataset.icon); });
  $('weather')._action = weather;

  var lastKey = 0, okDown = 0, okLong = false, okTimer = null;
  document.addEventListener('keydown', function (e) {
    resetIdle();
    if (ambientOn) { stopAmbient(); e.preventDefault(); return; }
    var now = Date.now();
    if (arranging && !moving) {
      var ak = e.keyCode;
      if (ak === 37) move(-1, 0);
      else if (ak === 39) move(1, 0);
      else if (ak === 13 && !e.repeat) { var pick = current(); if (pick && pick.dataset.launch) startMove(pick.dataset.launch); }
      else if (ak === 10009 || ak === 27 || ak === 8) stopArrange();
      e.preventDefault();
      return;
    }
    if (moving) {
      var code = e.keyCode, cols = rowName() === 'grid' ? GRID_COLS : 0;
      if (code === 37) moveBy(-1);
      else if (code === 39) moveBy(1);
      else if (code === 38 && cols) moveBy(-cols);
      else if (code === 40 && cols) moveBy(cols);
      else if (code === 13 && !e.repeat) endMove();
      else if (code === 10009 || code === 27 || code === 8) { if (arranging) stopArrange(); else endMove(); }
      e.preventDefault();
      return;
    }
    if (modal) {
      if (!(e.repeat && now - lastKey < 110)) { lastKey = now; modalKey(e.keyCode); }
      e.preventDefault();
      return;
    }
    if (e.keyCode === 13) {
      // OK: a short press activates, holding it opens the app menu.
      e.preventDefault();
      if (!e.repeat) {
        okDown = now; okLong = false;
        clearTimeout(okTimer);
        // Still held after 1.5 s without repeats or release: that is a hold too.
        okTimer = setTimeout(function () { if (okDown && !okLong) { okLong = true; longPress(); } }, 1500);
      } else if (okDown && !okLong && now - okDown > 550) {
        okLong = true; clearTimeout(okTimer); longPress();
      }
      return;
    }
    if (e.repeat && now - lastKey < 110) { e.preventDefault(); return; }
    lastKey = now;
    switch (e.keyCode) {
      case 37: move(-1, 0); break;
      case 39: move(1, 0); break;
      case 38: move(0, -1); break;
      case 40: move(0, 1); break;
      case 10009: case 27: case 8: back(); break;
      default: return;
    }
    e.preventDefault();
  });
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== 13 || !okDown || moving || arranging) return;
    clearTimeout(okTimer);
    // Remotes that don't repeat a held key: judge the hold by how long OK stayed down.
    if (!okLong) { if (Date.now() - okDown >= 550) longPress(); else activate(); }
    okDown = 0;
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tick(); getApps(render); checkSleepRequest(); resetIdle(); ensureVetro(); checkPairing(); }
    else {
      // In the background (another app in front): free what is quick to rebuild when we come back.
      if (ambientOn) stopAmbient();
      $('heroArtBox').innerHTML = '';
      $('appsGrid').innerHTML = '';
      document.querySelectorAll('.news-img').forEach(function (i) { i.remove(); });
    }
  });
  window.addEventListener('appcontrol', checkSleepRequest);

  tick();
  setInterval(tick, 15000);
  weather();
  setInterval(weather, 20 * 60000);
  getApps(render);
  renderControls();
  renderToday();
  setInterval(rotateNews, 10000);
  setInterval(function () { renderToday(); if (rowName() === 'today') setTimeout(refocus, 50); }, 30 * 60000);
  startHeroTimer();
  checkSleepRequest();
  resetIdle();
  setInterval(checkPairing, 3000);
  ensureVetro();
  // At boot the TV pre-starts Garage Home hidden (appbootingsupport), and Autorun Last App doesn't bring it
  // forward. Started hidden = pre-started: ask the TV to show us, so boot lands here instead of TV channels.
  if (hasTizen && document.hidden) {
    setTimeout(function () {
      try { tizen.application.launch(tizen.application.getCurrentApplication().appInfo.id, function () {}, function () {}); } catch (e) {}
    }, 300);
  }
  setTimeout(function () { $('splash').classList.add('gone'); }, 1800);
})();
