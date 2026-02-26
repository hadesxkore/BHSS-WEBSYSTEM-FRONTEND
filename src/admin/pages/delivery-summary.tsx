import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Search,
  TriangleAlert,
  Truck,
  XCircle,
} from "lucide-react"

import ReactApexChart from "react-apexcharts"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type DeliveryStatus = "Pending" | "Delivered" | "Delayed" | "Cancelled"

type AdminDeliveryRow = {
  id: string
  dateKey: string
  municipality: string
  school: string
  categoryKey: string
  categoryLabel: string
  status: DeliveryStatus
  statusReason: string
  uploadedAt: string
  images: Array<{ url: string; filename: string }>
  concerns: string[]
  remarks: string
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

function statusBadge(status: DeliveryStatus) {
  if (status === "Delivered") {
    return {
      label: "Delivered",
      icon: CheckCircle2,
      badgeClass: "bg-green-50 text-green-700 border border-green-200 font-medium",
    }
  }
  if (status === "Delayed") {
    return {
      label: "Delayed",
      icon: TriangleAlert,
      badgeClass: "bg-amber-50 text-amber-700 border border-amber-200 font-medium",
    }
  }
  if (status === "Cancelled") {
    return {
      label: "Cancelled",
      icon: XCircle,
      badgeClass: "bg-red-50 text-red-600 border border-red-200 font-medium",
    }
  }
  return {
    label: "Pending",
    icon: FileText,
    badgeClass: "bg-teal-50 text-teal-700 border border-teal-200 font-medium",
  }
}

function CountBadge({
  value,
  variant,
}: {
  value: number
  variant: "delivered" | "pending" | "delayed" | "cancelled"
}) {
  const cls =
    variant === "delivered"
      ? "bg-green-100 text-green-800 font-semibold"
      : variant === "delayed"
        ? "bg-amber-100 text-amber-800 font-semibold"
        : variant === "cancelled"
          ? "bg-red-100 text-red-700 font-semibold"
          : "bg-teal-100 text-teal-800 font-semibold"

  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-full px-2 py-0.5 text-xs tabular-nums ${cls}`}
    >
      {value}
    </span>
  )
}

function formatPrettyDate(dateKey: string) {
  const d = new Date(dateKey)
  if (Number.isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "2-digit",
  })
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const url = src.startsWith("http") ? src : `${window.location.origin}${src}`
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.onload = () => resolve(String(reader.result || ""))
      reader.readAsDataURL(blob)
    })
    return dataUrl
  } catch {
    return null
  }
}

export function AdminDeliverySummary() {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: today, to: today }
  })
  const [isRangeOpen, setIsRangeOpen] = useState(false)
  const [sort, setSort] = useState<"newest" | "oldest">("newest")
  const [search, setSearch] = useState("")

  const [rows, setRows] = useState<AdminDeliveryRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [isPdfOpen, setIsPdfOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all")
  const [isMunicipalitiesOpen, setIsMunicipalitiesOpen] = useState(false)
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<string[]>([])

  useEffect(() => {
    const t = setTimeout(async () => {
      setIsLoading(true)
      try {
        const qs = new URLSearchParams()
        if (range?.from) qs.set("from", format(range.from, "yyyy-MM-dd"))
        if (range?.to) qs.set("to", format(range.to, "yyyy-MM-dd"))
        if (search.trim()) qs.set("search", search.trim())
        qs.set("sort", sort)

        const data = (await apiFetch(`/api/admin/delivery/history?${qs.toString()}`)) as {
          records?: AdminDeliveryRow[]
        }

        setRows(Array.isArray(data.records) ? data.records : [])
      } catch (e: any) {
        toast.error(e?.message || "Failed to load delivery summary")
        setRows([])
      } finally {
        setIsLoading(false)
      }
    }, 250)

    return () => clearTimeout(t)
  }, [range?.from, range?.to, search, sort])

  const municipalityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const m = (r.municipality || "").trim()
      if (m) set.add(m)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  useEffect(() => {
    setSelectedMunicipalities((prev) => prev.filter((m) => municipalityOptions.includes(m)))
  }, [municipalityOptions])

  const scopedRows = useMemo(() => {
    if (scopeMode === "all") return rows
    const set = new Set(selectedMunicipalities)
    return rows.filter((r) => set.has(r.municipality))
  }, [rows, scopeMode, selectedMunicipalities])

  const rangeLabel = useMemo(() => {
    if (!range?.from && !range?.to) return "Select range"
    if (range?.from && !range?.to) return format(range.from, "MMM dd, yyyy")
    if (range?.from && range?.to) {
      return `${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`
    }
    return "Select range"
  }, [range])

  const summary = useMemo(() => {
    const total = scopedRows.length
    const delivered = scopedRows.filter((r) => r.status === "Delivered").length
    const pending = scopedRows.filter((r) => r.status === "Pending").length
    const delayed = scopedRows.filter((r) => r.status === "Delayed").length
    const cancelled = scopedRows.filter((r) => r.status === "Cancelled").length

    const uniqueMunicipalities = new Set(scopedRows.map((r) => r.municipality).filter(Boolean))
    const uniqueSchools = new Set(scopedRows.map((r) => r.school).filter(Boolean))

    return {
      total,
      delivered,
      pending,
      delayed,
      cancelled,
      uniqueMunicipalityCount: uniqueMunicipalities.size,
      uniqueSchoolCount: uniqueSchools.size,
    }
  }, [scopedRows])

  const topCategories = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of scopedRows) {
      const k = (r.categoryLabel || "").trim() || "(Unknown)"
      map.set(k, (map.get(k) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [scopedRows])

  const statusSeries = useMemo(() => {
    return [summary.delivered, summary.pending, summary.delayed, summary.cancelled]
  }, [summary.cancelled, summary.delayed, summary.delivered, summary.pending])

  const statusLabels = useMemo(() => {
    return ["Delivered", "Pending", "Delayed", "Cancelled"] as const
  }, [])

  const statusDonutOptions = useMemo(() => {
    return {
      chart: {
        type: "donut" as const,
        toolbar: { show: false },
        animations: { enabled: true, speed: 600 },
      },
      labels: statusLabels,
      colors: ["#16a34a", "#0d9488", "#d97706", "#dc2626"],
      legend: { position: "bottom" as const },
      dataLabels: { enabled: true },
      stroke: { width: 2 },
      plotOptions: {
        pie: {
          donut: {
            size: "62%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "Total",
                formatter: () => String(summary.total),
              },
            },
          },
        },
      },
      tooltip: { enabled: true },
      responsive: [
        {
          breakpoint: 640,
          options: {
            chart: { height: 260 },
            legend: { position: "bottom" as const },
          },
        },
      ],
    }
  }, [statusLabels, summary.total])

  const topCategoriesBarOptions = useMemo(() => {
    const labels = topCategories.map(([label]) => label)
    return {
      chart: {
        type: "bar" as const,
        toolbar: { show: false },
        animations: { enabled: true, speed: 650 },
      },
      plotOptions: {
        bar: {
          borderRadius: 10,
          columnWidth: "55%",
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: labels,
        labels: {
          show: true,
          rotate: -35,
          trim: true,
          hideOverlappingLabels: true,
        },
      },
      yaxis: {
        labels: {
          formatter: (v: number) => String(Math.round(v)),
        },
      },
      tooltip: { enabled: true },
      colors: ["#16a34a"],
      grid: { strokeDashArray: 4 },
    }
  }, [topCategories])

  const topCategoriesBarSeries = useMemo(() => {
    return [
      {
        name: "Records",
        data: topCategories.map(([, count]) => count),
      },
    ]
  }, [topCategories])

  const categoryTableByDateBySchool = useMemo(() => {
    const dateMap = new Map<
      string,
      Map<
        string,
        {
          schoolLabel: string
          categories: Map<
            string,
            {
              categoryLabel: string
              total: number
              delivered: number
              pending: number
              delayed: number
              cancelled: number
            }
          >
        }
      >
    >()

    const shouldShowMunicipality =
      scopeMode === "all" ||
      (scopeMode === "selected" && selectedMunicipalities.map((m) => (m || "").trim()).filter(Boolean).length !== 1)

    for (const r of scopedRows) {
      const dateKey = (r.dateKey || "").trim() || "(Unknown Date)"
      const municipality = (r.municipality || "").trim()
      const school = (r.school || "").trim() || "(Unknown School)"
      const schoolKey = `${municipality}||${school}`
      const schoolLabel = shouldShowMunicipality && municipality ? `${school} (${municipality})` : school
      const categoryLabel = (r.categoryLabel || "").trim() || "(Unknown)"

      const dateBucket = dateMap.get(dateKey) || new Map()
      const schoolBucket =
        dateBucket.get(schoolKey) ||
        ({
          schoolLabel,
          categories: new Map(),
        } as const)

      const curr =
        schoolBucket.categories.get(categoryLabel) ||
        ({
          categoryLabel,
          total: 0,
          delivered: 0,
          pending: 0,
          delayed: 0,
          cancelled: 0,
        } as const)

      schoolBucket.categories.set(categoryLabel, {
        categoryLabel: curr.categoryLabel,
        total: curr.total + 1,
        delivered: curr.delivered + (r.status === "Delivered" ? 1 : 0),
        pending: curr.pending + (r.status === "Pending" ? 1 : 0),
        delayed: curr.delayed + (r.status === "Delayed" ? 1 : 0),
        cancelled: curr.cancelled + (r.status === "Cancelled" ? 1 : 0),
      })

      dateBucket.set(schoolKey, schoolBucket)
      dateMap.set(dateKey, dateBucket)
    }

    const dates = Array.from(dateMap.keys()).sort((a, b) => {
      if (sort === "newest") return b.localeCompare(a)
      return a.localeCompare(b)
    })

    return dates.map((dateKey) => {
      const dateBucket = dateMap.get(dateKey)!
      const schools = Array.from(dateBucket.values())
        .map((s) => ({
          schoolLabel: s.schoolLabel,
          categories: Array.from(s.categories.values()).sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => a.schoolLabel.localeCompare(b.schoolLabel))

      return { dateKey, schools }
    })
  }, [scopedRows, scopeMode, sort, selectedMunicipalities])

  const cleanupPdfUrl = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    setPdfUrl(null)
  }

  const buildPdf = async () => {
    setIsGeneratingPdf(true)
    try {
      const bhssLogo = await loadImageAsDataUrl("/images/bhsslogo.png")
      const bataanLogo = await loadImageAsDataUrl("/images/bataanlogo.png")

      const createPage = (
        pdf: jsPDF,
        title: string,
        generatedAtText: string,
        rangeText: string,
        municipalityLabel?: string
      ) => {
        const pageWidth = pdf.internal.pageSize.getWidth()
        const marginX = 14
        const topY = 12

        pdf.setFillColor(248, 250, 252)
        pdf.rect(0, 0, pageWidth, 36, "F")

        if (bhssLogo) {
          pdf.addImage(bhssLogo, "PNG", marginX, topY, 14, 14)
        }
        if (bataanLogo) {
          pdf.addImage(bataanLogo, "PNG", pageWidth - marginX - 14, topY, 14, 14)
        }

        pdf.setTextColor(15, 23, 42)
        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(14)
        pdf.text(title, pageWidth / 2, topY + 7, { align: "center" })

        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(9)
        pdf.setTextColor(71, 85, 105)
        pdf.text(generatedAtText, marginX, topY + 22, { align: "left" })
        pdf.text(rangeText, pageWidth - marginX, topY + 22, { align: "right" })

        if (municipalityLabel) {
          pdf.setFont("helvetica", "bold")
          pdf.setFontSize(11)
          pdf.setTextColor(30, 41, 59)
          pdf.text(municipalityLabel, pageWidth / 2, topY + 31, { align: "center" })
        }

        pdf.setDrawColor(226, 232, 240)
        pdf.line(marginX, 36, pageWidth - marginX, 36)
        return 44
      }

      const makeSummaryFromRows = (rws: AdminDeliveryRow[]) => {
        const total = rws.length
        const delivered = rws.filter((r) => r.status === "Delivered").length
        const pending = rws.filter((r) => r.status === "Pending").length
        const delayed = rws.filter((r) => r.status === "Delayed").length
        const cancelled = rws.filter((r) => r.status === "Cancelled").length
        const uniqueSchools = new Set(rws.map((r) => r.school).filter(Boolean)).size
        return { total, delivered, pending, delayed, cancelled, uniqueSchools }
      }

      const groupByDateAndSchool = (rws: AdminDeliveryRow[]) => {
        const map = new Map<
          string,
          Map<
            string,
            {
              schoolLabel: string
              categories: Map<
                string,
                {
                  categoryLabel: string
                  total: number
                  delivered: number
                  pending: number
                  delayed: number
                  cancelled: number
                }
              >
            }
          >
        >()
        for (const r of rws) {
          const dateKey = (r.dateKey || "").trim() || "(Unknown Date)"
          const school = (r.school || "").trim() || "(Unknown School)"
          const categoryLabel = (r.categoryLabel || "").trim() || "(Unknown)"
          const dateBucket = map.get(dateKey) || new Map()

          const schoolBucket =
            dateBucket.get(school) ||
            ({
              schoolLabel: school,
              categories: new Map(),
            } as const)

          const curr =
            schoolBucket.categories.get(categoryLabel) ||
            ({
              categoryLabel,
              total: 0,
              delivered: 0,
              pending: 0,
              delayed: 0,
              cancelled: 0,
            } as const)

          schoolBucket.categories.set(categoryLabel, {
            categoryLabel: curr.categoryLabel,
            total: curr.total + 1,
            delivered: curr.delivered + (r.status === "Delivered" ? 1 : 0),
            pending: curr.pending + (r.status === "Pending" ? 1 : 0),
            delayed: curr.delayed + (r.status === "Delayed" ? 1 : 0),
            cancelled: curr.cancelled + (r.status === "Cancelled" ? 1 : 0),
          })

          dateBucket.set(school, schoolBucket)
          map.set(dateKey, dateBucket)
        }

        const dates = Array.from(map.keys()).sort((a, b) => {
          if (sort === "newest") return b.localeCompare(a)
          return a.localeCompare(b)
        })
        return dates.map((dateKey) => {
          const bucket = map.get(dateKey)!
          const schools = Array.from(bucket.values())
            .map((s) => ({
              schoolLabel: s.schoolLabel,
              categories: Array.from(s.categories.values()).sort((a, b) => b.total - a.total),
            }))
            .sort((a, b) => a.schoolLabel.localeCompare(b.schoolLabel))

          return { dateKey, schools }
        })
      }

      const generatedAt = new Date().toLocaleString()

      // Page strategy:
      // - scopeMode === 'all' => 1 municipality per PDF page
      // - scopeMode === 'selected' => single report covering selected municipalities
      const municipalities = (() => {
        if (scopeMode !== "all") return []
        const set = new Set<string>()
        for (const r of rows) {
          const m = (r.municipality || "").trim()
          if (m) set.add(m)
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
      })()

      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })

      const renderReportPage = (pdf: jsPDF, title: string, municipalityLabel: string | null, rws: AdminDeliveryRow[]) => {
        const pageWidth = pdf.internal.pageSize.getWidth()
        const marginX = 14

        let y = createPage(
          pdf,
          title,
          `Generated: ${generatedAt}`,
          `Range: ${rangeLabel}`,
          municipalityLabel || undefined
        )

        const s = makeSummaryFromRows(rws)

        // Summary cards row
        const cardGap = 6
        const cardW = (pageWidth - marginX * 2 - cardGap * 2) / 3
        const cardH = 16
        const cardY = y

        const drawCard = (x: number, label: string, value: string, sub?: string) => {
          pdf.setDrawColor(226, 232, 240)
          pdf.setFillColor(255, 255, 255)
          pdf.roundedRect(x, cardY, cardW, cardH, 2, 2, "FD")
          pdf.setTextColor(71, 85, 105)
          pdf.setFont("helvetica", "normal")
          pdf.setFontSize(9)
          pdf.text(label, x + 3, cardY + 6)
          pdf.setTextColor(15, 23, 42)
          pdf.setFont("helvetica", "bold")
          pdf.setFontSize(12)
          pdf.text(value, x + 3, cardY + 13)
          if (sub) {
            pdf.setTextColor(71, 85, 105)
            pdf.setFont("helvetica", "normal")
            pdf.setFontSize(8)
            pdf.text(sub, x + cardW - 3, cardY + 13, { align: "right" })
          }
        }

        const schoolsCount = new Set(rws.map((r) => r.school).filter(Boolean)).size
        const muniCount = new Set(rws.map((r) => r.municipality).filter(Boolean)).size

        drawCard(marginX, "Total Records", String(s.total))
        drawCard(marginX + cardW + cardGap, "Coverage", String(muniCount), `Schools: ${schoolsCount}`)
        drawCard(marginX + (cardW + cardGap) * 2, "Delivered", String(s.delivered), `Pending: ${s.pending}`)

        y = cardY + cardH + 8

        // Status breakdown as a compact table
        autoTable(pdf, {
          startY: y,
          head: [["Status", "Count"]],
          body: [
            ["Delivered", String(s.delivered)],
            ["Pending", String(s.pending)],
            ["Delayed", String(s.delayed)],
            ["Cancelled", String(s.cancelled)],
          ],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
          columnStyles: { 0: { cellWidth: 40 }, 1: { halign: "right" } },
          margin: { left: marginX, right: marginX },
        })

        y = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 6 : y + 20

        // Items per date
        const blocks = groupByDateAndSchool(rws)
        for (const block of blocks) {
          const dateTitle = formatPrettyDate(block.dateKey)

          for (const schoolBlock of block.schools) {
            autoTable(pdf, {
              startY: y,
              head: [[`${dateTitle} — ${schoolBlock.schoolLabel}`, "Total", "Delivered", "Pending", "Delayed", "Cancelled"]],
              body: schoolBlock.categories.slice(0, 25).map((c) => [
                c.categoryLabel,
                String(c.total),
                String(c.delivered),
                String(c.pending),
                String(c.delayed),
                String(c.cancelled),
              ]),
              theme: "grid",
              styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2 },
              headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: "bold" },
              columnStyles: {
                0: { cellWidth: pageWidth - marginX * 2 - 5 * 18 },
                1: { cellWidth: 18, halign: "right" },
                2: { cellWidth: 18, halign: "right" },
                3: { cellWidth: 18, halign: "right" },
                4: { cellWidth: 18, halign: "right" },
                5: { cellWidth: 18, halign: "right" },
              },
              margin: { left: marginX, right: marginX },
            })

            y = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 6 : y + 20
          }
        }
      }

      if (scopeMode === "all") {
        const title = "Delivery Summary Report"
        const byMunicipality = new Map<string, AdminDeliveryRow[]>()
        for (const r of rows) {
          const m = (r.municipality || "").trim() || "(Unknown Municipality)"
          byMunicipality.set(m, [...(byMunicipality.get(m) || []), r])
        }

        const muniList = municipalities.length ? municipalities : Array.from(byMunicipality.keys()).sort((a, b) => a.localeCompare(b))
        muniList.forEach((m, idx) => {
          if (idx > 0) pdf.addPage()
          renderReportPage(pdf, title, m, byMunicipality.get(m) || [])
        })
      } else {
        // Selected municipalities => one combined report page(s)
        const title = "Delivery Summary Report"
        const label = (() => {
          const list = selectedMunicipalities.map((m) => (m || "").trim()).filter(Boolean)
          if (list.length === 0) return "Selected Municipalities"
          if (list.length === 1) return list[0]
          const head = list.slice(0, 3).join(", ")
          return list.length > 3 ? `${head} +${list.length - 3}` : head
        })()
        renderReportPage(pdf, title, label, scopedRows)
      }

      const blob = pdf.output("blob")
      cleanupPdfUrl()
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setIsPdfOpen(true)
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate PDF")
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const downloadPdf = () => {
    if (!pdfUrl) return
    const a = document.createElement("a")
    a.href = pdfUrl
    a.download = `delivery-summary-${new Date().toISOString().slice(0, 10)}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const selectedMunicipalityLabel = useMemo(() => {
    if (scopeMode === "all") return "All Municipalities"
    if (selectedMunicipalities.length === 0) return "Select municipalities"
    if (selectedMunicipalities.length === 1) return selectedMunicipalities[0]
    return `${selectedMunicipalities.length} municipalities selected`
  }, [scopeMode, selectedMunicipalities])

  return (
    <div className="space-y-6 px-1">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-green-100 p-2.5 shadow-sm ring-1 ring-green-200">
              <Truck className="size-5 text-green-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Delivery Summary</h1>
              <p className="text-sm text-muted-foreground">
                Filter by date range and municipality scope.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <img src="/images/bhsslogo.png" alt="BHSS Logo" className="h-10 w-10 object-contain" />
          <img src="/images/bataanlogo.png" alt="Bataan Logo" className="h-10 w-10 object-contain" />
          <Button
            type="button"
            className="rounded-xl bg-green-700 hover:bg-green-800 text-white shadow-sm"
            onClick={buildPdf}
            disabled={isGeneratingPdf}
          >
            <Download className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <Dialog
        open={isPdfOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsPdfOpen(false)
            cleanupPdfUrl()
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>PDF Preview</DialogTitle>
            <DialogDescription>
              Review the generated report, then download.
            </DialogDescription>
          </DialogHeader>

          <div className="h-[65vh] w-full rounded-xl border overflow-hidden bg-muted/10">
            {pdfUrl ? (
              <iframe title="Delivery Summary PDF" src={pdfUrl} className="h-full w-full" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                No preview.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setIsPdfOpen(false)}>
              Close
            </Button>
            <Button className="rounded-xl" onClick={downloadPdf} disabled={!pdfUrl}>
              <Download className="size-4" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-green-600" />
            <CardTitle className="text-sm font-semibold text-neutral-700">Scope &amp; Filters</CardTitle>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="min-w-0 lg:col-span-3">
              <Popover open={isRangeOpen} onOpenChange={setIsRangeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-start rounded-xl"
                  >
                    <CalendarDays className="size-4" />
                    <span className="truncate">{rangeLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 rounded-xl border shadow-lg overflow-hidden"
                  align="start"
                >
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={(r) => setRange(r)}
                    numberOfMonths={2}
                    className="p-2 [--cell-size:--spacing(7)]"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-0 lg:col-span-1">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl"
                onClick={() => setRange(undefined)}
              >
                Clear
              </Button>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as any)}>
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Municipalities</SelectItem>
                  <SelectItem value="selected">Selected Municipalities</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 lg:col-span-3">
              <Popover
                open={isMunicipalitiesOpen}
                onOpenChange={setIsMunicipalitiesOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between rounded-xl"
                    disabled={scopeMode !== "selected"}
                  >
                    <span className="truncate">{selectedMunicipalityLabel}</span>
                    <span className="text-xs text-muted-foreground">{selectedMunicipalities.length}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Municipalities</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setSelectedMunicipalities([])}
                      >
                        Clear
                      </Button>
                    </div>

                    <div className="max-h-64 overflow-auto rounded-lg border p-2">
                      <div className="grid gap-2">
                        {municipalityOptions.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No municipalities found.</div>
                        ) : (
                          municipalityOptions.map((m) => {
                            const checked = selectedMunicipalities.includes(m)
                            return (
                              <label key={m} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    const isOn = v === true
                                    setSelectedMunicipalities((prev) => {
                                      if (isOn) return prev.includes(m) ? prev : [...prev, m]
                                      return prev.filter((x) => x !== m)
                                    })
                                  }}
                                />
                                <span className="truncate">{m}</span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Tip: pick multiple municipalities to compare totals.
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
            </div>

            <div className="min-w-0 lg:col-span-1">
              <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Records</CardTitle>
            <div className="rounded-xl bg-muted p-2">
              <Truck className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight text-neutral-900">{summary.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Within the selected filters</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Coverage</CardTitle>
            <div className="rounded-xl bg-muted p-2">
              <ClipboardList className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight text-neutral-900">{summary.uniqueMunicipalityCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Municipalities · {summary.uniqueSchoolCount} Schools</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-green-600">Delivered</CardTitle>
            <div className="rounded-xl bg-green-100 p-2 ring-1 ring-green-200">
              <CheckCircle2 className="size-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight text-green-800">{summary.delivered}</div>
            <p className="text-xs text-green-600/60 mt-1">Pending: {summary.pending}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-green-500" />
              Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { status: "Delivered" as const, count: summary.delivered },
                  { status: "Pending" as const, count: summary.pending },
                  { status: "Delayed" as const, count: summary.delayed },
                  { status: "Cancelled" as const, count: summary.cancelled },
                ] as const
              ).map((s) => {
                const meta = statusBadge(s.status)
                const Icon = meta.icon
                return (
                  <Badge key={s.status} className={`rounded-xl ${meta.badgeClass}`}>
                    <Icon className="mr-1 size-3.5" />
                    {meta.label}: {s.count}
                  </Badge>
                )
              })}
            </div>

            <div className="mt-4 h-64 w-full">
              {summary.total === 0 ? (
                <div className="h-full rounded-xl border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
                  No chart data.
                </div>
              ) : (
                <ReactApexChart
                  options={statusDonutOptions as any}
                  series={statusSeries as any}
                  type="donut"
                  height={260}
                />
              )}
            </div>

            {isLoading ? (
              <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-green-500" />
              Top Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <div className="text-sm text-muted-foreground">No category data.</div>
            ) : (
              <div className="grid gap-4">
                <div className="h-64 w-full">
                  <ReactApexChart
                    options={topCategoriesBarOptions as any}
                    series={topCategoriesBarSeries as any}
                    type="bar"
                    height={260}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-white shadow-sm">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-green-500" />
            Items / Equipment — Vertical List
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Grouped per date in the selected range — view items delivered per day.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : categoryTableByDateBySchool.length === 0 ? (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                No records found.
              </div>
            ) : (
              categoryTableByDateBySchool.map((block) => (
                <div key={block.dateKey} className="rounded-2xl border overflow-hidden">
                  <div className="flex items-center justify-between gap-3 bg-green-50 px-4 py-3 border-b">
                    <div className="font-semibold text-neutral-800 text-sm">{formatPrettyDate(block.dateKey)}</div>
                    <div className="text-xs text-muted-foreground bg-white border px-2 py-0.5 rounded-full">
                      {block.schools.length} school{block.schools.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  <div className="p-3 space-y-3">
                    {block.schools.map((s) => (
                      <div key={s.schoolLabel} className="rounded-xl border overflow-hidden">
                        <div className="flex items-center justify-between gap-3 bg-muted/30 px-4 py-2.5 border-b">
                          <div className="font-medium text-neutral-700 text-sm">{s.schoolLabel}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.categories.length} {s.categories.length === 1 ? "category" : "categories"}
                          </div>
                        </div>

                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="text-xs font-semibold">Category</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Total</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Delivered</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Pending</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Delayed</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Cancelled</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {s.categories.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={6}
                                  className="py-6 text-center text-sm text-muted-foreground"
                                >
                                  No categories.
                                </TableCell>
                              </TableRow>
                            ) : (
                              s.categories.map((c) => (
                                <TableRow key={c.categoryLabel} className="hover:bg-muted/20 transition-colors">
                                  <TableCell className="font-medium text-neutral-800 text-sm">{c.categoryLabel}</TableCell>
                                  <TableCell className="text-right tabular-nums text-sm font-semibold">{c.total}</TableCell>
                                  <TableCell className="text-right">
                                    <CountBadge value={c.delivered} variant="delivered" />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <CountBadge value={c.pending} variant="pending" />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <CountBadge value={c.delayed} variant="delayed" />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <CountBadge value={c.cancelled} variant="cancelled" />
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}