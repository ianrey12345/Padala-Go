// Padala Go — screen wake lock
// Keeps the screen from dimming/locking while the app is open (rider on
// an active delivery, customer waiting on an order). Two strategies:
//   1. Native Screen Wake Lock API (navigator.wakeLock) where supported.
//   2. A silent, muted, looping 1x1 video as a fallback for browsers
//      without the native API (notably iOS Safari) — written directly
//      here instead of via NoSleep.js, since NoSleep's own feature
//      check (`"wakeLock" in navigator`) can't be reliably forced down
//      the fallback path: redefining navigator.wakeLock to return
//      undefined still leaves the property present, so `in` still sees
//      it as "supported" and NoSleep keeps trying the (broken-on-some-
//      devices) native path anyway. Owning both paths ourselves avoids
//      that.
//
// Browsers require a user gesture to start video playback or acquire a
// wake lock, so this arms on the first tap/click and stays armed for
// the rest of the session, re-acquiring after any tab-hide/show cycle
// (backgrounding, app switch, screen lock) since both the native lock
// and video playback are released automatically when the tab goes
// into the background.
(function () {
  var video = null;
  var nativeLock = null;
  var armed = false;

  function hasNativeWakeLock() {
    return !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function');
  }

  function requestNativeLock() {
    return navigator.wakeLock.request('screen').then(function (lock) {
      nativeLock = lock;
      // If the OS/browser releases it on its own (e.g. low battery mode),
      // clear our reference so the next visibilitychange re-acquires it.
      nativeLock.addEventListener('release', function () {
        nativeLock = null;
      });
    });
  }

  function buildFallbackVideo() {
    var v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.muted = true;
    v.loop = true;
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    // Minimal silent MP4, base64-inlined — no network request needed.
    v.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAr1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjIgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0xIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9ZGlhIHN1Ym1lPTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MCBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTAgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3//728P4FNjuY0JcRzeidMx+/FQK5PP0z6dR3EAAAAwABDAAA';
    return v;
  }

  function armFallback() {
    if (!video) video = buildFallbackVideo();
    if (!video.isConnected) document.body.appendChild(video);
    video.play().catch(function () {
      // Some browsers still reject on the very first attempt even inside
      // a gesture handler; a queued retry on the next tick usually works.
      setTimeout(function () { video.play().catch(function () {}); }, 50);
    });
  }

  function arm() {
    if (armed) return;
    armed = true;
    if (hasNativeWakeLock()) {
      requestNativeLock().catch(function () {
        // Native request rejected (e.g. low power mode) — fall back.
        armFallback();
      });
    } else {
      armFallback();
    }
  }

  function reacquireIfNeeded() {
    if (!armed || document.visibilityState !== 'visible') return;
    if (hasNativeWakeLock()) {
      if (!nativeLock) requestNativeLock().catch(function () {});
    } else if (video && video.paused) {
      video.play().catch(function () {});
    }
  }

  ['touchend', 'click'].forEach(function (evt) {
    document.addEventListener(evt, arm, { once: true, passive: true });
  });

  document.addEventListener('visibilitychange', reacquireIfNeeded);
})();
