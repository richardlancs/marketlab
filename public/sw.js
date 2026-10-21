/*
 * MarketLab's service worker: it only shows push notifications (sent by the
 * daily job, lib/alert-pushes.ts) and opens the right page when one is
 * clicked. It caches nothing, so pages are never served stale.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    message = null;
  }
  if (!message || typeof message.title !== "string") return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: typeof message.body === "string" ? message.body : "",
      tag: typeof message.tag === "string" ? message.tag : undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url: typeof message.url === "string" ? message.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only pages on this site: the URL is resolved against it, and anything elsewhere opens the home page.
  const wanted = new URL(event.notification.data?.url || "/", self.location.origin);
  const url = wanted.origin === self.location.origin ? wanted.href : self.location.origin + "/";
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = open.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) {
        try {
          await tab.focus();
          // navigate() works only on tabs this worker controls; otherwise a new window opens below.
          if (await tab.navigate(url)) return;
        } catch {}
      }
      await self.clients.openWindow(url);
    })(),
  );
});
