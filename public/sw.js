// Minimal service worker whose only job is receiving Web Push messages while
// the app isn't open and turning them into an OS notification, then routing
// a click on that notification back into the app. Deliberately does NOT add
// a fetch handler / offline cache — that's a separate concern (and a good
// way to introduce stale-asset bugs) that nothing here currently needs.
// Registered from src/lib/push.ts, only once the user actually opts into
// push reminders (see SettingsPanel "Напоминания") — not on every visit.

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for the previous SW (if any)
  // to be released — there's no versioned cache to worry about clobbering.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Life RPG", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Life RPG";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
