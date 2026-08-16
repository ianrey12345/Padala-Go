// Padala Go — keeps the screen from turning off / dimming (from the
// phone's own auto-lock / sleep timer) while this app is open, using the
// Screen Wake Lock API. Include it on any page you want to stay awake —
// same pattern as ios-install-banner.js.
//
// Notes:
// - Requires a secure context (https:// or localhost), same as the rest
//   of the app.
// - The OS/browser automatically releases the lock whenever the tab or
//   app is backgrounded, the screen is manually locked, etc. — so this
//   also re-acquires it the instant the app becomes visible again,
//   otherwise it would silently stop working after the first time
//   someone switches away and comes back.
// - Not supported on every browser/OS (notably older iOS Safari <16.4).
//   Wrapped in try/catch so it silently no-ops where unavailable instead
//   of breaking anything.
(function () {
  if (!('wakeLock' in navigator)) return;

  let wakeLockSentinel = null;

  async function requestWakeLock() {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    } catch (err) {
      // Common, harmless causes: battery saver mode, permissions, or the
      // page briefly not visible at request time. Just don't hold a lock.
      wakeLockSentinel = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockSentinel === null) {
      requestWakeLock();
    }
  });

  requestWakeLock();
})();
