// Logistricks Portal — Service Worker
// Handles push notifications and offline caching basics

const CACHE_NAME = "logistricks-v1"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim())
})

// ─── Push ─────────────────────────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return

  let payload
  try {
    payload = e.data.json()
  } catch {
    payload = { title: "Logistricks", body: e.data.text(), url: "/dashboard" }
  }

  const options = {
    body:               payload.body || "",
    icon:               "/icons/icon-192.png",
    badge:              "/icons/icon-72.png",
    data:               { url: payload.url || "/dashboard" },
    vibrate:            [150, 75, 150],
    requireInteraction: false,
    tag:                payload.tag || "logistricks-notification",
    renotify:           true,
  }

  e.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Logistricks", options),
      // Broadcast to all open portal tabs so they can show an in-app toast
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) =>
          clients.forEach((c) =>
            c.postMessage({ type: "PUSH_RECEIVED", payload })
          )
        ),
    ])
  )
})

// ─── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  const targetUrl = (e.notification.data && e.notification.data.url) || "/dashboard"

  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing portal tab if possible
        const existing = clients.find(
          (c) => c.url.includes("/dashboard") || c.url.includes("/requests")
        )
        if (existing) {
          existing.focus()
          return existing.navigate(targetUrl)
        }
        return self.clients.openWindow(targetUrl)
      })
  )
})
