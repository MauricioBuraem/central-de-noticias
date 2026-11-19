// Central de Notícias service worker: push alerts only (no offline caching of news,
// so readers never see stale stories).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data && event.data.text() }; }
  const title = data.title || "Central de Notícias";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      image: data.image || undefined,
      tag: data.tag || "central",
      data: { url: data.url || "/" },
      lang: "pt-BR",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url || "/", self.location.origin);
  url.searchParams.set("utm_source", "push");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.location.origin) && "focus" in c) { c.navigate(url.href); return c.focus(); }
      return self.clients.openWindow(url.href);
    }),
  );
});
