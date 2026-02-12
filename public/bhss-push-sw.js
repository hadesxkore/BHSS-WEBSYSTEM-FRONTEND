self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Notification", body: event.data ? event.data.text() : "" }
  }

  const title = data.title || "BHSS Notification"
  let timeText = ""
  try {
    timeText = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  } catch {
    timeText = ""
  }
  const bodyBase = data.body || ""
  const body = bodyBase && timeText ? `${bodyBase} • ${timeText}` : bodyBase || timeText
  const options = {
    body,
    data: { url: data.url || "/" },
    tag: data.tag || "bhss-notification",
    renotify: true,
    icon: data.icon || "/images/bhsslogo.png",
    badge: data.badge || "/images/bhsslogo.png",
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification?.data?.url || "/"

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of allClients) {
        if ("focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })()
  )
})
