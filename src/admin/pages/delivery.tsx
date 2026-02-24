import { useEffect, useMemo, useState, useRef } from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  Eye,
  Image as ImageIcon,
  Search,
  Truck,
  TriangleAlert,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type DeliveryStatus = "Pending" | "Delivered" | "Delayed" | "Cancelled"

const CATEGORY_BADGE_CLASSES = [
  "bg-sky-50 text-sky-800 border-sky-200",
  "bg-emerald-50 text-emerald-800 border-emerald-200",
  "bg-violet-50 text-violet-800 border-violet-200",
  "bg-amber-50 text-amber-900 border-amber-200",
  "bg-rose-50 text-rose-900 border-rose-200",
  "bg-indigo-50 text-indigo-900 border-indigo-200",
  "bg-teal-50 text-teal-900 border-teal-200",
  "bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200",
] as const

function categoryBadgeClass(value: string) {
  const v = String(value || "").trim().toLowerCase()
  let h = 0
  for (let i = 0; i < v.length; i += 1) {
    h = (h * 31 + v.charCodeAt(i)) >>> 0
  }
  return CATEGORY_BADGE_CLASSES[h % CATEGORY_BADGE_CLASSES.length]
}

// Optimized Image Component with caching, lazy loading, and skeleton
const OptimizedImage = ({
  src,
  alt,
  className,
  containerClassName,
  onLoad,
  onError,
}: {
  src: string
  alt: string
  className?: string
  containerClassName?: string
  onLoad?: () => void
  onError?: () => void
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [cachedSrc, setCachedSrc] = useState<string>("")
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const fullUrl = src.startsWith('http') ? src : `${getApiBaseUrl()}${src}`

    setIsLoaded(false)
    setHasError(false)
    setCachedSrc(fullUrl)
  }, [src])

  return (
    <div className={`relative ${containerClassName || ''}`}>
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 animate-pulse rounded-xl bg-slate-200" />
      )}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-100">
          <ImageIcon className="size-6 text-slate-400" />
        </div>
      ) : cachedSrc ? (
        <img
          ref={imgRef}
          src={cachedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className || ''}`}
          onLoad={() => {
            setIsLoaded(true)
            onLoad?.()
          }}
          onError={() => {
            setHasError(true)
            onError?.()
          }}
        />
      ) : null}
    </div>
  )
}

type AdminDeliveryRow = {
  id: string
  dateKey: string
  municipality: string
  school: string
  hlaManagerName?: string
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

function statusMeta(status: DeliveryStatus) {
  if (status === "Delivered") {
    return {
      label: "Delivered",
      icon: CheckCircle2,
      badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    }
  }
  if (status === "Delayed") {
    return {
      label: "Delayed",
      icon: TriangleAlert,
      badgeClass: "bg-amber-50 text-amber-800 border border-amber-200",
    }
  }
  if (status === "Cancelled") {
    return {
      label: "Cancelled",
      icon: XCircle,
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
    }
  }
  return {
    label: "Pending",
    icon: Clock,
    badgeClass: "bg-muted text-foreground border",
  }
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AdminDelivery() {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: today, to: today }
  })
  const [isRangeOpen, setIsRangeOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"newest" | "oldest">("newest")

  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("all")
  const [selectedSchool, setSelectedSchool] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const [rows, setRows] = useState<AdminDeliveryRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [viewDetails, setViewDetails] = useState<AdminDeliveryRow | null>(null)
  const [viewImages, setViewImages] = useState<AdminDeliveryRow | null>(null)
  const [imagePreviewIndex, setImagePreviewIndex] = useState<number | null>(null)

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null)
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)

  useEffect(() => {
    return () => {
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl)
    }
  }, [pdfObjectUrl])

  const toDataUrl = async (absoluteUrl: string) => {
    const res = await fetch(absoluteUrl)
    if (!res.ok) throw new Error("Failed to fetch image")
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.readAsDataURL(blob)
    })
  }

  const buildPdfForRow = async (row: AdminDeliveryRow) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 40

    doc.setFontSize(16)
    doc.text("Delivery Record", margin, margin)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 18)

    const details: Array<[string, string]> = [
      ["Date", row.dateKey],
      ["Municipality", row.municipality],
      ["School", row.school],
      ["Uploaded By", String(row.hlaManagerName || "") || "N/A"],
      ["Category", row.categoryLabel],
      ["Status", row.status],
      ["Uploaded At", formatDateTime(row.uploadedAt)],
      ["Reason", row.statusReason || "N/A"],
      ["Remarks", row.remarks || "N/A"],
      ["Concerns", row.concerns.length ? row.concerns.join(", ") : "N/A"],
      ["Images", String(row.images.length)],
    ]

    autoTable(doc, {
      startY: margin + 34,
      head: [["Field", "Value"]],
      body: details,
      styles: { fontSize: 10, cellPadding: 6, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: pageWidth - margin * 2 - 140 } },
      margin: { left: margin, right: margin },
    })

    doc.addPage()
    doc.setFontSize(14)
    doc.text("Uploaded Images", margin, margin)
    doc.setFontSize(10)
    doc.text("Two-column layout", margin, margin + 16)

    const colGap = 16
    const colWidth = (pageWidth - margin * 2 - colGap) / 2
    const cellHeight = 170
    const imgMaxHeight = 130
    const imgMaxWidth = colWidth

    let x = margin
    let y = margin + 32
    let col = 0

    for (const img of row.images) {
      const absUrl = `${getApiBaseUrl()}${img.url}`
      let dataUrl = ""
      try {
        dataUrl = await toDataUrl(absUrl)
      } catch {
        dataUrl = ""
      }

      if (y + cellHeight > pageHeight - margin) {
        doc.addPage()
        y = margin
        x = margin
        col = 0
      }

      doc.setDrawColor(226)
      doc.roundedRect(x, y, colWidth, cellHeight, 8, 8)

      if (dataUrl) {
        const props = doc.getImageProperties(dataUrl as any)
        const iw = props.width || 1
        const ih = props.height || 1
        const scale = Math.min(imgMaxWidth / iw, imgMaxHeight / ih)
        const w = iw * scale
        const h = ih * scale
        const ix = x + (colWidth - w) / 2
        const iy = y + 12 + (imgMaxHeight - h) / 2
        doc.addImage(dataUrl, ix, iy, w, h)
      } else {
        doc.setFontSize(10)
        doc.setTextColor(120)
        doc.text("Image unavailable", x + 12, y + 24)
        doc.setTextColor(0)
      }

      doc.setFontSize(9)
      const label = img.filename || "image"
      const clipped = label.length > 44 ? `${label.slice(0, 41)}...` : label
      doc.text(clipped, x + 12, y + cellHeight - 16, { maxWidth: colWidth - 24 })

      col += 1
      if (col === 2) {
        col = 0
        x = margin
        y += cellHeight + 16
      } else {
        x = margin + colWidth + colGap
      }
    }

    return doc
  }

  const handleExportPdf = async (row: AdminDeliveryRow) => {
    setIsPdfGenerating(true)
    try {
      const doc = await buildPdfForRow(row)
      const blob = doc.output("blob")
      const nextUrl = URL.createObjectURL(blob)

      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl)
      setPdfObjectUrl(nextUrl)
      setPdfPreviewOpen(true)
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate PDF")
    } finally {
      setIsPdfGenerating(false)
    }
  }

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
        toast.error(e?.message || "Failed to load delivery records")
        setRows([])
      } finally {
        setIsLoading(false)
      }
    }, 250)

    return () => clearTimeout(t)
  }, [range?.from, range?.to, search, sort])

  useEffect(() => {
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<any>
      const record = e?.detail?.record
      const user = e?.detail?.user
      if (!record) return

      const dateKey = String(record.dateKey || "")
      const fromKey = range?.from ? format(range.from, "yyyy-MM-dd") : ""
      const toKey = range?.to ? format(range.to, "yyyy-MM-dd") : ""
      if (fromKey && dateKey < fromKey) return
      if (toKey && dateKey > toKey) return

      const nextRow: AdminDeliveryRow = {
        id: String(record.id || ""),
        dateKey,
        municipality: String(user?.municipality || ""),
        school: String(user?.school || ""),
        hlaManagerName: String(user?.hlaManagerName || user?.name || ""),
        categoryKey: String(record.categoryKey || ""),
        categoryLabel: String(record.categoryLabel || ""),
        status: (record.status as any) || "Pending",
        statusReason: String(record.statusReason || ""),
        uploadedAt: String(record.uploadedAt || new Date().toISOString()),
        images: Array.isArray(record.images) ? record.images : [],
        concerns: Array.isArray(record.concerns) ? record.concerns : [],
        remarks: String(record.remarks || ""),
      }

      setRows((prev) => {
        const existingIdx = prev.findIndex((r) => r.id === nextRow.id)
        if (existingIdx >= 0) {
          const copy = [...prev]
          copy[existingIdx] = nextRow
          return copy
        }
        return [nextRow, ...prev]
      })
      setCurrentPage(1)
    }

    window.addEventListener("delivery:saved", handler)
    return () => window.removeEventListener("delivery:saved", handler)
  }, [range?.from, range?.to])

  const stats = useMemo(() => {
    const total = rows.length
    const delivered = rows.filter((r) => r.status === "Delivered").length
    const withIssues = rows.filter((r) => r.status === "Delayed" || r.status === "Cancelled").length
    return { total, delivered, withIssues }
  }, [rows])

  const municipalityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const m = (r.municipality || "").trim()
      if (m) set.add(m)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const schoolOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (selectedMunicipality !== "all" && r.municipality !== selectedMunicipality) continue
      const s = (r.school || "").trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows, selectedMunicipality])

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      if (selectedMunicipality !== "all" && r.municipality !== selectedMunicipality) continue
      if (selectedSchool !== "all" && r.school !== selectedSchool) continue
      const key = String(r.categoryKey || "").trim() || String(r.categoryLabel || "").trim()
      const label = String(r.categoryLabel || "").trim() || key
      if (!key) continue
      map.set(key, label)
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows, selectedMunicipality, selectedSchool])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedMunicipality !== "all" && r.municipality !== selectedMunicipality) return false
      if (selectedSchool !== "all" && r.school !== selectedSchool) return false
      if (selectedCategory !== "all" && r.categoryKey !== selectedCategory) return false
      return true
    })
  }, [rows, selectedMunicipality, selectedSchool, selectedCategory])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / pageSize))
  }, [filteredRows.length])

  const pagedRows = useMemo(() => {
    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [currentPage, filteredRows, totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [range?.from, range?.to, search, sort, selectedMunicipality, selectedSchool, selectedCategory])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const rangeLabel = useMemo(() => {
    if (!range?.from && !range?.to) return "Select range"
    if (range?.from && !range?.to) return format(range.from, "MMM dd, yyyy")
    if (range?.from && range?.to) {
      return `${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`
    }
    return "Select range"
  }, [range])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="size-6" />
            Delivery
          </h1>
          <p className="text-sm text-muted-foreground">
            Review delivery uploads across all municipalities and schools.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Total Records</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <Truck className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.total}</div>
            <div className="mt-2 text-xs text-neutral-500">In the selected range</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Delivered</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <CheckCircle2 className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.delivered}</div>
            <div className="mt-2 text-xs text-neutral-500">Status: Delivered</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Needs Attention</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <TriangleAlert className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.withIssues}</div>
            <div className="mt-2 text-xs text-neutral-500">Delayed or Cancelled</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Records</CardTitle>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="min-w-0 lg:col-span-2">
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
              <Select
                value={selectedMunicipality}
                onValueChange={(v) => {
                  setSelectedMunicipality(v)
                  setSelectedSchool("all")
                  setSelectedCategory("all")
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="Municipality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Municipalities</SelectItem>
                  {municipalityOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <Select value={selectedSchool} onValueChange={(v) => setSelectedSchool(v)}>
                <SelectTrigger
                  className="h-10 w-full rounded-xl min-w-0"
                  disabled={selectedMunicipality === "all"}
                >
                  <SelectValue placeholder="School" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schoolOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v)}>
                <SelectTrigger
                  className="h-10 w-full rounded-xl min-w-0"
                >
                  <SelectValue placeholder="Materials/Goods" />
                </SelectTrigger>
                <SelectContent key={`${selectedMunicipality}-${selectedSchool}`}>
                  <SelectItem value="all">All Materials/Goods</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
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

          <div className="flex justify-end">
            <div className="text-sm text-muted-foreground">
              Showing {pagedRows.length} of {filteredRows.length} (Total: {rows.length})
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Municipality</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>HLA Manager</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded At</TableHead>
                  <TableHead>Images</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRows.map((r) => {
                    const meta = statusMeta(r.status)
                    const StatusIcon = meta.icon
                    const hasConcerns = Array.isArray(r.concerns) && r.concerns.length > 0
                    return (
                      <TableRow
                        key={r.id}
                        className={
                          hasConcerns
                            ? "bg-yellow-50 hover:bg-yellow-100"
                            : ""
                        }
                      >
                        <TableCell className="whitespace-nowrap">{r.dateKey}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.municipality}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{r.school}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{r.hlaManagerName || ""}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`rounded-xl border ${categoryBadgeClass(r.categoryKey || r.categoryLabel)}`}
                            title={r.categoryLabel}
                          >
                            {r.categoryLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`rounded-xl ${meta.badgeClass}`}>
                            <StatusIcon className="mr-1 size-3.5" />
                            {meta.label}
                          </Badge>
                          {(r.status === "Cancelled" || r.status === "Delayed") && r.statusReason && (
                            <div className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
                              {r.statusReason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(r.uploadedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.images.length}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              className="h-8 rounded-lg px-2 text-xs bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900"
                              onClick={() => setViewDetails(r)}
                            >
                              <Eye className="mr-1 size-3.5" />
                              Details
                            </Button>

                            <Button
                              variant="outline"
                              className="h-8 rounded-lg px-2 text-xs bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100 hover:text-sky-900"
                              disabled={r.images.length === 0}
                              onClick={() => {
                                setViewImages(r)
                                setImagePreviewIndex(null)
                              }}
                            >
                              <ImageIcon className="mr-1 size-3.5" />
                              Images
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {filteredRows.length > pageSize && (
            <div className="mt-4 flex justify-end">
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }}
                      aria-disabled={currentPage === 1}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={page === currentPage}
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentPage(page)
                        }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }}
                      aria-disabled={currentPage === totalPages}
                      className={
                        currentPage === totalPages ? "pointer-events-none opacity-50" : ""
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewDetails} onOpenChange={(open) => !open && setViewDetails(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Details</DialogTitle>
            <DialogDescription>Full details for this upload.</DialogDescription>
          </DialogHeader>

          {viewDetails ? (
            <div className="grid gap-4">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{viewDetails.dateKey}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Municipality</span>
                  <span className="font-medium">{viewDetails.municipality}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">School</span>
                  <span className="font-medium text-right">{viewDetails.school}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Uploaded By</span>
                  <span className="font-medium text-right">{viewDetails.hlaManagerName || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium">{viewDetails.categoryLabel}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Status</Label>
                <div>
                  {(() => {
                    const meta = statusMeta(viewDetails.status)
                    const StatusIcon = meta.icon
                    return (
                      <Badge className={`rounded-xl ${meta.badgeClass}`}>
                        <StatusIcon className="mr-1 size-3.5" />
                        {meta.label}
                      </Badge>
                    )
                  })()}
                </div>
              </div>

              {(viewDetails.status === "Cancelled" || viewDetails.status === "Delayed") && (
                <div className="grid gap-1">
                  <Label>Reason</Label>
                  <div className="rounded-xl border bg-muted/10 p-3 text-sm whitespace-pre-wrap break-words">
                    {viewDetails.statusReason || "N/A"}
                  </div>
                </div>
              )}

              <div className="grid gap-1">
                <Label>Remarks</Label>
                <div className="rounded-xl border bg-muted/10 p-3 text-sm whitespace-pre-wrap break-words">
                  {viewDetails.remarks || "N/A"}
                </div>
              </div>

              <div className="grid gap-1">
                <Label>Concerns</Label>
                {viewDetails.concerns.length === 0 ? (
                  <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">N/A</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {viewDetails.concerns.map((c) => (
                      <Badge key={c} className="rounded-xl bg-muted text-foreground border">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            {viewDetails ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => handleExportPdf(viewDetails)}
                disabled={isPdfGenerating}
              >
                <FileDown className="size-4" />
                {isPdfGenerating ? "Generating" : "Export PDF"}
              </Button>
            ) : null}
            <Button variant="outline" className="rounded-xl" onClick={() => setViewDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pdfPreviewOpen}
        onOpenChange={(open) => {
          setPdfPreviewOpen(open)
          if (!open) {
            if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl)
            setPdfObjectUrl(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>PDF Preview</DialogTitle>
            <DialogDescription>Review the PDF and download it.</DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/10 overflow-hidden h-[65vh]">
            {pdfObjectUrl ? (
              <iframe title="PDF Preview" src={pdfObjectUrl} className="h-full w-full" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                No preview.
              </div>
            )}
          </div>

          <DialogFooter>
            {pdfObjectUrl ? (
              <a href={pdfObjectUrl} download className="w-full sm:w-auto">
                <Button type="button" className="rounded-xl w-full sm:w-auto">
                  <FileDown className="size-4" />
                  Download
                </Button>
              </a>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setPdfPreviewOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewImages && imagePreviewIndex === null}
        onOpenChange={(open) => {
          if (!open) {
            setViewImages(null)
            setImagePreviewIndex(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Images</DialogTitle>
            <DialogDescription>Click an image to preview.</DialogDescription>
          </DialogHeader>

          {viewImages ? (
            viewImages.images.length === 0 ? (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                No images.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {viewImages.images.map((img, idx) => (
                  <button
                    key={img.filename}
                    type="button"
                    className="overflow-hidden rounded-xl border bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setImagePreviewIndex(idx)}
                  >
                    <OptimizedImage
                      src={img.url}
                      alt={img.filename}
                      containerClassName="h-32 w-full"
                      className="h-32 w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setViewImages(null)
                setImagePreviewIndex(null)
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewImages && imagePreviewIndex !== null}
        onOpenChange={(open) => {
          if (!open) setImagePreviewIndex(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-hidden p-0">
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader className="px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
              <DialogTitle>Image Preview</DialogTitle>
              <DialogDescription>Use Prev/Next to navigate.</DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 px-4 sm:px-6">
              {(() => {
                if (!viewImages || imagePreviewIndex === null) {
                  return (
                    <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                      No image.
                    </div>
                  )
                }

                const img = viewImages.images[imagePreviewIndex]
                if (!img) {
                  return (
                    <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                      No image.
                    </div>
                  )
                }

                const canPrev = imagePreviewIndex > 0
                const canNext = imagePreviewIndex < viewImages.images.length - 1

                return (
                  <div className="flex h-full flex-col gap-3">
                    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border bg-black/90">
                      <OptimizedImage
                        src={img.url}
                        alt={img.filename}
                        containerClassName="w-full h-full"
                        className="h-full w-full object-contain"
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-muted-foreground truncate">
                        {img.filename + ` (${imagePreviewIndex + 1}/${viewImages.images.length})`}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl"
                          disabled={!canPrev}
                          onClick={() =>
                            setImagePreviewIndex((i) => (i === null ? i : Math.max(0, i - 1)))
                          }
                        >
                          <ChevronLeft className="size-4" />
                          Prev
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl"
                          disabled={!canNext}
                          onClick={() =>
                            setImagePreviewIndex((i) =>
                              i === null ? i : Math.min(viewImages.images.length - 1, i + 1)
                            )
                          }
                        >
                          Next
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <DialogFooter className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
              <Button variant="outline" className="rounded-xl" onClick={() => setImagePreviewIndex(null)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
