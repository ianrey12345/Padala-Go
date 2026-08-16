// Padala Go — TEMPORARY DEBUG VERSION (v2) of the screen wake-lock
// script. Reports each stage separately so we can see exactly where
// this breaks: whether a tap is even detected, and separately whether
// enable() actually resolves or rejects.
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
  var tapCount = 0;

  showBanner('✅ loaded | override: ' + (overrideWorked ? 'OK' : 'FAILED') + ' | taps: 0 | tap screen to arm', '#B67A16');

  function enableOnce() {
    tapCount++;
    if (enabled) return;
    enabled = true;

    // Show IMMEDIATELY, synchronously, before calling enable() — this
    // proves whether the tap itself was detected at all, separate from
    // whether enable() succeeds.
    showBanner('👆 tap #' + tapCount + ' detected — calling enable()...', '#2A5FAD');

    noSleep.enable().then(function () {
      showBanner('✅ ENABLED (video playing) — now leave phone untouched', '#2F8F5B');
    }).catch(function (err) {
      showBanner('❌ enable() FAILED: ' + (err && err.message ? err.message : String(err)), '#D64545');
    });
  }

  document.addEventListener('touchstart', enableOnce, true);
  document.addEventListener('touchend', enableOnce, true);
  document.addEventListener('pointerdown', enableOnce, true);
  document.addEventListener('click', enableOnce, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) {
      noSleep.enable().catch(function () {});
    }
  });
})();
