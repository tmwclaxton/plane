/* LGS kill-switch service worker: clears old Plane caches and unregisters. */
self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
      var regs = await self.registration.unregister();
      var clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach(function (client) {
        client.navigate(client.url);
      });
      return regs;
    })()
  );
});
