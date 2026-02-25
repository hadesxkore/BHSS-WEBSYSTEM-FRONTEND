import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import ReactApexChart from "react-apexcharts"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  BadgeCheck,
  Clock,
  Megaphone,
  PackageCheck,
  School,
  TrendingUp,
  TriangleAlert,
  Users,
  ChevronRight,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AnnouncementsFeedPage } from "@/components/announcements-feed-page"
import { DashboardAnnouncements } from "../components/dashboard-announcements"
import { useAdminNavStore } from "../admin-nav-store"

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

async function apiFetch(path: string) {
  const token = getAuthToken()
  if (!token) throw new Error("Not authenticated")

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || "Request failed")
  return data
}

type AdminAttendanceRecord = {
  _id: string
  dateKey: string
  grade?: string
  present?: number
  absent?: number
  school?: string
  municipality?: string
  createdAt?: string
  updatedAt?: string
}

type AdminDeliveryRecord = {
  id: string
  dateKey: string
  municipality: string
  school: string
  userName?: string
  hlaManagerName?: string
  username?: string
  categoryKey: string
  categoryLabel: string
  status: "Pending" | "Delivered" | "Delayed" | "Cancelled"
  statusReason?: string
  uploadedAt?: string
  images?: Array<{ url: string; filename: string }>
  concerns?: string[]
  remarks?: string
}

function useBreakpoint(maxWidth: number) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return

    const m = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = () => setMatches(!!m.matches)
    onChange()

    try {
      m.addEventListener("change", onChange)
      return () => m.removeEventListener("change", onChange)
    } catch {
      m.addListener(onChange)
      return () => m.removeListener(onChange)
    }
  }, [maxWidth])

  return matches
}

export function Dashboard() {
  const setActiveItem = useAdminNavStore((s) => s.setActiveItem)
  const isXs = useBreakpoint(420)
  const isSm = useBreakpoint(640)

  const [activeView, setActiveView] = useState<"dashboard" | "announcements">("dashboard")

  const MUNICIPALITY_COLORS = [
    "#16a34a",
    "#0d9488",
    "#0284c7",
    "#7c3aed",
    "#dc2626",
    "#d97706",
    "#64748b",
  ]

  const [attendance, setAttendance] = useState<AdminAttendanceRecord[]>([])
  const [deliveries, setDeliveries] = useState<AdminDeliveryRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedConcern, setSelectedConcern] = useState<AdminDeliveryRecord | null>(null)
  const [imagePreviewIndex, setImagePreviewIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const from = new Date(now)
    from.setDate(now.getDate() - 6)
    const fromKey = from.toISOString().slice(0, 10)
    const toKey = now.toISOString().slice(0, 10)

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const [att, del] = await Promise.all([
          apiFetch(`/api/admin/attendance/history?from=${fromKey}&to=${toKey}&sort=newest`),
          apiFetch(`/api/admin/delivery/history?from=${fromKey}&to=${toKey}&sort=newest`),
        ])
        if (cancelled) return
        setAttendance(((att as any)?.records || []) as AdminAttendanceRecord[])
        setDeliveries(((del as any)?.records || []) as AdminDeliveryRecord[])
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || "Failed to load data")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const distinctSchools = useMemo(() => {
    const s = new Set<string>()
    deliveries.forEach((d) => d.school && s.add(d.school))
    attendance.forEach((a) => a.school && s.add(a.school))
    return s.size
  }, [attendance, deliveries])

  const concernDeliveries = useMemo(() => {
    const rows = (deliveries || []).filter(
      (d) => Array.isArray((d as any).concerns) && ((d as any).concerns as any[]).length > 0
    )
    return rows.slice(0, 6)
  }, [deliveries])

  const beneficiaries7d = useMemo(() => {
    let total = 0
    attendance.forEach((a) => (total += Math.max(0, a.present || 0)))
    return total
  }, [attendance])

  const deliveries7d = useMemo(
    () => deliveries.filter((d) => d.status === "Delivered").length,
    [deliveries]
  )

  const completionRate = useMemo(() => {
    const total = deliveries.length
    if (!total) return 0
    const delivered = deliveries.filter((d) => d.status === "Delivered").length
    return Math.round((delivered / total) * 100)
  }, [deliveries])

  const kpis = useMemo(
    () => [
      {
        title: "Active Schools",
        value: String(distinctSchools),
        delta: "",
        icon: School,
        color: "text-indigo-600",
        bg: "bg-indigo-50",
        border: "border-indigo-100",
      },
      {
        title: "Beneficiaries (7d)",
        value: beneficiaries7d.toLocaleString(),
        delta: "",
        icon: Users,
        color: "text-green-600",
        bg: "bg-green-50",
        border: "border-green-100",
      },
      {
        title: "Deliveries (7d)",
        value: deliveries7d.toLocaleString(),
        delta: "",
        icon: PackageCheck,
        color: "text-teal-600",
        bg: "bg-teal-50",
        border: "border-teal-100",
      },
      {
        title: "Completion Rate",
        value: `${completionRate}%`,
        delta: "",
        icon: BadgeCheck,
        color: "text-violet-600",
        bg: "bg-violet-50",
        border: "border-violet-100",
      },
    ],
    [distinctSchools, beneficiaries7d, deliveries7d, completionRate]
  )

  const deliveriesTrend = useMemo(() => {
    const days: string[] = []
    const labels: string[] = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push(key)
      labels.push(d.toLocaleDateString(undefined, { weekday: "short" }))
    }
    const deliveredPerDay: Record<string, number> = {}
    const pendingPerDay: Record<string, number> = {}
    days.forEach((k) => {
      deliveredPerDay[k] = 0
      pendingPerDay[k] = 0
    })
    deliveries.forEach((r) => {
      if (!(r.dateKey in deliveredPerDay)) return
      if (r.status === "Delivered") deliveredPerDay[r.dateKey]++
      if (r.status === "Pending") pendingPerDay[r.dateKey]++
    })
    return days.map((k, idx) => ({ label: labels[idx], delivered: deliveredPerDay[k], pending: pendingPerDay[k] }))
  }, [deliveries])

  const municipalityMix = useMemo(() => {
    const byMuni = new Map<string, number>()
    deliveries.forEach((d) => {
      const key = d.municipality || "Unknown"
      byMuni.set(key, (byMuni.get(key) || 0) + 1)
    })
    const entries = Array.from(byMuni.entries()).sort((a, b) => b[1] - a[1])
    const top = entries.slice(0, 6)
    const othersCount = entries.slice(6).reduce((sum, [, v]) => sum + v, 0)
    const res = top.map(([name, value]) => ({ name, value }))
    if (othersCount > 0) res.push({ name: "Others", value: othersCount })
    return res
  }, [deliveries])

  const topSchools = useMemo(() => {
    const bySchool = new Map<string, number>()
    deliveries.forEach((d) => {
      if (d.status !== "Delivered") return
      const key = d.school || "Unknown"
      bySchool.set(key, (bySchool.get(key) || 0) + 1)
    })
    return Array.from(bySchool.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([school, delivered]) => ({ school, delivered }))
  }, [deliveries])

  const topSchoolsChart = useMemo(() => {
    const labels = topSchools.map((s) => s.school)
    const series = [{ name: "Delivered", data: topSchools.map((s) => s.delivered) }]

    return {
      options: {
        chart: {
          type: "bar",
          toolbar: { show: false },
          fontFamily: "inherit",
          redrawOnParentResize: true,
          redrawOnWindowResize: true,
          background: "transparent",
        },
        plotOptions: {
          bar: {
            horizontal: true,
            borderRadius: 8,
            barHeight: "60%",
          },
        },
        dataLabels: { enabled: false },
        grid: { borderColor: "#f0fdf4", strokeDashArray: 4 },
        xaxis: {
          categories: labels,
          labels: { style: { colors: "#6b7280" }, trim: true },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          labels: {
            style: { colors: "#374151" },
            maxWidth: isXs ? 90 : 160,
            trim: true,
          },
        },
        colors: ["#16a34a"],
        tooltip: { theme: "light" },
        responsive: [
          {
            breakpoint: 420,
            options: {
              plotOptions: { bar: { barHeight: "55%" } },
              grid: { padding: { left: 4, right: 8 } },
              yaxis: { labels: { maxWidth: 70 } },
            },
          },
        ],
      } as any,
      series,
    }
  }, [isXs, topSchools])

  const recentActivity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = []
    deliveries.forEach((d) => {
      items.push({
        id: `d-${d.id}`,
        title:
          d.status === "Delivered"
            ? "Delivery delivered"
            : d.status === "Delayed"
              ? "Delivery delayed"
              : d.status === "Pending"
                ? "Delivery pending"
                : "Delivery updated",
        subtitle: `${d.school || "Unknown School"} • ${d.categoryLabel}`,
        time: d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : "",
        variant: d.status === "Delivered" ? "success" : d.status === "Delayed" ? "warning" : "info",
      })
    })
    attendance.forEach((a) => {
      items.push({
        id: `a-${a._id}`,
        title: "Attendance saved",
        subtitle: `${a.school || "Unknown School"}${a.grade ? ` • Grade ${a.grade}` : ""} • Present: ${a.present ?? 0}, Absent: ${a.absent ?? 0}`,
        time: a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "",
        variant: "info",
      })
    })
    items.sort((x, y) => (y.time || "").localeCompare(x.time || ""))
    return items.slice(0, 6)
  }, [attendance, deliveries])

  // ── Announcements view ──
  if (activeView === "announcements") {
    return (
      <div className="space-y-4 min-w-0 overflow-x-hidden bg-gradient-to-br from-green-50 via-white to-teal-50/40 min-h-screen px-4 py-8 sm:px-6"
        style={{ fontFamily: "'Plus Jakarta Sans', 'Nunito', sans-serif" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-800 sm:text-3xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Announcements
            </h1>
            <div className="mt-1 text-sm text-gray-500">Dashboard announcements feed</div>
          </div>
          <button
            type="button"
            onClick={() => setActiveView("dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:text-gray-800"
          >
            ← Back to dashboard
          </button>
        </div>
        <AnnouncementsFeedPage mode="admin" />
      </div>
    )
  }

  // ── Loading skeleton helper ──
  const ChartLoader = () => (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-gray-400">
      <span className="size-4 animate-spin rounded-full border-2 border-gray-100 border-t-green-500" />
      Loading…
    </div>
  )

  return (
    <div
      className="space-y-6 min-w-0 overflow-x-hidden bg-gradient-to-br from-green-50 via-white to-teal-50/30 min-h-screen px-4 py-8 sm:px-6 lg:px-8"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Nunito', sans-serif" }}
    >
      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-green-700">
            <Clock className="size-3" />
            Live · This Week
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight text-gray-800 sm:text-4xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bataan Healthy School Setting — Admin overview
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveView("announcements")}
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-200 transition-all hover:bg-green-500 active:scale-[0.97]"
        >
          <Megaphone className="size-4" />
          Announcements
        </button>
      </motion.div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, idx) => (
          <motion.div
            key={k.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.06 }}
          >
            <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{k.title}</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-gray-800">{k.value}</p>
                  <p className="mt-1 text-xs text-gray-400">Compared to last period</p>
                </div>
                <div className={`grid size-11 place-items-center rounded-xl ${k.bg} ${k.color}`}>
                  <k.icon className="size-5" />
                </div>
              </div>
              {/* subtle colored bar at bottom */}
              <div className={`absolute bottom-0 left-0 h-0.5 w-full ${k.bg}`} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Dashboard Announcements ── */}
      <DashboardAnnouncements onViewAll={() => setActiveView("announcements")} />

      {/* ── Delivery Concerns ── */}
      {concernDeliveries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
        >
          <div className="rounded-2xl border border-amber-100 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-600">
                    <TriangleAlert className="size-4" />
                  </div>
                  <h2 className="text-sm font-bold text-gray-800">Delivery Concerns</h2>
                  {isLoading && <span className="text-xs text-gray-400">Loading…</span>}
                </div>
                <p className="mt-0.5 pl-10 text-xs text-gray-500">Latest deliveries with reported concerns</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveItem("Delivery")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800"
              >
                View all
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {concernDeliveries.map((d) => {
                  const who =
                    String(d.hlaManagerName || "").trim() ||
                    String(d.userName || "").trim() ||
                    String(d.username || "").trim() ||
                    "(unknown)"
                  const when = d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : d.dateKey
                  const concerns = Array.isArray(d.concerns) ? d.concerns : []
                  const concernCount = concerns.length
                  const scrollable = concernCount >= 6

                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => { setSelectedConcern(d); setImagePreviewIndex(null) }}
                      className="group w-full min-w-0 overflow-hidden text-left rounded-2xl border border-gray-100 bg-gray-50/60 p-4 transition-all hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50"
                    >
                      <div className="flex h-full flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                            {d.school || "Unknown School"}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            {concernCount} concern{concernCount === 1 ? "" : "s"}
                          </span>
                          {d.municipality && (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {d.municipality}
                            </span>
                          )}
                        </div>

                        <p className="truncate text-xs text-gray-500">
                          {who}{d.categoryLabel ? ` · ${d.categoryLabel}` : ""}
                        </p>

                        <div className={`space-y-1 ${scrollable ? "max-h-24 overflow-auto pr-1" : ""}`}>
                          {concerns.map((c, idx) => (
                            <p key={`${d.id}-c-${idx}`} className="text-xs text-gray-700 leading-relaxed">
                              {c}
                            </p>
                          ))}
                        </div>

                        <p className="mt-auto pt-1 text-[11px] text-gray-400">{when}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Concern Details Dialog ── */}
      <Dialog
        open={!!selectedConcern && imagePreviewIndex === null}
        onOpenChange={(open: boolean) => {
          if (!open) { setSelectedConcern(null); setImagePreviewIndex(null) }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
          <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
            <DialogTitle className="text-base font-bold text-gray-800">Delivery Concern Details</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">Review reported concerns and uploaded images.</DialogDescription>
          </DialogHeader>

          {selectedConcern ? (() => {
            const who =
              String(selectedConcern.hlaManagerName || "").trim() ||
              String(selectedConcern.userName || "").trim() ||
              String(selectedConcern.username || "").trim() ||
              "(unknown)"
            const when = selectedConcern.uploadedAt
              ? new Date(selectedConcern.uploadedAt).toLocaleString()
              : selectedConcern.dateKey
            const concerns = Array.isArray(selectedConcern.concerns) ? selectedConcern.concerns : []
            const images = Array.isArray(selectedConcern.images) ? selectedConcern.images : []

            return (
              <div className="grid gap-4 p-6">
                {/* Summary */}
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-gray-800">{selectedConcern.school || "Unknown School"}</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {who}{selectedConcern.municipality ? ` · ${selectedConcern.municipality}` : ""}
                        {selectedConcern.categoryLabel ? ` · ${selectedConcern.categoryLabel}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{when}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                      {selectedConcern.status}
                    </span>
                    {selectedConcern.statusReason && (
                      <span className="inline-flex items-center rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600">
                        {selectedConcern.statusReason}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                      {concerns.length} concern{concerns.length === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                      {images.length} image{images.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Concerns */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Concerns</p>
                    {concerns.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-400">No concerns.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {concerns.map((c, idx) => (
                          <div
                            key={`${selectedConcern.id}-detail-c-${idx}`}
                            className="rounded-xl border border-gray-100 bg-white p-3 text-sm text-gray-700 leading-relaxed"
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedConcern.remarks && (
                      <div className="mt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Remarks</p>
                        <div className="mt-2 rounded-xl border border-gray-100 bg-white p-3 text-sm text-gray-700 leading-relaxed">
                          {selectedConcern.remarks}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Images */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Uploaded Images</p>
                    {images.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-400">No images.</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {images.map((img, idx) => (
                          <button
                            key={`${img.filename}-${idx}`}
                            type="button"
                            onClick={() => setImagePreviewIndex(idx)}
                            className="group overflow-hidden rounded-xl border border-gray-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50"
                          >
                            <img
                              src={`${getApiBaseUrl()}${img.url}`}
                              alt={img.filename || `image-${idx + 1}`}
                              className="h-28 w-full object-cover transition-transform group-hover:scale-[1.04]"
                              loading="lazy"
                            />
                            <div className="px-2 py-1.5 text-[11px] text-gray-400 truncate">{img.filename}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })() : null}
        </DialogContent>
      </Dialog>

      {/* ── Image Preview Dialog ── */}
      <Dialog
        open={!!selectedConcern && imagePreviewIndex !== null}
        onOpenChange={(open: boolean) => { if (!open) setImagePreviewIndex(null) }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-800">Image Preview</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">Use Prev / Next to navigate.</DialogDescription>
          </DialogHeader>

          {(() => {
            const images = Array.isArray(selectedConcern?.images) ? selectedConcern!.images! : []
            const idx = imagePreviewIndex
            if (!selectedConcern || idx === null || !images[idx]) {
              return <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-400">No image.</div>
            }
            const img = images[idx]

            return (
              <div className="grid gap-4">
                <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  <img
                    src={`${getApiBaseUrl()}${img.url}`}
                    alt={img.filename || `image-${idx + 1}`}
                    className="max-h-[65vh] w-full object-contain bg-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm text-gray-400">{img.filename}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={idx <= 0}
                      onClick={() => setImagePreviewIndex((p) => (p === null ? p : Math.max(0, p - 1)))}
                      className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      disabled={idx >= images.length - 1}
                      onClick={() => setImagePreviewIndex((p) => (p === null ? p : Math.min(images.length - 1, p + 1)))}
                      className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                    <button
                      type="button"
                      onClick={() => setImagePreviewIndex(null)}
                      className="inline-flex items-center rounded-xl bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500"
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Charts Row 1: Trend + Municipality ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.06 }}
          className="lg:col-span-8"
        >
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-1 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-green-100 text-green-600">
                    <Activity className="size-4" />
                  </div>
                  <h2 className="text-sm font-bold text-gray-800">Delivery Trend</h2>
                </div>
                <p className="mt-0.5 pl-10 text-xs text-gray-500">Delivered vs pending — last 7 days</p>
              </div>
              {error && <span className="text-xs text-red-500">{error}</span>}
              {isLoading && <span className="text-xs text-gray-400">Loading…</span>}
            </div>
            <div className="h-[240px] p-3 sm:h-[300px] sm:p-5">
              {isLoading ? <ChartLoader /> : error ? (
                <div className="flex h-full items-center justify-center text-sm text-red-500">Failed to load</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={deliveriesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="deliveredFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0.01} />
                      </linearGradient>
                      <linearGradient id="pendingFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} hide={isXs} interval={isSm ? 1 : 0} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <YAxis tickLine={false} axisLine={false} width={isXs ? 22 : 28} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #f3f4f6", fontSize: 12 }} />
                    <Legend verticalAlign={isSm ? "bottom" : "top"} iconType="circle" iconSize={8} />
                    <Area type="monotone" dataKey="delivered" stroke="#16a34a" fill="url(#deliveredFill)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="pending" stroke="#d97706" fill="url(#pendingFill)" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="lg:col-span-4"
        >
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm h-full">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-teal-100 text-teal-600">
                  <School className="size-4" />
                </div>
                <h2 className="text-sm font-bold text-gray-800">Municipality Mix</h2>
              </div>
              <p className="mt-0.5 pl-10 text-xs text-gray-500">Share of records by municipality</p>
            </div>
            <div className="h-[240px] p-3 sm:h-[300px] sm:p-4">
              {isLoading ? <ChartLoader /> : error ? (
                <div className="flex h-full items-center justify-center text-sm text-red-500">Failed to load</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #f3f4f6", fontSize: 12 }} />
                    <Pie
                      data={municipalityMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={isXs ? 40 : 55}
                      outerRadius={isXs ? 70 : 88}
                      paddingAngle={3}
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth={2}
                    >
                      {municipalityMix.map((entry, idx) => (
                        <Cell key={`muni-${entry.name}-${idx}`} fill={MUNICIPALITY_COLORS[idx % MUNICIPALITY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Charts Row 2: Top Schools + Recent Activity ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.12 }}
          className="lg:col-span-7"
        >
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-1 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
                    <TrendingUp className="size-4" />
                  </div>
                  <h2 className="text-sm font-bold text-gray-800">Top Schools</h2>
                </div>
                <p className="mt-0.5 pl-10 text-xs text-gray-500">Most deliveries in the last 7 days</p>
              </div>
              {error && <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">Error</span>}
              {isLoading && <span className="text-xs text-gray-400">Loading…</span>}
            </div>
            <div className="h-[240px] p-3 sm:h-[280px] sm:p-5">
              {isLoading ? <ChartLoader /> : error ? (
                <div className="flex h-full items-center justify-center text-sm text-red-500">Failed to load</div>
              ) : (
                <div className="h-full w-full overflow-hidden [&_.apexcharts-canvas]:!w-full [&_.apexcharts-svg]:!w-full [&_.apexcharts-canvas]:!h-full [&_.apexcharts-svg]:!h-full">
                  <ReactApexChart
                    type="bar"
                    height="100%"
                    width="100%"
                    options={topSchoolsChart.options}
                    series={topSchoolsChart.series as any}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.14 }}
          className="lg:col-span-5"
        >
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-600">
                  <Activity className="size-4" />
                </div>
                <h2 className="text-sm font-bold text-gray-800">Recent Activity</h2>
              </div>
              <p className="mt-0.5 pl-10 text-xs text-gray-500">Latest actions across schools and users</p>
            </div>

            <div className="p-4 space-y-2">
              {recentActivity.map((a, idx) => {
                const parts = String(a.subtitle || "").split(" • ")
                const isDelivery = a.id.startsWith("d-")
                const school = isDelivery ? (parts[0] || "") : ""
                const category = isDelivery ? (parts[1] || "") : ""
                const fallbackSubtitle = !isDelivery ? String(a.subtitle || "") : ""

                const variantStyles = {
                  success: "bg-green-100 text-green-700",
                  warning: "bg-amber-100 text-amber-700",
                  info: "bg-sky-100 text-sky-700",
                }

                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18, delay: idx * 0.04 }}
                    className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 transition-all hover:border-gray-200 hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{a.title}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${variantStyles[a.variant]}`}>
                            {a.variant}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {isDelivery ? school : fallbackSubtitle}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {isDelivery && category && (
                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 truncate max-w-[50vw]">
                            {category}
                          </span>
                        )}
                        <p className="mt-0.5 text-[11px] text-gray-400 break-words sm:whitespace-nowrap">{a.time}</p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}

              {isLoading && <p className="text-xs text-gray-400">Loading recent activity…</p>}
              {error && <p className="text-xs text-red-500">Failed to load activity.</p>}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}