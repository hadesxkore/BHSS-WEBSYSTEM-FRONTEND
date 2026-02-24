import { useEffect, useRef } from "react"
import { io, type Socket } from "socket.io-client"
import { notify } from "@/components/ui/in-app-notifications"

function getApiBaseUrl() {
  const envAny = (import.meta as any)?.env as any
  const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
  return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
}

function formatClockTimeNow() {
  try {
    return new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

type AttendanceSavedPayload = {
  record?: {
    id?: string
    userId?: string
    dateKey?: string
    grade?: string
  }
  user?: {
    school?: string
  }
}

type DeliverySavedPayload = {
  record?: {
    id?: string
    userId?: string
    dateKey?: string
    categoryKey?: string
    categoryLabel?: string
  }
  user?: {
    school?: string
  }
}

export function AdminGlobalNotifications() {
  const lastNotificationIdRef = useRef<string>("")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/notifsound.mp3")
        audioRef.current.preload = "auto"
      }
      audioRef.current.currentTime = 0
      const p = audioRef.current.play()
      if (p && typeof (p as any).catch === "function") {
        ;(p as any).catch(() => {})
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {})
    }

    const socket: Socket = io(getApiBaseUrl(), { transports: ["websocket"] })

    socket.on("attendance:saved", (payload: AttendanceSavedPayload) => {
      window.dispatchEvent(new CustomEvent("attendance:saved", { detail: payload }))

      const dateKey = String(payload?.record?.dateKey || "")
      const grade = String(payload?.record?.grade || "")
      const school = String(payload?.user?.school || "")

      const notificationId = `attendance-${dateKey}-${grade}-${school}`
      if (notificationId && lastNotificationIdRef.current === notificationId) return
      lastNotificationIdRef.current = notificationId

      const title = "New attendance saved"
      const body = `${school || "(school)"} • ${grade || "(grade)"} • ${dateKey || "(date)"}`
      const timeText = formatClockTimeNow()
      const bodyWithTime = timeText ? `${body} • ${timeText}` : body

      notify({
        variant: "success",
        title,
        message: body,
        id: notificationId,
      })

      playSound()

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(title, {
            body: bodyWithTime,
            silent: false,
            tag: notificationId,
            icon: "/images/bhsslogo.png",
            badge: "/images/bhsslogo.png",
          })
          setTimeout(() => n.close(), 5000)
        } catch {
          // ignore
        }
      }
    })

    socket.on("delivery:saved", (payload: DeliverySavedPayload) => {
      window.dispatchEvent(new CustomEvent("delivery:saved", { detail: payload }))

      const dateKey = String(payload?.record?.dateKey || "")
      const categoryLabel = String(payload?.record?.categoryLabel || "")
      const school = String(payload?.user?.school || "")

      const notificationId = `delivery-${dateKey}-${categoryLabel}-${school}`
      if (notificationId && lastNotificationIdRef.current === notificationId) return
      lastNotificationIdRef.current = notificationId

      const title = "New delivery saved"
      const body = `${school || "(school)"} • ${categoryLabel || "(category)"} • ${dateKey || "(date)"}`
      const timeText = formatClockTimeNow()
      const bodyWithTime = timeText ? `${body} • ${timeText}` : body

      notify({
        variant: "success",
        title,
        message: body,
        id: notificationId,
      })

      playSound()

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(title, {
            body: bodyWithTime,
            silent: false,
            tag: notificationId,
            icon: "/images/bhsslogo.png",
            badge: "/images/bhsslogo.png",
          })
          setTimeout(() => n.close(), 5000)
        } catch {
          // ignore
        }
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return null
}
