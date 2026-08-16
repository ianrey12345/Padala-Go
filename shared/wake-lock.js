// Padala Go — keeps the screen from dimming/locking while the app is
// open. Wraps NoSleep.js (loaded via CDN — see the script tag you need
// to add right before this one) instead of only the native Wake Lock
// API, because native wakeLock is known to silently "succeed" without
// actually holding the screen awake inside an installed/standalone iOS
// PWA. NoSleep.js works around that with a muted looping video as a
// fallback, which iOS Safari does respect.
//
// IMPORTANT — iOS refuses to let ANY video start playing until the user
// has made a real tap/click on the page (its autoplay policy). That's
// almost certainly why the previous version "worked" while you were
// actively tapping around but the screen still dimmed once it sat idle:
// nothing had ever actually been allowed to start. This version waits
// for the very first tap anywhere on the page, enables the wake lock at
// that moment, and it then stays active for the rest of the session —
// including through idle periods with no touches.
(function () {
  if (typeof NoSleep === 'undefined') {
    console.warn('[wake-lock] NoSleep.js not loaded — add its <script> tag before this one.');
    return;
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

  // The OS can still force-release the lock when the app is backgrounded
  // (switched away from, screen manually locked, etc). Re-enable it the
  // moment the app is visible again so a background/foreground cycle
  // doesn't quietly turn this off for the rest of the session.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) {
      noSleep.enable();
    }
  });
})();
