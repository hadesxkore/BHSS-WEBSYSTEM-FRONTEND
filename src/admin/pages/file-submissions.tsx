import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import {
  CalendarDays,
  Download,
  Eye,
  FileText,
  Folder,
  Search,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
  "bg-indigo-50 text-indigo-900 border-indigo-200",
  "bg-teal-50 text-teal-900 border-teal-200",
  "bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200",
] as const

function folderBadgeClass(value: string) {
  const v = String(value || "").trim().toLowerCase()
  let h = 0
  for (let i = 0; i < v.length; i += 1) {
    h = (h * 31 + v.charCodeAt(i)) >>> 0
  }
  return FOLDER_BADGE_CLASSES[h % FOLDER_BADGE_CLASSES.length]
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

export function AdminFileSubmissions() {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: today, to: today }
  })
  const [isRangeOpen, setIsRangeOpen] = useState(false)
  const [search, setSearch] = useState("")

  const [selectedFolder, setSelectedFolder] = useState<string>("all")
  const [selectedCoordinator, setSelectedCoordinator] = useState<string>("all")
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("all")
  const [selectedSchool, setSelectedSchool] = useState<string>("all")

  const [rows, setRows] = useState<AdminFileSubmissionRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [viewRow, setViewRow] = useState<AdminFileSubmissionRow | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 6

  const rangeLabel = useMemo(() => {
    if (!range?.from && !range?.to) return "Select range"
    if (range?.from && !range?.to) return format(range.from, "MMM dd, yyyy")
    if (range?.from && range?.to) {
      return `${format(range.from, "MMM dd, yyyy")} – ${format(range.to, "MMM dd, yyyy")}`
    }
    return "Select range"
  }, [range])

  const loadRows = async () => {
    setIsLoading(true)
    try {
      const qs = new URLSearchParams()
      if (range?.from) qs.set("from", format(range.from, "yyyy-MM-dd"))
      if (range?.to) qs.set("to", format(range.to, "yyyy-MM-dd"))
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
  }, [range?.from, range?.to, search])

  useEffect(() => {
    const handler = () => {
      void loadRows()
    }

    window.addEventListener("file-submission:uploaded", handler)
    return () => window.removeEventListener("file-submission:uploaded", handler)
  }, [range?.from, range?.to, search])

  const rowsForMunicipalityOptions = useMemo(() => {
    return rows.filter((r) => {
      if (selectedFolder !== "all" && r.folder !== selectedFolder) return false
      if (selectedCoordinator !== "all" && r.coordinator?.id !== selectedCoordinator) return false
      if (selectedSchool !== "all" && r.coordinator?.school !== selectedSchool) return false
      return true
    })
  }, [rows, selectedFolder, selectedCoordinator, selectedSchool])

  const rowsForSchoolOptions = useMemo(() => {
    return rows.filter((r) => {
      if (selectedFolder !== "all" && r.folder !== selectedFolder) return false
      if (selectedCoordinator !== "all" && r.coordinator?.id !== selectedCoordinator) return false
      if (selectedMunicipality !== "all" && r.coordinator?.municipality !== selectedMunicipality)
        return false
      return true
    })
  }, [rows, selectedFolder, selectedCoordinator, selectedMunicipality])

  const rowsForFolderOptions = useMemo(() => {
    return rows.filter((r) => {
      if (selectedCoordinator !== "all" && r.coordinator?.id !== selectedCoordinator) return false
      if (selectedMunicipality !== "all" && r.coordinator?.municipality !== selectedMunicipality)
        return false
      if (selectedSchool !== "all" && r.coordinator?.school !== selectedSchool) return false
      return true
    })
  }, [rows, selectedCoordinator, selectedMunicipality, selectedSchool])

  const rowsForCoordinatorOptions = useMemo(() => {
    return rows.filter((r) => {
      if (selectedFolder !== "all" && r.folder !== selectedFolder) return false
      if (selectedMunicipality !== "all" && r.coordinator?.municipality !== selectedMunicipality)
        return false
      if (selectedSchool !== "all" && r.coordinator?.school !== selectedSchool) return false
      return true
    })
  }, [rows, selectedFolder, selectedMunicipality, selectedSchool])

  const municipalityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rowsForMunicipalityOptions) {
      const m = (r.coordinator?.municipality || "").trim()
      if (m) set.add(m)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rowsForMunicipalityOptions])

  const schoolOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rowsForSchoolOptions) {
      const s = (r.coordinator?.school || "").trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rowsForSchoolOptions])

  const folderOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rowsForFolderOptions) {
      const f = (r.folder || "").trim()
      if (f) set.add(f)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rowsForFolderOptions])

  const coordinatorOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rowsForCoordinatorOptions) {
      const id = String(r.coordinator?.id || "")
      const label = String(r.coordinator?.name || r.coordinator?.username || "").trim()
      if (!id || !label) continue
      map.set(id, label)
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rowsForCoordinatorOptions])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedFolder !== "all" && r.folder !== selectedFolder) return false
      if (selectedCoordinator !== "all" && r.coordinator?.id !== selectedCoordinator) return false
      if (selectedMunicipality !== "all" && r.coordinator?.municipality !== selectedMunicipality) return false
      if (selectedSchool !== "all" && r.coordinator?.school !== selectedSchool) return false
      return true
    })
  }, [rows, selectedFolder, selectedCoordinator, selectedMunicipality, selectedSchool])

  const groupedByFolder = useMemo(() => {
    const map = new Map<string, AdminFileSubmissionRow[]>()
    for (const r of filteredRows) {
      const key = String(r.folder || "Others")
      const list = map.get(key) || []
      list.push(r)
      map.set(key, list)
    }

    for (const [, list] of map.entries()) {
      list.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))
    }

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredRows])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(groupedByFolder.length / pageSize))
  }, [groupedByFolder.length])

  const pagedFolders = useMemo(() => {
    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    const start = (safePage - 1) * pageSize
    return groupedByFolder.slice(start, start + pageSize)
  }, [currentPage, groupedByFolder, totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [range?.from, range?.to, search, selectedFolder, selectedCoordinator, selectedMunicipality, selectedSchool])

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
      total: filteredRows.length,
      folders: new Set(filteredRows.map((r) => r.folder)).size,
      coordinators: new Set(filteredRows.map((r) => r.coordinator?.id)).size,
    }
  }, [filteredRows])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="size-6" />
            File Submissions
          </h1>
          <p className="text-sm text-muted-foreground">
            Review coordinator uploads grouped by folder.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border border-black/5 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Files</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <Folder className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.total}</div>
            <div className="mt-2 text-xs text-neutral-500">Matching current filters</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-black/5 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Folders</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <Folder className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.folders}</div>
            <div className="mt-2 text-xs text-neutral-500">Unique folder types</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-black/5 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Coordinators</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <User className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.coordinators}</div>
            <div className="mt-2 text-xs text-neutral-500">Unique uploaders</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Submissions</CardTitle>
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
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="Municipality" />
                </SelectTrigger>
                <SelectContent key={`${selectedFolder}-${selectedCoordinator}-${selectedSchool}`}>
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
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="School" />
                </SelectTrigger>
                <SelectContent key={`${selectedFolder}-${selectedCoordinator}-${selectedMunicipality}`}>
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
              <Select value={selectedFolder} onValueChange={(v) => setSelectedFolder(v)}>
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="Folder" />
                </SelectTrigger>
                <SelectContent key={`${selectedCoordinator}-${selectedMunicipality}-${selectedSchool}`}>
                  <SelectItem value="all">All Folders</SelectItem>
                  {folderOptions.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <Select value={selectedCoordinator} onValueChange={(v) => setSelectedCoordinator(v)}>
                <SelectTrigger className="h-10 w-full rounded-xl min-w-0">
                  <SelectValue placeholder="Coordinator" />
                </SelectTrigger>
                <SelectContent key={`${selectedFolder}-${selectedMunicipality}-${selectedSchool}`}>
                  <SelectItem value="all">All Coordinators</SelectItem>
                  {coordinatorOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 lg:col-span-1">
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
          </div>

          <div className="flex justify-end">
            <div className="text-sm text-muted-foreground">
              Showing {pagedFolders.length} of {groupedByFolder.length} folder{groupedByFolder.length !== 1 ? "s" : ""}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No submissions found.</div>
          ) : (
            <Accordion type="multiple" className="rounded-xl border overflow-hidden">
              {pagedFolders.map(([folder, list]) => {
                return (
                  <AccordionItem key={folder} value={folder} className="px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={`rounded-xl border ${folderBadgeClass(folder)}`}
                          title={folder}
                        >
                          {folder}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {list.length} file{list.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="rounded-xl border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead>File</TableHead>
                              <TableHead>Coordinator</TableHead>
                              <TableHead>School</TableHead>
                              <TableHead>Uploaded</TableHead>
                              <TableHead>Size</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {list.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="min-w-[240px]">
                                  <div className="flex flex-col">
                                    <span className="font-medium truncate max-w-[320px]">{r.name}</span>
                                    {r.description ? (
                                      <span className="text-xs text-muted-foreground truncate max-w-[320px]">
                                        {r.description}
                                      </span>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {r.coordinator?.name || r.coordinator?.username || ""}
                                </TableCell>
                                <TableCell className="max-w-[260px] truncate">
                                  {r.coordinator?.school || ""}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {formatDateTime(r.uploadedAt)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{formatFileSize(r.size)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="outline"
                                      className="h-8 rounded-lg px-2 text-xs"
                                      onClick={() => setViewRow(r)}
                                    >
                                      <Eye className="mr-1 size-3.5" />
                                      View
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="h-8 rounded-lg px-2 text-xs"
                                      onClick={() => handleDownload(r)}
                                    >
                                      <Download className="mr-1 size-3.5" />
                                      Download
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}

          {groupedByFolder.length > pageSize && (
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
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission</DialogTitle>
            <DialogDescription>
              {viewRow?.folder || ""}
            </DialogDescription>
          </DialogHeader>

          {viewRow ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>File</Label>
                <div className="rounded-xl border bg-muted/10 p-3 text-sm break-words">
                  {viewRow.name}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label>Coordinator</Label>
                  <div className="text-sm">
                    {viewRow.coordinator?.name || viewRow.coordinator?.username || ""}
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label>Uploaded</Label>
                  <div className="text-sm">{formatDateTime(viewRow.uploadedAt)}</div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label>Municipality</Label>
                  <div className="text-sm">{viewRow.coordinator?.municipality || ""}</div>
                </div>
                <div className="grid gap-1">
                  <Label>School</Label>
                  <div className="text-sm">{viewRow.coordinator?.school || ""}</div>
                </div>
              </div>

              {viewRow.description ? (
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <div className="rounded-xl border bg-muted/10 p-3 text-sm whitespace-pre-wrap break-words">
                    {viewRow.description}
                  </div>
                </div>
              ) : null}

              {viewRow.type?.startsWith("image/") && viewRow.url ? (
                <div className="grid gap-2">
                  <Label>Preview</Label>
                  <div className="rounded-xl border overflow-hidden bg-slate-50">
                    <img
                      src={`${getApiBaseUrl()}${viewRow.url}`}
                      alt={viewRow.name}
                      className="w-full max-h-[420px] object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setViewRow(null)}>
                  Close
                </Button>
                <Button className="rounded-xl" onClick={() => handleDownload(viewRow)}>
                  <Download className="mr-2 size-4" />
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
