import { useEffect, useMemo, useState, useRef, useCallback } from "react"
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
  ZoomIn,
} from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
] as const

function categoryBadgeClass(value: string) {
  const v = String(value || "").trim().toLowerCase()
  let h = 0
  for (let i = 0; i < v.length; i += 1) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return CATEGORY_BADGE_CLASSES[h % CATEGORY_BADGE_CLASSES.length]
}

// ─── Optimized Image Component ───────────────────────────────────────────────
// Key optimisations:
//  1. IntersectionObserver – only starts loading when the thumbnail enters the
//     viewport (true lazy loading, not just the browser hint).
//  2. Animated skeleton while loading.
//  3. Graceful error state.
//  4. decoding="async" so the main thread isn't blocked.
//  5. Priority prop to eagerly load the first visible image in the lightbox.
const LazyImage = ({
  src,
  alt,
  className,
  containerClassName,
  priority = false,
}: {
  src: string
  alt: string
  className?: string
  containerClassName?: string
  priority?: boolean
}) => {
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    priority ? "loading" : "idle"
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const fullUrl = src.startsWith("http") ? src : `${getApiBaseUrl()}${src}`

  useEffect(() => {
    if (priority) return // already "loading" from initial state

    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStatus("loading")
          observer.disconnect()
        }
      },
      { rootMargin: "200px" } // start loading 200px before it enters viewport
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [priority])

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${containerClassName ?? ""}`}>
      {/* Skeleton */}
      {status !== "loaded" && status !== "error" && (
        <div className="absolute inset-0 animate-pulse rounded-xl bg-gray-100" />
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-gray-50 text-gray-300">
          <ImageIcon className="size-6" />
          <span className="text-[10px]">Failed</span>
        </div>
      )}

      {/* Actual image – only rendered when we're ready to load */}
      {(status === "loading" || status === "loaded") && (
        <img
          src={fullUrl}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={`transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          } ${className ?? ""}`}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
// Extracted into its own component so re-renders from navigation don't cause
// the whole dialog to remount. Also pre-loads the adjacent images so next/prev
// feel instant.
const Lightbox = ({
  images,
  index,
  onClose,
  onNav,
}: {
  images: Array<{ url: string; filename: string }>
  index: number
  onClose: () => void
  onNav: (i: number) => void
}) => {
  const img = images[index]
  if (!img) return null

  const canPrev = index > 0
  const canNext = index < images.length - 1

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canPrev) onNav(index - 1)
      if (e.key === "ArrowRight" && canNext) onNav(index + 1)
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [index, canPrev, canNext, onNav, onClose])

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Main image */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-gray-950">
        <LazyImage
          key={img.url} // remount on navigation so skeleton resets
          src={img.url}
          alt={img.filename}
          containerClassName="w-full h-full"
          className="h-full w-full object-contain"
          priority
        />
        {/* Pre-load neighbours invisibly */}
        {canNext && (
          <img
            src={images[index + 1].url.startsWith("http")
              ? images[index + 1].url
              : `${getApiBaseUrl()}${images[index + 1].url}`}
            alt=""
            className="sr-only"
            aria-hidden
          />
        )}
        {canPrev && (
          <img
            src={images[index - 1].url.startsWith("http")
              ? images[index - 1].url
              : `${getApiBaseUrl()}${images[index - 1].url}`}
            alt=""
            className="sr-only"
            aria-hidden
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 truncate text-xs text-gray-400">
          {img.filename} &nbsp;·&nbsp; {index + 1} / {images.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onNav(index - 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Prev
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onNav(index + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Thumbnail Grid ───────────────────────────────────────────────────────────
// Renders images in a virtualised-style grid: only VISIBLE_BATCH images are
// rendered at a time; more are added as the user scrolls the container.
const BATCH_SIZE = 12

const ThumbnailGrid = ({
  images,
  onSelect,
}: {
  images: Array<{ url: string; filename: string }>
  onSelect: (i: number) => void
}) => {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisibleCount(BATCH_SIZE) // reset when images change
  }, [images])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, images.length))
        }
      },
      { rootMargin: "100px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [images.length])

  const visible = images.slice(0, visibleCount)

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
      {visible.map((img, idx) => (
        <button
          key={`${img.filename}-${idx}`}
          type="button"
          onClick={() => onSelect(idx)}
          className="group relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50 transition-all hover:border-green-200 hover:shadow-md"
        >
          <LazyImage
            src={img.url}
            alt={img.filename}
            containerClassName="h-28 w-full"
            className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20">
            <ZoomIn className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100 drop-shadow" />
          </div>
          <p className="truncate px-2 py-1.5 text-[11px] text-gray-400">{img.filename}</p>
        </button>
      ))}

      {/* Sentinel – triggers next batch */}
      {visibleCount < images.length && (
        <div ref={sentinelRef} className="col-span-full py-3 text-center text-xs text-gray-400">
          Loading more…
        </div>
      )}
    </div>
  )
}

// ─── Types & helpers ──────────────────────────────────────────────────────────
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
    return (JSON.parse(raw) as { token?: string })?.token || null
  } catch { return null }
}

async function apiFetch(path: string) {
  const token = getAuthToken()
  if (!token) throw new Error("Not authenticated")
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.message || "Request failed")
  return data
}

function statusMeta(status: DeliveryStatus) {
  if (status === "Delivered") return { label: "Delivered", icon: CheckCircle2, badgeClass: "bg-green-50 text-green-700 border border-green-200" }
  if (status === "Delayed")   return { label: "Delayed",   icon: TriangleAlert, badgeClass: "bg-amber-50 text-amber-700 border border-amber-200" }
  if (status === "Cancelled") return { label: "Cancelled", icon: XCircle,       badgeClass: "bg-red-50 text-red-600 border border-red-200" }
  return                             { label: "Pending",   icon: Clock,          badgeClass: "bg-gray-100 text-gray-600 border border-gray-200" }
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// ─── Main Component ───────────────────────────────────────────────────────────
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
    return () => { if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl) }
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
      headStyles: { fillColor: [22, 163, 74], textColor: 255 },
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

    let x = margin, y = margin + 32, col = 0

    for (const img of row.images) {
      const absUrl = `${getApiBaseUrl()}${img.url}`
      let dataUrl = ""
      try { dataUrl = await toDataUrl(absUrl) } catch { dataUrl = "" }

      if (y + cellHeight > pageHeight - margin) {
        doc.addPage(); y = margin; x = margin; col = 0
      }

      doc.setDrawColor(226)
      doc.roundedRect(x, y, colWidth, cellHeight, 8, 8)

      if (dataUrl) {
        const props = doc.getImageProperties(dataUrl as any)
        const iw = props.width || 1, ih = props.height || 1
        const scale = Math.min(imgMaxWidth / iw, imgMaxHeight / ih)
        const w = iw * scale, h = ih * scale
        doc.addImage(dataUrl, x + (colWidth - w) / 2, y + 12 + (imgMaxHeight - h) / 2, w, h)
      } else {
        doc.setFontSize(10); doc.setTextColor(120)
        doc.text("Image unavailable", x + 12, y + 24); doc.setTextColor(0)
      }

      doc.setFontSize(9)
      const label = img.filename || "image"
      doc.text(label.length > 44 ? `${label.slice(0, 41)}...` : label, x + 12, y + cellHeight - 16, { maxWidth: colWidth - 24 })

      col += 1
      if (col === 2) { col = 0; x = margin; y += cellHeight + 16 }
      else { x = margin + colWidth + colGap }
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
        const data = (await apiFetch(`/api/admin/delivery/history?${qs.toString()}`)) as { records?: AdminDeliveryRow[] }
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
          const copy = [...prev]; copy[existingIdx] = nextRow; return copy
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
    for (const r of rows) { const m = (r.municipality || "").trim(); if (m) set.add(m) }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const schoolOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (selectedMunicipality !== "all" && r.municipality !== selectedMunicipality) continue
      const s = (r.school || "").trim(); if (s) set.add(s)
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
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows, selectedMunicipality, selectedSchool])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedMunicipality !== "all" && r.municipality !== selectedMunicipality) return false
      if (selectedSchool !== "all" && r.school !== selectedSchool) return false
      if (selectedCategory !== "all" && r.categoryKey !== selectedCategory) return false
      return true
    })
  }, [rows, selectedMunicipality, selectedSchool, selectedCategory])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / pageSize)), [filteredRows.length])
  const pagedRows = useMemo(() => {
    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    return filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  }, [currentPage, filteredRows, totalPages])

  useEffect(() => { setCurrentPage(1) }, [range?.from, range?.to, search, sort, selectedMunicipality, selectedSchool, selectedCategory])
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages) }, [currentPage, totalPages])

  const rangeLabel = useMemo(() => {
    if (!range?.from && !range?.to) return "Select range"
    if (range?.from && !range?.to) return format(range.from, "MMM dd, yyyy")
    if (range?.from && range?.to) return `${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`
    return "Select range"
  }, [range])

  const handleLightboxNav = useCallback((i: number) => setImagePreviewIndex(i), [])
  const handleLightboxClose = useCallback(() => {
    setImagePreviewIndex(null)
    setViewImages(null)
  }, [])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="space-y-6 min-w-0 overflow-x-hidden bg-gradient-to-br from-green-50 via-white to-teal-50/30 min-h-screen px-4 py-8 sm:px-6 lg:px-8"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Nunito', sans-serif" }}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-green-700">
            <Truck className="size-3" />
            Delivery Management
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-800 sm:text-4xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Delivery
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review delivery uploads across all municipalities and schools.
          </p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Total Records", value: stats.total, sub: "In the selected range", icon: Truck, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Delivered", value: stats.delivered, sub: "Status: Delivered", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
          { label: "Needs Attention", value: stats.withIssues, sub: "Delayed or Cancelled", icon: TriangleAlert, color: "text-amber-600", bg: "bg-amber-50" },
        ].map((card) => (
          <div key={card.label} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{card.label}</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-gray-800">{card.value}</p>
                <p className="mt-1 text-xs text-gray-400">{card.sub}</p>
              </div>
              <div className={`grid size-11 place-items-center rounded-xl ${card.bg} ${card.color}`}>
                <card.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Records Table Card ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Filters */}
        <div className="border-b border-gray-100 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Records</h2>
            <p className="text-xs text-gray-400">
              Showing {pagedRows.length} of {filteredRows.length}
              {rows.length !== filteredRows.length ? ` (Total: ${rows.length})` : ""}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            {/* Date range */}
            <div className="min-w-0 lg:col-span-3">
              <Popover open={isRangeOpen} onOpenChange={setIsRangeOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800"
                  >
                    <CalendarDays className="size-4 shrink-0 text-gray-400" />
                    <span className="truncate">{rangeLabel}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl border shadow-lg overflow-hidden" align="start">
                  <Calendar mode="range" selected={range} onSelect={(r) => setRange(r)} numberOfMonths={2} className="p-2 [--cell-size:--spacing(7)]" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-0 lg:col-span-1">
              <button type="button" onClick={() => setRange(undefined)}
                className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700">
                Clear
              </button>
            </div>

            {/* Municipality */}
            <div className="min-w-0 lg:col-span-2">
              <Select value={selectedMunicipality} onValueChange={(v) => { setSelectedMunicipality(v); setSelectedSchool("all"); setSelectedCategory("all") }}>
                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm">
                  <SelectValue placeholder="Municipality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Municipalities</SelectItem>
                  {municipalityOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* School */}
            <div className="min-w-0 lg:col-span-2">
              <Select value={selectedSchool} onValueChange={(v) => setSelectedSchool(v)} disabled={selectedMunicipality === "all"}>
                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm">
                  <SelectValue placeholder="School" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schoolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="min-w-0 lg:col-span-2">
              <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v)}>
                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm">
                  <SelectValue placeholder="Materials/Goods" />
                </SelectTrigger>
                <SelectContent key={`${selectedMunicipality}-${selectedSchool}`}>
                  <SelectItem value="all">All Materials/Goods</SelectItem>
                  {categoryOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="min-w-0 lg:col-span-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-300" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 placeholder-gray-300 outline-none transition-all focus:border-green-400 focus:ring-2 focus:ring-green-100"
                />
              </div>
            </div>

            {/* Sort */}
            <div className="min-w-0 lg:col-span-1">
              <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80 border-b border-gray-100">
                {["Date", "Municipality", "School", "HLA Manager", "Category", "Status", "Uploaded At", "Images", "Action"].map((h, i) => (
                  <TableHead key={h} className={`text-xs font-bold uppercase tracking-wider text-gray-400 ${i === 8 ? "text-right" : ""}`}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="size-6 animate-spin rounded-full border-2 border-gray-100 border-t-green-500" />
                      <span className="text-sm">Loading records…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Truck className="size-8 text-gray-200" />
                      <span className="text-sm">No records found.</span>
                    </div>
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
                      className={`border-b border-gray-50 transition-colors ${hasConcerns ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-gray-50/50"}`}
                    >
                      <TableCell className="whitespace-nowrap text-sm text-gray-700">{r.dateKey}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-700">{r.municipality}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-gray-700">{r.school}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-gray-500">{r.hlaManagerName || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${categoryBadgeClass(r.categoryKey || r.categoryLabel)}`} title={r.categoryLabel}>
                          {r.categoryLabel}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                          <StatusIcon className="size-3" />
                          {meta.label}
                        </span>
                        {(r.status === "Cancelled" || r.status === "Delayed") && r.statusReason && (
                          <p className="mt-1 text-[11px] text-gray-400 whitespace-normal break-words">{r.statusReason}</p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-500">{formatDateTime(r.uploadedAt)}</TableCell>
                      <TableCell className="text-sm text-gray-700">{r.images.length}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewDetails(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition-all hover:bg-green-100"
                          >
                            <Eye className="size-3.5" /> Details
                          </button>
                          <button
                            type="button"
                            disabled={r.images.length === 0}
                            onClick={() => { setViewImages(r); setImagePreviewIndex(null) }}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-all hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ImageIcon className="size-3.5" /> Images
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filteredRows.length > pageSize && (
          <div className="border-t border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`inline-flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                      page === currentPage
                        ? "bg-green-600 text-white shadow-sm shadow-green-200"
                        : "border border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Details Dialog ── */}
      <Dialog open={!!viewDetails} onOpenChange={(open) => !open && setViewDetails(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
          <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
            <DialogTitle className="text-base font-bold text-gray-800">Record Details</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">Full details for this upload.</DialogDescription>
          </DialogHeader>

          {viewDetails && (
            <div className="grid gap-4 px-6 py-5">
              <div className="grid gap-2.5 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                {[
                  ["Date", viewDetails.dateKey],
                  ["Municipality", viewDetails.municipality],
                  ["School", viewDetails.school],
                  ["Uploaded By", viewDetails.hlaManagerName || "N/A"],
                  ["Category", viewDetails.categoryLabel],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-0.5">{label}</span>
                    <span className="text-sm font-medium text-gray-700 text-right">{value}</span>
                  </div>
                ))}
              </div>

              <div className="grid gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Status</p>
                {(() => {
                  const meta = statusMeta(viewDetails.status)
                  const StatusIcon = meta.icon
                  return (
                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>
                      <StatusIcon className="size-3.5" /> {meta.label}
                    </span>
                  )
                })()}
              </div>

              {(viewDetails.status === "Cancelled" || viewDetails.status === "Delayed") && (
                <div className="grid gap-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Reason</p>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {viewDetails.statusReason || "N/A"}
                  </div>
                </div>
              )}

              <div className="grid gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Remarks</p>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {viewDetails.remarks || "N/A"}
                </div>
              </div>

              <div className="grid gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Concerns</p>
                {viewDetails.concerns.length === 0 ? (
                  <p className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-400">N/A</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {viewDetails.concerns.map((c) => (
                      <span key={c} className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 px-6 py-4">
            <div className="flex items-center justify-end gap-2">
              {viewDetails && (
                <button
                  type="button"
                  onClick={() => handleExportPdf(viewDetails)}
                  disabled={isPdfGenerating}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800 disabled:opacity-60"
                >
                  <FileDown className="size-4" />
                  {isPdfGenerating ? "Generating…" : "Export PDF"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewDetails(null)}
                className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── PDF Preview Dialog ── */}
      <Dialog
        open={pdfPreviewOpen}
        onOpenChange={(open) => {
          setPdfPreviewOpen(open)
          if (!open) { if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl); setPdfObjectUrl(null) }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-800">PDF Preview</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">Review the PDF and download it.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-gray-100 overflow-hidden h-[65vh]">
            {pdfObjectUrl
              ? <iframe title="PDF Preview" src={pdfObjectUrl} className="h-full w-full" />
              : <div className="h-full w-full flex items-center justify-center text-sm text-gray-400">No preview.</div>
            }
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            {pdfObjectUrl && (
              <a href={pdfObjectUrl} download className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500">
                <FileDown className="size-4" /> Download
              </a>
            )}
            <button type="button" onClick={() => setPdfPreviewOpen(false)}
              className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Image Thumbnail Grid Dialog ── */}
      <Dialog
        open={!!viewImages && imagePreviewIndex === null}
        onOpenChange={(open) => { if (!open) { setViewImages(null); setImagePreviewIndex(null) } }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
          <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
            <DialogTitle className="text-base font-bold text-gray-800">
              Images
              {viewImages && (
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                  {viewImages.images.length}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Click an image to open full preview. Images load as you scroll.
            </DialogDescription>
          </DialogHeader>

          <div className="p-5">
            {viewImages ? (
              viewImages.images.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-gray-400">
                  <ImageIcon className="size-8 text-gray-200" />
                  <span className="text-sm">No images uploaded.</span>
                </div>
              ) : (
                <ThumbnailGrid
                  images={viewImages.images}
                  onSelect={(i) => setImagePreviewIndex(i)}
                />
              )
            ) : null}
          </div>

          <div className="border-t border-gray-100 px-6 py-4">
            <button type="button" onClick={() => { setViewImages(null); setImagePreviewIndex(null) }}
              className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Lightbox Dialog ── */}
      <Dialog
        open={!!viewImages && imagePreviewIndex !== null}
        onOpenChange={(open) => { if (!open) setImagePreviewIndex(null) }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader className="border-b border-gray-100 px-5 pb-3 pt-5">
              <DialogTitle className="text-sm font-bold text-gray-800">Image Preview</DialogTitle>
              <DialogDescription className="text-xs text-gray-400">
                Use arrow keys or Prev / Next to navigate.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 px-5 py-4">
              {viewImages && imagePreviewIndex !== null ? (
                <Lightbox
                  images={viewImages.images}
                  index={imagePreviewIndex}
                  onNav={handleLightboxNav}
                  onClose={handleLightboxClose}
                />
              ) : null}
            </div>

            <div className="border-t border-gray-100 px-5 py-3">
              <button type="button" onClick={() => setImagePreviewIndex(null)}
                className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300">
                ← Back to grid
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}