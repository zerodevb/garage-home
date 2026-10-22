// Browser preview only (not packaged): start with the Free-TV test playlist.
if (typeof tizen === 'undefined' && !localStorage.getItem('gp.playlists')) {
  localStorage.setItem('gp.playlists', JSON.stringify([{id: 'freetv', type: 'm3u', name: 'Free TV (test)',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'}]));
  localStorage.setItem('gp.active', '"freetv"');
}
// Preview only: a CORS-open proxy on the Mac (see README) stands in for Vetro's /proxy.
window.GP_PROXY = 'http://127.0.0.1:18101/proxy?url=';
// Preview only: #keys=40,39,13 presses those key codes after load (L = long-press OK).
(function () {
  var m = /keys=([\dL,]+)/.exec(location.hash);
  if (m) window.addEventListener('load', function () {
    var codes = m[1].split(','), i = 0;
    var next = function () {
      if (i >= codes.length) return;
      var c = codes[i++];
      if (c === 'L') {
        document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 13}));
        setTimeout(function () { document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 13, repeat: true})); }, 600);
        return setTimeout(next, 900);
      }
      document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: +c}));
      if (+c === 13) document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: 13}));
      setTimeout(next, 250);
    };
    setTimeout(next, 3500);
  });
})();
