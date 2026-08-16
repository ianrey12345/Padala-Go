// Padala Go — keeps the screen from dimming/locking while the app is
// open, using NoSleep.js (loaded via CDN — add its <script> tag right
// before this one).
//
// WHY THIS FORCES THE VIDEO METHOD:
// NoSleep.js always prefers the native Screen Wake Lock API whenever the
// browser reports support for it (navigator.wakeLock — true on iOS
// 16.4+). That native API has confirmed, still-open WebKit bugs where it
// reports success without actually holding the screen awake — notably
// inside installed/standalone home-screen apps (WebKit bug 254545), but
// also intermittently in plain Safari tabs on various iOS versions.
// NoSleep's OTHER method — a muted, invisible, looping video — is the
// one that actually works around this, but NoSleep only falls back to it
// when navigator.wakeLock looks unsupported. So below, we hide
// navigator.wakeLock from NoSleep's own detection before constructing
// it, forcing it down the reliable video path everywhere instead of
// gambling on the buggy native one.
//
// IMPORTANT — iOS refuses to let ANY video start playing until the user
// has made a real tap/click on the page (its autoplay policy). This
// waits for the very first tap anywhere on the page, enables the wake
// lock at that moment, and it then stays active for the rest of the
// session — including through idle periods with no touches.
(function () {
  if (typeof NoSleep === 'undefined') {
    console.warn('[wake-lock] NoSleep.js not loaded — add its <script> tag before this one.');
    return;
  }

  try {
    Object.defineProperty(navigator, 'wakeLock', {
      get: function () { return undefined; },
      configurable: true
    });
  } catch (e) {
    // If this can't be redefined in some browser, NoSleep just falls
    // back to whichever method it would have picked on its own.
  }

  const noSleep = new NoSleep();
  let enabled = false;

  function enableOnce() {
    if (enabled) return;
    enabled = true;
    noSleep.enable();
    document.removeEventListener('touchstart', enableOnce, true);
    document.removeEventListener('click', enableOnce, true);
  }

  document.addEventListener('touchstart', enableOnce, true);
  document.addEventListener('click', enableOnce, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) {
      noSleep.enable();
    }
  });
})();
