// Padala Go — iOS "disable Auto-Lock" tip
// iOS does not allow a home-screen PWA to reliably keep the screen awake
// (see wake-lock.js for the full explanation) — the only fully reliable
// fix is the rider/customer turning off their own phone's Auto-Lock
// setting while using the app. This shows a one-time, dismissible tip
// walking them through it. Safe no-op on Android/desktop.
(function () {
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var dismissKey = "padalaAutoLockTipDismissed";

  if (!isIos) return;
  if (localStorage.getItem(dismissKey) === "1") return;

  function showTip() {
    // Don't stack with the "Add to Home Screen" banner if both are
    // eligible to show on the same visit — that one takes priority since
    // it's shown to a narrower audience (not-yet-installed visitors).
    if (document.getElementById('padalaInstallDismiss')) return;

    var bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.style.cssText = [
      "position:fixed", "left:12px", "right:12px", "bottom:12px", "z-index:9999",
      "background:#082F2B", "color:#fff", "padding:12px 14px", "border-radius:14px",
      "font-family:Inter,system-ui,sans-serif", "font-size:13.5px", "line-height:1.4",
      "box-shadow:0 6px 20px rgba(0,0,0,0.25)", "display:flex", "align-items:center", "gap:10px"
    ].join(";");

    bar.innerHTML =
      '<span style="flex:1;">📱 iPhone screen keeps locking? Go to ' +
      '<strong>Settings → Display &amp; Brightness → Auto-Lock → Never</strong> ' +
      'so it stays on while you\'re using the app.</span>' +
      '<button id="padalaAutoLockDismiss" aria-label="Dismiss" ' +
      'style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;' +
      'padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">Got it</button>';

    document.body.appendChild(bar);
    document.getElementById("padalaAutoLockDismiss").addEventListener("click", function () {
      localStorage.setItem(dismissKey, "1");
      bar.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", showTip);
  } else {
    showTip();
  }
})();
