import { useCallback, useEffect, useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, Paperclip } from "lucide-react"
import { io, type Socket } from "socket.io-client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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

type EventAttachment = {
  url: string
  originalName: string
  filename: string
  mimeType: string
  size: number
}

type CalendarEvent = {
  _id?: string
  id?: string
  title: string
  description?: string
  dateKey: string
  startTime: string
  endTime: string
  status?: "Scheduled" | "Cancelled"
  cancelReason?: string
  cancelledAt?: string
  attachment?: EventAttachment
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
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || "Request failed")
  return data
}

function asKey(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function resolveAssetUrl(url?: string) {
  const u = String(url || "").trim()
  if (!u) return ""
  if (u.startsWith("http://") || u.startsWith("https://")) return u
  const base = getApiBaseUrl()
  return `${base}${u.startsWith("/") ? "" : "/"}${u}`
}

export function UserEventCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pendingOpenEventId, setPendingOpenEventId] = useState<string | null>(null)

  const [openDayKey, setOpenDayKey] = useState<string | null>(null)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewDateKey, setViewDateKey] = useState<string | null>(null)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
    const days: Date[] = []
    let cur = start
    while (cur <= end) {
      days.push(cur)
      cur = addDays(cur, 1)
    }
    return days
  }, [month])

  const range = useMemo(() => {
    const from = asKey(startOfWeek(startOfMonth(month), { weekStartsOn: 0 }))
    const to = asKey(endOfWeek(endOfMonth(month), { weekStartsOn: 0 }))
    return { from, to }
  }, [month])

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const k = String(e.dateKey || "")
      if (!k) continue
      const arr = m.get(k) || []
      arr.push(e)
      m.set(k, arr)
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
      m.set(k, arr)
    }
    return m
  }, [events])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = (await apiFetch(`/api/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)) as any
      const list = Array.isArray(data?.events) ? (data.events as CalendarEvent[]) : []
      setEvents(list)
    } catch (e: any) {
      setError(e?.message || "Failed to load events")
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bhss_notif_intent")
      if (!raw) return
      const parsed = JSON.parse(raw) as any
      if (String(parsed?.kind || "") !== "event") return

      const sourceId = String(parsed?.sourceId || "").trim()
      const dateKey = String(parsed?.dateKey || "").trim()
      if (!sourceId) return

      localStorage.removeItem("bhss_notif_intent")
      setPendingOpenEventId(sourceId)

      if (dateKey) {
        try {
          const d = new Date(`${dateKey}T00:00:00`)
          if (!Number.isNaN(d.getTime())) setMonth(startOfMonth(d))
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!pendingOpenEventId) return
    if (isLoading) return

    const id = pendingOpenEventId
    const found = events.find((e) => String(e._id || e.id || "").trim() === id)
    const stub: CalendarEvent =
      found ||
      ({
        id,
        title: "Event",
        dateKey: asKey(new Date()),
        startTime: "",
        endTime: "",
      } as CalendarEvent)

    openDetails(stub).finally(() => {
      setPendingOpenEventId(null)
    })
  }, [events, isLoading, pendingOpenEventId])

  useEffect(() => {
    const socket: Socket = io(getApiBaseUrl(), { transports: ["websocket"] })

    const refresh = () => {
      load().catch(() => {
        // ignore
      })
    }

    socket.on("event:created", refresh)
    socket.on("event:cancelled", refresh)

    return () => {
      try {
        socket.disconnect()
      } catch {
        // ignore
      }
    }
  }, [load])

  function openViewEvents(dateKey: string) {
    setOpenDayKey(null)
    setViewDateKey(dateKey)
    setViewOpen(true)
  }

  async function openDetails(e: CalendarEvent) {
    setOpenDayKey(null)

    const eventId = String(e._id || e.id || "").trim()
    if (!eventId) {
      setSelectedEvent(e)
      setDetailsOpen(true)
      return
    }

    try {
      const data = (await apiFetch(`/api/events/${encodeURIComponent(eventId)}`)) as any
      const ev = (data?.event || null) as CalendarEvent | null
      setSelectedEvent(ev || e)
    } catch {
      setSelectedEvent(e)
    } finally {
      setDetailsOpen(true)
    }
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <CalendarDays className="size-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Event Calendar</h2>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">View scheduled events for the month.</div>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button variant="outline" className="rounded-2xl" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>

          <div className="flex flex-1 items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-2xl"
              onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[180px] text-center text-sm font-semibold tracking-tight">
              {format(month, "MMMM yyyy").toUpperCase()}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="rounded-2xl"
              onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {(error || isLoading) && (
        <div className="text-sm text-muted-foreground">{isLoading ? "Loading events…" : error}</div>
      )}

      <Card className="overflow-hidden rounded-3xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
        <CardHeader className="pb-3">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-xs font-medium text-neutral-500">
            {weekdays.map((d) => (
              <div key={d} className="px-1 sm:px-2">
                {d}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {gridDays.map((d) => {
                  const key = asKey(d)
                  const inMonth = isSameMonth(d, month)
                  const dayEvents = byDate.get(key) || []
                  const isToday = isSameDay(d, new Date())

                  const hasEvents = dayEvents.length > 0
                  const popOpen = openDayKey === key

                  return (
                    <Popover key={key} open={popOpen} onOpenChange={(v) => setOpenDayKey(v ? key : null)}>
                      <PopoverTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (hasEvents) setOpenDayKey((prev) => (prev === key ? null : key))
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return
                            e.preventDefault()
                            if (hasEvents) setOpenDayKey((prev) => (prev === key ? null : key))
                          }}
                          className={`group relative min-h-[92px] sm:min-h-[120px] rounded-2xl border text-left transition-colors p-1.5 sm:p-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                            inMonth
                              ? "border-black/5 bg-white/55 hover:bg-white/75"
                              : "border-black/5 bg-white/35 hover:bg-white/55"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className={`text-xs font-semibold ${
                                inMonth ? "text-neutral-800" : "text-neutral-400"
                              }`}
                            >
                              {format(d, "d")}
                            </div>
                            {isToday ? <div className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                          </div>

                          <div className="mt-2 space-y-1">
                            {dayEvents.slice(0, 3).map((e) => {
                              const cancelled = String(e.status || "Scheduled") === "Cancelled"
                              return (
                                <button
                                  key={String(e._id || e.id || e.title + e.startTime)}
                                  type="button"
                                  onClick={(ev) => {
                                    ev.preventDefault()
                                    ev.stopPropagation()
                                    openDetails(e)
                                  }}
                                  className={`block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-xl px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-medium text-white ${
                                    cancelled ? "bg-red-600/90" : "bg-emerald-600/90"
                                  }`}
                                  title={`${e.startTime}–${e.endTime} ${e.title}`}
                                >
                                  {e.startTime} {e.title}
                                </button>
                              )
                            })}
                            {dayEvents.length > 3 ? (
                              <div className="text-[10px] sm:text-[11px] text-neutral-500">
                                +{dayEvents.length - 3} more
                              </div>
                            ) : null}
                          </div>

                          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent group-hover:ring-emerald-600/15" />
                        </div>
                      </PopoverTrigger>

                      {hasEvents ? (
                        <PopoverContent align="start" className="w-72 rounded-2xl">
                          <div className="text-sm font-semibold">{format(d, "MMMM d, yyyy")}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}
                          </div>
                          <div className="mt-3 grid gap-2">
                            <Button variant="outline" className="rounded-2xl" onClick={() => openViewEvents(key)}>
                              View events
                            </Button>
                          </div>
                        </PopoverContent>
                      ) : null}
                    </Popover>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={viewOpen}
        onOpenChange={(v) => {
          setViewOpen(v)
          if (!v) setViewDateKey(null)
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Events</DialogTitle>
          </DialogHeader>

          <div className="text-sm text-muted-foreground">
            {viewDateKey ? format(new Date(`${viewDateKey}T00:00:00`), "EEEE, MMMM d, yyyy") : ""}
          </div>

          <div className="mt-3 grid gap-2">
            {(viewDateKey ? byDate.get(viewDateKey) || [] : []).map((e) => {
              const cancelled = String(e.status || "Scheduled") === "Cancelled"
              return (
                <button
                  key={String(e._id || e.id || e.title + e.startTime)}
                  type="button"
                  onClick={() => {
                    setViewOpen(false)
                    openDetails(e)
                  }}
                  className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                    cancelled
                      ? "border-red-200/70 bg-red-50/70 hover:bg-red-50"
                      : "border-black/5 bg-white/60 hover:bg-white/75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {e.title}
                        {cancelled ? (
                          <span className="ml-2 rounded-lg bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            Cancelled
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {e.startTime}–{e.endTime}
                      </div>
                    </div>
                    {e.attachment?.url ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="size-3.5" />
                        <span className="max-w-[140px] truncate">{e.attachment.originalName}</span>
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })}

            {viewDateKey && (byDate.get(viewDateKey) || []).length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">No events.</div>
            ) : null}
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onOpenChange={(v) => {
          setDetailsOpen(v)
          if (!v) setSelectedEvent(null)
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Event details</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              {selectedEvent?.dateKey
                ? format(new Date(`${selectedEvent.dateKey}T00:00:00`), "EEEE, MMMM d, yyyy")
                : ""}
            </div>

            {selectedEvent && String(selectedEvent.status || "Scheduled") === "Cancelled" ? (
              <div className="rounded-2xl border border-red-200/70 bg-red-50/70 px-3 py-2 text-sm text-red-700">
                <div className="font-semibold">Cancelled</div>
                <div className="mt-1 text-xs text-red-700/80">
                  Reason: {selectedEvent.cancelReason || "(no reason)"}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold text-slate-900">{selectedEvent?.title || ""}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedEvent?.startTime || ""}–{selectedEvent?.endTime || ""}
              </div>

              {selectedEvent?.description ? (
                <div className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {selectedEvent.description}
                </div>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">No description.</div>
              )}

              {selectedEvent?.attachment?.url ? (
                <a
                  href={resolveAssetUrl(selectedEvent.attachment.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <Paperclip className="size-4" />
                  <span className="truncate max-w-[320px]">{selectedEvent.attachment.originalName}</span>
                </a>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => setDetailsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
