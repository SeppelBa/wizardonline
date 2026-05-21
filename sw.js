const CACHE = "wizard-online-v4";
const ASSETS = ["./","./index.html","./style.css","./app.js","./manifest.json","./icon.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase-Requests immer ans Netz, niemals cachen
  if (url.hostname.includes("firebaseio.com") || url.hostname.includes("firebasedatabase.app") || url.hostname.includes("gstatic.com") || url.hostname.includes("googleapis.com")) {
    return;
  }
  // Network-first für HTML/JS/CSS, damit Updates ankommen
  if (req.destination === "document" || req.destination === "script" || req.destination === "style") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }
  // Cache-first für Assets
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch {
      return caches.match("./index.html");
    }
  })());
});
