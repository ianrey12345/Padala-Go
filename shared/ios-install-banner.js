// Shows a one-time "Add to Home Screen" tip to iOS Safari visitors who
// haven't installed the PWA yet. Safe no-op on Android/desktop/already-installed.
(function () {
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var isStandalone = window.navigator.standalone === true; // true once added to home screen
  var dismissKey = "padalaInstallBannerDismissed";

  if (!isIos || isStandalone) return;
  if (localStorage.getItem(dismissKey) === "1") return;

  var bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.style.cssText = [
    "position:fixed", "left:12px", "right:12px", "bottom:12px", "z-index:9999",
    "background:#082F2B", "color:#fff", "padding:12px 14px", "border-radius:14px",
    "font-family:Inter,system-ui,sans-serif", "font-size:13.5px", "line-height:1.4",
    "box-shadow:0 6px 20px rgba(0,0,0,0.25)", "display:flex", "align-items:center", "gap:10px"
  ].join(";");

  bar.innerHTML =
    '<span style="flex:1;">Install this app: tap <strong>Share</strong> ' +
    '<span style="display:inline-block;">&#x2191;</span> then ' +
    '<strong>“Add to Home Screen.”</strong></span>' +
    '<button id="padalaInstallDismiss" aria-label="Dismiss" ' +
    'style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;' +
    'padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer;">Got it</button>';

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(bar);
    document.getElementById("padalaInstallDismiss").addEventListener("click", function () {
      localStorage.setItem(dismissKey, "1");
      bar.remove();
    });
  });
})();
