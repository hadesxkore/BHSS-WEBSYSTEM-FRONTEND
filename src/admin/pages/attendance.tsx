import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  ArrowUpDown,
  CalendarDays,
  ClipboardCheck,
  Search,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AttendanceRow = {
  id: string
  dateKey: string
  municipality: string
  school: string
  grade: string
  present: number
  absent: number
  notes: string
  updatedAtIso: string
}

const MUNICIPALITIES = [
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
]

const MUNICIPALITY_SCHOOLS: Record<string, string[]> = {
  Abucay: ["Abucay Central ES", "Mabatang ES"],
  Bagac: ["Bagac ES", "Paysawan ES"],
  "Balanga City": ["Balanga ES", "Tenejero ES"],
  Dinalupihan: ["Dinalupihan ES", "Luacan ES"],
  Hermosa: ["Hermosa ES", "Mabiga ES"],
  Limay: ["Limay ES", "Lamao ES"],
  Mariveles: ["Mariveles ES", "Alas-asin ES"],
  Morong: ["Morong ES", "Nagbalayong ES"],
  Orani: ["Orani ES", "Kabalutan ES"],
  Orion: ["Orion ES", "Santa Elena ES"],
  Pilar: ["Pilar ES", "Del Rosario ES"],
  Samal: ["Samal ES", "West Calaguiman ES"],
}

function startOfDayKey(d: Date) {
  return format(d, "yyyy-MM-dd")
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

type SortKey = "municipality" | "school" | "grade" | "present" | "absent"
type SortDir = "asc" | "desc"

export function Attendance() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("All")
  const [selectedSchool, setSelectedSchool] = useState<string>("All")
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("municipality")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const dayKey = useMemo(() => startOfDayKey(selectedDate), [selectedDate])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setIsLoading(true)
      try {
        const qs = new URLSearchParams()
        qs.set("from", dayKey)
        qs.set("to", dayKey)
        if (search.trim()) qs.set("search", search.trim())
        qs.set("sort", "newest")

        const data = await apiFetch(`/api/admin/attendance/history?${qs.toString()}`)
        const next: AttendanceRow[] = ((data as any)?.records || []).map((r: any) => ({
          id: String(r._id || r.id || ""),
          dateKey: String(r.dateKey || ""),
          municipality: String(r.municipality || ""),
          school: String(r.school || ""),
          grade: String(r.grade || ""),
          present: Number(r.present || 0),
          absent: Number(r.absent || 0),
          notes: String(r.notes || ""),
          updatedAtIso: String(r.updatedAt || ""),
        }))

        if (!cancelled) setRows(next)
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || "Failed to load attendance")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [dayKey, search])

  useEffect(() => {
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<any>
      const record = e?.detail?.record
      const user = e?.detail?.user
      if (!record) return

      const dateKey = String(record.dateKey || "")
      const municipality = String(user?.municipality || "")
      const school = String(user?.school || "")
      const grade = String(record.grade || "")
      const present = Number(record.present || 0)
      const absent = Number(record.absent || 0)
      const notes = String(record.notes || "")
      const updatedAtIso = String(record.updatedAt || new Date().toISOString())

      if (dateKey !== dayKey) return

      setRows((prev) => {
        const nextRow: AttendanceRow = {
          id: String(record.id || record._id || `${record.userId}-${dateKey}`),
          dateKey,
          municipality,
          school,
          grade,
          present,
          absent,
          notes,
          updatedAtIso,
        }

        const existingIdx = prev.findIndex((r) => r.id === nextRow.id)
        if (existingIdx >= 0) {
          const copy = [...prev]
          copy[existingIdx] = nextRow
          return copy
        }
        return [nextRow, ...prev]
      })
    }

    window.addEventListener("attendance:saved", handler)
    return () => window.removeEventListener("attendance:saved", handler)
  }, [dayKey])

  const schoolsForSelectedMunicipality = useMemo(() => {
    if (selectedMunicipality === "All") return []
    return MUNICIPALITY_SCHOOLS[selectedMunicipality] ?? []
  }, [selectedMunicipality])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rows.filter((row) => {
      if (row.dateKey !== dayKey) return false
      if (selectedMunicipality !== "All" && row.municipality !== selectedMunicipality) {
        return false
      }
      if (selectedSchool !== "All" && row.school !== selectedSchool) return false
      if (!q) return true

      return (
        row.school.toLowerCase().includes(q) ||
        row.municipality.toLowerCase().includes(q) ||
        row.grade.toLowerCase().includes(q) ||
        row.notes.toLowerCase().includes(q)
      )
    })
  }, [dayKey, rows, search, selectedMunicipality, selectedSchool])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") {
        const res = av - bv
        return sortDir === "asc" ? res : -res
      }
      const res = String(av).localeCompare(String(bv))
      return sortDir === "asc" ? res : -res
    })
    return copy
  }, [filtered, sortDir, sortKey])

  const stats = useMemo(() => {
    const total = filtered.length
    const present = filtered.reduce((acc, r) => acc + (Number.isFinite(r.present) ? r.present : 0), 0)
    const absent = filtered.reduce((acc, r) => acc + (Number.isFinite(r.absent) ? r.absent : 0), 0)
    const rate = present + absent === 0 ? 0 : Math.round((present / (present + absent)) * 100)

    return { total, present, absent, rate }
  }, [filtered])

  const onHeaderSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDir("asc")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-muted-foreground" />
            <h2 className="text-2xl font-bold tracking-tight">Attendance</h2>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          View daily attendance per municipality and school.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Total</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <Search className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.total}</div>
            <div className="mt-2 text-xs text-neutral-500">Rows for selected filters</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Present</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <Badge variant="secondary" className="rounded-xl bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700">
                Sum
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.present}</div>
            <div className="mt-2 text-xs text-neutral-500">Total present (sum)</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Absent</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <Badge variant="secondary" className="rounded-xl bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-700">
                Sum
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.absent}</div>
            <div className="mt-2 text-xs text-neutral-500">Total absent (sum)</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Attendance Rate</CardTitle>
            <div className="rounded-2xl border border-black/5 bg-white/70 p-2 shadow-sm">
              <CalendarDays className="size-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-neutral-900">{stats.rate}%</div>
            <div className="mt-2 text-xs text-neutral-500">Present / total</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <Label>Date</Label>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full min-w-0 flex-1 justify-start">
                      <CalendarDays className="size-4" />
                      {format(selectedDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && setSelectedDate(d)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Today
                </Button>
              </div>
            </div>

            <div className="lg:col-span-3">
              <Label>Municipality</Label>
              <div className="mt-2">
                <Select
                  value={selectedMunicipality}
                  onValueChange={(v) => {
                    setSelectedMunicipality(v)
                    setSelectedSchool("All")
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select municipality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    {MUNICIPALITIES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="lg:col-span-3">
              <Label>School</Label>
              <div className="mt-2">
                <Select
                  value={selectedSchool}
                  onValueChange={setSelectedSchool}
                  disabled={selectedMunicipality === "All"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        selectedMunicipality === "All" ? "Select municipality first" : "Select school"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    {schoolsForSelectedMunicipality.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="lg:col-span-12">
              <Label>Search</Label>
              <div className="mt-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search school, municipality, grade, status..."
                />
              </div>
            </div>

            <div className="lg:col-span-12 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground">{sorted.length}</span> result(s)
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDate(new Date())
                  setSelectedMunicipality("All")
                  setSelectedSchool("All")
                  setSearch("")
                  setSortKey("municipality")
                  setSortDir("asc")
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Attendance List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => onHeaderSort("municipality")}
                  >
                    Municipality
                    <ArrowUpDown className={sortKey === "municipality" ? "opacity-100" : "opacity-40"} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => onHeaderSort("school")}
                  >
                    School
                    <ArrowUpDown className={sortKey === "school" ? "opacity-100" : "opacity-40"} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => onHeaderSort("grade")}
                  >
                    Grade
                    <ArrowUpDown className={sortKey === "grade" ? "opacity-100" : "opacity-40"} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => onHeaderSort("present")}
                  >
                    Present
                    <ArrowUpDown className={sortKey === "present" ? "opacity-100" : "opacity-40"} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => onHeaderSort("absent")}
                  >
                    Absent
                    <ArrowUpDown className={sortKey === "absent" ? "opacity-100" : "opacity-40"} />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    {isLoading ? "Loading..." : "No data for the selected filters."}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.municipality}</TableCell>
                    <TableCell>{row.school}</TableCell>
                    <TableCell>{row.grade}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.present}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.absent}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
