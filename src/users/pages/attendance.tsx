import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { format, isAfter, isBefore, parseISO, startOfDay } from "date-fns"
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  Plus,
  Pencil,
  Save,
  Search,
  Users,
  MessageSquare,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

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

type AttendanceRecord = {
  id: string
  dateKey: string
  grade: string
  present: number
  absent: number
  notes?: string
  createdAtIso: string
  updatedAtIso: string
}

type PendingAttendanceEntry = {
  grade: string
  present: number
  absent: number
  notes: string
}

const GRADE_OPTIONS = [
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
] as const
type GradeOption = (typeof GRADE_OPTIONS)[number] | "Custom"

const ALL_GRADES = Array.from({ length: 6 }, (_, i) => `Grade ${i + 1}`)

function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem("bhss_auth")
    if (!raw) return null
    return JSON.parse(raw) as AuthState
  } catch {
    return null
  }
}

function getApiBaseUrl() {
  const envAny = (import.meta as any)?.env as any
  const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
  return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
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
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

function safeInt(v: string) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

function inRange(day: Date, from?: Date, to?: Date) {
  const d = startOfDay(day)
  const f = from ? startOfDay(from) : undefined
  const t = to ? startOfDay(to) : undefined
  if (f && isBefore(d, f)) return false
  if (t && isAfter(d, t)) return false
  return true
}

function startOfDayKey(d: Date) {
  return format(d, "yyyy-MM-dd")
}

export function UserAttendance() {
  const auth = useMemo(() => getAuth(), [])
  const userId = auth?.user?.id || ""

  const [activeTab, setActiveTab] = useState<"record" | "history">("record")
  const [isSaving, setIsSaving] = useState(false)

  const [date, setDate] = useState<Date | undefined>(() => new Date())
  const [gradeOption, setGradeOption] = useState<GradeOption>("Grade 2")
  const [customGrade, setCustomGrade] = useState("")
  const [lastPresetGrade, setLastPresetGrade] = useState<Exclude<GradeOption, "Custom">>(
    "Grade 2"
  )
  const [isCustomGradeOpen, setIsCustomGradeOpen] = useState(false)
  const [customGradeDraft, setCustomGradeDraft] = useState("")
  const [present, setPresent] = useState("0")
  const [absent, setAbsent] = useState("0")
  const [notes, setNotes] = useState("")

  const [pendingEntries, setPendingEntries] = useState<PendingAttendanceEntry[]>([])

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [isDateLoading, setIsDateLoading] = useState(false)

  const [rangeOpen, setRangeOpen] = useState(false)
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({})
  const [search, setSearch] = useState("")
  const [gradeFilter, setGradeFilter] = useState<string>("all")

  const PAGE_SIZE = 15
  const [page, setPage] = useState(1)

  const [viewNotesTarget, setViewNotesTarget] = useState<AttendanceRecord | null>(null)
  const [editTarget, setEditTarget] = useState<AttendanceRecord | null>(null)
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [editGradeDraft, setEditGradeDraft] = useState("Grade 1")
  const [editPresentDraft, setEditPresentDraft] = useState("0")
  const [editAbsentDraft, setEditAbsentDraft] = useState("0")
  const [editNotesDraft, setEditNotesDraft] = useState("")

  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const successTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    setRecords([])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    if (!date) return

    const dateKey = startOfDayKey(date)
    const run = async () => {
      setIsDateLoading(true)
      try {
        await apiFetch(`/api/attendance/by-date/${encodeURIComponent(dateKey)}/all`)
      } catch (e: any) {
        toast.error(e?.message || "Failed to load attendance")
      } finally {
        setIsDateLoading(false)
      }
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, date])

  const totals = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 6)

    const last7 = records.filter((r) => {
      const d = parseISO(`${r.dateKey}T00:00:00.000Z`)
      return inRange(d, weekAgo, now)
    })

    const sumPresent = last7.reduce((acc, r) => acc + (r.present || 0), 0)
    const sumAbsent = last7.reduce((acc, r) => acc + (r.absent || 0), 0)

    return {
      count7: last7.length,
      present7: sumPresent,
      absent7: sumAbsent,
    }
  }, [records])

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records
      .filter((r) => {
        const d = parseISO(`${r.dateKey}T00:00:00.000Z`)
        if (!inRange(d, range.from, range.to)) return false
        if (gradeFilter !== "all" && String(r.grade || "") !== gradeFilter) return false
        if (!q) return true
        const dateLabel = format(d, "MMM dd, yyyy").toLowerCase()
        const note = (r.notes || "").toLowerCase()
        return dateLabel.includes(q) || note.includes(q)
      })
      .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)))
  }, [records, range.from, range.to, search, gradeFilter])

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to, search, gradeFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), pageCount)
  const pagedRecords = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredRecords.slice(start, start + PAGE_SIZE)
  }, [filteredRecords, safePage])

  const goToPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), pageCount))
  }

  const renderPagination = (align: "start" | "end" = "end") => {
    if (filteredRecords.length <= PAGE_SIZE) return null

    const pageItems: number[] = []
    const start = Math.max(1, safePage - 2)
    const end = Math.min(pageCount, start + 4)
    for (let i = start; i <= end; i++) pageItems.push(i)

    return (
      <Pagination className={align === "end" ? "justify-end" : "justify-start"}>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (safePage > 1) goToPage(safePage - 1)
              }}
              className={safePage <= 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>

          {pageItems.map((p) => (
            <PaginationItem key={`att-page-${p}`}>
              <PaginationLink
                href="#"
                isActive={p === safePage}
                onClick={(e) => {
                  e.preventDefault()
                  goToPage(p)
                }}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (safePage < pageCount) goToPage(safePage + 1)
              }}
              className={safePage >= pageCount ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    )
  }

  const isEditedRecord = (r: AttendanceRecord) => {
    return Boolean(r.updatedAtIso && r.createdAtIso && r.updatedAtIso !== r.createdAtIso)
  }

  const openEditModal = (r: AttendanceRecord) => {
    setEditTarget(r)
    setEditGradeDraft(String(r.grade || "").trim() || "Grade 1")
    setEditPresentDraft(String(r.present ?? 0))
    setEditAbsentDraft(String(r.absent ?? 0))
    setEditNotesDraft(String(r.notes ?? ""))
  }

  const saveEditModal = async () => {
    if (!editTarget) return
    const p = safeInt(editPresentDraft)
    const a = safeInt(editAbsentDraft)
    const grade = String(editGradeDraft || "").trim()
    const dateKey = String(editTarget.dateKey || "").trim()

    if (!grade) {
      toast.error("Please select a grade")
      return
    }
    if (!dateKey) {
      toast.error("Missing date")
      return
    }
    if (p + a <= 0) {
      toast.error("Please enter at least one value")
      return
    }

    setIsEditSaving(true)
    try {
      const data = (await apiFetch("/api/attendance/record", {
        method: "POST",
        body: JSON.stringify({
          dateKey,
          grade,
          present: p,
          absent: a,
          notes: editNotesDraft.trim() || "",
        }),
      })) as { record?: any }

      const saved = data?.record
      if (saved) {
        setRecords((prev) => {
          const next = [...prev]
          const mapped: AttendanceRecord = {
            id: String(saved._id || saved.id || editTarget.id),
            dateKey: String(saved.dateKey || dateKey),
            grade: String(saved.grade || grade),
            present: Number(saved.present || p),
            absent: Number(saved.absent || a),
            notes: String(saved.notes || ""),
            createdAtIso: saved.createdAt
              ? new Date(saved.createdAt).toISOString()
              : editTarget.createdAtIso,
            updatedAtIso: saved.updatedAt
              ? new Date(saved.updatedAt).toISOString()
              : new Date().toISOString(),
          }

          const idx = next.findIndex((r) => r.id === editTarget.id)
          if (idx >= 0) next[idx] = mapped
          else next.unshift(mapped)
          return next
        })
      }

      toast.success("Attendance updated")
      setEditTarget(null)
    } catch (e: any) {
      toast.error(e?.message || "Failed to update")
    } finally {
      setIsEditSaving(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    if (activeTab !== "history") return

    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams()
        if (range.from) qs.set("from", startOfDayKey(range.from))
        if (range.to) qs.set("to", startOfDayKey(range.to))
        if (search.trim()) qs.set("search", search.trim())
        if (gradeFilter !== "all") qs.set("grade", gradeFilter)

        const data = (await apiFetch(`/api/attendance/history?${qs.toString()}`)) as {
          records?: any[]
        }

        const next = (Array.isArray(data.records) ? data.records : []).map((r) => {
          return {
            id: String(r._id || r.id || ""),
            dateKey: String(r.dateKey || ""),
            grade: String(r.grade || ""),
            present: Number(r.present || 0),
            absent: Number(r.absent || 0),
            notes: String(r.notes || ""),
            createdAtIso: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
            updatedAtIso: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
          } as AttendanceRecord
        })

        setRecords(next)
      } catch (e: any) {
        toast.error(e?.message || "Failed to load attendance history")
      }
    }, 250)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userId, range.from, range.to, search, gradeFilter])

  const addPendingEntry = () => {
    if (!date) {
      toast.error("Please select a date")
      return
    }

    const p = safeInt(present)
    const a = safeInt(absent)
    const finalGrade = (gradeOption === "Custom" ? customGrade : gradeOption).trim()

    if (!finalGrade) {
      toast.error("Please select a grade")
      return
    }
    if (p + a <= 0) {
      toast.error("Please enter at least one value")
      return
    }

    setPendingEntries((prev) => {
      const next = prev.filter((x) => x.grade !== finalGrade)
      next.unshift({ grade: finalGrade, present: p, absent: a, notes: notes.trim() || "" })
      return next
    })

    setPresent("")
    setAbsent("")
    setNotes("")
  }

  const savePendingAll = async () => {
    if (!userId) {
      toast.error("Not authenticated")
      return
    }
    if (!date) {
      toast.error("Please select a date")
      return
    }
    if (!pendingEntries.length) {
      toast.error("No pending entries")
      return
    }

    setIsSaving(true)
    try {
      const dateKey = startOfDayKey(date)
      await apiFetch("/api/attendance/record/bulk", {
        method: "POST",
        body: JSON.stringify({ dateKey, entries: pendingEntries }),
      })

      toast.success(`Saved ${pendingEntries.length} grade${pendingEntries.length !== 1 ? "s" : ""}`)
      setPendingEntries([])

      await apiFetch(`/api/attendance/by-date/${encodeURIComponent(dateKey)}/all`)
    } catch (e: any) {
      toast.error(e?.message || "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  const headerSubtitle = useMemo(() => {
    const school = auth?.user?.school || ""
    const mun = auth?.user?.municipality || ""
    const label = [school, mun].filter(Boolean).join(" • ")
    return label || "Record attendance quickly and review history"
  }, [auth?.user?.municipality, auth?.user?.school])

  if (!auth?.user) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Not Authenticated</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Please log in again.
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="rounded-2xl border bg-gradient-to-br from-slate-50 to-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ClipboardList className="size-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold leading-tight">Attendance</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{headerSubtitle}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-xl px-3 py-1">
              <Users className="mr-2 size-4" />
              {totals.count7} records (7d)
            </Badge>
            <Badge variant="outline" className="rounded-xl px-3 py-1">
              Present: {totals.present7}
            </Badge>
            <Badge variant="outline" className="rounded-xl px-3 py-1">
              Absent: {totals.absent7}
            </Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-3">
        <TabsList className="rounded-xl">
          <TabsTrigger value="record">
            <CheckCircle2 className="size-4" />
            Record
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="record">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5" />
                Record Attendance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 w-full justify-start rounded-xl"
                        disabled={isDateLoading}
                      >
                        <CalendarIcon className="mr-2 size-4" />
                        {date ? format(date, "MMM dd, yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <Calendar mode="single" selected={date} onSelect={setDate} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Grade</Label>
                  <Select
                    value={gradeOption}
                    onValueChange={(v) => {
                      const next = v as GradeOption
                      if (next === "Custom") {
                        setGradeOption("Custom")
                        setCustomGradeDraft(customGrade || "Grade 1")
                        setIsCustomGradeOpen(true)
                        return
                      }
                      setGradeOption(next)
                      setLastPresetGrade(next)
                      setCustomGrade("")
                      setCustomGradeDraft("")
                    }}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <span className="truncate">
                        {gradeOption === "Custom" ? customGrade || "Custom" : gradeOption}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="att-present">Present</Label>
                  <Input
                    id="att-present"
                    inputMode="numeric"
                    value={present}
                    onChange={(e) => setPresent(e.target.value.replace(/[^0-9]/g, ""))}
                    onFocus={() => {
                      if (String(present) === "0") setPresent("")
                    }}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="att-absent">Absent</Label>
                  <Input
                    id="att-absent"
                    inputMode="numeric"
                    value={absent}
                    onChange={(e) => setAbsent(e.target.value.replace(/[^0-9]/g, ""))}
                    onFocus={() => {
                      if (String(absent) === "0") setAbsent("")
                    }}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  className="w-full rounded-xl sm:w-auto"
                  onClick={addPendingEntry}
                  disabled={isSaving || isDateLoading}
                >
                  <Save className="size-4" />
                  Save
                </Button>
                <Button
                  type="button"
                  className="w-full rounded-xl sm:w-auto"
                  variant="outline"
                  onClick={addPendingEntry}
                  disabled={isSaving || isDateLoading}
                >
                  <Plus className="size-4" />
                  Add another
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="att-notes">Notes (optional)</Label>
                <Textarea
                  id="att-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[90px] rounded-xl"
                  placeholder="Optional"
                />
              </div>

              <div className="grid gap-3">
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Pending entries</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pendingEntries.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No pending entries.</div>
                    ) : (
                      pendingEntries.map((e) => (
                        <div
                          key={`pending-${e.grade}`}
                          className="flex items-start justify-between gap-3 rounded-xl border bg-slate-50 p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">{e.grade}</div>
                            <div className="text-xs text-muted-foreground">
                              Present {e.present} • Absent {e.absent}
                            </div>
                            {!!e.notes && (
                              <div className="mt-1 text-xs text-muted-foreground truncate">{e.notes}</div>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-xl"
                            onClick={() => setPendingEntries((prev) => prev.filter((x) => x.grade !== e.grade))}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full flex-1 rounded-xl"
                        onClick={() => setPendingEntries([])}
                        disabled={isSaving || isDateLoading || pendingEntries.length === 0}
                      >
                        Clear list
                      </Button>
                      <Button
                        type="button"
                        className="w-full flex-1 rounded-xl"
                        onClick={savePendingAll}
                        disabled={isSaving || isDateLoading || pendingEntries.length === 0}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          <>
                            <Save className="size-4" />
                            Save all ({pendingEntries.length})
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5" />
                Attendance History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-center gap-2">
                  <div className="relative w-full sm:max-w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 rounded-xl pl-9"
                      placeholder="Search date or notes"
                    />
                  </div>

                  <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-10 rounded-xl">
                        <CalendarIcon className="mr-2 size-4" />
                        {range.from ? (
                          range.to ? (
                            `${format(range.from, "MMM dd, yyyy")} - ${format(range.to, "MMM dd, yyyy")}`
                          ) : (
                            format(range.from, "MMM dd, yyyy")
                          )
                        ) : (
                          "Date range"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <Calendar
                        mode="range"
                        selected={range as any}
                        onSelect={(v: any) => {
                          setRange(v || {})
                        }}
                        numberOfMonths={2}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="ghost"
                          className="rounded-xl"
                          onClick={() => {
                            setRange({})
                            setRangeOpen(false)
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Select value={gradeFilter} onValueChange={setGradeFilter}>
                    <SelectTrigger className="h-10 w-full rounded-xl sm:w-[160px]">
                      <SelectValue placeholder="All grades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All grades</SelectItem>
                      {ALL_GRADES.map((g) => (
                        <SelectItem key={`filter-${g}`} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-muted-foreground">
                  Showing {filteredRecords.length} of {records.length}
                </div>
              </div>

              <div className="hidden md:block">{renderPagination("end")}</div>

              <Separator />

              <div className="rounded-xl border overflow-hidden hidden md:block">
                <Table className="w-full table-fixed [&_th]:px-6 [&_td]:px-6">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[80px]">Edited</TableHead>
                      <TableHead className="w-[170px]">Date</TableHead>
                      <TableHead className="w-[140px]">Grade</TableHead>
                      <TableHead className="w-[120px] text-right">Present</TableHead>
                      <TableHead className="w-[120px] text-right">Absent</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[110px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {pagedRecords.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                            No records found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pagedRecords.map((r) => {
                          const d = parseISO(`${r.dateKey}T00:00:00.000Z`)
                          return (
                            <motion.tr
                              key={r.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              transition={{ duration: 0.16 }}
                              className="border-b last:border-b-0"
                            >
                              <TableCell>
                                {isEditedRecord(r) ? (
                                  <Badge variant="secondary" className="rounded-xl">
                                    Edited
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                {format(d, "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {r.grade || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="inline-flex min-w-[3rem] justify-end rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  {r.present}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="inline-flex min-w-[3rem] justify-end rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                  {r.absent}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground align-top">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl h-8 px-2"
                                  onClick={() => setViewNotesTarget(r)}
                                >
                                  <MessageSquare className="mr-1 size-3.5" />
                                  View Notes
                                </Button>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="rounded-xl h-8 px-2"
                                  onClick={() => openEditModal(r)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </TableCell>
                            </motion.tr>
                          )
                        })
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              <div className="hidden md:block">{renderPagination("end")}</div>

              <div className="grid gap-3 md:hidden">
                {pagedRecords.length === 0 ? (
                  <div className="rounded-xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                    No records found.
                  </div>
                ) : (
                  pagedRecords.map((r) => {
                    const d = parseISO(`${r.dateKey}T00:00:00.000Z`)
                    const hasNotes = Boolean((r.notes || "").trim())
                    return (
                      <div key={r.id} className="rounded-xl border bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">
                              {format(d, "MMM dd, yyyy")}
                            </div>
                            <div className="mt-1 text-sm font-semibold">Attendance</div>
                            <div className="mt-1 text-xs text-muted-foreground">{r.grade || "—"}</div>
                            {isEditedRecord(r) && (
                              <div className="mt-2">
                                <Badge variant="secondary" className="rounded-xl">
                                  Edited
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="inline-flex min-w-[4rem] justify-end rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
                              P: {r.present}
                            </span>
                            <span className="inline-flex min-w-[4rem] justify-end rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700">
                              A: {r.absent}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3">
                          {hasNotes ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full rounded-xl"
                              onClick={() => setViewNotesTarget(r)}
                            >
                              View notes
                            </Button>
                          ) : (
                            <div className="text-xs text-muted-foreground">No notes.</div>
                          )}
                        </div>

                        <div className="mt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full rounded-xl"
                            onClick={() => openEditModal(r)}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="md:hidden">{renderPagination("end")}</div>

              <div className="text-xs text-muted-foreground">
                Attendance is synced to the server.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!viewNotesTarget}
        onOpenChange={(open) => {
          if (!open) setViewNotesTarget(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Notes</DialogTitle>
            <DialogDescription>
              {viewNotesTarget
                ? `${format(parseISO(`${viewNotesTarget.dateKey}T00:00:00.000Z`), "MMMM dd, yyyy")} • ${viewNotesTarget.grade || "—"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/10 p-4 text-sm whitespace-pre-wrap break-words">
            {viewNotesTarget?.notes?.trim() ? viewNotesTarget.notes : "—"}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCustomGradeOpen}
        onOpenChange={(open) => {
          setIsCustomGradeOpen(open)
          if (!open) {
            if (!customGrade.trim()) {
              setGradeOption(lastPresetGrade)
            }
          }
        }}
      >
        <DialogContent className="w-[360px] max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Custom grade</DialogTitle>
            <DialogDescription>Select the grade level to use for this attendance record.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="att-grade-custom">Grade</Label>
            <Select value={customGradeDraft} onValueChange={(v) => setCustomGradeDraft(v)}>
              <SelectTrigger className="h-10 rounded-xl" id="att-grade-custom">
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {ALL_GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              onClick={() => {
                setIsCustomGradeOpen(false)
                if (!customGrade.trim()) setGradeOption(lastPresetGrade)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => {
                const next = customGradeDraft.trim()
                if (!next) {
                  toast.error("Please enter a grade")
                  return
                }
                setCustomGrade(next)
                setGradeOption("Custom")
                setIsCustomGradeOpen(false)
              }}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      >
        <DialogContent className="w-[420px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden p-0">
          <div className="grid max-h-[90vh] grid-rows-[auto,1fr,auto]">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>Edit attendance</DialogTitle>
              <DialogDescription>
                {editTarget
                  ? `${format(parseISO(`${editTarget.dateKey}T00:00:00.000Z`), "MMMM dd, yyyy")} • ${editTarget.grade || "—"}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-auto px-6 pb-4">
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Grade</Label>
                  <Select value={editGradeDraft} onValueChange={setEditGradeDraft}>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_GRADES.map((g) => (
                        <SelectItem key={`edit-${g}`} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Present</Label>
                    <Input
                      inputMode="numeric"
                      value={editPresentDraft}
                      onChange={(e) => setEditPresentDraft(e.target.value.replace(/[^0-9]/g, ""))}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Absent</Label>
                    <Input
                      inputMode="numeric"
                      value={editAbsentDraft}
                      onChange={(e) => setEditAbsentDraft(e.target.value.replace(/[^0-9]/g, ""))}
                      className="h-10 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={editNotesDraft}
                    onChange={(e) => setEditNotesDraft(e.target.value)}
                    className="h-[140px] rounded-xl resize-none overflow-auto"
                    placeholder="Add notes..."
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setEditTarget(null)}
                disabled={isEditSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={saveEditModal}
                disabled={isEditSaving}
              >
                {isEditSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
        <DialogContent className="w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl">
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"
            >
              <motion.div
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.05 }}
              >
                <CheckCircle2 className="size-7" />
              </motion.div>
            </motion.div>

            <div className="mt-4 text-lg font-semibold">Attendance saved</div>
            <div className="mt-1 text-sm text-muted-foreground">You can record another grade now.</div>

            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.85, ease: "easeOut" }}
              className="mt-5 h-1 w-full overflow-hidden rounded-full bg-emerald-500/15"
            >
              <div className="h-full w-full bg-emerald-500" />
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
