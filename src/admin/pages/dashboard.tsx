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
  Calendar,
  Clock,
  Megaphone,
  PackageCheck,
  School,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react"

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
    "#6366F1",
    "#22C55E",
    "#06B6D4",
    "#F59E0B",
    "#F43F5E",
    "#A855F7",
    "#0EA5E9",
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
    return () => {
      cancelled = true
    }
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
        accent: "from-indigo-500/15 via-indigo-500/5 to-transparent",
      },
      {
        title: "Beneficiaries (7d)",
        value: beneficiaries7d.toLocaleString(),
        delta: "",
        icon: Users,
        accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      },
      {
        title: "Deliveries (7d)",
        value: deliveries7d.toLocaleString(),
        delta: "",
        icon: PackageCheck,
        accent: "from-sky-500/15 via-sky-500/5 to-transparent",
      },
      {
        title: "Completion Rate",
        value: `${completionRate}%`,
        delta: "",
        icon: BadgeCheck,
        accent: "from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
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
        },
        plotOptions: {
          bar: {
            horizontal: true,
            borderRadius: 10,
            barHeight: "70%",
          },
        },
        dataLabels: { enabled: false },
        grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
        xaxis: {
          categories: labels,
          labels: { style: { colors: "#64748b" }, trim: true },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          labels: {
            style: { colors: "#475569" },
            maxWidth: isXs ? 90 : 160,
            trim: true,
          },
        },
        colors: ["#6366f1"],
        tooltip: { theme: "light" },
        responsive: [
          {
            breakpoint: 420,
            options: {
              plotOptions: { bar: { barHeight: "62%" } },
              grid: {
                padding: { left: 4, right: 8 },
              },
              yaxis: {
                labels: {
                  maxWidth: 70,
                },
              },
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

  if (activeView === "announcements") {
    return (
      <div
        className="space-y-4 min-w-0 overflow-x-hidden"
        style={{ fontFamily: '"Artico Soft-Medium","Mona Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Announcements</h1>
            <div className="mt-1 text-sm text-muted-foreground truncate">
              Dashboard announcements feed
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={() => setActiveView("dashboard")}
            >
              Back to dashboard
            </Button>
          </div>
        </div>

        <AnnouncementsFeedPage mode="admin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" style={{ fontFamily: '"Artico Soft-Medium","Mona Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex flex-col gap-2"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            <div className="mt-1 text-sm text-muted-foreground truncate max-w-[calc(100vw-2rem)] sm:max-w-none">
              Bataan Healthy School Setting — Admin overview (sample UI)
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={() => setActiveView("announcements")}
            >
              <Megaphone className="mr-2 size-4" />
              Announcements
            </Button>
            <Badge variant="secondary" className="rounded-xl px-3 py-1">
              <Calendar className="mr-2 size-4" />
              This week
            </Badge>
            <Badge variant="outline" className="rounded-xl px-3 py-1">
              <Clock className="mr-2 size-4" />
              Live
            </Badge>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, idx) => (
          <motion.div
            key={k.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.04 }}
          >
            <Card
              className={`relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]`}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">
                  {k.title}
                </CardTitle>
                <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
                  <k.icon className="size-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">{k.value}</div>
                  <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-2 py-1 text-xs font-semibold text-emerald-700">
                    <TrendingUp className="size-3.5" />
                    {k.delta}
                  </div>
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  Compared to last period
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <DashboardAnnouncements onViewAll={() => setActiveView("announcements")} />

      {concernDeliveries.length > 0 ? (
        <Card className="rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-5 text-amber-600" />
                Delivery Concerns
              </CardTitle>
              <div className="text-sm text-muted-foreground truncate">
                Latest deliveries with reported concerns
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isLoading ? <div className="text-xs text-muted-foreground">Loading…</div> : null}
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() => {
                  setActiveItem("Delivery")
                }}
              >
                View all
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-4 rounded-2xl border bg-white/70 p-4 md:grid-cols-2 xl:grid-cols-3">
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
                    className="relative w-full min-w-0 overflow-hidden text-left rounded-2xl border border-black/5 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 md:hover:z-10 md:hover:bg-white md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
                    onClick={() => {
                      setSelectedConcern(d)
                      setImagePreviewIndex(null)
                    }}
                  >
                    <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1 font-semibold text-neutral-900 truncate">
                            {d.school || "Unknown School"}
                          </div>
                          <Badge
                            variant="outline"
                            className="rounded-xl border-amber-200 bg-amber-50 text-amber-700"
                          >
                            {concernCount} concern{concernCount === 1 ? "" : "s"}
                          </Badge>
                          {d.municipality ? (
                            <Badge variant="secondary" className="rounded-xl">
                              {d.municipality}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-1 text-sm text-muted-foreground truncate">
                          {who}
                          {d.categoryLabel ? ` • ${d.categoryLabel}` : ""}
                        </div>

                        <div
                          className={`mt-3 space-y-1 ${scrollable ? "max-h-28 overflow-auto pr-2" : ""}`}
                        >
                          {concerns.map((c, idx) => (
                            <div
                              key={`${d.id}-c-${idx}`}
                              className="text-sm text-neutral-800 leading-relaxed"
                            >
                              {c}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground break-words sm:whitespace-nowrap">
                        {when}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={!!selectedConcern && imagePreviewIndex === null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedConcern(null)
            setImagePreviewIndex(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delivery Concern Details</DialogTitle>
            <DialogDescription>Review reported concerns and uploaded images.</DialogDescription>
          </DialogHeader>

          {selectedConcern ? (
            (() => {
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
                <div className="grid gap-4">
                  <div className="rounded-2xl border bg-white/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-neutral-900 truncate">
                          {selectedConcern.school || "Unknown School"}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {who}
                          {selectedConcern.municipality ? ` • ${selectedConcern.municipality}` : ""}
                          {selectedConcern.categoryLabel ? ` • ${selectedConcern.categoryLabel}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{when}</div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="rounded-xl">
                        {selectedConcern.status}
                      </Badge>
                      {selectedConcern.statusReason ? (
                        <Badge variant="outline" className="rounded-xl">
                          {selectedConcern.statusReason}
                        </Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className="rounded-xl border-amber-200 bg-amber-50 text-amber-700"
                      >
                        {concerns.length} concern{concerns.length === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline" className="rounded-xl">
                        {images.length} image{images.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border bg-white/60 p-4">
                      <div className="text-sm font-semibold text-neutral-900">Concerns</div>
                      {concerns.length === 0 ? (
                        <div className="mt-2 text-sm text-muted-foreground">No concerns.</div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {concerns.map((c, idx) => (
                            <div
                              key={`${selectedConcern.id}-detail-c-${idx}`}
                              className="rounded-xl border bg-white/70 p-3 text-sm text-neutral-800 leading-relaxed"
                            >
                              {c}
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedConcern.remarks ? (
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-neutral-900">Remarks</div>
                          <div className="mt-2 rounded-xl border bg-white/70 p-3 text-sm text-neutral-800 leading-relaxed">
                            {selectedConcern.remarks}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border bg-white/60 p-4">
                      <div className="text-sm font-semibold text-neutral-900">Uploaded Images</div>
                      {images.length === 0 ? (
                        <div className="mt-2 text-sm text-muted-foreground">No images.</div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {images.map((img, idx) => (
                            <button
                              key={`${img.filename}-${idx}`}
                              type="button"
                              className="group overflow-hidden rounded-2xl border bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
                              onClick={() => setImagePreviewIndex(idx)}
                            >
                              <img
                                src={`${getApiBaseUrl()}${img.url}`}
                                alt={img.filename || `image-${idx + 1}`}
                                className="h-28 w-full object-cover transition-transform group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                              <div className="px-3 py-2 text-xs text-muted-foreground truncate">{img.filename}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedConcern && imagePreviewIndex !== null}
        onOpenChange={(open) => {
          if (!open) setImagePreviewIndex(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
            <DialogDescription>Use Prev/Next to navigate.</DialogDescription>
          </DialogHeader>

          {(() => {
            const images = Array.isArray(selectedConcern?.images) ? selectedConcern!.images! : []
            const idx = imagePreviewIndex
            if (!selectedConcern || idx === null || !images[idx]) {
              return <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">No image.</div>
            }

            const img = images[idx]

            return (
              <div className="grid gap-4">
                <div className="overflow-hidden rounded-2xl border bg-black/5">
                  <img
                    src={`${getApiBaseUrl()}${img.url}`}
                    alt={img.filename || `image-${idx + 1}`}
                    className="max-h-[65vh] w-full object-contain bg-white"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm text-muted-foreground truncate">{img.filename}</div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={idx <= 0}
                      onClick={() => setImagePreviewIndex((p) => (p === null ? p : Math.max(0, p - 1)))}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={idx >= images.length - 1}
                      onClick={() =>
                        setImagePreviewIndex((p) => (p === null ? p : Math.min(images.length - 1, p + 1)))
                      }
                    >
                      Next
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl"
                      onClick={() => setImagePreviewIndex(null)}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.06 }}
          className="lg:col-span-8"
        >
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-5" />
                  Delivery Trend
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  Delivered vs pending (last 7 days)
                </div>
              </div>
              {error ? (
                <div className="text-xs text-red-600">{error}</div>
              ) : isLoading ? (
                <div className="text-xs text-muted-foreground">Loading…</div>
              ) : null}
            </CardHeader>
            <CardContent className="h-[240px] sm:h-[320px] p-3 sm:p-6">
              {isLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
              ) : error ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-red-600">Failed to load</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={deliveriesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="deliveredFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="pendingFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} hide={isXs} interval={isSm ? 1 : 0} />
                    <YAxis tickLine={false} axisLine={false} width={isXs ? 22 : 28} />
                    <Tooltip />
                    <Legend verticalAlign={isSm ? "bottom" : "top"} />
                    <Area type="monotone" dataKey="delivered" stroke="#10b981" fill="url(#deliveredFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="pending" stroke="#f59e0b" fill="url(#pendingFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.1 }}
          className="lg:col-span-4"
        >
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="size-5" />
                Municipality Mix
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Share of records by municipality
              </div>
            </CardHeader>
            <CardContent className="h-[240px] sm:h-[320px] p-3 sm:p-6">
              {isLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
              ) : error ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-red-600">Failed to load</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Pie
                      data={municipalityMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={isXs ? 40 : 55}
                      outerRadius={isXs ? 70 : 90}
                      paddingAngle={3}
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth={2}
                    >
                      {municipalityMix.map((entry, idx) => (
                        <Cell key={`muni-${entry.name}-${idx}`} fill={MUNICIPALITY_COLORS[idx % MUNICIPALITY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.12 }}
          className="lg:col-span-7"
        >
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-5" />
                  Top Schools (Deliveries)
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  Most delivered entries in the last 7 days
                </div>
              </div>
              {error ? (
                <Badge variant="outline" className="w-fit rounded-xl text-red-600 border-red-200">Error</Badge>
              ) : isLoading ? (
                <Badge variant="outline" className="w-fit rounded-xl">Loading</Badge>
              ) : null}
            </CardHeader>
            <CardContent className="h-[240px] sm:h-[280px] p-3 sm:p-6">
              {isLoading ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
              ) : error ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-red-600">Failed to load</div>
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
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.14 }}
          className="lg:col-span-5"
        >
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5" />
                Recent Activity
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Latest actions across schools and users
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivity.map((a, idx) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18, delay: idx * 0.04 }}
                    className="group min-w-0 overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-white/80 to-emerald-50/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-all md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_26px_rgba(0,0,0,0.06)]"
                  >
                    {(() => {
                      const parts = String(a.subtitle || "").split(" • ")
                      const isDelivery = a.id.startsWith("d-")
                      const school = isDelivery ? (parts[0] || "") : ""
                      const category = isDelivery ? (parts[1] || "") : ""
                      const fallbackSubtitle = !isDelivery ? String(a.subtitle || "") : ""

                      return (
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <div className="min-w-0 flex-1 basis-full truncate font-medium sm:basis-auto">
                                {a.title}
                              </div>
                              <span
                                className={`inline-flex max-w-full shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize shadow-sm transition-colors group-hover:brightness-[0.98] ${
                                  a.variant === "success"
                                    ? "border-emerald-200/70 bg-gradient-to-r from-emerald-50 to-emerald-100/70 text-emerald-800"
                                    : a.variant === "warning"
                                      ? "border-amber-200/70 bg-gradient-to-r from-amber-50 to-amber-100/70 text-amber-800"
                                      : "border-sky-200/70 bg-gradient-to-r from-sky-50 to-sky-100/70 text-sky-800"
                                }`}
                              >
                                {a.variant}
                              </span>
                            </div>

                            {isDelivery ? (
                              <div className="mt-1 min-w-0 truncate text-sm text-muted-foreground">
                                {school}
                              </div>
                            ) : (
                              <div className="mt-1 min-w-0 truncate text-sm text-muted-foreground">
                                {fallbackSubtitle}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 text-right">
                            {isDelivery && category ? (
                              <div className="inline-flex max-w-[60vw] items-center justify-end rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm truncate">
                                {category}
                              </div>
                            ) : null}
                            <div className="mt-1 text-xs text-muted-foreground break-words sm:whitespace-nowrap">
                              {a.time}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </motion.div>
                ))}
              </div>

              {isLoading ? (
                <div className="text-xs text-muted-foreground">Loading recent activity…</div>
              ) : error ? (
                <div className="text-xs text-red-600">Failed to load activity.</div>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
