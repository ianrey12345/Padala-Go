// Padala Go — TEMPORARY DEBUG VERSION of the screen wake-lock script.
// This version reports its own live status in an on-screen banner so we
// can see exactly what's happening instead of guessing. Once confirmed
// working, swap back to the plain (non-debug) version.
(function () {
  function showBanner(text, color) {
    var el = document.getElementById('wakeLockDebugBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wakeLockDebugBanner';
      el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;color:#fff;font-size:11px;padding:8px;z-index:99999;text-align:center;font-family:sans-serif;white-space:pre-wrap;';
      document.body.appendChild(el);
    }
    el.style.background = color || '#D64545';
    el.textContent = text;
  }

  if (typeof NoSleep === 'undefined') {
    showBanner('❌ NoSleep NOT loaded', '#D64545');
    return;
  }

  var overrideWorked = false;
  try {
    Object.defineProperty(navigator, 'wakeLock', {
      get: function () { return undefined; },
      configurable: true
    });
    overrideWorked = (typeof navigator.wakeLock === 'undefined');
  } catch (e) {
    overrideWorked = false;
  }

  var noSleep = new NoSleep();
  var enabled = false;

  showBanner('✅ NoSleep loaded | native-API override: ' + (overrideWorked ? 'OK' : 'FAILED') + ' | tap screen to arm', '#B67A16');

  function enableOnce() {
    if (enabled) return;
    enabled = true;
    noSleep.enable().then(function () {
      showBanner('✅ Wake lock ENABLED (video playing) — leave phone untouched now', '#2F8F5B');
    }).catch(function (err) {
      showBanner('❌ enable() FAILED: ' + (err && err.message ? err.message : err), '#D64545');
    });
    document.removeEventListener('touchstart', enableOnce, true);
    document.removeEventListener('click', enableOnce, true);
  }

  document.addEventListener('touchstart', enableOnce, true);
  document.addEventListener('click', enableOnce, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) {
      noSleep.enable().catch(function () {});
    }
  });
})();
