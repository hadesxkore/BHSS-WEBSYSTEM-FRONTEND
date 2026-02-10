import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

function getApiBaseUrl() {
  const envAny = (import.meta as any)?.env as any
  const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
  return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
}

function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem("bhss_auth")
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: string }
    return parsed?.token || null
  } catch {
    return null
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const token = getAuthToken()
  if (!token) throw new Error("Not authenticated")

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || "Request failed")
  return data
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")

  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export function EnablePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "default" : Notification.permission
  )
  const [isBusy, setIsBusy] = useState(false)
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined"

    setIsSupported(supported)
    if (typeof Notification !== "undefined") setPermission(Notification.permission)
  }, [])

  const label = useMemo(() => {
    if (!isSupported) return "Push not supported"
    if (permission === "granted") return "Push enabled"
    if (permission === "denied") return "Push blocked"
    return "Enable notifications"
  }, [isSupported, permission])

  const enable = useCallback(async () => {
    if (!isSupported) {
      toast.error("Push notifications are not supported in this browser")
      return
    }

    setIsBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") {
        toast.error("Notification permission not granted")
        return
      }

      const { publicKey } = await apiFetch("/api/push/vapid-public-key")
      if (!publicKey) {
        toast.error("Missing VAPID public key on server")
        return
      }

      const reg = await navigator.serviceWorker.register("/bhss-push-sw.js")

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(String(publicKey)),
      })

      await apiFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(sub),
      })

      toast.success("Push notifications enabled")
    } catch (e: any) {
      toast.error(e?.message || "Failed to enable push")
    } finally {
      setIsBusy(false)
    }
  }, [isSupported])

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-xl"
      onClick={enable}
      disabled={!isSupported || isBusy || permission === "granted"}
      title={!isSupported ? "Not supported" : permission === "denied" ? "Blocked in browser settings" : undefined}
    >
      {isBusy ? "Working..." : label}
    </Button>
  )
}
