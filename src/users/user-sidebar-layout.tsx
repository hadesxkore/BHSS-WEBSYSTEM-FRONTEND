import { useEffect, useMemo, useState } from "react"
import {
  LayoutDashboard,
  Truck,
  ClipboardCheck,
  CircleUserRound,
  Bell,
  Megaphone,
  CalendarDays,
  LogOut,
  School,
  Mail,
  Settings,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { io, type Socket } from "socket.io-client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { notify } from "@/components/ui/in-app-notifications"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { UserHome } from "./pages/home"
import { UserDelivery } from "./pages/delivery"
import { UserAccount } from "./pages/account"
import { UserAttendance } from "./pages/attendance"
import { UserAnnouncements } from "./pages/announcements"
import { UserEventCalendar } from "./pages/event-calendar"

type UserSidebarLayoutProps = {
  userEmail?: string
  userSchool?: string
  userMunicipality?: string
  onLogout: () => void
}

type AuthState = {
  token: string
  user: {
    id: string
    username: string
    email: string
    name: string
    role: string
    school?: string
    municipality?: string
    avatarUrl?: string
  }
}

function formatTimeAmPm(hhmm?: string) {
  const raw = String(hhmm || "").trim()
  if (!raw) return ""
  const m = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return raw
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (Number.isNaN(hh) || Number.isNaN(mm)) return raw

  const isPm = hh >= 12
  const h12 = ((hh + 11) % 12) + 1
  const ampm = isPm ? "PM" : "AM"
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`
}

function formatTimeRangeAmPm(start?: string, end?: string) {
  const s = formatTimeAmPm(start)
  const e = formatTimeAmPm(end)
  if (s && e) return `${s}–${e}`
  return s || e || ""
}

function readStateStorageKey(userId?: string) {
  const id = String(userId || "").trim()
  return `bhss_user_notification_read_${id || "anon"}`
}

function readReadSet(userId?: string) {
  try {
    const raw = localStorage.getItem(readStateStorageKey(userId))
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set<string>(parsed.map((x) => String(x || "")).filter(Boolean))
  } catch {
    return new Set<string>()
  }
}

function writeReadSet(userId: string | undefined, set: Set<string>) {
  try {
    localStorage.setItem(readStateStorageKey(userId), JSON.stringify(Array.from(set.values()).slice(0, 500)))
  } catch {
    // ignore
  }
}

type UserNotification = {
  id: string
  kind: "event" | "announcement"
  title: string
  message: string
  createdAt: number
  read: boolean
  status?: "Scheduled" | "Cancelled"
  cancelReason?: string
}

type EventCreatedPayload = {
  event?: {
    id?: string
    title?: string
    dateKey?: string
    startTime?: string
    endTime?: string
    status?: string
  }
}

type EventCancelledPayload = {
  event?: {
    id?: string
    title?: string
    dateKey?: string
    startTime?: string
    endTime?: string
    status?: string
    cancelReason?: string
  }
}

type AnnouncementCreatedPayload = {
  announcement?: {
    id?: string
    title?: string
    priority?: string
    audience?: string
    createdAt?: number
  }
}

function formatClockTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function formatAbsoluteDateTime(ts: number) {
  try {
    return new Date(ts).toLocaleString([], {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function formatRelativeNotifiedAt(ts: number) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return ""

  const now = Date.now()
  const d = new Date(t)
  const n = new Date(now)

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayMs = 24 * 60 * 60 * 1000

  const dayDiff = Math.floor((startOfDay(n) - startOfDay(d)) / dayMs)
  if (dayDiff === 0) return `Today ${formatClockTime(t)}`
  if (dayDiff === 1) return `Yesterday ${formatClockTime(t)}`
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff}d ago`

  const weekDiff = Math.floor(dayDiff / 7)
  if (weekDiff >= 1 && weekDiff < 5) return `${weekDiff}w ago`

  const monthDiff = Math.floor(dayDiff / 30)
  if (monthDiff >= 1 && monthDiff < 12) return `${monthDiff}mo ago`

  const yearDiff = Math.max(1, Math.floor(dayDiff / 365))
  return `${yearDiff}y ago`
}

function getApiBaseUrl() {
  const envAny = (import.meta as any)?.env as any
  const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
  return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
}

function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem("bhss_auth")
    if (!raw) return null
    return JSON.parse(raw) as AuthState
  } catch {
    return null
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const auth = getAuth()
  if (!auth?.token) throw new Error("Not authenticated")

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${auth.token}`,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

type EventsListResponse = {
  events?: Array<{
    _id?: string
    id?: string
    title?: string
    dateKey?: string
    startTime?: string
    endTime?: string
    status?: string
    cancelReason?: string
    createdAt?: string
  }>
}

type AnnouncementsListResponse = {
  announcements?: Array<{
    _id?: string
    id?: string
    title?: string
    message?: string
    createdAt?: string
  }>
}

function initials(name?: string) {
  const n = (name || "").trim()
  if (!n) return "U"
  const parts = n.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || "U"
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : ""
  return `${first}${second}`.toUpperCase()
}

type UserMenuItem = {
  title: string
  icon: React.ComponentType<{ className?: string }>
  component: React.ComponentType
}

const userMenuItems: UserMenuItem[] = [
  {
    title: "Home",
    icon: LayoutDashboard,
    component: UserHome,
  },
  {
    title: "Announcements",
    icon: Megaphone,
    component: UserAnnouncements,
  },
  {
    title: "Calendar",
    icon: CalendarDays,
    component: UserEventCalendar,
  },
  {
    title: "Delivery",
    icon: Truck,
    component: UserDelivery,
  },
  {
    title: "Attendance",
    icon: ClipboardCheck,
    component: UserAttendance,
  },
  {
    title: "Account",
    icon: Settings,
    component: UserAccount,
  },
]

export function UserSidebarLayout({
  userEmail,
  userSchool,
  userMunicipality,
  onLogout,
}: UserSidebarLayoutProps) {
  const [activeItem, setActiveItem] = useState<string>(
    userMenuItems[0]?.title || "Home"
  )

  const [authUser, setAuthUser] = useState<AuthState["user"] | null>(() => {
    return getAuth()?.user || null
  })

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState<"all" | "announcements" | "events">("all")
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    const auth = getAuth()
    return readReadSet(auth?.user?.id)
  })

  useEffect(() => {
    const auth = getAuth()
    try {
      const userId = String(auth?.user?.id || "").trim() || "anon"
      localStorage.removeItem(`bhss_user_notifications_${userId}`)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = (await apiFetch("/api/announcements")) as AnnouncementsListResponse
        const list = Array.isArray(data?.announcements) ? data.announcements : []
        if (cancelled || !list.length) return

        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id))

          const seeded: UserNotification[] = list
            .map((a): UserNotification | null => {
              const id = String(a?._id || a?.id || "").trim()
              if (!id) return null
              const title = String(a?.title || "Announcement")
              const message = String(a?.message || "")
              const notificationId = `announcement-${id}`
              if (existingIds.has(notificationId)) return null

              const isRead = readIds.has(notificationId)
              return {
                id: notificationId,
                kind: "announcement",
                title,
                message,
                createdAt: a?.createdAt ? new Date(String(a.createdAt)).getTime() : Date.now(),
                read: isRead,
              }
            })
            .filter(Boolean) as UserNotification[]

          seeded.sort((a, b) => b.createdAt - a.createdAt)

          if (!seeded.length) return prev
          return [...seeded, ...prev].slice(0, 50)
        })
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const auth = getAuth()
    setReadIds(readReadSet(auth?.user?.id))
  }, [])

  useEffect(() => {
    const auth = getAuth()
    writeReadSet(auth?.user?.id, readIds)
  }, [readIds])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = (await apiFetch("/api/events")) as EventsListResponse
        const events = Array.isArray(data?.events) ? data.events : []
        if (cancelled || !events.length) return

        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id))

          const seeded: UserNotification[] = events
            .map((e): UserNotification | null => {
              const id = String(e?._id || e?.id || "").trim()
              if (!id) return null
              const title = String(e?.title || "New event")
              const dateKey = String(e?.dateKey || "")
              const startTime = String(e?.startTime || "")
              const endTime = String(e?.endTime || "")
              const statusRaw = String((e as any)?.status || "Scheduled")
              const status: UserNotification["status"] =
                statusRaw === "Cancelled" ? "Cancelled" : "Scheduled"
              const cancelReason = String((e as any)?.cancelReason || "")

              const notificationId = `event-${id}`
              if (existingIds.has(notificationId)) return null

              const message = `${dateKey || "(date)"} • ${formatTimeRangeAmPm(startTime, endTime)}`
              const isRead = readIds.has(notificationId)

              return {
                id: notificationId,
                kind: "event",
                title,
                message,
                createdAt: e?.createdAt ? new Date(String(e.createdAt)).getTime() : Date.now(),
                read: isRead,
                status,
                cancelReason: status === "Cancelled" ? cancelReason || undefined : undefined,
              }
            })
            .filter(Boolean) as UserNotification[]

          seeded.sort((a, b) => b.createdAt - a.createdAt)

          if (!seeded.length) return prev
          return [...seeded, ...prev].slice(0, 50)
        })
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {})
    }

    const handler = () => {
      setAuthUser(getAuth()?.user || null)
    }
    window.addEventListener("storage", handler)
    window.addEventListener("bhss_auth_updated", handler as any)
    return () => {
      window.removeEventListener("storage", handler)
      window.removeEventListener("bhss_auth_updated", handler as any)
    }
  }, [])

  useEffect(() => {
    const socket: Socket = io(getApiBaseUrl(), { transports: ["websocket"] })

    socket.on("connect", () => {
      // keep minimal diagnostics; helps verify realtime connection in dev
      console.log("User socket connected", socket.id)
    })

    socket.on("connect_error", (err) => {
      console.error("User socket connect_error", err)
    })

    socket.on("event:created", (payload: EventCreatedPayload) => {
      const title = String(payload?.event?.title || "New event")
      const dateKey = String(payload?.event?.dateKey || "")
      const startTime = String(payload?.event?.startTime || "")
      const endTime = String(payload?.event?.endTime || "")
      const id = String(payload?.event?.id || "")

      const isRead = (() => {
        const auth = getAuth()
        return readReadSet(auth?.user?.id).has(
          `event-${id || `${dateKey}-${startTime}-${title}`}`
        )
      })()

      const message = `${dateKey || "(date)"} • ${formatTimeRangeAmPm(startTime, endTime)}`
      const notificationId = `event-${id || `${dateKey}-${startTime}-${title}`}`

      notify({
        variant: "success",
        title: "New event scheduled",
        message: `${title} • ${message}`,
        id: notificationId,
      })

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification("New event scheduled", {
            body: `${title} • ${message}`,
            silent: false,
            tag: notificationId,
          })
          setTimeout(() => n.close(), 5000)
        } catch {
          // ignore
        }
      }

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notificationId)) return prev
        const next: UserNotification = {
          id: notificationId,
          kind: "event",
          title,
          message,
          createdAt: Date.now(),
          read: isRead,
          status: "Scheduled",
        }
        return [next, ...prev].slice(0, 50)
      })
    })

    socket.on("announcement:created", (payload: AnnouncementCreatedPayload) => {
      const title = String(payload?.announcement?.title || "Announcement")
      const id = String(payload?.announcement?.id || "")
      const createdAt =
        typeof payload?.announcement?.createdAt === "number" ? payload.announcement.createdAt : Date.now()

      const notificationId = `announcement-${id || `${createdAt}-${title}`}`

      const isRead = (() => {
        const auth = getAuth()
        return readReadSet(auth?.user?.id).has(notificationId)
      })()

      notify({
        variant: "info",
        title: "New announcement",
        message: title,
        id: notificationId,
      })

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification("New announcement", {
            body: title,
            silent: false,
            tag: notificationId,
          })
          setTimeout(() => n.close(), 5000)
        } catch {
          // ignore
        }
      }

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notificationId)) return prev
        const next: UserNotification = {
          id: notificationId,
          kind: "announcement",
          title,
          message: "",
          createdAt,
          read: isRead,
        }
        return [next, ...prev].slice(0, 50)
      })
    })

    socket.on("event:cancelled", (payload: EventCancelledPayload) => {
      const title = String(payload?.event?.title || "Event")
      const dateKey = String(payload?.event?.dateKey || "")
      const startTime = String(payload?.event?.startTime || "")
      const endTime = String(payload?.event?.endTime || "")
      const id = String(payload?.event?.id || "")
      const reason = String(payload?.event?.cancelReason || "")

      const message = `${dateKey || "(date)"} • ${formatTimeRangeAmPm(startTime, endTime)}`
      const notificationId = `event-${id || `${dateKey}-${startTime}-${title}`}`

      const isRead = (() => {
        const auth = getAuth()
        return readReadSet(auth?.user?.id).has(notificationId)
      })()

      notify({
        variant: "error",
        title: "Event cancelled",
        message: `${title} • ${message}${reason ? ` • ${reason}` : ""}`,
        id: `${notificationId}-cancelled`,
      })

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification("Event cancelled", {
            body: `${title} • ${message}${reason ? ` • ${reason}` : ""}`,
            silent: false,
            tag: `${notificationId}-cancelled`,
          })
          setTimeout(() => n.close(), 6000)
        } catch {
          // ignore
        }
      }

      setNotifications((prev) => {
        const exists = prev.find((n) => n.id === notificationId)
        if (exists) {
          return prev
            .map((n): UserNotification =>
              n.id === notificationId
                ? {
                    ...n,
                    status: "Cancelled",
                    cancelReason: reason || n.cancelReason,
                    read: isRead ? true : false,
                  }
                : n
            )
            .slice(0, 50)
        }

        const next: UserNotification = {
          id: notificationId,
          kind: "event",
          title,
          message,
          createdAt: Date.now(),
          read: isRead,
          status: "Cancelled",
          cancelReason: reason || undefined,
        }
        return [next, ...prev].slice(0, 50)
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    const auth = getAuth()
    if (!auth?.user?.id) return

    let cancelled = false
    ;(async () => {
      try {
        const data = (await apiFetch(`/api/users/${encodeURIComponent(auth.user.id)}`)) as any
        const u = (data as any)?.user || (data as any)
        if (!u || cancelled) return
        setAuthUser((prev) => ({
          ...(prev || auth.user),
          email: u.email ?? prev?.email ?? auth.user.email,
          username: u.username ?? prev?.username ?? auth.user.username,
          name: u.name ?? prev?.name ?? auth.user.name,
          school: u.school ?? prev?.school ?? auth.user.school,
          municipality: u.municipality ?? prev?.municipality ?? auth.user.municipality,
          avatarUrl: u.avatarUrl ?? prev?.avatarUrl ?? (auth.user as any)?.avatarUrl,
        }))
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      const auth = getAuth()
      if (!auth?.user?.id) return
      apiFetch(`/api/users/${encodeURIComponent(auth.user.id)}`)
        .then((data: any) => {
          const u = (data as any)?.user || (data as any)
          if (!u) return
          setAuthUser((prev) => ({
            ...(prev || auth.user),
            email: u.email ?? prev?.email ?? auth.user.email,
            username: u.username ?? prev?.username ?? auth.user.username,
            name: u.name ?? prev?.name ?? auth.user.name,
            school: u.school ?? prev?.school ?? auth.user.school,
            municipality: u.municipality ?? prev?.municipality ?? auth.user.municipality,
            avatarUrl: u.avatarUrl ?? prev?.avatarUrl ?? (auth.user as any)?.avatarUrl,
          }))
        })
        .catch(() => {})
    }

    window.addEventListener("bhss_auth_updated", handler as any)
    return () => {
      window.removeEventListener("bhss_auth_updated", handler as any)
    }
  }, [])

  const ActiveComponent =
    userMenuItems.find((item) => item.title === activeItem)?.component || UserHome

  const headerLabel = useMemo(() => {
    if (activeItem) return activeItem
    return "Home"
  }, [activeItem])

  const sidebarTitle = useMemo(() => {
    return userMunicipality?.trim() || "Municipality"
  }, [userMunicipality])

  const avatarSrc = useMemo(() => {
    const raw = authUser?.avatarUrl || ""
    if (!raw) return ""
    if (/^https?:\/\//i.test(raw)) return raw
    if (raw.startsWith("/")) return `${getApiBaseUrl()}${raw}`
    return raw
  }, [authUser?.avatarUrl])

  const unreadCount = useMemo(() => {
    return notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0)
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    if (notifTab === "events") return notifications.filter((n) => n.kind === "event")
    if (notifTab === "announcements") return notifications.filter((n) => n.kind === "announcement")
    return notifications
  }, [notifications, notifTab])

  return (
    <SidebarProvider
      className="bg-[#f5faf7] has-data-[variant=inset]:!bg-[#f5faf7]"
      style={{ fontFamily: '"Artico Soft-Medium","Mona Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
    >
      <Sidebar
        collapsible="icon"
        variant="inset"
        className="
          [@supports(backdrop-filter:blur(0))]:[&_[data-slot=sidebar-inner]]:backdrop-blur-xl
          [&_[data-slot=sidebar-inner]]:!bg-[#f5faf7]/70
          [&_[data-slot=sidebar-inner]]:rounded-2xl
          [&_[data-slot=sidebar-inner]]:border
          [&_[data-slot=sidebar-inner]]:border-black/5
          [&_[data-slot=sidebar-inner]]:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_8px_24px_rgba(0,0,0,0.04)]
        "
      >
        <SidebarHeader className="border-b border-black/5 bg-transparent">
          <div className="flex items-center gap-2 px-2 py-4">
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm overflow-hidden">
              {avatarSrc ? (
                <Avatar className="size-9 rounded-xl">
                  <AvatarImage src={avatarSrc} />
                  <AvatarFallback className="rounded-xl text-xs font-semibold">
                    {initials(authUser?.name)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <CircleUserRound className="size-5" />
              )}
            </div>
            <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
              <span className="font-semibold leading-tight">{sidebarTitle}</span>
              <span className="text-xs text-muted-foreground">BHSS User Portal</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {userMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      className="w-full my-0.5 text-[15px] text-neutral-800 [&>svg]:size-5 rounded-2xl border border-transparent bg-transparent hover:bg-emerald-600 hover:text-white hover:[&>svg]:text-white data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-transparent data-[active=true]:shadow-none transition-colors px-3.5 py-2.5 h-11 gap-2.5"
                      isActive={activeItem === item.title}
                      onClick={() => setActiveItem(item.title)}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/60">
          <div className="flex flex-col gap-2">
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-3" />
                <span className="truncate">{userEmail || ""}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <School className="size-3" />
                <span className="truncate">{userSchool || ""}</span>
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-start text-base"
              onClick={onLogout}
            >
              <LogOut className="size-5" />
              <span className="group-data-[collapsible=icon]:hidden">Logout</span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-white">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-white">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-lg font-semibold">{headerLabel}</h1>
          <div className="ml-auto">
            <DropdownMenu open={notifOpen} onOpenChange={(v) => setNotifOpen(v)}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-xl">
                  <Bell className="size-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-semibold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                  <span className="sr-only">Notifications</span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-[calc(100vw-2rem)] max-w-[320px] sm:max-w-[380px] sm:w-[360px] rounded-2xl p-2 sm:p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] sm:text-sm font-semibold">Notifications</div>
                    <div className="text-xs text-muted-foreground">
                      {notifications.length ? `${notifications.length} total` : "No notifications yet"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-8 rounded-xl px-2 text-xs"
                    onClick={() => {
                      setNotifications([])
                    }}
                  >
                    Clear
                  </Button>
                </div>

                <div className="mt-3">
                  <Tabs value={notifTab} onValueChange={(v) => setNotifTab(v as any)}>
                    <TabsList className="grid w-full grid-cols-3 h-9">
                      <TabsTrigger value="all" className="px-2 text-xs sm:text-sm">
                        All
                      </TabsTrigger>
                      <TabsTrigger value="announcements" className="px-2 text-xs sm:text-sm">
                        Announce
                      </TabsTrigger>
                      <TabsTrigger value="events" className="px-2 text-xs sm:text-sm">
                        Events
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value={notifTab}>
                      <div className="mt-2 max-h-[min(50dvh,300px)] space-y-2 overflow-auto pr-1">
                        {filteredNotifications.length ? (
                          filteredNotifications.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => {
                                setNotifications((prev) =>
                                  prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
                                )
                                setReadIds((prev) => {
                                  const next = new Set(prev)
                                  next.add(n.id)
                                  return next
                                })
                              }}
                              className={`group relative block w-full overflow-hidden text-left rounded-2xl border bg-white/70 p-3 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-[1px] hover:bg-white hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
                                n.status === "Cancelled"
                                  ? "border-red-600/25"
                                  : n.kind === "event"
                                    ? "border-emerald-600/20"
                                    : "border-sky-600/20"
                              }`}
                            >
                              <div
                                className={`absolute inset-y-0 left-0 w-1 ${
                                  n.status === "Cancelled"
                                    ? "bg-red-600"
                                    : n.kind === "event"
                                      ? "bg-emerald-600"
                                      : "bg-sky-600"
                                }`}
                              />

                              <div className="flex items-start justify-between gap-3">
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    n.status === "Cancelled"
                                      ? "bg-red-600/10 text-red-700"
                                      : n.kind === "event"
                                        ? "bg-emerald-600/10 text-emerald-700"
                                        : "bg-sky-600/10 text-sky-700"
                                  }`}
                                >
                                  {n.kind === "event" ? "Event" : "Announcement"}
                                </span>

                                <div className="flex items-center gap-2">
                                  {!n.read ? (
                                    <span
                                      className={`mt-0.5 size-2 rounded-full ${
                                        n.status === "Cancelled"
                                          ? "bg-red-600"
                                          : n.kind === "event"
                                            ? "bg-emerald-600"
                                            : "bg-sky-600"
                                      }`}
                                      aria-label="Unread"
                                    />
                                  ) : null}

                                  {n.status === "Cancelled" ? (
                                    <span className="shrink-0 rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                                      Cancelled
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-2 pl-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 text-[13px] sm:text-sm font-semibold leading-snug truncate text-slate-900">
                                    {n.title}
                                  </div>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="shrink-0 text-[10px] sm:text-xs text-muted-foreground hover:text-slate-700">
                                        {formatRelativeNotifiedAt(n.createdAt)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6}>
                                      {formatAbsoluteDateTime(n.createdAt)}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              <div
                                className={`mt-1 text-[11px] sm:text-xs leading-snug text-muted-foreground ${
                                  n.kind === "announcement" ? "line-clamp-2 whitespace-normal break-words" : "truncate"
                                }`}
                              >
                                {n.message}
                              </div>
                              {n.status === "Cancelled" && n.cancelReason ? (
                                <div className="mt-1 hidden sm:block text-xs truncate text-muted-foreground">
                                  Reason: {n.cancelReason}
                                </div>
                              ) : null}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-6 text-center text-sm text-muted-foreground">
                            No items
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 bg-white">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <ActiveComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
