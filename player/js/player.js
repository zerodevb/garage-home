/* Garage Player video: thin wrapper over Samsung AVPlay (webapis.avplay).
   In a desktop browser there is no AVPlay, so playback is simulated for UI testing. */
var GP = window.GP || {};
(function () {
  'use strict';

  var av = typeof webapis !== 'undefined' && webapis.avplay ? webapis.avplay : null;
  var listeners = {};
  var current = null, rect = null, retries = 0, retryTimer = null, mode = 'fit';
  var MODES = {fit: 'PLAYER_DISPLAY_MODE_LETTER_BOX', fill: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', zoom: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'};

  function emit(name, arg) { if (listeners[name]) listeners[name](arg); }

  function place(r) {
    rect = r;
    var el = document.getElementById('av');
    el.style.left = r[0] + 'px'; el.style.top = r[1] + 'px';
    el.style.width = r[2] + 'px'; el.style.height = r[3] + 'px';
    if (av && current) { try { av.setDisplayRect(r[0], r[1], r[2], r[3]); } catch (e) {} }
  }

  // Samsung's screensaver must stay off while video plays, and come back when it stops.
  function screenSaver(on) {
    try {
      var c = webapis.appcommon;
      c.setScreenSaver(on ? c.AppCommonScreenSaverState.SCREEN_SAVER_ON : c.AppCommonScreenSaverState.SCREEN_SAVER_OFF, function () {}, function () {});
    } catch (e) {}
  }
  var paused = false;
  function pause() {
    if (!current || paused) return false;
    try { if (av) av.pause(); } catch (e) { return false; }
    paused = true; screenSaver(true); emit('paused', true);
    return true;
  }
  function resume() {
    if (!current || !paused) return false;
    try { if (av) av.play(); } catch (e) { return false; }
    paused = false; screenSaver(false); emit('paused', false);
    return true;
  }

  function stop() {
    clearTimeout(retryTimer);
    current = null;
    if (paused) { paused = false; emit('paused', false); }
    screenSaver(true);
    if (!av) return;
    try { av.stop(); } catch (e) {}
    try { av.close(); } catch (e) {}
  }

  function play(channel, ua) {
    stop();
    current = channel;
    retries = 0;
    open(ua);
  }

  function open(ua) {
    var ch = current;
    if (!ch) return;
    emit('buffering', true);
    if (!av) { setTimeout(function () { if (current === ch) emit('buffering', false); }, 400); return; }
    try {
      av.open(ch.url);
      if (ua) { try { av.setStreamingProperty('USER_AGENT', ua); } catch (e) {} }
      av.setListener({
        onbufferingstart: function () { emit('buffering', true); },
        onbufferingcomplete: function () { emit('buffering', false); },
        onstreamcompleted: function () { retry(ua); },
        onerror: function () { retry(ua); },
        onsubtitlechange: function (duration, text) { emit('subtitle', text); }
      });
      av.setDisplayRect(rect[0], rect[1], rect[2], rect[3]);
      try { av.setDisplayMethod(MODES[mode]); } catch (e) {}
      av.prepareAsync(function () {
        if (current !== ch) return;
        try { av.play(); retries = 0; paused = false; screenSaver(false); emit('playing', ch); } catch (e) { retry(ua); }
      }, function () { retry(ua); });
    } catch (e) { retry(ua); }
  }

  // Live streams drop now and then: retry a few times with growing pauses, then report.
  function retry(ua) {
    var ch = current;
    if (!ch) return;
    try { av.stop(); av.close(); } catch (e) {}
    if (retries >= 3) { emit('failed', ch); emit('buffering', false); return; }
    retries++;
    emit('buffering', true);
    retryTimer = setTimeout(function () { if (current === ch) open(ua); }, 1500 * retries);
  }

  function setMode(m) {
    mode = m;
    if (av && current) { try { av.setDisplayMethod(MODES[m]); } catch (e) {} }
  }

  // Audio / subtitle tracks: [{type, index, label}]
  function tracks() {
    if (!av || !current) return [];
    try {
      return av.getTotalTrackInfo().filter(function (t) { return t.type === 'AUDIO' || t.type === 'TEXT'; }).map(function (t) {
        var info = {};
        try { info = JSON.parse(t.extra_info || '{}'); } catch (e) {}
        var lang = info.language || info.track_lang || '';
        return {type: t.type, index: t.index, label: (lang ? lang.toUpperCase() : (t.type === 'AUDIO' ? 'Audio' : 'Subtitles')) + ' ' + (t.index + 1)};
      });
    } catch (e) { return []; }
  }
  function selectTrack(t) {
    if (!av) return;
    try {
      if (t.type === 'TEXT') av.setSilentSubtitle(false);
      av.setSelectTrack(t.type, t.index);
    } catch (e) {}
  }
  function subtitlesOff() { if (av) { try { av.setSilentSubtitle(true); } catch (e) {} } emit('subtitle', ''); }

  GP.player = {
    available: !!av, play: play, stop: stop, pause: pause, resume: resume, paused: function () { return paused; }, place: place, setMode: setMode, mode: function () { return mode; },
    tracks: tracks, selectTrack: selectTrack, subtitlesOff: subtitlesOff, current: function () { return current; },
    on: function (name, fn) { listeners[name] = fn; }
  };
  window.GP = GP;
})();
