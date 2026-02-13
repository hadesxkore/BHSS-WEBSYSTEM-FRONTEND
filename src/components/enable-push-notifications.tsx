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

  const url = `${getApiBaseUrl()}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || `Request failed (${res.status}) ${url}`)
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
    if (permission === "granted") return "Sync push"
    if (permission === "denied") return "Push blocked"
    return "Enable notifications"
  }, [isSupported, permission])

  const enable = useCallback(async () => {
    if (!isSupported) {
      toast.error("Push notifications are not supported in this browser")
      return
    }

    try {
      console.log("[push] enable: start", {
        permission: typeof Notification === "undefined" ? "n/a" : Notification.permission,
        apiBaseUrl: getApiBaseUrl(),
        isSecureContext: typeof window === "undefined" ? "n/a" : window.isSecureContext,
        userAgent: typeof navigator === "undefined" ? "n/a" : navigator.userAgent,
      })
    } catch {
      // ignore
    }

    setIsBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") {
        try {
          console.warn("[push] permission not granted", perm)
        } catch {
          // ignore
        }
        toast.error("Notification permission not granted")
        return
      }

      try {
        console.log("[push] permission granted")
      } catch {
        // ignore
      }

      const { publicKey } = await apiFetch("/api/push/vapid-public-key")
      try {
        console.log("[push] vapid public key fetched", {
          present: Boolean(publicKey),
          length: String(publicKey || "").length,
        })
      } catch {
        // ignore
      }

      const publicKeyTrimmed = String(publicKey || "").trim()
      if (!publicKeyTrimmed) {
        toast.error("Missing VAPID public key on server")
        return
      }

      if (!/^[A-Za-z0-9\-_]+$/.test(publicKeyTrimmed)) {
        toast.error("Invalid VAPID public key format")
        return
      }

      try {
        console.log("[push] registering service worker")
      } catch {
        // ignore
      }

      const reg =
        (await navigator.serviceWorker.getRegistration("/")) ||
        (await navigator.serviceWorker.register("/bhss-push-sw.js", { scope: "/" }))

      try {
        console.log("[push] service worker registration", {
          scope: reg.scope,
          installing: Boolean(reg.installing),
          waiting: Boolean(reg.waiting),
          active: Boolean(reg.active),
        })
      } catch {
        // ignore
      }

      let activeReg = reg
      try {
        activeReg = await navigator.serviceWorker.ready
        try {
          console.log("[push] service worker ready")
        } catch {
          // ignore
        }
      } catch {
        try {
          console.warn("[push] service worker ready() failed; continuing")
        } catch {
          // ignore
        }
      }

      try {
        console.log("[push] checking existing subscription")
      } catch {
        // ignore
      }

      let sub = await activeReg.pushManager.getSubscription()
      if (!sub) {
        try {
          console.log("[push] no existing subscription; subscribing")
        } catch {
          // ignore
        }

        sub = await activeReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKeyTrimmed),
        })
      } else {
        try {
          console.log("[push] existing subscription found")
        } catch {
          // ignore
        }
      }

      try {
        console.log("[push] subscription", {
          endpoint: sub?.endpoint,
          hasKeys: Boolean((sub as any)?.toJSON?.()?.keys || (sub as any)?.keys),
        })
      } catch {
        // ignore
      }

      await apiFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(sub),
      })

      try {
        console.log("[push] subscribe saved")
      } catch {
        // ignore
      }

      toast.success("Push notifications enabled")
    } catch (e: any) {
      const rawMsg = e?.message || "Failed to enable push"
      const errName = String(e?.name || "")

      try {
        const permState = await (navigator as any)?.permissions?.query?.({ name: "notifications" })
        console.log("[push] permissions.query(notifications)", { state: permState?.state })
      } catch {
        // ignore
      }

      const msg =
        rawMsg === "Registration failed - push service error" ||
        String(rawMsg).includes("push service error") ||
        errName === "AbortError"
          ? "Push subscribe failed (push service error). On Edge localhost this is commonly caused by adblock/VPN, strict tracking prevention, or network/firewall blocking the push service. Try disable extensions/VPN, clear site data, then Sync push again."
          : rawMsg

      toast.error(msg)
      
      try {
        console.error("[push] enable failed", e)
      } catch {
        // ignore
      }
    } finally {
      try {
        console.log("[push] enable: done")
      } catch {
        // ignore
      }
      setIsBusy(false)
    }
  }, [isSupported])

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-xl"
      onClick={enable}
      disabled={!isSupported || isBusy}
      title={!isSupported ? "Not supported" : permission === "denied" ? "Blocked in browser settings" : undefined}
    >
      {isBusy ? "Working..." : label}
    </Button>
  )
}
