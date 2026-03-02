import { useCallback, useEffect, useRef, useMemo, useState } from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import {
    AlertTriangle,
    Building2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Download,
    Eye,
    Image as ImageIcon,
    MapPin,
    Search,
    Tag,
    Truck,
    X,
    XCircle,
} from "lucide-react"

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// ─── Types ────────────────────────────────────────────────────────────────────

type DeliveryStatus = "Pending" | "Delivered" | "Delayed" | "Cancelled"

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.message || "Request failed")
    return data
}

function statusBadgeClass(status: DeliveryStatus) {
    if (status === "Delivered") return "bg-green-50 text-green-700 border-green-200"
    if (status === "Delayed") return "bg-amber-50 text-amber-700 border-amber-200"
    if (status === "Cancelled") return "bg-red-50 text-red-600 border-red-200"
    return "bg-teal-50 text-teal-700 border-teal-200"
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
    try {
        const url = src.startsWith("http") ? src : `${window.location.origin}${src}`
        const res = await fetch(url)
        if (!res.ok) return null
        const blob = await res.blob()
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onerror = () => reject(new Error("Failed"))
            reader.onload = () => resolve(String(reader.result || ""))
            reader.readAsDataURL(blob)
        })
    } catch {
        return null
    }
}

// ─── Thumbnail Grid (virtualised batch loading) ───────────────────────────────

const BATCH_SIZE = 12

function ThumbnailGrid({
    images,
    onSelect,
}: {
    images: Array<{ url: string; filename: string }>
    onSelect: (i: number) => void
}) {
    const [visible, setVisible] = useState(BATCH_SIZE)
    const sentinel = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = sentinel.current
        if (!el) return
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) setVisible((v) => Math.min(v + BATCH_SIZE, images.length))
        }, { threshold: 0.1 })
        obs.observe(el)
        return () => obs.disconnect()
    }, [images.length])

    return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.slice(0, visible).map((img, i) => (
                <button
                    key={i}
                    type="button"
                    onClick={() => onSelect(i)}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm transition-all hover:border-amber-300 hover:shadow-md focus:outline-none"
                >
                    <img
                        src={`${getApiBaseUrl()}${img.url}`}
                        alt={img.filename}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20">
                        <Eye className="size-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
                    </div>
                </button>
            ))}
            <div ref={sentinel} />
        </div>
    )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
    images,
    index,
    onClose,
    onNav,
}: {
    images: Array<{ url: string; filename: string }>
    index: number
    onClose: () => void
    onNav: (i: number) => void
}) {
    const img = images[index]
    const total = images.length

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") onNav(Math.max(0, index - 1))
            if (e.key === "ArrowRight") onNav(Math.min(total - 1, index + 1))
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [index, total, onClose, onNav])

    if (!img) return null

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl bg-gray-50 overflow-hidden border border-gray-100">
                <img
                    src={`${getApiBaseUrl()}${img.url}`}
                    alt={img.filename}
                    className="max-h-full max-w-full object-contain"
                />
            </div>
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onNav(index - 1)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="size-4" /> Prev
                </button>
                <span className="text-xs text-gray-400 font-medium tabular-nums">
                    {index + 1} / {total}
                </span>
                <button
                    type="button"
                    disabled={index === total - 1}
                    onClick={() => onNav(index + 1)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Next <ChevronRight className="size-4" />
                </button>
            </div>
            <p className="truncate text-center text-xs text-gray-400">{img.filename}</p>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminDeliveryConcernSummary() {
    const [range, setRange] = useState<DateRange | undefined>(() => {
        const today = new Date()
        return { from: today, to: today }
    })
    const [isRangeOpen, setIsRangeOpen] = useState(false)
    const [search, setSearch] = useState("")
    const [selectedMunicipality, setSelectedMunicipality] = useState("all")
    const [selectedSchool, setSelectedSchool] = useState("all")
    const [selectedCategory, setSelectedCategory] = useState("all")
    const [selectedConcernType, setSelectedConcernType] = useState("all")
    const [sort, setSort] = useState<"newest" | "oldest">("newest")

    const [rows, setRows] = useState<AdminDeliveryRow[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // ── Details + Images modals ──────────────────────────────────────────────────
    const [viewDetails, setViewDetails] = useState<AdminDeliveryRow | null>(null)
    const [viewImages, setViewImages] = useState<AdminDeliveryRow | null>(null)
    const [imagePreviewIndex, setImagePreviewIndex] = useState<number | null>(null)

    // ── PDF ──────────────────────────────────────────────────────────────────────
    const [isPdfOpen, setIsPdfOpen] = useState(false)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

    const handleLightboxNav = useCallback((i: number) => setImagePreviewIndex(i), [])
    const handleLightboxClose = useCallback(() => {
        setImagePreviewIndex(null)
        setViewImages(null)
    }, [])

    // ─── Fetch ──────────────────────────────────────────────────────────────────

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
                const all = Array.isArray(data.records) ? data.records : []
                setRows(all.filter((r) => Array.isArray(r.concerns) && r.concerns.length > 0))
            } catch (e: any) {
                toast.error(e?.message || "Failed to load concern summary")
                setRows([])
            } finally {
                setIsLoading(false)
            }
        }, 250)
        return () => clearTimeout(t)
    }, [range?.from, range?.to, search, sort])

    // ─── Filter Options ─────────────────────────────────────────────────────────

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
            const key = (r.categoryKey || r.categoryLabel || "").trim()
            const label = (r.categoryLabel || "").trim() || key
            if (key) map.set(key, label)
        }
        return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    }, [rows, selectedMunicipality, selectedSchool])

    const concernTypeOptions = useMemo(() => {
        const set = new Set<string>()
        for (const r of rows) {
            for (const c of (r.concerns || [])) { const ct = (c || "").trim(); if (ct) set.add(ct) }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [rows])

    // ─── Filtered Rows ──────────────────────────────────────────────────────────

    const filteredRows = useMemo(() => {
        return rows.filter((r) => {
            if (selectedMunicipality !== "all" && r.municipality !== selectedMunicipality) return false
            if (selectedSchool !== "all" && r.school !== selectedSchool) return false
            if (selectedCategory !== "all" && r.categoryKey !== selectedCategory) return false
            if (selectedConcernType !== "all" && !(r.concerns || []).includes(selectedConcernType)) return false
            return true
        })
    }, [rows, selectedMunicipality, selectedSchool, selectedCategory, selectedConcernType])

    // ─── Stats ──────────────────────────────────────────────────────────────────

    const stats = useMemo(() => {
        const totalRecords = filteredRows.length
        const totalConcerns = filteredRows.reduce((acc, r) => acc + (r.concerns?.length ?? 0), 0)
        const uniqueSchools = new Set(filteredRows.map((r) => r.school).filter(Boolean)).size
        const uniqueMunicipalities = new Set(filteredRows.map((r) => r.municipality).filter(Boolean)).size

        const concernMap = new Map<string, number>()
        for (const r of filteredRows) {
            for (const c of (r.concerns || [])) concernMap.set(c, (concernMap.get(c) || 0) + 1)
        }
        const topConcerns = Array.from(concernMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
        return { totalRecords, totalConcerns, uniqueSchools, uniqueMunicipalities, topConcerns, concernMap }
    }, [filteredRows])

    const rangeLabel = useMemo(() => {
        if (!range?.from && !range?.to) return "Select range"
        if (range?.from && !range?.to) return format(range.from, "MMM dd, yyyy")
        if (range?.from && range?.to) return `${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`
        return "Select range"
    }, [range])

    // ─── PDF Export ─────────────────────────────────────────────────────────────

    const buildPdf = async () => {
        setIsGeneratingPdf(true)
        try {
            const bhssLogo = await loadImageAsDataUrl("/images/bhsslogo.png")
            const bataanLogo = await loadImageAsDataUrl("/images/bataanlogo.png")

            const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
            const pageWidth = pdf.internal.pageSize.getWidth()
            const marginX = 14

            pdf.setFillColor(254, 243, 199)
            pdf.rect(0, 0, pageWidth, 36, "F")
            if (bhssLogo) pdf.addImage(bhssLogo, "PNG", marginX, 11, 14, 14)
            if (bataanLogo) pdf.addImage(bataanLogo, "PNG", pageWidth - marginX - 14, 11, 14, 14)
            pdf.setTextColor(120, 53, 15)
            pdf.setFont("helvetica", "bold")
            pdf.setFontSize(14)
            pdf.text("Delivery Concern Summary Report", pageWidth / 2, 20, { align: "center" })
            pdf.setFont("helvetica", "normal")
            pdf.setFontSize(9)
            pdf.setTextColor(71, 85, 105)
            pdf.text(`Generated: ${new Date().toLocaleString()}`, marginX, 30)
            pdf.text(`Range: ${rangeLabel}`, pageWidth - marginX, 30, { align: "right" })
            pdf.setDrawColor(253, 186, 116)
            pdf.line(marginX, 36, pageWidth - marginX, 36)

            let y = 44

            autoTable(pdf, {
                startY: y,
                head: [["Metric", "Value"]],
                body: [
                    ["Records with Concerns", String(stats.totalRecords)],
                    ["Total Concerns", String(stats.totalConcerns)],
                    ["Municipalities Affected", String(stats.uniqueMunicipalities)],
                    ["Schools Affected", String(stats.uniqueSchools)],
                ],
                theme: "grid",
                styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [254, 243, 199], textColor: [120, 53, 15], fontStyle: "bold" },
                columnStyles: { 0: { cellWidth: 80 }, 1: { halign: "right" } },
                margin: { left: marginX, right: marginX },
            })
            y = (pdf as any).lastAutoTable?.finalY + 6 || y + 30

            if (stats.topConcerns.length > 0) {
                autoTable(pdf, {
                    startY: y,
                    head: [["Top Concern Types", "Occurrences"]],
                    body: stats.topConcerns.map(([concern, count]) => [concern, String(count)]),
                    theme: "grid",
                    styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
                    headStyles: { fillColor: [254, 243, 199], textColor: [120, 53, 15], fontStyle: "bold" },
                    columnStyles: { 0: {}, 1: { halign: "right", cellWidth: 30 } },
                    margin: { left: marginX, right: marginX },
                })
                y = (pdf as any).lastAutoTable?.finalY + 6 || y + 30
            }

            autoTable(pdf, {
                startY: y,
                head: [["Date", "Municipality", "School", "Category", "Status", "Concerns"]],
                body: filteredRows.map((r) => [
                    r.dateKey, r.municipality, r.school, r.categoryLabel, r.status,
                    (r.concerns || []).join(", "),
                ]),
                theme: "grid",
                styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
                headStyles: { fillColor: [254, 243, 199], textColor: [120, 53, 15], fontStyle: "bold" },
                columnStyles: {
                    0: { cellWidth: 22 }, 1: { cellWidth: 28 }, 2: { cellWidth: 38 },
                    3: { cellWidth: 28 }, 4: { cellWidth: 20 },
                    5: { cellWidth: pageWidth - marginX * 2 - 136 },
                },
                margin: { left: marginX, right: marginX },
            })

            if (pdfUrl) URL.revokeObjectURL(pdfUrl)
            const blob = pdf.output("blob")
            const url = URL.createObjectURL(blob)
            setPdfUrl(url)
            setIsPdfOpen(true)
        } catch (e: any) {
            toast.error(e?.message || "Failed to generate PDF")
        } finally {
            setIsGeneratingPdf(false)
        }
    }

    // ─── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 px-1">

            {/* ── Header ── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-100 p-2.5 shadow-sm ring-1 ring-amber-200">
                        <AlertTriangle className="size-5 text-amber-700" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Concern Summary</h1>
                        <p className="text-sm text-muted-foreground">Overview of all delivery records with flagged concerns.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <img src="/images/bhsslogo.png" alt="BHSS Logo" className="h-10 w-10 object-contain" />
                    <img src="/images/bataanlogo.png" alt="Bataan Logo" className="h-10 w-10 object-contain" />
                    <Button
                        type="button"
                        disabled={isGeneratingPdf || filteredRows.length === 0}
                        onClick={buildPdf}
                        className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                    >
                        <Download className="mr-2 size-4" />
                        {isGeneratingPdf ? "Generating…" : "Export PDF"}
                    </Button>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                    { label: "Records w/ Concerns", value: stats.totalRecords, icon: Truck, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
                    { label: "Total Concerns", value: stats.totalConcerns, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
                    { label: "Municipalities", value: stats.uniqueMunicipalities, icon: MapPin, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
                    { label: "Schools Affected", value: stats.uniqueSchools, icon: Building2, color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200" },
                ].map((card) => (
                    <div key={card.label} className={`rounded-2xl border ${card.border} bg-white p-4 shadow-sm flex items-start justify-between`}>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{card.label}</p>
                            <p className="mt-2 text-3xl font-extrabold text-gray-800">{card.value}</p>
                        </div>
                        <div className={`grid size-10 place-items-center rounded-xl ${card.bg} ${card.color}`}>
                            <card.icon className="size-5" />
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Top Concern Types (clickable filter chips) ── */}
            {stats.topConcerns.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-700">Top Concern Types</p>
                    <div className="flex flex-wrap gap-2">
                        {stats.topConcerns.map(([concern, count]) => (
                            <button
                                key={concern}
                                type="button"
                                onClick={() => setSelectedConcernType(selectedConcernType === concern ? "all" : concern)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${selectedConcernType === concern
                                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                        : "bg-white border-amber-300 text-amber-700 hover:bg-amber-100"
                                    }`}
                            >
                                <AlertTriangle className="size-3.5" />
                                {concern}
                                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${selectedConcernType === concern ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                                    {count}
                                </span>
                            </button>
                        ))}
                        {selectedConcernType !== "all" && (
                            <button
                                type="button"
                                onClick={() => setSelectedConcernType("all")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:border-gray-300"
                            >
                                <XCircle className="size-3.5" />
                                Clear filter
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Filters + Table ── */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                {/* Filters bar */}
                <div className="border-b border-gray-100 px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-800">
                            Records with Concerns
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                {filteredRows.length}
                            </span>
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                        {/* Date range */}
                        <div className="min-w-0 lg:col-span-3">
                            <Popover open={isRangeOpen} onOpenChange={setIsRangeOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex h-9 w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-all hover:border-amber-300"
                                    >
                                        <CalendarDays className="size-4 shrink-0 text-gray-400" />
                                        <span className="truncate">{rangeLabel}</span>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 rounded-xl border shadow-lg overflow-hidden" align="start">
                                    <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} className="p-2 [--cell-size:--spacing(7)]" />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="min-w-0 lg:col-span-1">
                            <button
                                type="button"
                                onClick={() => setRange(undefined)}
                                className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-500 transition-all hover:border-gray-300"
                            >
                                Clear
                            </button>
                        </div>

                        <div className="min-w-0 lg:col-span-2">
                            <Select value={selectedMunicipality} onValueChange={(v) => { setSelectedMunicipality(v); setSelectedSchool("all") }}>
                                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm"><SelectValue placeholder="Municipality" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Municipalities</SelectItem>
                                    {municipalityOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="min-w-0 lg:col-span-2">
                            <Select value={selectedSchool} onValueChange={setSelectedSchool} disabled={selectedMunicipality === "all"}>
                                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm"><SelectValue placeholder="School" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Schools</SelectItem>
                                    {schoolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="min-w-0 lg:col-span-2">
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categoryOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="min-w-0 lg:col-span-2">
                            <Select value={selectedConcernType} onValueChange={setSelectedConcernType}>
                                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm"><SelectValue placeholder="Concern Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Concern Types</SelectItem>
                                    {concernTypeOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="min-w-0 lg:col-span-1">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-300" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search…"
                                    className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 placeholder-gray-300 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                />
                            </div>
                        </div>

                        <div className="min-w-0 lg:col-span-1">
                            <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                                <SelectTrigger className="h-9 w-full rounded-xl border-gray-200 text-sm"><SelectValue placeholder="Sort" /></SelectTrigger>
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
                    <table className="w-full min-w-[860px] border-collapse">
                        <thead>
                            <tr className="border-b-2 border-gray-100 bg-gray-50/70">
                                {["Date", "Municipality", "School", "Category", "Status", "Concerns", "Actions"].map((label) => (
                                    <th
                                        key={label}
                                        className={`py-3.5 px-5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap ${label === "Actions" ? "text-right" : "text-left"}`}
                                    >
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-2.5 text-gray-400">
                                            <div className="size-7 animate-spin rounded-full border-2 border-gray-100 border-t-amber-500" />
                                            <span className="text-sm">Loading records…</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3 text-gray-400">
                                            <div className="rounded-2xl bg-amber-50 p-4">
                                                <AlertTriangle className="size-8 text-amber-300" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-500">No concern records found</p>
                                                <p className="text-xs text-gray-400 mt-0.5">Try adjusting the filters or date range</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="bg-amber-50/40 border-l-[3px] border-l-amber-400 hover:bg-amber-50/80 transition-colors duration-150"
                                    >
                                        {/* Date */}
                                        <td className="py-4 px-5 whitespace-nowrap">
                                            <span className="text-sm font-medium text-gray-800">{r.dateKey}</span>
                                        </td>

                                        {/* Municipality */}
                                        <td className="py-4 px-5 whitespace-nowrap">
                                            <span className="flex items-center gap-1.5 text-sm text-gray-600">
                                                <MapPin className="size-3.5 text-gray-300 shrink-0" />
                                                {r.municipality}
                                            </span>
                                        </td>

                                        {/* School */}
                                        <td className="py-4 px-5 max-w-[200px]">
                                            <span className="flex items-center gap-1.5 text-sm text-gray-700 truncate" title={r.school}>
                                                <Building2 className="size-3.5 text-gray-300 shrink-0" />
                                                <span className="truncate">{r.school}</span>
                                            </span>
                                        </td>

                                        {/* Category */}
                                        <td className="py-4 px-5 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 border-gray-200">
                                                <Tag className="size-3 text-gray-400" />
                                                {r.categoryLabel}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="py-4 px-5">
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(r.status)}`}>
                                                {r.status}
                                            </span>
                                        </td>

                                        {/* Concerns */}
                                        <td className="py-4 px-5">
                                            <div className="flex flex-wrap gap-1.5">
                                                {(r.concerns || []).slice(0, 2).map((c) => (
                                                    <Badge key={c} className="rounded-full bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-2 py-0.5">
                                                        {c}
                                                    </Badge>
                                                ))}
                                                {(r.concerns || []).length > 2 && (
                                                    <Badge className="rounded-full bg-gray-100 text-gray-500 border-gray-200 text-[10px] px-2 py-0.5">
                                                        +{r.concerns.length - 2} more
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td className="py-4 px-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setViewDetails(r)}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition-all hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 hover:shadow-none"
                                                >
                                                    <Eye className="size-3.5" />
                                                    Details
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={r.images.length === 0}
                                                    onClick={() => { setViewImages(r); setImagePreviewIndex(null) }}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition-all hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    <ImageIcon className="size-3.5" />
                                                    Images
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Details Dialog ── */}
            <Dialog open={!!viewDetails} onOpenChange={(open) => !open && setViewDetails(null)}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
                    <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
                        <DialogTitle className="text-base font-bold text-gray-800">Record Details</DialogTitle>
                        <DialogDescription className="text-sm text-gray-500">Full details for this delivery record with concerns.</DialogDescription>
                    </DialogHeader>

                    {viewDetails && (
                        <div className="grid gap-4 px-6 py-5">
                            {/* Basic info */}
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

                            {/* Status */}
                            <div className="grid gap-1.5">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Status</p>
                                <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(viewDetails.status)}`}>
                                    {viewDetails.status}
                                </span>
                            </div>

                            {(viewDetails.status === "Cancelled" || viewDetails.status === "Delayed") && (
                                <div className="grid gap-1.5">
                                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Reason</p>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                                        {viewDetails.statusReason || "N/A"}
                                    </div>
                                </div>
                            )}

                            {/* Concerns */}
                            <div className="grid gap-1.5">
                                <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Concerns</p>
                                {viewDetails.concerns.length === 0 ? (
                                    <p className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-400">None</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {viewDetails.concerns.map((c) => (
                                            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                                <AlertTriangle className="size-3" />
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Remarks */}
                            <div className="grid gap-1.5">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Remarks</p>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                                    {viewDetails.remarks || "N/A"}
                                </div>
                            </div>

                            {/* Images count + quick open */}
                            <div className="grid gap-1.5">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Images</p>
                                <div className="flex items-center gap-3">
                                    <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold border ${viewDetails.images.length > 0 ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                                        {viewDetails.images.length} image{viewDetails.images.length !== 1 ? "s" : ""}
                                    </span>
                                    {viewDetails.images.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => { setViewDetails(null); setViewImages(viewDetails); setImagePreviewIndex(null) }}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-all"
                                        >
                                            <ImageIcon className="size-3.5" />
                                            View Images
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="border-t border-gray-100 px-6 py-4">
                        <div className="flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => setViewDetails(null)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300"
                            >
                                <X className="size-4" />
                                Close
                            </button>
                        </div>
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
                            Click an image to open full preview.
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
                                <ThumbnailGrid images={viewImages.images} onSelect={(i) => setImagePreviewIndex(i)} />
                            )
                        ) : null}
                    </div>

                    <div className="border-t border-gray-100 px-6 py-4">
                        <button type="button" onClick={() => { setViewImages(null); setImagePreviewIndex(null) }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300">
                            <X className="size-4" />
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
                            <DialogDescription className="text-xs text-gray-400">Use arrow keys or Prev / Next to navigate.</DialogDescription>
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
                                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300">
                                ← Back to grid
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── PDF Preview Dialog ── */}
            <Dialog
                open={isPdfOpen}
                onOpenChange={(open) => {
                    setIsPdfOpen(open)
                    if (!open && pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null) }
                }}
            >
                <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-gray-800">Concern Summary PDF</DialogTitle>
                        <DialogDescription className="text-sm text-gray-500">Review and download the report.</DialogDescription>
                    </DialogHeader>
                    <div className="rounded-xl border border-gray-100 overflow-hidden h-[65vh]">
                        {pdfUrl
                            ? <iframe title="Concern Summary PDF" src={pdfUrl} className="h-full w-full" />
                            : <div className="h-full w-full flex items-center justify-center text-sm text-gray-400">No preview.</div>
                        }
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        {pdfUrl && (
                            <a href={pdfUrl} download={`concern-summary-${new Date().toISOString().slice(0, 10)}.pdf`}
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500">
                                <Download className="size-4" /> Download
                            </a>
                        )}
                        <button type="button" onClick={() => setIsPdfOpen(false)}
                            className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:border-gray-300">
                            Close
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    )
}
