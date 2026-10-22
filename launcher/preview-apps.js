// Desktop preview only (not packaged): a sample app list standing in for the TV's own.
window.PREVIEW_APPS = [
  {id: 'org.tizen.netflix-app', name: 'Netflix', show: true, icon: ''},
  {id: 'MCmYXNxgcu.DisneyPlus', name: 'Disney+', show: true, icon: ''},
  {id: 'org.tizen.primevideo', name: 'Prime Video', show: true, icon: ''},
  {id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: true, icon: ''},
  {id: 'rJeHak5zRg.Spotify', name: 'Spotify - Music and Podcasts', show: true, icon: ''},
  {id: 'GaragePlay.player', name: 'Garage Player', show: true, icon: ''}
];
// #keys=40,40,13 presses those key codes after load (L = long-press OK); #ambient starts ambient mode after 2 s.
(function () {
  var m = /keys=([\dL,]+)/.exec(location.hash);
  if (/ambient/.test(location.hash)) window.PREVIEW_IDLE_MINUTES = 2 / 60;
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
    setTimeout(next, 3000);
  });
})();
