import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { format, parseISO } from "date-fns"
import { Megaphone, CalendarClock, ChevronRight, Image as ImageIcon, Paperclip, Radio, RefreshCw, Plus, Heart } from "lucide-react"
import { io, type Socket } from "socket.io-client"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type AuthState = {
  token: string
  user: {
    id: string
    username: string
    email: string
    name: string
    role: string
  }
}

type AnnouncementPriority = "Normal" | "Important" | "Urgent"
type AnnouncementAudience = "All" | "Users"

type AnnouncementListResponse = {
  announcements?: Array<{
    _id?: string
    id?: string
    title?: string
    message?: string
    priority?: string
    audience?: string
    createdAt?: string
    attachments?: Array<{
      filename?: string
      originalName?: string
      url?: string
      size?: number
      mimeType?: string
    }>
  }>
}

type AnnouncementDetailsResponse = {
  announcement?: {
    _id?: string
    id?: string
    title?: string
    message?: string
    priority?: string
    audience?: string
    createdAt?: string
    attachments?: Array<{
      filename?: string
      originalName?: string
      url?: string
      size?: number
      mimeType?: string
    }>
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

type EventCreatedPayload = {
  event?: {
    id?: string
    title?: string
    dateKey?: string
    startTime?: string
    endTime?: string
    status?: string
    createdAt?: number
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
    createdAt?: number
  }
}

type FeedItemKind = "event" | "announcement"

type FeedItem = {
  id: string
  kind: FeedItemKind
  sourceId?: string
  title: string
  subtitle: string
  dateKey?: string
  startTime?: string
  endTime?: string
  status?: "Scheduled" | "Cancelled"
  cancelReason?: string
  createdAt: number
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

type EventDetailsResponse = {
  event?: {
    _id?: string
    id?: string
    title?: string
    description?: string
    dateKey?: string
    startTime?: string
    endTime?: string
    status?: string
    cancelReason?: string
    attachment?: {
      filename?: string
      originalName?: string
      url?: string
      size?: number
      mimeType?: string
    }
  }
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
  const token = auth?.token
  if (!token) throw new Error("Not authenticated")

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

function safeFormatDateKey(dateKey?: string) {
  const raw = String(dateKey || "").trim()
  if (!raw) return ""
  try {
    return format(parseISO(raw), "MMM d, yyyy")
  } catch {
    try {
      return format(parseISO(`${raw}T00:00:00.000Z`), "MMM d, yyyy")
    } catch {
      return raw
    }
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

export function AnnouncementsFeedPage({ mode = "user" }: { mode?: "user" | "admin" }) {
  const [activeTab, setActiveTab] = useState<"all" | "announcements" | "events">("all")
  const [isLoading, setIsLoading] = useState(true)
  const [events, setEvents] = useState<FeedItem[]>([])
  const [announcements, setAnnouncements] = useState<FeedItem[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const [selectedEventDetails, setSelectedEventDetails] = useState<EventDetailsResponse["event"] | null>(null)
  const [selectedAnnouncementDetails, setSelectedAnnouncementDetails] =
    useState<AnnouncementDetailsResponse["announcement"] | null>(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)

  const [pendingOpen, setPendingOpen] = useState<
    | { kind: "announcement" | "event"; sourceId: string }
    | null
  >(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createMessage, setCreateMessage] = useState("")
  const [createPriority, setCreatePriority] = useState<AnnouncementPriority>("Normal")
  const [createAudience, setCreateAudience] = useState<AnnouncementAudience>("All")
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const createFilesInputRef = useRef<HTMLInputElement | null>(null)

  const PAGE_SIZE = 10

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bhss_notif_intent")
      if (!raw) return
      const parsed = JSON.parse(raw) as any
      if (!parsed?.kind || !parsed?.sourceId) return
      localStorage.removeItem("bhss_notif_intent")
      const kind = String(parsed.kind)
      const sourceId = String(parsed.sourceId)
      if (kind !== "announcement" && kind !== "event") return
      if (!sourceId.trim()) return
      setPendingOpen({ kind: kind as any, sourceId })
      if (kind === "announcement") setActiveTab("announcements")
      if (kind === "event") setActiveTab("events")
    } catch {
      // ignore
    }
  }, [])

  const [page, setPage] = useState(1)

  const loadAll = async () => {
    const [eventsRes, announcementsRes] = await Promise.all([
      apiFetch("/api/events") as Promise<EventsListResponse>,
      apiFetch("/api/announcements") as Promise<AnnouncementListResponse>,
    ])

    const eventsList = Array.isArray(eventsRes?.events) ? eventsRes.events : []
    const mappedEvents: FeedItem[] = eventsList
      .map((e): FeedItem | null => {
        const id = String(e?._id || e?.id || "").trim()
        if (!id) return null
        const title = String(e?.title || "New event")
        const dateKey = String(e?.dateKey || "")
        const startTime = String(e?.startTime || "")
        const endTime = String(e?.endTime || "")
        const status = String(e?.status || "Scheduled") as any
        const cancelReason = String((e as any)?.cancelReason || "")
        const subtitle = `${safeFormatDateKey(dateKey) || dateKey || "(date)"} • ${formatTimeRangeAmPm(startTime, endTime)}`
        const createdAt = e?.createdAt ? new Date(String(e.createdAt)).getTime() : Date.now()
        return {
          id: `event-${id}`,
          kind: "event",
          sourceId: id,
          title,
          subtitle,
          dateKey,
          startTime,
          endTime,
          status: status === "Cancelled" ? "Cancelled" : "Scheduled",
          cancelReason: cancelReason || undefined,
          createdAt,
        }
      })
      .filter(Boolean) as FeedItem[]

    const announcementsList = Array.isArray(announcementsRes?.announcements) ? announcementsRes.announcements : []
    const mappedAnnouncements: FeedItem[] = announcementsList
      .map((a): FeedItem | null => {
        const id = String(a?._id || a?.id || "").trim()
        if (!id) return null
        const title = String(a?.title || "Announcement")
        const msg = String(a?.message || "")
        const subtitle = msg || "(no message)"
        const createdAt = a?.createdAt ? new Date(String(a.createdAt)).getTime() : Date.now()
        return { id: `announcement-${id}`, kind: "announcement", sourceId: id, title, subtitle, createdAt }
      })
      .filter(Boolean) as FeedItem[]

    mappedEvents.sort((a, b) => b.createdAt - a.createdAt)
    mappedAnnouncements.sort((a, b) => b.createdAt - a.createdAt)
    setEvents(mappedEvents)
    setAnnouncements(mappedAnnouncements)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      try {
        await loadAll()
      } catch {
        if (!cancelled) { setEvents([]); setAnnouncements([]) }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const socket: Socket = io(getApiBaseUrl(), { transports: ["websocket"] })

    socket.on("event:created", (payload: EventCreatedPayload) => {
      const title = String(payload?.event?.title || "New event")
      const dateKey = String(payload?.event?.dateKey || "")
      const startTime = String(payload?.event?.startTime || "")
      const endTime = String(payload?.event?.endTime || "")
      const id = String(payload?.event?.id || "").trim()
      if (!id) return
      const createdAt = typeof payload?.event?.createdAt === "number" ? payload.event.createdAt : Date.now()
      const itemId = `event-${id}`
      setEvents((prev) => {
        if (prev.some((x) => x.id === itemId)) return prev
        const subtitle = `${safeFormatDateKey(dateKey) || dateKey || "(date)"} • ${formatTimeRangeAmPm(startTime, endTime)}`
        const next: FeedItem = { id: itemId, kind: "event", sourceId: id, title, subtitle, dateKey, startTime, endTime, status: "Scheduled", createdAt }
        return [next, ...prev]
      })
    })

    socket.on("event:cancelled", (payload: EventCancelledPayload) => {
      const id = String(payload?.event?.id || "").trim()
      if (!id) return
      const itemId = `event-${id}`
      const cancelReason = String(payload?.event?.cancelReason || "").trim()
      setEvents((prev) => prev.map((x) => x.id === itemId ? { ...x, status: "Cancelled", cancelReason: cancelReason || x.cancelReason } : x))
    })

    socket.on("announcement:created", (payload: AnnouncementCreatedPayload) => {
      const id = String(payload?.announcement?.id || "").trim()
      if (!id) return
      const itemId = `announcement-${id}`
      setAnnouncements((prev) => {
        if (prev.some((x) => x.id === itemId)) return prev
        const title = String(payload?.announcement?.title || "Announcement")
        const createdAt = typeof payload?.announcement?.createdAt === "number" ? payload.announcement.createdAt : Date.now()
        const next: FeedItem = { id: itemId, kind: "announcement", sourceId: id, title, subtitle: "", createdAt }
        return [next, ...prev]
      })
    })

    return () => { socket.disconnect() }
  }, [])

  const mergedAll = useMemo<FeedItem[]>(() => {
    const map = new Map<string, FeedItem>()
    for (const it of events) map.set(it.id, it)
    for (const it of announcements) map.set(it.id, it)
    const items = Array.from(map.values())
    items.sort((a, b) => b.createdAt - a.createdAt)
    return items
  }, [announcements, events])

  const visible = useMemo(() => {
    if (activeTab === "events") return mergedAll.filter((x) => x.kind === "event")
    if (activeTab === "announcements") return mergedAll.filter((x) => x.kind === "announcement")
    return mergedAll
  }, [activeTab, mergedAll])

  useEffect(() => { setPage(1) }, [activeTab])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(visible.length / PAGE_SIZE)), [PAGE_SIZE, visible.length])

  useEffect(() => { setPage((p) => Math.min(Math.max(1, p), pageCount)) }, [pageCount])

  const pagedVisible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return visible.slice(start, start + PAGE_SIZE)
  }, [PAGE_SIZE, page, visible])

  const showingFrom = visible.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const showingTo = visible.length ? Math.min(page * PAGE_SIZE, visible.length) : 0

  const openDetails = async (it: FeedItem) => {
    setSelected(it)
    setDetailsOpen(true)
    setSelectedEventDetails(null)
    setSelectedAnnouncementDetails(null)
    setIsDetailsLoading(true)
    try {
      const sourceId = String(it.sourceId || "").trim()
      if (!sourceId) return
      if (it.kind === "event") {
        const res = (await apiFetch(`/api/events/${encodeURIComponent(sourceId)}`)) as EventDetailsResponse
        setSelectedEventDetails(res?.event || null)
      }
      if (it.kind === "announcement") {
        const res = (await apiFetch(`/api/announcements/${encodeURIComponent(sourceId)}`)) as AnnouncementDetailsResponse
        setSelectedAnnouncementDetails(res?.announcement || null)
      }
    } catch {
      setSelectedEventDetails(null)
      setSelectedAnnouncementDetails(null)
    } finally {
      setIsDetailsLoading(false)
    }
  }

  useEffect(() => {
    if (!pendingOpen) return
    if (isLoading) return
    if (pendingOpen.kind !== "announcement") return
    const sourceId = String(pendingOpen.sourceId || "").trim()
    if (!sourceId) { setPendingOpen(null); return }
    const match = announcements.find((x) => x.kind === "announcement" && String(x.sourceId) === sourceId)
    const it: FeedItem = match || ({ id: `announcement-${sourceId}`, kind: "announcement", sourceId, title: "Announcement", subtitle: "", createdAt: Date.now() } as FeedItem)
    openDetails(it).finally(() => { setPendingOpen(null) })
  }, [announcements, isLoading, pendingOpen])

  const createAnnouncement = async () => {
    const title = createTitle.trim()
    const message = createMessage.trim()
    if (!title) { toast.error("Title is required"); return }
    if (!message) { toast.error("Message is required"); return }
    setIsCreating(true)
    try {
      const fd = new FormData()
      fd.append("title", title)
      fd.append("message", message)
      fd.append("priority", createPriority)
      fd.append("audience", createAudience)
      for (const f of createFiles) fd.append("attachments", f)
      await apiFetch("/api/admin/announcements", { method: "POST", body: fd })
      toast.success("Announcement created")
      setCreateOpen(false)
      setCreateTitle("")
      setCreateMessage("")
      setCreatePriority("Normal")
      setCreateAudience("All")
      setCreateFiles([])
      await loadAll()
    } catch (e: any) {
      toast.error(e?.message || "Failed to create announcement")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50/40 px-4 py-8 sm:px-6 lg:px-8"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Nunito', 'Inter', sans-serif" }}
    >
      {/* ── Page Header ── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-green-700">
            <Radio className="size-3" />
            Live Updates
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight text-gray-800 sm:text-4xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Announcements
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Your complete feed of health announcements and scheduled wellness events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {mode === "admin" && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-green-200 transition-all hover:bg-green-500 hover:shadow-green-300 active:scale-[0.97]"
            >
              <Plus className="size-4" />
              New Announcement
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsLoading(true)
              loadAll().catch(() => {}).finally(() => setIsLoading(false))
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:text-gray-800 hover:shadow-md active:scale-[0.97]"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main Card ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* Tabs */}
        <div className="border-b border-gray-100 pt-5">
          <div className="overflow-x-auto px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-1">
              {(["all", "announcements", "events"] as const).map((tab) => {
                const count =
                  tab === "all" ? mergedAll.length : tab === "announcements" ? announcements.length : events.length
                const isActive = activeTab === tab
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-semibold capitalize transition-all sm:px-4 ${
                      isActive ? "text-green-700" : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {tab}
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold transition-all ${
                        isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {count}
                    </span>
                    {isActive && (
                      <motion.span
                        layoutId="activeTabIndicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-green-500"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Feed */}
        <div className="p-4 sm:p-6">
          <div className="h-[calc(100dvh-360px)] min-h-[320px] max-h-[560px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="size-8 animate-spin rounded-full border-[3px] border-green-100 border-t-green-500" />
                <p className="mt-3 text-sm text-gray-400">Loading feed…</p>
              </div>
            ) : pagedVisible.length ? (
              <div className="space-y-2.5">
                {pagedVisible.map((it, i) => {
                  const isEvent = it.kind === "event"
                  const isCancelled = isEvent && it.status === "Cancelled"
                  const mobileMeta = isEvent
                    ? `${safeFormatDateKey(it.dateKey) || String(it.dateKey || "")} • ${formatTimeRangeAmPm(it.startTime, it.endTime)}`
                    : ""

                  return (
                    <motion.button
                      key={it.id}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2, ease: "easeOut" }}
                      onClick={() => openDetails(it)}
                      className={`group w-full rounded-2xl border text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-green-300 active:scale-[0.995] ${
                        isCancelled
                          ? "border-red-100 bg-red-50/60 hover:border-red-200 hover:bg-red-50"
                          : isEvent
                            ? "border-teal-100 bg-teal-50/40 hover:border-teal-200 hover:bg-teal-50/70 hover:shadow-sm"
                            : "border-green-100 bg-green-50/40 hover:border-green-200 hover:bg-green-50/70 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
                        {/* Icon */}
                        <div
                          className={`grid size-11 shrink-0 place-items-center rounded-xl transition-all duration-200 group-hover:scale-105 ${
                            isEvent
                              ? isCancelled
                                ? "bg-red-100 text-red-500"
                                : "bg-teal-100 text-teal-600"
                              : "bg-green-100 text-green-600"
                          }`}
                        >
                          {isEvent ? <CalendarClock className="size-5" /> : <Megaphone className="size-5" />}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                                isEvent
                                  ? isCancelled
                                    ? "bg-red-100 text-red-600"
                                    : "bg-teal-100 text-teal-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {isEvent ? "Event" : "Announcement"}
                            </span>
                            {isCancelled && (
                              <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                                Cancelled
                              </span>
                            )}
                            <span className="truncate text-sm font-semibold text-gray-800">{it.title}</span>
                          </div>
                          <div className={`mt-0.5 text-sm text-gray-500 ${isEvent ? "truncate" : "line-clamp-2"}`}>
                            {it.subtitle}
                          </div>
                          {mobileMeta && (
                            <div className="mt-1 text-xs text-gray-400 sm:hidden">{mobileMeta}</div>
                          )}
                        </div>

                        {/* Date (desktop) */}
                        {isEvent && (
                          <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                              {safeFormatDateKey(it.dateKey) || String(it.dateKey || "")}
                            </span>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTimeRangeAmPm(it.startTime, it.endTime)}
                            </span>
                          </div>
                        )}

                        <ChevronRight className="size-4 shrink-0 text-gray-300 transition-all duration-200 group-hover:text-green-500 group-hover:translate-x-0.5" />
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
                <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-green-100 text-green-400">
                  <Heart className="size-6" />
                </div>
                <p className="text-sm font-semibold text-gray-600">No items yet</p>
                <p className="mt-1 max-w-xs text-xs text-gray-400">
                  Events will appear here automatically. Announcements will show once the backend is connected.
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!isLoading && visible.length ? (
            <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-gray-400">
                Showing{" "}
                <span className="font-semibold text-gray-600">{showingFrom}</span>–
                <span className="font-semibold text-gray-600">{showingTo}</span> of{" "}
                <span className="font-semibold text-gray-600">{visible.length}</span>
              </div>

              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: pageCount }).map((_, idx) => {
                    const p = idx + 1
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`inline-flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                          p === page
                            ? "bg-green-600 text-white shadow-sm shadow-green-200"
                            : "border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Details Dialog ── */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(v) => {
          setDetailsOpen(v)
          if (!v) {
            setSelected(null)
            setSelectedEventDetails(null)
            setSelectedAnnouncementDetails(null)
            setIsDetailsLoading(false)
          }
        }}
      >
        <DialogContent className="rounded-2xl border border-gray-100 bg-white p-0 w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-hidden shadow-xl">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
              <DialogTitle className="text-base font-bold text-gray-800">
                {selected?.kind === "event" ? "Event Details" : "Announcement Details"}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                {selected?.kind === "event"
                  ? "Full event information, including attachments."
                  : "Full announcement information."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {selected?.kind === "event" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                    <div className="text-base font-bold text-gray-800">
                      {String(selectedEventDetails?.title || selected?.title || "Event")}
                    </div>
                    {String(selectedEventDetails?.status || selected?.status || "") === "Cancelled" ? (
                      <div className="mt-2">
                        <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                          Cancelled
                        </span>
                        {String(selectedEventDetails?.cancelReason || selected?.cancelReason || "") ? (
                          <div className="mt-2 text-sm text-red-500">
                            Reason: {String(selectedEventDetails?.cancelReason || selected?.cancelReason || "")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-2 text-sm font-semibold text-teal-700">
                      {String(selectedEventDetails?.dateKey || selected?.dateKey || "")
                        ? safeFormatDateKey(selectedEventDetails?.dateKey || selected?.dateKey)
                        : ""}
                    </div>
                    <div className="mt-0.5 text-sm text-gray-500">
                      {formatTimeRangeAmPm(
                        String(selectedEventDetails?.startTime || selected?.startTime || ""),
                        String(selectedEventDetails?.endTime || selected?.endTime || "")
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Description</div>
                    <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
                      {isDetailsLoading ? (
                        <span className="flex items-center gap-2 text-gray-400">
                          <span className="size-3 animate-spin rounded-full border border-gray-200 border-t-green-500" />
                          Loading…
                        </span>
                      ) : (
                        String(selectedEventDetails?.description || "") || "No additional description."
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Attachment</div>
                    <div className="mt-2 text-sm">
                      {selectedEventDetails?.attachment?.url ? (
                        <a
                          href={`${getApiBaseUrl()}${String(selectedEventDetails.attachment.url)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-green-600 hover:text-green-700 underline underline-offset-4"
                        >
                          {String(selectedEventDetails.attachment.originalName || "Download file")}
                        </a>
                      ) : (
                        <span className="text-gray-400">No attachment</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : selected?.kind === "announcement" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-green-100 bg-green-50/50 p-4">
                    <div className="text-base font-bold text-gray-800">
                      {String(selectedAnnouncementDetails?.title || selected?.title || "Announcement")}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-green-700">
                        Announcement
                      </span>
                      {String(selectedAnnouncementDetails?.priority || "") ? (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                          {String(selectedAnnouncementDetails?.priority || "Normal")}
                        </span>
                      ) : null}
                      {String(selectedAnnouncementDetails?.audience || "") ? (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                          {String(selectedAnnouncementDetails?.audience || "All")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      {selectedAnnouncementDetails?.createdAt
                        ? format(new Date(String(selectedAnnouncementDetails.createdAt)), "MMM d, yyyy • h:mm a")
                        : ""}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Message</div>
                    <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
                      {isDetailsLoading ? (
                        <span className="flex items-center gap-2 text-gray-400">
                          <span className="size-3 animate-spin rounded-full border border-gray-200 border-t-green-500" />
                          Loading…
                        </span>
                      ) : (
                        String(selectedAnnouncementDetails?.message || selected?.subtitle || "") || "(no message)"
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Attachments</div>
                    <div className="mt-3">
                      {Array.isArray(selectedAnnouncementDetails?.attachments) &&
                      selectedAnnouncementDetails!.attachments!.length ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {selectedAnnouncementDetails!.attachments!.map((a, idx) => {
                            const url = String(a?.url || "")
                            const abs = url ? `${getApiBaseUrl()}${url}` : ""
                            const isImage = String(a?.mimeType || "").startsWith("image/")
                            const name = String(a?.originalName || a?.filename || `file-${idx + 1}`)
                            return (
                              <a
                                key={`${name}-${idx}`}
                                href={abs || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="group block overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-md"
                              >
                                <div className="aspect-video w-full bg-gray-50">
                                  {isImage && abs ? (
                                    <img
                                      src={abs}
                                      alt={name}
                                      className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-gray-300">
                                      <Paperclip className="size-4" />
                                    </div>
                                  )}
                                </div>
                                <div className="px-2 py-2 text-xs">
                                  <div className="truncate font-medium text-gray-600">{name}</div>
                                </div>
                              </a>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">No attachments</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
                  <div className="text-sm font-semibold text-gray-500">Announcements not connected yet</div>
                  <div className="mt-1 text-sm text-gray-400">
                    Once you add an announcements backend, this modal will show the full details.
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800 hover:shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create Announcement Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl border border-gray-100 bg-white p-0 w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-hidden shadow-xl">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
              <DialogTitle className="text-base font-bold text-gray-800">Create Announcement</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Share updates with users. Attach images or files if needed.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Title</label>
                  <input
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. Feeding program update"
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none transition-all focus:border-green-400 focus:ring-2 focus:ring-green-100"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Message</label>
                  <Textarea
                    value={createMessage}
                    onChange={(e) => setCreateMessage(e.target.value)}
                    placeholder="Write the announcement details…"
                    className="min-h-[140px] rounded-xl border-gray-200 text-gray-800 placeholder-gray-300 focus:border-green-400 focus:ring-green-100"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Priority</label>
                    <Select value={createPriority} onValueChange={(v) => setCreatePriority(v as AnnouncementPriority)}>
                      <SelectTrigger className="rounded-xl border-gray-200">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="Important">Important</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Audience</label>
                    <Select value={createAudience} onValueChange={(v) => setCreateAudience(v as AnnouncementAudience)}>
                      <SelectTrigger className="rounded-xl border-gray-200">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All</SelectItem>
                        <SelectItem value="Users">Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Attachments (up to 6)
                  </label>
                  <Input
                    ref={createFilesInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      if (!files.length) return
                      setCreateFiles((prev) => [...prev, ...files].slice(0, 6))
                      e.currentTarget.value = ""
                    }}
                  />

                  <div className="flex flex-col gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                        <ImageIcon className="size-4 text-gray-400" />
                        <span className="truncate">Add images / files</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Up to 6 files • 10MB each
                        {createFiles.length ? ` • ${createFiles.length} selected` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => createFilesInputRef.current?.click()}
                      className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800"
                    >
                      Select files
                    </button>
                  </div>

                  {createFiles.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {createFiles.map((f, idx) => {
                        const isImage = f.type.startsWith("image/")
                        const src = isImage ? URL.createObjectURL(f) : ""
                        return (
                          <div
                            key={`${f.name}-${idx}`}
                            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                          >
                            <div className="aspect-video bg-gray-50">
                              {isImage && src ? (
                                <img src={src} alt={f.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-gray-300">
                                  <Paperclip className="size-4" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 px-2 py-2">
                              <div className="min-w-0 truncate text-xs font-medium text-gray-600">{f.name}</div>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-500 transition-all hover:border-red-200 hover:text-red-500"
                                onClick={() => setCreateFiles((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 bg-white px-6 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={createAnnouncement}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-green-100 transition-all hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.97]"
                >
                  {isCreating ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Creating…
                    </>
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}