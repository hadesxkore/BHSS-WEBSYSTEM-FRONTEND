import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { format, parseISO } from "date-fns"
import { CalendarDays, Megaphone, CalendarClock, ChevronRight, Image as ImageIcon, Paperclip } from "lucide-react"
import { io, type Socket } from "socket.io-client"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  const [selectedEventDetails, setSelectedEventDetails] = useState<EventDetailsResponse["event"] | null>(
    null
  )
  const [selectedAnnouncementDetails, setSelectedAnnouncementDetails] =
    useState<AnnouncementDetailsResponse["announcement"] | null>(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)

  const [pendingOpen, setPendingOpen] = useState<
    | {
        kind: "announcement" | "event"
        sourceId: string
      }
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
        const subtitle = `${safeFormatDateKey(dateKey) || dateKey || "(date)"} • ${formatTimeRangeAmPm(
          startTime,
          endTime
        )}`
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

    const announcementsList = Array.isArray(announcementsRes?.announcements)
      ? announcementsRes.announcements
      : []
    const mappedAnnouncements: FeedItem[] = announcementsList
      .map((a): FeedItem | null => {
        const id = String(a?._id || a?.id || "").trim()
        if (!id) return null
        const title = String(a?.title || "Announcement")
        const msg = String(a?.message || "")
        const subtitle = msg || "(no message)"
        const createdAt = a?.createdAt ? new Date(String(a.createdAt)).getTime() : Date.now()
        return {
          id: `announcement-${id}`,
          kind: "announcement",
          sourceId: id,
          title,
          subtitle,
          createdAt,
        }
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
        if (!cancelled) {
          setEvents([])
          setAnnouncements([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
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

      const createdAt =
        typeof payload?.event?.createdAt === "number" ? payload.event.createdAt : Date.now()

      const itemId = `event-${id}`
      setEvents((prev) => {
        if (prev.some((x) => x.id === itemId)) return prev
        const subtitle = `${safeFormatDateKey(dateKey) || dateKey || "(date)"} • ${formatTimeRangeAmPm(
          startTime,
          endTime
        )}`
        const next: FeedItem = {
          id: itemId,
          kind: "event",
          sourceId: id,
          title,
          subtitle,
          dateKey,
          startTime,
          endTime,
          status: "Scheduled",
          createdAt,
        }
        return [next, ...prev]
      })
    })

    socket.on("event:cancelled", (payload: EventCancelledPayload) => {
      const id = String(payload?.event?.id || "").trim()
      if (!id) return
      const itemId = `event-${id}`
      const cancelReason = String(payload?.event?.cancelReason || "").trim()

      setEvents((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "Cancelled",
                cancelReason: cancelReason || x.cancelReason,
              }
            : x
        )
      )
    })

    socket.on("announcement:created", (payload: AnnouncementCreatedPayload) => {
      const id = String(payload?.announcement?.id || "").trim()
      if (!id) return

      const itemId = `announcement-${id}`
      setAnnouncements((prev) => {
        if (prev.some((x) => x.id === itemId)) return prev

        const title = String(payload?.announcement?.title || "Announcement")
        const createdAt =
          typeof payload?.announcement?.createdAt === "number" ? payload.announcement.createdAt : Date.now()

        const next: FeedItem = {
          id: itemId,
          kind: "announcement",
          sourceId: id,
          title,
          subtitle: "",
          createdAt,
        }

        return [next, ...prev]
      })
    })

    return () => {
      socket.disconnect()
    }
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

  useEffect(() => {
    setPage(1)
  }, [activeTab])

  const pageCount = useMemo(() => {
    return Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  }, [PAGE_SIZE, visible.length])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pageCount))
  }, [pageCount])

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
        const res = (await apiFetch(
          `/api/announcements/${encodeURIComponent(sourceId)}`
        )) as AnnouncementDetailsResponse
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
    if (!sourceId) {
      setPendingOpen(null)
      return
    }

    const match = announcements.find((x) => x.kind === "announcement" && String(x.sourceId) === sourceId)
    const it: FeedItem =
      match ||
      ({
        id: `announcement-${sourceId}`,
        kind: "announcement",
        sourceId,
        title: "Announcement",
        subtitle: "",
        createdAt: Date.now(),
      } as FeedItem)

    openDetails(it).finally(() => {
      setPendingOpen(null)
    })
  }, [announcements, isLoading, pendingOpen])

  const createAnnouncement = async () => {
    const title = createTitle.trim()
    const message = createMessage.trim()
    if (!title) {
      toast.error("Title is required")
      return
    }
    if (!message) {
      toast.error("Message is required")
      return
    }

    setIsCreating(true)
    try {
      const fd = new FormData()
      fd.append("title", title)
      fd.append("message", message)
      fd.append("priority", createPriority)
      fd.append("audience", createAudience)
      for (const f of createFiles) fd.append("attachments", f)

      await apiFetch("/api/admin/announcements", {
        method: "POST",
        body: fd,
      })

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Announcements</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            Your complete feed of announcements and scheduled events.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-xl px-3 py-1">
            <Megaphone className="mr-2 size-4" />
            Feed
          </Badge>
          <Badge variant="outline" className="rounded-xl px-3 py-1">
            <CalendarDays className="mr-2 size-4" />
            Events
          </Badge>
        </div>
      </div>

      <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Notifications Feed</CardTitle>
          <div className="flex items-center gap-2">
            {mode === "admin" ? (
              <Button
                type="button"
                className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setCreateOpen(true)}
              >
                Create announcement
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={() => {
                setIsLoading(true)
                loadAll()
                  .catch(() => {})
                  .finally(() => setIsLoading(false))
              }}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">
                All
              </TabsTrigger>
              <TabsTrigger value="announcements" className="flex-1">
                Announcements
              </TabsTrigger>
              <TabsTrigger value="events" className="flex-1">
                Events
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <ScrollArea className="h-[calc(100dvh-290px)] min-h-[360px] max-h-[560px] pr-2">
                {isLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Loading feed…</div>
                ) : pagedVisible.length ? (
                  <div className="space-y-3">
                    {pagedVisible.map((it) => {
                      const isEvent = it.kind === "event"
                      const isCancelled = isEvent && it.status === "Cancelled"
                      const mobileMeta = isEvent
                        ? `${safeFormatDateKey(it.dateKey) || String(it.dateKey || "")} • ${formatTimeRangeAmPm(
                            it.startTime,
                            it.endTime
                          )}`
                        : ""
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => openDetails(it)}
                          className={`group w-full rounded-2xl border p-3 sm:p-4 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-emerald-400/50 shadow-[0_1px_0_rgba(255,255,255,0.7),0_10px_30px_rgba(0,0,0,0.06)] hover:-translate-y-[1px] hover:shadow-[0_1px_0_rgba(255,255,255,0.7),0_16px_40px_rgba(0,0,0,0.10)] active:translate-y-0 ${
                            isCancelled
                              ? "border-red-700/20 bg-red-50/80 hover:bg-red-50"
                              : "border-black/15 bg-slate-50/90 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                            <div
                              className={`grid size-10 sm:size-11 shrink-0 place-items-center rounded-2xl border transition-colors group-hover:bg-opacity-90 ${
                                isEvent
                                  ? isCancelled
                                    ? "border-red-200 bg-red-100 text-red-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                              }`}
                            >
                              {isEvent ? <CalendarClock className="size-5" /> : <Megaphone className="size-5" />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <Badge
                                  variant="outline"
                                  className={`rounded-xl ${
                                    isEvent
                                      ? isCancelled
                                        ? "border-red-200 bg-red-100 text-red-700"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-sky-200 bg-sky-50 text-sky-700"
                                  }`}
                                >
                                  {isEvent ? "Event" : "Announcement"}
                                </Badge>
                                {isCancelled ? (
                                  <Badge className="rounded-xl bg-red-600 text-white hover:bg-red-600">
                                    Cancelled
                                  </Badge>
                                ) : null}
                                <div className="truncate text-sm font-semibold">{it.title}</div>
                              </div>
                              <div
                                className={`mt-1 text-sm text-muted-foreground ${
                                  isEvent ? "truncate" : "whitespace-normal break-words line-clamp-2"
                                }`}
                              >
                                {it.subtitle}
                              </div>

                              {mobileMeta ? (
                                <div className="mt-2 text-xs text-muted-foreground sm:hidden line-clamp-2">
                                  {mobileMeta}
                                </div>
                              ) : null}
                            </div>

                            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                              {isEvent ? (
                                <div className="text-xs font-medium text-slate-700 whitespace-nowrap">
                                  {safeFormatDateKey(it.dateKey) || String(it.dateKey || "")}
                                </div>
                              ) : null}
                              {isEvent ? (
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatTimeRangeAmPm(it.startTime, it.endTime)}
                                </div>
                              ) : null}
                            </div>

                            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-10 text-center">
                    <div className="text-sm font-semibold">No items yet</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Events will appear here automatically. Announcements will show once the backend is connected.
                    </div>
                  </div>
                )}
              </ScrollArea>

              {!isLoading && visible.length ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Showing {showingFrom}–{showingTo} of {visible.length}
                  </div>

                  {pageCount > 1 ? (
                    <Pagination className="mx-0 w-full justify-start sm:w-auto sm:justify-center">
                      <PaginationContent className="flex-wrap justify-start">
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              setPage((p) => Math.max(1, p - 1))
                            }}
                          />
                        </PaginationItem>

                        {Array.from({ length: pageCount }).map((_, idx) => {
                          const p = idx + 1
                          return (
                            <PaginationItem key={p}>
                              <PaginationLink
                                href="#"
                                isActive={p === page}
                                onClick={(e) => {
                                  e.preventDefault()
                                  setPage(p)
                                }}
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          )
                        })}

                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              setPage((p) => Math.min(pageCount, p + 1))
                            }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  ) : null}
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
        <DialogContent className="rounded-2xl p-0 w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-hidden">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="px-6 pb-4 pt-6">
              <DialogTitle>{selected?.kind === "event" ? "Event details" : "Announcement details"}</DialogTitle>
              <DialogDescription>
                {selected?.kind === "event"
                  ? "Full event information, including attachments."
                  : "Full announcement information."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {selected?.kind === "event" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="text-base font-semibold">
                      {String(selectedEventDetails?.title || selected?.title || "Event")}
                    </div>
                    {String(selectedEventDetails?.status || selected?.status || "") === "Cancelled" ? (
                      <div className="mt-2">
                        <Badge className="rounded-xl bg-red-600 text-white hover:bg-red-600">Cancelled</Badge>
                        {String(selectedEventDetails?.cancelReason || selected?.cancelReason || "") ? (
                          <div className="mt-2 text-sm text-red-700">
                            Reason: {String(selectedEventDetails?.cancelReason || selected?.cancelReason || "")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-1 text-sm text-muted-foreground">
                      {String(selectedEventDetails?.dateKey || selected?.dateKey || "")
                        ? `${safeFormatDateKey(selectedEventDetails?.dateKey || selected?.dateKey)}`
                        : ""}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatTimeRangeAmPm(
                        String(selectedEventDetails?.startTime || selected?.startTime || ""),
                        String(selectedEventDetails?.endTime || selected?.endTime || "")
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="text-sm font-semibold">More info</div>
                    <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {isDetailsLoading
                        ? "Loading…"
                        : String(selectedEventDetails?.description || "") || "No additional description."}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="text-sm font-semibold">Attachment</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedEventDetails?.attachment?.url ? (
                        <a
                          href={`${getApiBaseUrl()}${String(selectedEventDetails.attachment.url)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-emerald-700 underline underline-offset-4"
                        >
                          {String(selectedEventDetails.attachment.originalName || "Download file")}
                        </a>
                      ) : (
                        "No attachment"
                      )}
                    </div>
                  </div>
                </div>
              ) : selected?.kind === "announcement" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="text-base font-semibold">
                      {String(selectedAnnouncementDetails?.title || selected?.title || "Announcement")}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-xl border-sky-200 bg-sky-50 text-sky-700">
                        Announcement
                      </Badge>
                      {String(selectedAnnouncementDetails?.priority || "") ? (
                        <Badge variant="secondary" className="rounded-xl">
                          {String(selectedAnnouncementDetails?.priority || "Normal")}
                        </Badge>
                      ) : null}
                      {String(selectedAnnouncementDetails?.audience || "") ? (
                        <Badge variant="outline" className="rounded-xl">
                          {String(selectedAnnouncementDetails?.audience || "All")}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-2 text-sm text-muted-foreground">
                      {selectedAnnouncementDetails?.createdAt
                        ? format(new Date(String(selectedAnnouncementDetails.createdAt)), "MMM d, yyyy • h:mm a")
                        : ""}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="text-sm font-semibold">Message</div>
                    <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {isDetailsLoading
                        ? "Loading…"
                        : String(selectedAnnouncementDetails?.message || selected?.subtitle || "") ||
                          "(no message)"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
                    <div className="text-sm font-semibold">Attachments</div>
                    <div className="mt-2">
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
                                className="group block overflow-hidden rounded-xl border border-black/5 bg-white/70 hover:bg-white"
                              >
                                <div className="aspect-video w-full bg-neutral-50">
                                  {isImage && abs ? (
                                    <img
                                      src={abs}
                                      alt={name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-muted-foreground">
                                      <Paperclip className="size-4" />
                                    </div>
                                  )}
                                </div>
                                <div className="px-2 py-2 text-xs">
                                  <div className="truncate font-medium">{name}</div>
                                </div>
                              </a>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No attachments</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-8 text-center">
                  <div className="text-sm font-semibold">Announcements not connected yet</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Once you add an announcements backend, this modal will show the full details.
                  </div>
                </div>
              )}
            </div>

            <div className="border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => setDetailsOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl p-0 w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-hidden">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="px-6 pb-4 pt-6">
              <DialogTitle>Create announcement</DialogTitle>
              <DialogDescription>Share updates with users. Attach images/files if needed.</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">Title</div>
                  <Input
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. Feeding program update"
                    className="rounded-xl"
                  />
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">Message</div>
                  <Textarea
                    value={createMessage}
                    onChange={(e) => setCreateMessage(e.target.value)}
                    placeholder="Write the announcement details…"
                    className="min-h-[140px] rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <div className="text-sm font-medium">Priority</div>
                    <Select
                      value={createPriority}
                      onValueChange={(v) => setCreatePriority(v as AnnouncementPriority)}
                    >
                      <SelectTrigger className="rounded-xl">
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
                    <div className="text-sm font-medium">Audience</div>
                    <Select
                      value={createAudience}
                      onValueChange={(v) => setCreateAudience(v as AnnouncementAudience)}
                    >
                      <SelectTrigger className="rounded-xl">
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
                  <div className="text-sm font-medium">Attachments (up to 6)</div>
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

                  <div className="flex flex-col gap-2 rounded-xl border border-dashed border-black/15 bg-white/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ImageIcon className="size-4 text-muted-foreground" />
                        <span className="truncate">Add images / files</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Up to 6 files • 10MB each
                        {createFiles.length ? ` • ${createFiles.length} selected` : ""}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => createFilesInputRef.current?.click()}
                    >
                      Select files
                    </Button>
                  </div>

                  {createFiles.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {createFiles.map((f, idx) => {
                        const isImage = f.type.startsWith("image/")
                        const src = isImage ? URL.createObjectURL(f) : ""
                        return (
                          <div
                            key={`${f.name}-${idx}`}
                            className="overflow-hidden rounded-xl border border-black/5 bg-white/70"
                          >
                            <div className="aspect-video bg-neutral-50">
                              {isImage && src ? (
                                <img src={src} alt={f.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-muted-foreground">
                                  <Paperclip className="size-4" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 px-2 py-2">
                              <div className="min-w-0 truncate text-xs font-medium">{f.name}</div>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] hover:bg-neutral-50"
                                onClick={() => {
                                  setCreateFiles((prev) => prev.filter((_, i) => i !== idx))
                                }}
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

            <div className="border-t bg-background px-6 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  disabled={isCreating}
                  onClick={createAnnouncement}
                >
                  {isCreating ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
