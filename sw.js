const CACHE = "wizard-online-v1";
const ASSETS = ["./","./index.html","./style.css","./app.js","./config.example.js","./manifest.json","./icon.svg"];
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
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      return response;
    } catch {
      return caches.match("./index.html");
    }
  })());
});
