import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react"
import { format } from "date-fns"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder,
  LayoutGrid,
  List,
  Search,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

type AdminFileSubmissionRow = {
  id: string
  folder: string
  name: string
  size: number
  type: string
  description: string
  uploadedAt: string
  status: string
  url: string
  coordinator: {
    id: string
    name: string
    username: string
    municipality: string
    school: string
    hlaRoleType: string
  }
}

const FOLDER_BADGE_CLASSES = [
  "bg-sky-50 text-sky-800 border-sky-200",
  "bg-emerald-50 text-emerald-800 border-emerald-200",
  "bg-violet-50 text-violet-800 border-violet-200",
  "bg-amber-50 text-amber-900 border-amber-200",
  "bg-rose-50 text-rose-900 border-rose-200",
  "bg-emerald-50 text-emerald-900 border-emerald-200",
  "bg-teal-50 text-teal-900 border-teal-200",
  "bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200",
] as const

const ACCENT_ICON_BG = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
] as const

const ACCENT_TEXT = [
  "text-sky-600",
  "text-emerald-600",
  "text-violet-600",
  "text-amber-600",
  "text-rose-600",
] as const

const ACCENT_BAR = [
  "bg-sky-200",
  "bg-emerald-200",
  "bg-violet-200",
  "bg-amber-200",
  "bg-rose-200",
] as const

const FOLDER_FILL_CLASSES = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-emerald-600",
  "bg-teal-500",
  "bg-fuchsia-500",
] as const

function accentIndex(value: string) {
  const v = String(value || "").trim().toLowerCase()
  let h = 0
  for (let i = 0; i < v.length; i += 1) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return h
}

function accentIconClass(value: string) {
  const h = accentIndex(value)
  return ACCENT_ICON_BG[h % ACCENT_ICON_BG.length]
}

function accentTextClass(value: string) {
  const h = accentIndex(value)
  return ACCENT_TEXT[h % ACCENT_TEXT.length]
}

function accentBarClass(value: string) {
  const h = accentIndex(value)
  return ACCENT_BAR[h % ACCENT_BAR.length]
}

function folderBadgeClass(value: string) {
  const v = String(value || "").trim().toLowerCase()
  let h = 0
  for (let i = 0; i < v.length; i += 1) {
    h = (h * 31 + v.charCodeAt(i)) >>> 0
  }
  return FOLDER_BADGE_CLASSES[h % FOLDER_BADGE_CLASSES.length]
}

function folderFillClass(value: string) {
  const v = String(value || "").trim().toLowerCase()
  let h = 0
  for (let i = 0; i < v.length; i += 1) {
    h = (h * 31 + v.charCodeAt(i)) >>> 0
  }
  return FOLDER_FILL_CLASSES[h % FOLDER_FILL_CLASSES.length]
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

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`
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

const BATAAN_MUNICIPALITIES = [
  "Abucay",
  "Bagac",
  "Balanga City",
  "Dinalupihan",
  "Hermosa",
  "Limay",
  "Mariveles",
  "Morong",
  "Orani",
  "Orion",
  "Pilar",
  "Samal",
] as const

function fileTypeLabel(mime: string, name: string) {
  const m = String(mime || "").toLowerCase()
  const n = String(name || "").toLowerCase()
  const ext = n.includes(".") ? n.split(".").pop() || "" : ""
  if (m.includes("pdf") || ext === "pdf") return "PDF"
  if (m.includes("spreadsheet") || m.includes("excel") || ext === "xls" || ext === "xlsx") return "XLS"
  if (m.includes("word") || ext === "doc" || ext === "docx") return "DOC"
  if (m.startsWith("image/")) return "JPG"
  if (ext) return ext.toUpperCase()
  return "FILE"
}

function isImageFile(mime: string, name: string) {
  const m = String(mime || "").toLowerCase()
  if (m.startsWith("image/")) return true
  const n = String(name || "").toLowerCase()
  const ext = n.includes(".") ? n.split(".").pop() || "" : ""
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)
}

export function AdminFileSubmissions() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date())
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [isFiltering, startFiltering] = useTransition()

  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null)
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null)

  const [selectedFolder, setSelectedFolder] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const [rows, setRows] = useState<AdminFileSubmissionRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [viewRow, setViewRow] = useState<AdminFileSubmissionRow | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageByFolder, setPageByFolder] = useState<Record<string, number>>({ all: 1 })
  const pageSize = 12

  const rangeLabel = useMemo(() => {
    if (!selectedDate) return "All dates"
    return format(selectedDate, "MMM dd, yyyy")
  }, [selectedDate])

  const loadRows = async () => {
    setIsLoading(true)
    try {
      const qs = new URLSearchParams()
      if (selectedDate) {
        const d = format(selectedDate, "yyyy-MM-dd")
        qs.set("from", d)
        qs.set("to", d)
      }
      if (search.trim()) qs.set("search", search.trim())

      const data = (await apiFetch(`/api/admin/file-submissions/history?${qs.toString()}`)) as {
        records?: AdminFileSubmissionRow[]
      }

      setRows(Array.isArray(data.records) ? data.records : [])
    } catch (e: any) {
      toast.error(e?.message || "Failed to load file submissions")
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      void loadRows()
    }, 250)
    return () => clearTimeout(t)
  }, [selectedDate, search])

  useEffect(() => {
    const handler = () => {
      void loadRows()
    }

    window.addEventListener("file-submission:uploaded", handler)
    return () => window.removeEventListener("file-submission:uploaded", handler)
  }, [selectedDate, search])

  const rowsForSelectedSchool = useMemo(() => {
    return rows.filter((r) => {
      if (!selectedMunicipality) return false
      if (!selectedSchool) return false
      if (String(r.coordinator?.municipality || "") !== selectedMunicipality) return false
      if (String(r.coordinator?.school || "") !== selectedSchool) return false
      return true
    })
  }, [rows, selectedMunicipality, selectedSchool])

  const folderPills = useMemo(() => {
    const set = new Set<string>()
    for (const r of rowsForSelectedSchool) {
      const f = String(r.folder || "").trim()
      if (f) set.add(f)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rowsForSelectedSchool])

  const stepKey = !selectedMunicipality ? "municipalities" : !selectedSchool ? "schools" : "files"

  const filteredFiles = useMemo(() => {
    let out = rowsForSelectedSchool

    if (selectedFolder !== "all") {
      out = out.filter((r) => String(r.folder || "") === selectedFolder)
    }

    const q = deferredSearch.trim().toLowerCase()
    if (q) {
      out = out.filter((r) => {
        return (
          String(r.name || "").toLowerCase().includes(q) ||
          String(r.folder || "").toLowerCase().includes(q) ||
          String(r.description || "").toLowerCase().includes(q) ||
          String(r.coordinator?.name || "").toLowerCase().includes(q)
        )
      })
    }

    return out
  }, [rowsForSelectedSchool, selectedFolder, deferredSearch])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredFiles.length / pageSize))
  }, [filteredFiles.length])

  const pagedFiles = useMemo(() => {
    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    const start = (safePage - 1) * pageSize
    return filteredFiles.slice(start, start + pageSize)
  }, [currentPage, filteredFiles, totalPages])

  useEffect(() => {
    const key = selectedFolder || "all"
    setPageByFolder((prev) => {
      const nextPage = Math.min(Math.max(currentPage, 1), totalPages)
      if (prev[key] === nextPage) return prev
      return { ...prev, [key]: nextPage }
    })
  }, [currentPage, selectedFolder, totalPages])

  useEffect(() => {
    const key = selectedFolder || "all"
    const remembered = pageByFolder[key] || 1
    setCurrentPage(remembered)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedMunicipality, selectedSchool, search, selectedDate])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const handleDownload = async (row: AdminFileSubmissionRow) => {
    try {
      const token = getAuthToken()
      if (!token) throw new Error("Not authenticated")

      const res = await fetch(`${getApiBaseUrl()}/api/admin/file-submissions/download/${encodeURIComponent(row.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) throw new Error("Download failed")

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = row.name || "file"
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e: any) {
      toast.error(e?.message || "Failed to download")
    }
  }

  const stats = useMemo(() => {
    return {
      total: rows.length,
      municipalities: new Set(rows.map((r) => r.coordinator?.municipality)).size,
      schools: new Set(rows.map((r) => r.coordinator?.school)).size,
    }
  }, [rows])

  const municipalityCards = useMemo(() => {
    const schoolSetByMunicipality = new Map<string, Set<string>>()
    const fileCountByMunicipality = new Map<string, number>()

    for (const r of rows) {
      const m = String(r.coordinator?.municipality || "").trim()
      const s = String(r.coordinator?.school || "").trim()
      if (!m) continue
      const set = schoolSetByMunicipality.get(m) || new Set<string>()
      if (s) set.add(s)
      schoolSetByMunicipality.set(m, set)
      fileCountByMunicipality.set(m, (fileCountByMunicipality.get(m) || 0) + 1)
    }

    return BATAAN_MUNICIPALITIES.map((m) => {
      const schoolsCount = schoolSetByMunicipality.get(m)?.size || 0
      const filesCount = fileCountByMunicipality.get(m) || 0
      return { name: m, schoolsCount, filesCount }
    }).filter((m) => m.filesCount > 0)
  }, [rows])

  const schoolCards = useMemo(() => {
    if (!selectedMunicipality) return [] as Array<{ name: string; filesCount: number }>
    const map = new Map<string, number>()
    for (const r of rows) {
      if (String(r.coordinator?.municipality || "") !== selectedMunicipality) continue
      const s = String(r.coordinator?.school || "").trim()
      if (!s) continue
      map.set(s, (map.get(s) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, filesCount]) => ({ name, filesCount }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, selectedMunicipality])

  const folderBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rowsForSelectedSchool) {
      const f = String(r.folder || "").trim() || "Others"
      map.set(f, (map.get(f) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count)
  }, [rowsForSelectedSchool])

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">File Submissions</h1>
          <p className="text-sm text-gray-400 mt-0.5">Browse coordinator uploads by municipality and school.</p>
        </div>
      </div>

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
          onClick={() => {
            setSelectedMunicipality(null)
            setSelectedSchool(null)
            setSelectedFolder("all")
          }}
        >
          File Submissions
        </button>
        {selectedMunicipality ? (
          <>
            <ChevronRight className="size-3.5 text-gray-300" />
            <button
              type="button"
              className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
              onClick={() => {
                setSelectedSchool(null)
                setSelectedFolder("all")
              }}
            >
              {selectedMunicipality}
            </button>
          </>
        ) : null}
        {selectedMunicipality && selectedSchool ? (
          <>
            <ChevronRight className="size-3.5 text-gray-300" />
            <span className="text-gray-700 font-semibold">{selectedSchool}</span>
          </>
        ) : null}
      </div>

      {/* ── Stats ── */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Total Files", value: stats.total, sub: "In selected date range", icon: <Folder className="size-4" />, seed: "files" },
          { label: "Municipalities", value: stats.municipalities, sub: "With submissions", icon: <Folder className="size-4" />, seed: "municipalities" },
          { label: "Schools", value: stats.schools, sub: "With submissions", icon: <User className="size-4" />, seed: "schools" },
        ].map((s) => (
          <Card key={s.label} className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{s.label}</span>
                <div className={`rounded-xl p-2 ${accentIconClass(s.seed)}`}>{s.icon}</div>
              </div>
              <div className="text-3xl font-bold text-gray-900 tracking-tight">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>


      <AnimatePresence mode="wait">
        {!selectedMunicipality ? (
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="space-y-4">
              {/* Date filter bar */}
              <div className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
                <span className="text-sm font-semibold text-gray-700">Municipalities</span>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="rounded-xl h-9 px-4 text-sm gap-2 border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-600">
                        <CalendarDays className="size-3.5" />
                        {rangeLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl border border-gray-100 shadow-lg overflow-hidden" align="end">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => setSelectedDate(d || undefined)}
                        numberOfMonths={1}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    className="rounded-xl h-9 px-4 text-sm border-gray-200 text-gray-500 hover:border-gray-300"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Municipality cards */}
              {isLoading ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {municipalityCards.map((m) => (
                    <button
                      key={m.name}
                      type="button"
                      className="text-left group"
                      onClick={() => {
                        setSelectedMunicipality(m.name)
                        setSelectedSchool(null)
                        setSelectedFolder("all")
                      }}
                    >
                      <div className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:border-gray-200`}>
                        <div className={`pointer-events-none absolute left-0 top-0 h-full w-[3px] opacity-0 transition-opacity group-hover:opacity-100 ${accentBarClass(m.name)}`} />
                        <div className="flex items-start justify-between mb-4">
                          <div className={`rounded-xl p-2.5 ${accentIconClass(m.name)}`}>
                            <Folder className="size-4" />
                          </div>
                          <span className={`text-xs font-semibold flex items-center gap-1 ${accentTextClass(m.name)}`}>
                            Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                        <div className="font-semibold text-gray-900 mb-1">{m.name}</div>
                        <div className="text-xs text-gray-400">
                          {m.schoolsCount} school{m.schoolsCount !== 1 ? "s" : ""} · {m.filesCount} file{m.filesCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : !selectedSchool ? (
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="space-y-4">
              {/* Header bar */}
              <div className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="rounded-xl h-8 px-3 text-xs border-gray-200 text-gray-500 hover:border-gray-300 gap-1.5"
                    onClick={() => {
                      setSelectedMunicipality(null)
                      setSelectedSchool(null)
                      setSelectedFolder("all")
                    }}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </Button>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{selectedMunicipality}</div>
                    <div className="text-xs text-gray-400">{schoolCards.length} school{schoolCards.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="rounded-xl h-9 px-4 text-sm gap-2 border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-600">
                        <CalendarDays className="size-3.5" />
                        {rangeLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl border border-gray-100 shadow-lg overflow-hidden" align="end">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => setSelectedDate(d || undefined)}
                        numberOfMonths={1}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    className="rounded-xl h-9 px-4 text-sm border-gray-200 text-gray-500 hover:border-gray-300"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* School cards */}
              {isLoading ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
              ) : schoolCards.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">No schools found.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {schoolCards.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      className="text-left group"
                      onClick={() => {
                        setSelectedSchool(s.name)
                        setSelectedFolder("all")
                      }}
                    >
                      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:border-gray-200">
                        <div className={`pointer-events-none absolute left-0 top-0 h-full w-[3px] opacity-0 transition-opacity group-hover:opacity-100 ${accentBarClass(s.name)}`} />
                        <div className="flex items-start justify-between mb-4">
                          <div className={`rounded-xl p-2.5 ${accentIconClass(s.name)}`}>
                            <User className="size-4" />
                          </div>
                          <span className={`text-xs font-semibold flex items-center gap-1 ${accentTextClass(s.name)}`}>
                            View <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                        <div className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">{s.name}</div>
                        <div className="text-xs text-gray-400">{s.filesCount} file{s.filesCount !== 1 ? "s" : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="rounded-xl h-8 px-3 text-xs border-gray-200 text-gray-500 hover:border-gray-300 gap-1.5"
                    onClick={() => {
                      setSelectedSchool(null)
                      setSelectedFolder("all")
                      setSearch("")
                    }}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </Button>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{selectedSchool}</div>
                    <div className="text-xs text-gray-400">{selectedMunicipality}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant={viewMode === "grid" ? "default" : "outline"}
                    className={`h-8 w-8 rounded-xl p-0 ${viewMode === "grid" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "border-gray-200"}`}
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="size-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "outline"}
                    className={`h-8 w-8 rounded-xl p-0 ${viewMode === "list" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "border-gray-200"}`}
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                  >
                    <List className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <Button
                    variant={selectedFolder === "all" ? "default" : "outline"}
                    className={`rounded-xl h-7 px-3 text-xs whitespace-nowrap ${selectedFolder === "all" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                    onClick={() => startFiltering(() => setSelectedFolder("all"))}
                    disabled={isFiltering}
                  >
                    All Files
                  </Button>
                  {folderPills.map((f) => (
                    <Button
                      key={f}
                      variant={selectedFolder === f ? "default" : "outline"}
                      className={`rounded-xl h-7 px-3 text-xs whitespace-nowrap ${selectedFolder === f ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                      onClick={() => startFiltering(() => setSelectedFolder(f))}
                      disabled={isFiltering}
                    >
                      {f}
                    </Button>
                  ))}
                </div>

                <div className="min-w-[220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-300" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search files…"
                      className="h-8 rounded-xl pl-8 text-sm border-gray-200 focus-visible:ring-emerald-300 bg-gray-50 placeholder:text-gray-300"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="text-xs text-gray-400">
                  Showing {pagedFiles.length} of {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">No submissions found.</div>
              ) : viewMode === "list" ? (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="text-xs text-gray-400 font-semibold">File</TableHead>
                        <TableHead className="text-xs text-gray-400 font-semibold">Folder</TableHead>
                        <TableHead className="text-xs text-gray-400 font-semibold">Coordinator</TableHead>
                        <TableHead className="text-xs text-gray-400 font-semibold">Uploaded</TableHead>
                        <TableHead className="text-xs text-gray-400 font-semibold">Size</TableHead>
                        <TableHead className="text-right text-xs text-gray-400 font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedFiles.map((r) => (
                        <TableRow key={r.id} className="hover:bg-gray-50/60 border-gray-50">
                          <TableCell className="min-w-[260px]">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm text-gray-800 truncate max-w-[360px]">{r.name}</span>
                              {r.description ? (
                                <span className="text-xs text-gray-400 truncate max-w-[360px]">
                                  {r.description}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="outline" className={`rounded-lg border text-xs ${folderBadgeClass(r.folder)}`}>
                              {r.folder}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-gray-600">
                            {r.coordinator?.name || r.coordinator?.username || ""}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-gray-500">{formatDateTime(r.uploadedAt)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-gray-500">{formatFileSize(r.size)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" className="h-7 rounded-lg px-2.5 text-xs border-gray-200 text-gray-600 hover:border-gray-300" onClick={() => setViewRow(r)}>
                                <Eye className="mr-1 size-3" />View
                              </Button>
                              <Button variant="outline" className="h-7 rounded-lg px-2.5 text-xs border-gray-200 text-gray-600 hover:border-gray-300" onClick={() => handleDownload(r)}>
                                <Download className="mr-1 size-3" />Download
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pagedFiles.map((r) => {
                    const typeText = fileTypeLabel(r.type, r.name)
                    const showThumb = isImageFile(r.type, r.name)
                    const thumbSrc = r.url
                      ? r.url.startsWith("http")
                        ? r.url
                        : `${getApiBaseUrl()}${r.url}`
                      : ""
                    return (
                      <div key={r.id} className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 group">
                        <div className="relative aspect-[16/9] bg-gray-50 overflow-hidden">
                          <Badge variant="outline" className="absolute right-2.5 top-2.5 rounded-lg text-xs border-gray-200 bg-white/90 text-gray-500">
                            {typeText}
                          </Badge>
                          {showThumb ? (
                            <>
                              <img
                                src={thumbSrc}
                                alt={r.name}
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={(e) => {
                                  const img = e.currentTarget
                                  img.classList.add("hidden")
                                  const fallback = img.parentElement?.querySelector(
                                    '[data-thumb-fallback="true"]'
                                  ) as HTMLElement | null
                                  fallback?.classList.remove("hidden")
                                }}
                              />
                              <div
                                data-thumb-fallback="true"
                                className="hidden absolute inset-0 flex items-center justify-center"
                              >
                                <div className={`rounded-xl p-3 ${accentIconClass(r.folder)}`}>
                                  <FileText className="size-5" />
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className={`rounded-xl p-3 ${accentIconClass(r.folder)}`}>
                                <FileText className="size-5" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-3.5 space-y-2">
                          <div className="font-semibold text-sm text-gray-800 truncate">{r.name}</div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`rounded-lg border text-xs ${folderBadgeClass(r.folder)}`}>
                              {r.folder}
                            </Badge>
                            <div className="text-xs text-gray-400 truncate">
                              {formatFileSize(r.size)}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {formatDateTime(r.uploadedAt)} · {r.coordinator?.name || r.coordinator?.username || ""}
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1">
                            <Button variant="outline" className="h-7 rounded-xl px-2.5 text-xs border-gray-200 text-gray-600 hover:border-gray-300" onClick={() => setViewRow(r)}>
                              <Eye className="mr-1 size-3" />View
                            </Button>
                            <Button variant="outline" className="h-7 rounded-xl px-2.5 text-xs border-gray-200 text-gray-600 hover:border-gray-300" onClick={() => handleDownload(r)}>
                              <Download className="mr-1 size-3" />Download
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {filteredFiles.length > pageSize && (
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
                            className={page === currentPage ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}
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
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Sidebar ── */}
          <div className="space-y-3">
            {/* Date filter */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Filter by date</div>
              <div className="text-xs text-gray-500 mb-3">{rangeLabel}</div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => setSelectedDate(d || undefined)}
                numberOfMonths={1}
                className="rounded-xl border border-gray-100 p-2 bg-white w-full"
              />
              <Button
                variant="outline"
                className="w-full rounded-xl h-9 mt-3 text-xs border-gray-200 text-gray-500 hover:border-gray-300"
                onClick={() => setSelectedDate(undefined)}
              >
                Clear date
              </Button>
            </div>

            {/* School info */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">School info</div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <div className="font-semibold text-sm text-gray-800">{selectedSchool}</div>
                <div className="text-xs text-gray-400 mt-0.5">{selectedMunicipality}</div>
              </div>
            </div>

            {/* File breakdown */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">File breakdown</div>
              {folderBreakdown.length === 0 ? (
                <div className="text-xs text-gray-400">No files.</div>
              ) : (
                <div className="space-y-2.5">
                  {folderBreakdown.map((b) => (
                    <div key={b.folder}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-600 truncate">{b.folder}</span>
                        <span className="text-xs font-semibold text-gray-400">{b.count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${folderFillClass(b.folder)} opacity-70`}
                          style={{ width: `${Math.min(100, Math.round((b.count / Math.max(1, filteredFiles.length)) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900">Submission</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              {viewRow?.folder || ""}
            </DialogDescription>
          </DialogHeader>

          {viewRow ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">File</Label>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 break-words">
                  {viewRow.name}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Coordinator</Label>
                  <div className="text-sm text-gray-700">
                    {viewRow.coordinator?.name || viewRow.coordinator?.username || ""}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Uploaded</Label>
                  <div className="text-sm text-gray-700">{formatDateTime(viewRow.uploadedAt)}</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Municipality</Label>
                  <div className="text-sm text-gray-700">{viewRow.coordinator?.municipality || ""}</div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">School</Label>
                  <div className="text-sm text-gray-700">{viewRow.coordinator?.school || ""}</div>
                </div>
              </div>

              {viewRow.description ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Description</Label>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {viewRow.description}
                  </div>
                </div>
              ) : null}

              {viewRow.type?.startsWith("image/") && viewRow.url ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preview</Label>
                  <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
                    <img
                      src={`${getApiBaseUrl()}${viewRow.url}`}
                      alt={viewRow.name}
                      className="w-full max-h-[420px] object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" className="rounded-xl h-9 px-4 text-sm border-gray-200 text-gray-600 hover:border-gray-300" onClick={() => setViewRow(null)}>
                  Close
                </Button>
                <Button className="rounded-xl h-9 px-4 text-sm bg-emerald-600 hover:bg-emerald-700 border-emerald-600" onClick={() => handleDownload(viewRow)}>
                  <Download className="mr-2 size-3.5" />
                  Download
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}