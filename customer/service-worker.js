// Padala Go — Customer service worker
// Caches the app shell so the PWA opens instantly and survives brief network drops.
// NOTE: order/chat data itself comes from Firestore over the network, not from this cache —
// this only speeds up loading the pages/assets themselves.

const CACHE_NAME = "padala-customer-v1";

const APP_SHELL = [
  "/customer/index.html",
  "/customer/signup.html",
  "/customer/forgot-password.html",
  "/customer/home.html",
  "/customer/order.html",
  "/customer/order-status.html",
  "/customer/my-orders.html",
  "/customer/chat.html",
  "/customer/chat-thread.html",
  "/customer/manifest.json",
  "/customer/icons/icon-192.png",
  "/customer/icons/icon-512.png",
  "/shared/styles.css",
  "/shared/firebase-config.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle same-origin GET requests — let Firebase/Firestore/Maps calls go straight to the network.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      // Network-first for HTML so users don't get stuck on a stale page; cache-first fallback otherwise.
      return req.headers.get("accept")?.includes("text/html") ? network : cached || network;
    })
  );
});
