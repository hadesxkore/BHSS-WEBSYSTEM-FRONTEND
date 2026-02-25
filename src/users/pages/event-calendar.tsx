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
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Schedule</p>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-600 text-white flex-shrink-0">
              <CalendarDays className="size-4" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Event Calendar</h2>
          </div>
          <p className="mt-0.5 text-sm text-gray-400">View scheduled events for the month.</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl h-9 px-4 text-xs font-semibold border-gray-200 text-gray-500 hover:border-gray-300"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg h-7 w-7 hover:bg-gray-100 text-gray-500"
              onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="min-w-[130px] text-center text-sm font-bold text-gray-800 tracking-tight px-1">
              {format(month, "MMMM yyyy")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg h-7 w-7 hover:bg-gray-100 text-gray-500"
              onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {(error || isLoading) && (
        <div className="text-sm text-gray-400 px-1">
          {isLoading ? "Loading events…" : error}
        </div>
      )}

      {/* ── Calendar Grid ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekdays.map((d) => (
            <div key={d} className="py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-7 divide-x divide-y divide-gray-50">
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
                        className={`group relative min-h-[72px] sm:min-h-[110px] text-left transition-colors p-1.5 sm:p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300 cursor-default ${
                          hasEvents ? "cursor-pointer" : ""
                        } ${inMonth ? "bg-white hover:bg-gray-50/80" : "bg-gray-50/40 hover:bg-gray-50/70"}`}
                      >
                        {/* Day number */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`inline-flex items-center justify-center text-xs font-bold rounded-full w-6 h-6 sm:w-7 sm:h-7 transition-colors ${
                              isToday
                                ? "bg-emerald-600 text-white"
                                : inMonth
                                  ? "text-gray-700 group-hover:bg-gray-100"
                                  : "text-gray-300"
                            }`}
                          >
                            {format(d, "d")}
                          </span>
                        </div>

                        {/* Events */}
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 2).map((e) => {
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
                                className={`block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] sm:text-[11px] font-semibold transition-opacity hover:opacity-80 ${
                                  cancelled
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                                title={`${e.startTime}–${e.endTime} ${e.title}`}
                              >
                                <span className="hidden sm:inline">{e.startTime} </span>
                                {e.title}
                              </button>
                            )
                          })}
                          {dayEvents.length > 2 ? (
                            <div className="text-[9px] sm:text-[10px] font-semibold text-gray-400 px-1">
                              +{dayEvents.length - 2} more
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </PopoverTrigger>

                    {hasEvents ? (
                      <PopoverContent align="start" className="w-64 rounded-2xl border border-gray-100 shadow-lg p-3">
                        <div className="text-sm font-bold text-gray-900">{format(d, "MMMM d, yyyy")}</div>
                        <div className="mt-0.5 text-xs text-gray-400 mb-3">
                          {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}
                        </div>
                        <Button
                          className="w-full rounded-xl h-8 text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                          onClick={() => openViewEvents(key)}
                        >
                          View events
                        </Button>
                      </PopoverContent>
                    ) : null}
                  </Popover>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── View Events Dialog ── */}
      <Dialog
        open={viewOpen}
        onOpenChange={(v) => {
          setViewOpen(v)
          if (!v) setViewDateKey(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-gray-100 shadow-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-gray-50">
            <DialogTitle className="text-base font-bold text-gray-900">Events</DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              {viewDateKey ? format(new Date(`${viewDateKey}T00:00:00`), "EEEE, MMMM d, yyyy") : ""}
            </p>
          </DialogHeader>

          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
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
                  className={`w-full rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                    cancelled
                      ? "border-rose-100 bg-rose-50 hover:border-rose-200"
                      : "border-gray-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 truncate">{e.title}</span>
                        {cancelled ? (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 flex-shrink-0">
                            Cancelled
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {e.startTime}–{e.endTime}
                      </div>
                    </div>
                    {e.attachment?.url ? (
                      <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                        <Paperclip className="size-3" />
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })}

            {viewDateKey && (byDate.get(viewDateKey) || []).length === 0 ? (
              <div className="py-8 text-sm text-gray-400 text-center">No events for this day.</div>
            ) : null}
          </div>

          <div className="px-4 pb-4 flex justify-end">
            <Button
              variant="outline"
              className="rounded-xl h-9 px-4 text-sm border-gray-200 text-gray-500 hover:border-gray-300"
              onClick={() => setViewOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Event Details Dialog ── */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(v) => {
          setDetailsOpen(v)
          if (!v) setSelectedEvent(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-gray-100 shadow-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-gray-50">
            <DialogTitle className="text-base font-bold text-gray-900">Event details</DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedEvent?.dateKey
                ? format(new Date(`${selectedEvent.dateKey}T00:00:00`), "EEEE, MMMM d, yyyy")
                : ""}
            </p>
          </DialogHeader>

          <div className="p-4 space-y-3">
            {/* Cancelled banner */}
            {selectedEvent && String(selectedEvent.status || "Scheduled") === "Cancelled" ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <div className="text-sm font-bold text-rose-700">Cancelled</div>
                <div className="mt-0.5 text-xs text-rose-500">
                  Reason: {selectedEvent.cancelReason || "(no reason provided)"}
                </div>
              </div>
            ) : null}

            {/* Event card */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-bold text-gray-900">{selectedEvent?.title || ""}</span>
                </div>
                <span className="text-xs font-semibold text-gray-400 whitespace-nowrap flex-shrink-0">
                  {selectedEvent?.startTime || ""}–{selectedEvent?.endTime || ""}
                </span>
              </div>

              {selectedEvent?.description ? (
                <p className="text-sm text-gray-600 whitespace-pre-wrap break-words leading-relaxed">
                  {selectedEvent.description}
                </p>
              ) : (
                <p className="text-sm text-gray-400">No description provided.</p>
              )}

              {selectedEvent?.attachment?.url ? (
                <a
                  href={resolveAssetUrl(selectedEvent.attachment.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors"
                >
                  <Paperclip className="size-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[240px]">{selectedEvent.attachment.originalName}</span>
                </a>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                className="rounded-xl h-9 px-4 text-sm border-gray-200 text-gray-500 hover:border-gray-300"
                onClick={() => setDetailsOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}