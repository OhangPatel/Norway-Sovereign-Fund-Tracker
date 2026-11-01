// Runs before first paint: a plain script in <head>. The CSP (public/.htaccess) allows
// script-src 'self' and no inline script, which is why this is a file of its own.
//
// Cached for a year as immutable (.htaccess, every .js), so index.html loads it as
// /boot.js?v=N: bump N whenever this file changes.
//
// 1. The saved theme goes on before anything paints, so the page and the switching
//    screen open in it rather than flashing the dark default first.
// 2. The switching screen (#boot in index.html, styled there): shown when a visitor
//    arrives from the classic design (?from=classic) and held until the app calls
//    __bootDone() with its data and photograph in, then shown again by __bootLeave()
//    on the way out to the classic design, where the browser keeps it on screen until
//    the classic page paints.
(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem('sov-theme');
    if (theme) root.setAttribute('data-theme', theme);
  } catch (e) { /* storage blocked: the dark default stands */ }

  var MIN_MS = 1400;   // long enough to read as a screen, not a flash
  var MAX_MS = 12000;  // never hold the page hostage to a failed load
  var start = Date.now();
  var booting = new URLSearchParams(location.search).get('from') === 'classic';
  var finished = false;

  function finish() {
    if (!booting || finished) return;
    finished = true;
    setTimeout(function () {
      root.classList.add('boot-done');            // the bar runs to the end
      setTimeout(function () {
        root.classList.add('boot-out');           // then the screen fades
        setTimeout(function () {
          root.classList.remove('is-booting', 'boot-done', 'boot-out');
        }, 450);
      }, 380);
      // Drop the marker so a reload or a shared link does not replay the screen.
      try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
    }, Math.max(0, MIN_MS - (Date.now() - start)));
  }

  if (booting) {
    root.classList.add('is-booting');
    setTimeout(finish, MAX_MS);
  }
  window.__bootDone = finish;

  window.__bootLeave = function (href) {
    root.classList.remove('boot-done', 'boot-out');
    root.classList.add('is-booting', 'is-leaving');
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { location.href = href; }, still ? 0 : 650);
  };
})();
