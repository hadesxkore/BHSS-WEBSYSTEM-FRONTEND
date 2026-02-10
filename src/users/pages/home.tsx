import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import ReactApexChart from "react-apexcharts"
import { addDays, format, parseISO, subDays } from "date-fns"
import {
  Activity,
  BadgeCheck,
  Calendar,
  ClipboardCheck,
  PackageCheck,
  TrendingUp,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardAnnouncements } from "@/admin/components/dashboard-announcements"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

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
  const fromEnv = (import.meta as any)?.env?.VITE_API_URL as string | undefined
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

  const [isLoading, setIsLoading] = useState(true)
  const [attendance, setAttendance] = useState<AttendanceRecordDto[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecordDto[]>([])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const fromKey = safeKey(subDays(new Date(), 29))
        const [attRes, delRes] = await Promise.all([
          apiFetch(`/api/attendance/history?from=${encodeURIComponent(fromKey)}&sort=newest`),
          apiFetch(`/api/delivery/history?sort=newest`),
        ])

        if (cancelled) return

        const att = Array.isArray((attRes as any)?.records) ? ((attRes as any).records as any[]) : []
        const del = Array.isArray((delRes as any)?.records) ? ((delRes as any).records as any[]) : []

        setAttendance(att)
        setDeliveries(del)
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || "Failed to load dashboard")
          setAttendance([])
          setDeliveries([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const dateKeys14 = useMemo(() => {
    const start = subDays(new Date(), 13)
    return Array.from({ length: 14 }, (_, i) => safeKey(addDays(start, i)))
  }, [])

  const attendanceSeries = useMemo(() => {
    const byKey = new Map<string, { present: number; absent: number }>()
    for (const r of attendance) {
      const k = String((r as any)?.dateKey || "").trim()
      if (!k) continue
      byKey.set(k, {
        present: Number((r as any)?.present || 0),
        absent: Number((r as any)?.absent || 0),
      })
    }

    const present = dateKeys14.map((k) => byKey.get(k)?.present || 0)
    const absent = dateKeys14.map((k) => byKey.get(k)?.absent || 0)

    return { present, absent }
  }, [attendance, dateKeys14])

  const deliveryStatusCounts14 = useMemo(() => {
    const startKey = dateKeys14[0]
    const endKey = dateKeys14[dateKeys14.length - 1]
    const counts = { Pending: 0, Delivered: 0, Delayed: 0, Cancelled: 0 }

    for (const r of deliveries) {
      const dateKey = String((r as any)?.dateKey || "").trim()
      if (!dateKey) continue
      if (startKey && dateKey < startKey) continue
      if (endKey && dateKey > endKey) continue

      const status = String((r as any)?.status || "Pending") as keyof typeof counts
      if (status in counts) counts[status] += 1
    }

    return counts
  }, [deliveries, dateKeys14])

  const totals = useMemo(() => {
    const startKey = dateKeys14[0]
    const endKey = dateKeys14[dateKeys14.length - 1]
    const att14 = attendance.filter((r) => {
      const k = String((r as any)?.dateKey || "").trim()
      if (!k) return false
      if (startKey && k < startKey) return false
      if (endKey && k > endKey) return false
      return true
    })

    const present14 = att14.reduce((acc, r) => acc + Number((r as any)?.present || 0), 0)
    const absent14 = att14.reduce((acc, r) => acc + Number((r as any)?.absent || 0), 0)

    const delivery14 = deliveries.filter((r) => {
      const k = String((r as any)?.dateKey || "").trim()
      if (!k) return false
      if (startKey && k < startKey) return false
      if (endKey && k > endKey) return false
      return true
    })

    const delivered14 = delivery14.filter((r) => String((r as any)?.status || "") === "Delivered").length

    return {
      present14,
      absent14,
      records14: att14.length,
      deliveries14: delivery14.length,
      delivered14,
    }
  }, [attendance, deliveries, dateKeys14])

  const kpis = useMemo<DashboardKpi[]>(() => {
    return [
      {
        title: "Attendance (14d)",
        value: String(totals.records14),
        delta: "",
        icon: ClipboardCheck,
        accent: "from-sky-500/15 via-sky-500/5 to-transparent",
      },
      {
        title: "Present (14d)",
        value: String(totals.present14),
        delta: "",
        icon: BadgeCheck,
        accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      },
      {
        title: "Deliveries (14d)",
        value: String(totals.deliveries14),
        delta: "",
        icon: Truck,
        accent: "from-indigo-500/15 via-indigo-500/5 to-transparent",
      },
      {
        title: "Delivered (14d)",
        value: String(totals.delivered14),
        delta: "",
        icon: PackageCheck,
        accent: "from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
      },
    ]
  }, [totals])

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

  const attendanceChart = useMemo(() => {
    return {
      options: {
        chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit" },
        stroke: { curve: "smooth", width: 2 },
        fill: { type: "gradient", gradient: { shadeIntensity: 0.25, opacityFrom: 0.4, opacityTo: 0.05 } },
        dataLabels: { enabled: false },
        xaxis: {
          categories: dateKeys14.map((k) => format(safeParseDateKey(k), "MMM d")),
          labels: { style: { colors: "#64748b" } },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { style: { colors: "#64748b" } } },
        grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
        colors: ["#10b981", "#f43f5e"],
        legend: { position: "top", horizontalAlign: "left", labels: { colors: "#475569" } },
        tooltip: { theme: "light" },
        responsive: [
          {
            breakpoint: 640,
            options: {
              legend: { position: "bottom", horizontalAlign: "left" },
              xaxis: { labels: { rotate: -35, rotateAlways: true } },
            },
          },
          {
            breakpoint: 420,
            options: {
              xaxis: { labels: { show: false } },
              legend: { position: "bottom", horizontalAlign: "left" },
            },
          },
        ],
      } as any,
      series: [
        { name: "Present", data: attendanceSeries.present },
        { name: "Absent", data: attendanceSeries.absent },
      ],
    }
  }, [attendanceSeries, dateKeys14])

  const deliveryStatusChart = useMemo(() => {
    const labels = ["Delivered", "Pending", "Delayed", "Cancelled"]
    const values = [
      deliveryStatusCounts14.Delivered,
      deliveryStatusCounts14.Pending,
      deliveryStatusCounts14.Delayed,
      deliveryStatusCounts14.Cancelled,
    ]

    return {
      options: {
        chart: { type: "donut", toolbar: { show: false }, fontFamily: "inherit" },
        labels,
        legend: { position: "bottom", labels: { colors: "#475569" } },
        dataLabels: { enabled: false },
        stroke: { width: 1, colors: ["#ffffff"] },
        colors: ["#10b981", "#6366f1", "#f59e0b", "#f43f5e"],
        tooltip: { theme: "light" },
        plotOptions: { pie: { donut: { size: "72%" } } },
        responsive: [
          {
            breakpoint: 640,
            options: {
              plotOptions: { pie: { donut: { size: "68%" } } },
              legend: { position: "bottom" },
            },
          },
          {
            breakpoint: 420,
            options: {
              plotOptions: { pie: { donut: { size: "64%" } } },
              legend: { position: "bottom" },
            },
          },
        ],
      } as any,
      series: values,
    }
  }, [deliveryStatusCounts14])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4 min-w-0 overflow-x-hidden"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Home</h1>
          <div className="mt-1 text-sm text-muted-foreground truncate max-w-[calc(100vw-2rem)] sm:max-w-none">
            {(school || "Your School") + (municipality ? ` • ${municipality}` : "")}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-xl px-3 py-1">
            <Calendar className="mr-2 size-4" />
            Last 14 days
          </Badge>
          <Badge variant="outline" className="rounded-xl px-3 py-1">
            <Activity className="mr-2 size-4" />
            Summary
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, idx) => (
          <motion.div
            key={k.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.04 }}
          >
            <Card className={`relative overflow-hidden rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]`}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.title}</CardTitle>
                <div className="rounded-xl bg-background/70 p-2 shadow-sm">
                  <k.icon className="size-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-2xl font-bold tracking-tight sm:text-3xl">{k.value}</div>
                  {k.delta ? (
                    <div className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <TrendingUp className="size-3.5" />
                      {k.delta}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {isLoading ? "Loading…" : "Updated from your records"}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <DashboardAnnouncements />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.06 }}
          className="lg:col-span-8"
        >
          <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-5" />
                  Attendance Trend
                </CardTitle>
                <div className="text-sm text-muted-foreground">Present vs absent (last 14 days)</div>
              </div>
              <Badge variant="outline" className="w-fit rounded-xl">
                Live
              </Badge>
            </CardHeader>
            <CardContent className="h-[240px] sm:h-[320px] p-3 sm:p-6">
              <div className="h-full w-full overflow-hidden [&_.apexcharts-canvas]:!w-full [&_.apexcharts-svg]:!w-full [&_.apexcharts-canvas]:!h-full [&_.apexcharts-svg]:!h-full">
                <ReactApexChart
                  type="area"
                  height="100%"
                  width="100%"
                  options={attendanceChart.options}
                  series={attendanceChart.series as any}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.1 }}
          className="lg:col-span-4"
        >
          <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
            <CardHeader className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5" />
                Delivery Status
              </CardTitle>
              <div className="text-sm text-muted-foreground">Breakdown (last 14 days)</div>
            </CardHeader>
            <CardContent className="h-[240px] sm:h-[320px] p-3 sm:p-6">
              <div className="h-full w-full overflow-hidden [&_.apexcharts-canvas]:!w-full [&_.apexcharts-svg]:!w-full [&_.apexcharts-canvas]:!h-full [&_.apexcharts-svg]:!h-full">
                <ReactApexChart
                  type="donut"
                  height="100%"
                  width="100%"
                  options={deliveryStatusChart.options}
                  series={deliveryStatusChart.series as any}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Recent Activity
          </CardTitle>
          <div className="text-sm text-muted-foreground">Latest updates from your attendance and delivery</div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 text-sm text-muted-foreground">Loading...</div>
          ) : recentActivity.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((a, idx) => (
                <div key={a.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div>
                      <div className="text-sm font-semibold">{a.title}</div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{a.subtitle}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge
                        variant="outline"
                        className={`rounded-xl ${
                          a.variant === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : a.variant === "warning"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-sky-200 bg-sky-50 text-sky-700"
                        }`}
                      >
                        {a.variant === "success" ? "Done" : a.variant === "warning" ? "Attention" : "Update"}
                      </Badge>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{a.time}</div>
                    </div>
                  </div>
                  {idx === recentActivity.length - 1 ? null : <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
