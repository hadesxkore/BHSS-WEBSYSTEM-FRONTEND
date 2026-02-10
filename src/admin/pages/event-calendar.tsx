import { useEffect, useMemo, useState } from "react"
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, addMonths } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, Paperclip } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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

function timeOptions() {
  const out: { value: string; label: string }[] = []
  for (let mins = 6 * 60; mins <= 22 * 60; mins += 30) {
    const hh = String(Math.floor(mins / 60)).padStart(2, "0")
    const mm = String(mins % 60).padStart(2, "0")
    const value = `${hh}:${mm}`
    const d = new Date(2000, 0, 1, Number(hh), Number(mm), 0)
    out.push({ value, label: format(d, "h:mm a") })
  }
  return out
}

function asKey(d: Date) {
  return format(d, "yyyy-MM-dd")
}

export function AdminEventCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [openDayKey, setOpenDayKey] = useState<string | null>(null)

  const [viewOpen, setViewOpen] = useState(false)
  const [viewDateKey, setViewDateKey] = useState<string | null>(null)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editStartTime, setEditStartTime] = useState("06:00")
  const [editEndTime, setEditEndTime] = useState("06:30")
  const [editFile, setEditFile] = useState<File | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)

  const [open, setOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startTime, setStartTime] = useState("06:00")
  const [endTime, setEndTime] = useState("06:30")
  const [file, setFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const options = useMemo(() => timeOptions(), [])

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

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      const data = (await apiFetch(
        `/api/admin/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      )) as any
      const list = Array.isArray(data?.events) ? (data.events as CalendarEvent[]) : []
      setEvents(list)
    } catch (e: any) {
      setError(e?.message || "Failed to load events")
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [range.from, range.to])

  useEffect(() => {
    if (!selectedEvent) return
    setIsEditing(false)
    setEditTitle(String(selectedEvent.title || ""))
    setEditDescription(String(selectedEvent.description || ""))
    setEditStartTime(String(selectedEvent.startTime || "06:00"))
    setEditEndTime(String(selectedEvent.endTime || "06:30"))
    setEditFile(null)
  }, [selectedEvent?._id, selectedEvent?.id])

  function openCreate(d: Date) {
    setOpenDayKey(null)
    setSelectedDate(d)
    setTitle("")
    setDescription("")
    setStartTime("06:00")
    setEndTime("06:30")
    setFile(null)
    setOpen(true)
  }

  function openViewEvents(dateKey: string) {
    setOpenDayKey(null)
    setViewDateKey(dateKey)
    setViewOpen(true)
  }

  function openDetails(e: CalendarEvent) {
    setOpenDayKey(null)
    setSelectedEvent(e)
    setDetailsOpen(true)
  }

  async function createEvent() {
    if (!selectedDate) return
    const dateKey = asKey(selectedDate)

    setIsSaving(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("title", title)
      fd.append("description", description)
      fd.append("dateKey", dateKey)
      fd.append("startTime", startTime)
      fd.append("endTime", endTime)
      if (file) fd.append("attachment", file)

      await apiFetch("/api/admin/events", {
        method: "POST",
        body: fd,
      })

      toast.success("Event created")
      setOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.message || "Failed to create event")
      toast.error(e?.message || "Failed to create event")
    } finally {
      setIsSaving(false)
    }
  }

  async function updateEvent() {
    if (!selectedEvent) return
    const eventId = String(selectedEvent._id || selectedEvent.id || "")
    if (!eventId) return

    setIsUpdating(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("title", editTitle)
      fd.append("description", editDescription)
      fd.append("dateKey", String(selectedEvent.dateKey || ""))
      fd.append("startTime", editStartTime)
      fd.append("endTime", editEndTime)
      if (editFile) fd.append("attachment", editFile)

      await apiFetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: "PUT",
        body: fd,
      })

      toast.success("Event updated")
      setDetailsOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.message || "Failed to update event")
      toast.error(e?.message || "Failed to update event")
    } finally {
      setIsUpdating(false)
    }
  }

  async function cancelEvent() {
    if (!selectedEvent) return
    const eventId = String(selectedEvent._id || selectedEvent.id || "")
    if (!eventId) return

    const reason = cancelReason.trim()
    if (!reason) return

    setIsCancelling(true)
    setError(null)
    try {
      await apiFetch(`/api/admin/events/${encodeURIComponent(eventId)}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      })

      toast.success("Event cancelled")
      setCancelOpen(false)
      setDetailsOpen(false)
      setCancelReason("")
      await load()
    } catch (e: any) {
      setError(e?.message || "Failed to cancel event")
      toast.error(e?.message || "Failed to cancel event")
    } finally {
      setIsCancelling(false)
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
          <div className="mt-1 text-sm text-muted-foreground">
            Click any date to schedule an event.
          </div>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
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
        <div className="text-sm text-muted-foreground">
          {isLoading ? "Loading events…" : error}
        </div>
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
                            if (hasEvents) {
                              setOpenDayKey((prev) => (prev === key ? null : key))
                            } else {
                              openCreate(d)
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return
                            e.preventDefault()
                            if (hasEvents) {
                              setOpenDayKey((prev) => (prev === key ? null : key))
                            } else {
                              openCreate(d)
                            }
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
                            <Button
                              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => openCreate(d)}
                            >
                              Create new event
                            </Button>
                            <Button
                              variant="outline"
                              className="rounded-2xl"
                              onClick={() => openViewEvents(key)}
                            >
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Schedule Event</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : ""}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="eventTitle">Event title</Label>
              <Input
                id="eventTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Feeding Program Meeting"
                className="rounded-2xl"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="eventDesc">More info</Label>
              <Textarea
                id="eventDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes, location, participants…"
                className="min-h-[100px] rounded-2xl"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Start time</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.value >= "06:00" && o.value <= "21:30")
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>End time</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.value >= "06:30" && o.value <= "22:00")
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="eventFile">Attachment (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="eventFile"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="rounded-2xl"
                />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5" />
                  <span className="truncate max-w-[150px]">{file ? file.name : "No file"}</span>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="rounded-2xl bg-emerald-600 hover:bg-emerald-700"
                disabled={!title.trim() || isSaving}
                onClick={createEvent}
              >
                {isSaving ? "Saving…" : "Create event"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewOpen}
        onOpenChange={(v) => {
          setViewOpen(v)
          if (!v) setViewDateKey(null)
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl max-h-[85vh] overflow-y-auto">
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
            <Button
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (!viewDateKey) return
                const d = new Date(`${viewDateKey}T00:00:00`)
                setViewOpen(false)
                openCreate(d)
              }}
            >
              Create new
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onOpenChange={(v) => {
          setDetailsOpen(v)
          if (!v) {
            setSelectedEvent(null)
            setIsEditing(false)
          }
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl max-h-[85vh] overflow-y-auto">
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

            <div className="grid gap-2">
              <Label>Title</Label>
              <Input
                value={isEditing ? editTitle : String(selectedEvent?.title || "")}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={!isEditing}
                className="rounded-2xl"
              />
            </div>

            <div className="grid gap-2">
              <Label>More info</Label>
              <Textarea
                value={isEditing ? editDescription : String(selectedEvent?.description || "")}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={!isEditing}
                className="min-h-[120px] rounded-2xl"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Start time</Label>
                <Select
                  value={isEditing ? editStartTime : String(selectedEvent?.startTime || "")}
                  onValueChange={setEditStartTime}
                  disabled={!isEditing}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.value >= "06:00" && o.value <= "21:30")
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>End time</Label>
                <Select
                  value={isEditing ? editEndTime : String(selectedEvent?.endTime || "")}
                  onValueChange={setEditEndTime}
                  disabled={!isEditing}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.value >= "06:30" && o.value <= "22:00")
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Attachment</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  {selectedEvent?.attachment?.url ? (
                    <a
                      href={`${getApiBaseUrl()}${selectedEvent.attachment.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white/60 px-3 py-2 text-sm hover:bg-white/80"
                    >
                      <Paperclip className="size-4" />
                      <span className="max-w-[260px] truncate">{selectedEvent.attachment.originalName}</span>
                    </a>
                  ) : (
                    <div className="text-sm text-muted-foreground">No attachment</div>
                  )}
                </div>
                {isEditing ? (
                  <Input
                    type="file"
                    onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                    className="rounded-2xl"
                  />
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => setDetailsOpen(false)}>
                Close
              </Button>

              {selectedEvent && String(selectedEvent.status || "Scheduled") !== "Cancelled" ? (
                <>
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          setIsEditing(false)
                          setEditTitle(String(selectedEvent.title || ""))
                          setEditDescription(String(selectedEvent.description || ""))
                          setEditStartTime(String(selectedEvent.startTime || "06:00"))
                          setEditEndTime(String(selectedEvent.endTime || "06:30"))
                          setEditFile(null)
                        }}
                      >
                        Discard
                      </Button>
                      <Button
                        className="rounded-2xl bg-emerald-600 hover:bg-emerald-700"
                        disabled={!editTitle.trim() || isUpdating}
                        onClick={updateEvent}
                      >
                        {isUpdating ? "Saving…" : "Save changes"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="rounded-2xl bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setCancelReason("")
                      setCancelOpen(true)
                    }}
                  >
                    Cancel event
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide the reason for cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="cancelReason">Reason</Label>
            <Textarea
              id="cancelReason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Type the reason…"
              className="min-h-[90px] rounded-2xl"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Back</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-red-600 hover:bg-red-700"
              disabled={!cancelReason.trim() || isCancelling}
              onClick={(e) => {
                e.preventDefault()
                cancelEvent()
              }}
            >
              {isCancelling ? "Cancelling…" : "Confirm cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
