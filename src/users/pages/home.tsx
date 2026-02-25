import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { format, parseISO } from "date-fns"
import {
  Activity,
  Calendar,
  ClipboardCheck,
  Megaphone,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardAnnouncements } from "@/admin/components/dashboard-announcements"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
  }
}

type AttendanceRecordDto = {
  _id?: string
  id?: string
  dateKey?: string
  grade?: string
  present?: number
  absent?: number
  notes?: string
  createdAt?: string
  updatedAt?: string
}

type DeliveryRecordDto = {
  _id?: string
  id?: string
  dateKey?: string
  categoryKey?: string
  categoryLabel?: string
  status?: "Pending" | "Delivered" | "Delayed" | "Cancelled"
  uploadedAt?: string
  updatedAt?: string
}

type AnnouncementDto = {
  _id?: string
  id?: string
}

type DashboardKpi = {
  title: string
  value: string
  delta: string
  icon: any
  accent: string
}

type ActivityItem = {
  id: string
  title: string
  subtitle: string
  time: string
  variant: "success" | "warning" | "info"
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
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || "Request failed")
  return data
}

function safeKey(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function safeParseDateKey(dateKey: string) {
  try {
    return parseISO(`${dateKey}T00:00:00.000Z`)
  } catch {
    return new Date(0)
  }
}

function timeAgoLabel(iso?: string, fallbackKey?: string) {
  const raw = String(iso || "").trim()
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) {
      const diffMs = Date.now() - d.getTime()
      const mins = Math.floor(diffMs / 60000)
      if (mins < 1) return "just now"
      if (mins < 60) return `${mins}m ago`
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return `${hrs}h ago`
      const days = Math.floor(hrs / 24)
      return `${days}d ago`
    }
  }
  const key = String(fallbackKey || "")
  return key ? format(safeParseDateKey(key), "MMM d") : ""
}

export function UserHome() {
  const auth = useMemo(() => getAuth(), [])
  const school = String(auth?.user?.school || "")
  const municipality = String(auth?.user?.municipality || "")

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const selectedDateKey = useMemo(() => safeKey(selectedDate || new Date()), [selectedDate])

  const [isLoading, setIsLoading] = useState(true)
  const [attendance, setAttendance] = useState<AttendanceRecordDto[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecordDto[]>([])
  const [announcementsCount, setAnnouncementsCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const [attRes, delRes, annRes] = await Promise.all([
          apiFetch(
            `/api/attendance/history?from=${encodeURIComponent(selectedDateKey)}&to=${encodeURIComponent(selectedDateKey)}&sort=newest`
          ),
          apiFetch(`/api/delivery/history?dateKey=${encodeURIComponent(selectedDateKey)}&sort=newest`),
          apiFetch(`/api/announcements`),
        ])

        if (cancelled) return

        const att = Array.isArray((attRes as any)?.records) ? ((attRes as any).records as any[]) : []
        const del = Array.isArray((delRes as any)?.records) ? ((delRes as any).records as any[]) : []
        const ann = Array.isArray((annRes as any)?.announcements)
          ? (((annRes as any).announcements as any[]) as AnnouncementDto[])
          : []

        setAttendance(att)
        setDeliveries(del)
        setAnnouncementsCount(ann.length)
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || "Failed to load dashboard")
          setAttendance([])
          setDeliveries([])
          setAnnouncementsCount(0)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedDateKey])

  const totals = useMemo(() => {
    const present = attendance.reduce((acc, r) => acc + Number((r as any)?.present || 0), 0)
    const absent = attendance.reduce((acc, r) => acc + Number((r as any)?.absent || 0), 0)
    return {
      present,
      absent,
      attendanceRecords: attendance.length,
      deliveries: deliveries.length,
    }
  }, [attendance, deliveries])

  const kpis = useMemo<DashboardKpi[]>(() => {
    return [
      {
        title: "Attendance",
        value: String(totals.attendanceRecords),
        delta: "",
        icon: ClipboardCheck,
        accent: "from-sky-500/15 via-sky-500/5 to-transparent",
      },
      {
        title: "Deliveries",
        value: String(totals.deliveries),
        delta: "",
        icon: Truck,
        accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      },
      {
        title: "Announcements",
        value: String(announcementsCount),
        delta: "",
        icon: Megaphone,
        accent: "from-sky-500/15 via-sky-500/5 to-transparent",
      },
    ]
  }, [totals, announcementsCount])

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = []

    for (const r of deliveries.slice(0, 30)) {
      const dateKey = String((r as any)?.dateKey || "")
      const categoryLabel = String((r as any)?.categoryLabel || "Delivery")
      const status = String((r as any)?.status || "Pending")
      const t = timeAgoLabel((r as any)?.updatedAt || (r as any)?.uploadedAt, dateKey)

      items.push({
        id: `d-${String((r as any)?._id || (r as any)?.id || "")}-${dateKey}-${categoryLabel}`,
        title: "Delivery updated",
        subtitle: `${categoryLabel} • ${status} • ${dateKey}`,
        time: t,
        variant: status === "Delivered" ? "success" : status === "Pending" ? "info" : "warning",
      })
    }

    for (const r of attendance.slice(0, 30)) {
      const dateKey = String((r as any)?.dateKey || "")
      const grade = String((r as any)?.grade || "")
      const p = Number((r as any)?.present || 0)
      const a = Number((r as any)?.absent || 0)
      const t = timeAgoLabel((r as any)?.updatedAt, dateKey)

      items.push({
        id: `a-${String((r as any)?._id || (r as any)?.id || "")}-${dateKey}-${grade}`,
        title: "Attendance saved",
        subtitle: `${grade || "(grade)"} • P:${p} A:${a} • ${dateKey}`,
        time: t,
        variant: "info",
      })
    }

    items.sort((x, y) => String(y.time).localeCompare(String(x.time)))
    return items.slice(0, 6)
  }, [attendance, deliveries])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="min-w-0 overflow-x-hidden space-y-5 p-6 bg-gray-50/50 min-h-screen"
    >
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Dashboard</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-0.5 truncate max-w-[calc(100vw-3rem)] sm:max-w-none">
            {(school || "Your School") + (municipality ? ` · ${municipality}` : "")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="rounded-xl h-9 px-4 text-sm border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-600 gap-2"
              >
                <Calendar className="size-3.5" />
                {format(selectedDate || new Date(), "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-2xl border border-gray-100 shadow-lg overflow-hidden" align="end">
              <CalendarPicker
                mode="single"
                selected={selectedDate}
                onSelect={(d) => setSelectedDate(d || undefined)}
                numberOfMonths={1}
                className="p-3"
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl h-9 px-3">
            <Activity className="size-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-gray-500">Summary</span>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k, idx) => (
          <motion.div
            key={k.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.06 }}
          >
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{k.title}</p>
                <p className="text-3xl font-bold tracking-tight text-gray-900">
                  {isLoading ? <span className="text-gray-200 animate-pulse">—</span> : k.value}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">
                  {isLoading ? "Loading…" : "Updated from your records"}
                </p>
              </div>
              <div className={`rounded-2xl p-3 flex-shrink-0 ${
                idx === 0 ? "bg-sky-50 text-sky-500" :
                idx === 1 ? "bg-emerald-50 text-emerald-600" :
                "bg-amber-50 text-amber-500"
              }`}>
                <k.icon className="size-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Announcements ── */}
      <div>
        <DashboardAnnouncements />
      </div>

      {/* ── Attendance + Deliveries ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Attendance */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2.5">
            <div className="rounded-xl bg-sky-50 p-2 text-sky-500">
              <ClipboardCheck className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Attendance</p>
              <p className="text-xs text-gray-400">{selectedDateKey}</p>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-1.5">Present</p>
              <p className="text-2xl font-bold text-emerald-700 tracking-tight">
                {isLoading ? <span className="text-emerald-200 animate-pulse">—</span> : String(totals.present)}
              </p>
            </div>
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1.5">Absent</p>
              <p className="text-2xl font-bold text-rose-600 tracking-tight">
                {isLoading ? <span className="text-rose-200 animate-pulse">—</span> : String(totals.absent)}
              </p>
            </div>
          </div>
        </div>

        {/* Deliveries */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2.5">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <Truck className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Deliveries</p>
              <p className="text-xs text-gray-400">{selectedDateKey}</p>
            </div>
          </div>
          <div className="p-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-1.5">Records</p>
              <p className="text-2xl font-bold text-emerald-700 tracking-tight">
                {isLoading ? <span className="text-emerald-200 animate-pulse">—</span> : String(totals.deliveries)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2.5">
          <div className="rounded-xl bg-gray-100 p-2 text-gray-500">
            <Activity className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Recent Activity</p>
            <p className="text-xs text-gray-400">Latest updates from your attendance and delivery</p>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">Loading...</div>
          ) : recentActivity.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">No activity yet.</div>
          ) : (
            recentActivity.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Dot indicator */}
                  <div className={`mt-1.5 size-2 rounded-full flex-shrink-0 ${
                    a.variant === "success" ? "bg-emerald-400" :
                    a.variant === "warning" ? "bg-amber-400" :
                    "bg-sky-400"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{a.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                    a.variant === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : a.variant === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}>
                    {a.variant === "success" ? "Done" : a.variant === "warning" ? "Attention" : "Update"}
                  </span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{a.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  )
}