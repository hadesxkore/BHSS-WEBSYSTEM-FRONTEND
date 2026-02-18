import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Package } from "lucide-react"
import * as XLSX from "xlsx"
import { toast } from "sonner"

type DistributionPageProps = {
  title?: string
  description?: string
}

function LpgDistributionPage() {
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const [rows, setRows] = useState<LpgDistributionRow[]>([])
  const [fileName, setFileName] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState<string>("")
  const [gasulHeaderTotal, setGasulHeaderTotal] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<{ rowId: string; value: string } | null>(null)
  const [isUpdatingCell, setIsUpdatingCell] = useState(false)
  const [isLoadingLatest, setIsLoadingLatest] = useState(true)

  const getApiBaseUrl = () => {
    const envAny = (import.meta as any)?.env as any
    const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
    return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
  }

  const getAuthToken = (): string | null => {
    try {
      const raw = localStorage.getItem("bhss_auth")
      if (!raw) return null
      const parsed = JSON.parse(raw) as { token?: string }
      return parsed?.token || null
    } catch {
      return null
    }
  }

  const apiFetch = async (path: string, init?: RequestInit) => {
    const token = getAuthToken()
    if (!token) throw new Error("Not authenticated")
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...(init || {}),
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

  const isLikelyMongoId = (s: string) => /^[a-f\d]{24}$/i.test(String(s || ""))

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.gasul += r.gasul
        return acc
      },
      { gasul: 0 }
    )
  }, [rows])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setIsLoadingLatest(true)
        const data = await apiFetch("/api/admin/distribution/lpg/latest")
        if (cancelled) return
        const savedRows = Array.isArray((data as any)?.rows) ? ((data as any).rows as any[]) : []
        if (savedRows.length === 0) return

        setRows(
          savedRows.map((r) => ({
            id: String(r.id || r._id || Math.random()),
            municipality: String(r.municipality || ""),
            school: String(r.schoolName || r.school || ""),
            gasul: Number(r.gasul || 0),
          }))
        )
        setFileName(String((data as any)?.batch?.sourceFileName || "Saved data"))
        setActiveSheet(String((data as any)?.batch?.sheetName || ""))
        setGasulHeaderTotal(null)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingLatest(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, LpgDistributionRow[]>()
    for (const r of rows) {
      if (!map.has(r.municipality)) map.set(r.municipality, [])
      map.get(r.municipality)!.push(r)
    }
    return Array.from(map.entries())
  }, [rows])

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName]
    if (!ws) throw new Error("Worksheet not found")
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][]

    const hasTemplateHeader = data
      .slice(0, 12)
      .some((r) => r.some((c) => String(c || "").toLowerCase().includes("lpg distribution")))
    if (!hasTemplateHeader) {
      throw new Error("Invalid template: missing 'LPG DISTRIBUTION' header")
    }

    const headerNumber = (() => {
      for (const r of data.slice(0, 12)) {
        for (const c of r) {
          const s = String(c || "")
          const m = s.match(/gasul\s*\((\d+(?:[\.,]\d+)?)\)/i)
          if (m?.[1]) return Number(String(m[1]).replace(/,/g, ""))
        }
      }
      return null
    })()

    const gasulColIndex = (() => {
      for (const r of data.slice(0, 20)) {
        for (let idx = 0; idx < r.length; idx++) {
          const s = String(r[idx] || "")
          if (s.toLowerCase().includes("gasul")) return idx
        }
      }
      return 2
    })()

    const kitchenColIndex = (() => {
      for (const r of data.slice(0, 30)) {
        for (let idx = 0; idx < r.length; idx++) {
          const s = String(r[idx] || "")
          if (s.toLowerCase().includes("bhss kitchen")) return idx
        }
      }
      return 1
    })()

    let municipality = ""
    const out: LpgDistributionRow[] = []

    for (let i = 0; i < data.length; i++) {
      const row = data[i] || []
      const colA = row[0]
      const colB = row[kitchenColIndex]
      const colC = row[gasulColIndex]

      const a = typeof colA === "string" ? colA.trim() : ""
      const b = typeof colB === "string" ? colB.trim() : ""

      if (a && a.toLowerCase() !== "lgu" && a.toLowerCase() !== "municipality") {
        municipality = a
      }

      if (!municipality) continue
      if (!b || b.toLowerCase().includes("bhss kitchen")) continue
      if (b.toLowerCase() === "total") continue

      const gasul = asNumber(colC)

      out.push({
        id: `${municipality}-${b}-${i}`,
        municipality,
        school: b,
        gasul,
      })
    }

    if (out.length === 0) throw new Error("No distribution rows found in the file")
    return { rows: out, headerNumber }
  }

  const loadWorkbook = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: "array" })
    const names = (wb.SheetNames || []).slice()
    if (names.length === 0) throw new Error("No worksheet found")

    setWorkbook(wb)
    setSheetNames(names)

    const preferred =
      names.find((n) => n.toLowerCase().trim() === "lpg") ||
      names.find((n) => n.toLowerCase().includes("lpg")) ||
      names[0]

    setActiveSheet(preferred)
    const parsed = parseSheet(wb, preferred)
    setRows(parsed.rows)
    setGasulHeaderTotal(typeof parsed.headerNumber === "number" && Number.isFinite(parsed.headerNumber) ? parsed.headerNumber : null)
  }

  const onPickFile = () => {
    setError(null)
    importFileInputRef.current?.click()
  }

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return

    setError(null)
    setFileName(f.name)
    try {
      await loadWorkbook(f)
    } catch (err: any) {
      setRows([])
      setWorkbook(null)
      setSheetNames([])
      setActiveSheet("")
      setGasulHeaderTotal(null)
      setError(err?.message || "Failed to parse file")
    }
  }

  const updateLocalCell = (rowId: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, gasul: value } : r)))
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">LPG Distribution</CardTitle>
            <CardDescription>Import an Excel template and review LPG distribution records.</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />
            <Button type="button" variant="outline" className="rounded-xl" onClick={onPickFile}>
              Import Excel
            </Button>

            <Button
              type="button"
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={rows.length === 0 || isSaving}
              onClick={async () => {
                setIsSaving(true)
                setError(null)
                try {
                  const result = await apiFetch("/api/admin/distribution/lpg/batches", {
                    method: "POST",
                    body: JSON.stringify({
                      bhssKitchenName: "BHSS Kitchen",
                      sheetName: activeSheet,
                      sourceFileName: fileName,
                      items: rows.map((r) => ({
                        municipality: r.municipality,
                        schoolName: r.school,
                        gasul: r.gasul,
                      })),
                    }),
                  })
                  if ((result as any)?.unchanged) toast.message("Nothing to be changed")
                  else toast.success("LPG distribution saved")
                } catch (e: any) {
                  const msg = e?.message || "Failed to save"
                  setError(msg)
                  toast.error(msg)
                } finally {
                  setIsSaving(false)
                }
              }}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>

            {sheetNames.length > 0 ? (
              <Select
                value={activeSheet}
                onValueChange={(v) => {
                  setError(null)
                  setActiveSheet(v)
                  if (!workbook) return
                  try {
                    const parsed = parseSheet(workbook, v)
                    setRows(parsed.rows)
                    setGasulHeaderTotal(
                      typeof parsed.headerNumber === "number" && Number.isFinite(parsed.headerNumber) ? parsed.headerNumber : null
                    )
                  } catch (e: any) {
                    setRows([])
                    setGasulHeaderTotal(null)
                    setError(e?.message || "Failed to parse worksheet")
                  }
                }}
              >
                <SelectTrigger className="h-10 w-[180px] rounded-xl bg-white/70">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {sheetNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={rows.length === 0}
              onClick={() => {
                setRows([])
                setFileName("")
                setError(null)
                setWorkbook(null)
                setSheetNames([])
                setActiveSheet("")
                setGasulHeaderTotal(null)
              }}
            >
              Clear
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
          {fileName ? <div className="mb-3 text-xs text-muted-foreground truncate">{fileName}</div> : null}

          {isLoadingLatest && rows.length === 0 ? (
            <div className="rounded-2xl border bg-white/70 overflow-hidden">
              <div className="p-4 space-y-3">
                <Skeleton className="h-6 w-[320px]" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-white/70 overflow-hidden">
              <div className="max-h-[70vh] overflow-auto touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <Table className="min-w-[320px] sm:min-w-[600px] md:min-w-[800px] w-full border-collapse text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        colSpan={2}
                        className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-left font-bold text-white"
                      >
                        <div>LPG DISTRIBUTION (11kg. tank)</div>
                      </TableHead>
                      <TableHead className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">
                        Gasul ({gasulHeaderTotal ?? totals.gasul})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="border border-emerald-900/20 p-6 text-center text-muted-foreground"
                        >
                          Import an Excel file to populate the table.
                        </TableCell>
                      </TableRow>
                    ) : (
                      grouped.flatMap(([muni, muniRows]) => {
                      const muniTotals = muniRows.reduce(
                        (acc, r) => {
                          acc.gasul += r.gasul
                          return acc
                        },
                        { gasul: 0 }
                      )

                      const lguRow = (
                        <TableRow key={`lgu-${muni}`}>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 text-center font-semibold w-[100px] sm:w-[120px]">
                            LGU
                          </TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1">BHSS Kitchen</TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 text-right tabular-nums w-[80px] sm:w-[100px]"></TableCell>
                        </TableRow>
                      )

                      const schoolRows = muniRows.map((r, idx) => (
                        <TableRow key={r.id}>
                          {idx === 0 ? (
                            <TableCell
                              rowSpan={muniRows.length}
                              className="border border-emerald-900/20 px-2 py-1 align-middle text-center font-semibold w-[100px] sm:w-[120px]"
                            >
                              {muni}
                            </TableCell>
                          ) : null}
                          <TableCell className="border border-emerald-900/20 px-2 py-1">
                            <div className="max-w-[160px] sm:max-w-[280px] md:max-w-[380px] truncate">{r.school}</div>
                          </TableCell>
                          <TableCell
                            className="border border-emerald-900/20 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50 w-[80px] sm:w-[100px]"
                            onClick={() => setEditing({ rowId: r.id, value: String(r.gasul ?? "") })}
                          >
                            {r.gasul || ""}
                          </TableCell>
                        </TableRow>
                      ))

                      const subtotalRow = (
                        <TableRow key={`sub-${muni}`}>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 w-[100px] sm:w-[120px]"></TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1"></TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 text-right tabular-nums font-semibold w-[80px] sm:w-[100px]">
                            {muniTotals.gasul || ""}
                          </TableCell>
                        </TableRow>
                      )

                      return [lguRow, ...schoolRows, subtotalRow]
                    })
                    )}

                    {rows.length > 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="border border-emerald-900/20 bg-emerald-50 px-2 py-2 font-bold text-emerald-950"
                        >
                          Grand Total
                        </TableCell>
                        <TableCell className="border border-emerald-900/20 bg-emerald-50 px-2 py-2 text-right tabular-nums font-bold text-emerald-950 w-[80px] sm:w-[100px]">
                          {totals.gasul}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <Dialog open={!!editing} onOpenChange={(o) => (!o ? setEditing(null) : null)}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Edit cell</DialogTitle>
                <DialogDescription>Gasul</DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Input
                  inputMode="decimal"
                  value={editing?.value ?? ""}
                  onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
                  placeholder="Enter number"
                />
                <div className="text-xs text-muted-foreground">Press Save to apply.</div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={isUpdatingCell}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!editing || isUpdatingCell}
                  onClick={async () => {
                    if (!editing) return
                    const nextVal = Number(editing.value)
                    if (!Number.isFinite(nextVal)) {
                      toast.error("Please enter a valid number")
                      return
                    }

                    setIsUpdatingCell(true)
                    setError(null)
                    try {
                      updateLocalCell(editing.rowId, nextVal)
                      if (isLikelyMongoId(editing.rowId)) {
                        await apiFetch(`/api/admin/distribution/lpg/rows/${editing.rowId}`, {
                          method: "PATCH",
                          body: JSON.stringify({ field: "gasul", value: nextVal }),
                        })
                      }
                      toast.success("Updated")
                      setEditing(null)
                    } catch (e: any) {
                      const msg = e?.message || "Failed to update"
                      setError(msg)
                      toast.error(msg)
                    } finally {
                      setIsUpdatingCell(false)
                    }
                  }}
                >
                  {isUpdatingCell ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}

type EditableWaterField =
  | "beneficiaries"
  | "water"
  | "week1"
  | "week2"
  | "week3"
  | "week4"
  | "week5"
  | "total"

export function Distribution({
  title = "Distribution",
  description = "Manage distribution and logistics",
}: DistributionPageProps = {}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Track and manage distribution of resources and materials to schools.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function RiceDistributionPage() {
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const [rows, setRows] = useState<RiceDistributionRow[]>([])
  const [fileName, setFileName] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState<string>("")
  const [riceHeaderTotal, setRiceHeaderTotal] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<{ rowId: string; value: string } | null>(null)
  const [isUpdatingCell, setIsUpdatingCell] = useState(false)
  const [isLoadingLatest, setIsLoadingLatest] = useState(true)

  const getApiBaseUrl = () => {
    const envAny = (import.meta as any)?.env as any
    const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
    return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
  }

  const getAuthToken = (): string | null => {
    try {
      const raw = localStorage.getItem("bhss_auth")
      if (!raw) return null
      const parsed = JSON.parse(raw) as { token?: string }
      return parsed?.token || null
    } catch {
      return null
    }
  }

  const apiFetch = async (path: string, init?: RequestInit) => {
    const token = getAuthToken()
    if (!token) throw new Error("Not authenticated")
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...(init || {}),
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

  const isLikelyMongoId = (s: string) => /^[a-f\d]{24}$/i.test(String(s || ""))

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.rice += r.rice
        return acc
      },
      { rice: 0 }
    )
  }, [rows])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setIsLoadingLatest(true)
        const data = await apiFetch("/api/admin/distribution/rice/latest")
        if (cancelled) return
        const savedRows = Array.isArray((data as any)?.rows) ? ((data as any).rows as any[]) : []
        if (savedRows.length === 0) return

        setRows(
          savedRows.map((r) => ({
            id: String(r.id || r._id || Math.random()),
            municipality: String(r.municipality || ""),
            school: String(r.schoolName || r.school || ""),
            rice: Number(r.rice || 0),
          }))
        )
        setFileName(String((data as any)?.batch?.sourceFileName || "Saved data"))
        setActiveSheet(String((data as any)?.batch?.sheetName || ""))
        setRiceHeaderTotal(null)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingLatest(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, RiceDistributionRow[]>()
    for (const r of rows) {
      if (!map.has(r.municipality)) map.set(r.municipality, [])
      map.get(r.municipality)!.push(r)
    }
    return Array.from(map.entries())
  }, [rows])

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName]
    if (!ws) throw new Error("Worksheet not found")
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][]

    const hasTemplateHeader = data
      .slice(0, 12)
      .some((r) => r.some((c) => String(c || "").toLowerCase().includes("rice distribution")))
    if (!hasTemplateHeader) {
      throw new Error("Invalid template: missing 'RICE DISTRIBUTION' header")
    }

    // Find header number from "Rice (1389)" pattern in first few rows
    const headerNumber = (() => {
      for (const r of data.slice(0, 5)) {
        for (const c of r) {
          const s = String(c || "")
          // Match patterns like "Rice (1389)" or just the number in parentheses
          const m = s.match(/rice\s*\(?\s*(\d+(?:[\.,]\d+)?)\s*\)?/i)
          if (m?.[1]) return Number(String(m[1]).replace(/,/g, ""))
        }
      }
      return null
    })()

    // Find the "LGU" header row to determine column structure
    let headerRowIndex = -1
    for (let i = 0; i < Math.min(data.length, 15); i++) {
      const row = data[i] || []
      const hasLGU = row.some((c) => String(c || "").toLowerCase() === "lgu")
      const hasKitchen = row.some((c) => String(c || "").toLowerCase().includes("bhss kitchen"))
      if (hasLGU && hasKitchen) {
        headerRowIndex = i
        break
      }
    }

    // Determine column indices based on header row
    let lguColIndex = 0
    let kitchenColIndex = 1
    let riceColIndex = 2

    if (headerRowIndex >= 0) {
      const headerRow = data[headerRowIndex] || []
      for (let idx = 0; idx < headerRow.length; idx++) {
        const cell = String(headerRow[idx] || "").toLowerCase().trim()
        if (cell === "lgu") lguColIndex = idx
        if (cell.includes("bhss kitchen")) kitchenColIndex = idx
      }
      // Rice column is the next column after kitchen, or column 2
      riceColIndex = kitchenColIndex + 1
    }

    let municipality = ""
    const out: RiceDistributionRow[] = []

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i] || []
      const colA = row[lguColIndex]
      const colB = row[kitchenColIndex]
      const colC = row[riceColIndex]

      const a = typeof colA === "string" ? colA.trim() : ""
      const b = typeof colB === "string" ? colB.trim() : ""

      // Skip subtotal/total rows
      const lowerA = a.toLowerCase()
      const lowerB = b.toLowerCase()
      if (lowerA === "total" || lowerB === "total") continue
      if (lowerA.includes("total") || lowerB.includes("total")) continue

      // Update municipality if we see a new one in LGU column
      if (a && a !== "LGU" && !lowerA.includes("municipality") && !isNumericValue(a)) {
        municipality = a
      }

      // Skip if no valid municipality yet
      if (!municipality) continue

      // Skip "LGU" label rows and empty rows
      if (!b || lowerB.includes("bhss kitchen") || lowerB === "lgu") continue

      // Parse rice value - handle both numbers and strings like "9.0"
      const rice = asNumber(colC)

      // Only add row if we have a school name
      if (b && !isNumericValue(b)) {
        out.push({
          id: `${municipality}-${b}-${i}`,
          municipality,
          school: b,
          rice,
        })
      }
    }

    if (out.length === 0) throw new Error("No distribution rows found in the file")
    return { rows: out, headerNumber }
  }

  const loadWorkbook = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: "array" })
    const names = (wb.SheetNames || []).slice()
    if (names.length === 0) throw new Error("No worksheet found")

    setWorkbook(wb)
    setSheetNames(names)

    const preferred =
      names.find((n) => n.toLowerCase().trim() === "rice") ||
      names.find((n) => n.toLowerCase().includes("rice")) ||
      names[0]

    setActiveSheet(preferred)
    const parsed = parseSheet(wb, preferred)
    setRows(parsed.rows)
    setRiceHeaderTotal(typeof parsed.headerNumber === "number" && Number.isFinite(parsed.headerNumber) ? parsed.headerNumber : null)
  }

  const onPickFile = () => {
    setError(null)
    importFileInputRef.current?.click()
  }

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return

    setError(null)
    setFileName(f.name)
    try {
      await loadWorkbook(f)
    } catch (err: any) {
      setRows([])
      setWorkbook(null)
      setSheetNames([])
      setActiveSheet("")
      setRiceHeaderTotal(null)
      setError(err?.message || "Failed to parse file")
    }
  }

  const updateLocalCell = (rowId: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, rice: value } : r)))
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">Rice Distribution</CardTitle>
            <CardDescription>Import an Excel template and review rice distribution records (25kg sacks).</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />
            <Button type="button" variant="outline" className="rounded-xl" onClick={onPickFile}>
              Import Excel
            </Button>

            <Button
              type="button"
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={rows.length === 0 || isSaving}
              onClick={async () => {
                setIsSaving(true)
                setError(null)
                try {
                  const result = await apiFetch("/api/admin/distribution/rice/batches", {
                    method: "POST",
                    body: JSON.stringify({
                      bhssKitchenName: "BHSS Kitchen",
                      sheetName: activeSheet,
                      sourceFileName: fileName,
                      items: rows.map((r) => ({
                        municipality: r.municipality,
                        schoolName: r.school,
                        rice: r.rice,
                      })),
                    }),
                  })
                  if ((result as any)?.unchanged) toast.message("Nothing to be changed")
                  else toast.success("Rice distribution saved")
                } catch (e: any) {
                  const msg = e?.message || "Failed to save"
                  setError(msg)
                  toast.error(msg)
                } finally {
                  setIsSaving(false)
                }
              }}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>

            {sheetNames.length > 0 ? (
              <Select
                value={activeSheet}
                onValueChange={(v) => {
                  setError(null)
                  setActiveSheet(v)
                  if (!workbook) return
                  try {
                    const parsed = parseSheet(workbook, v)
                    setRows(parsed.rows)
                    setRiceHeaderTotal(
                      typeof parsed.headerNumber === "number" && Number.isFinite(parsed.headerNumber) ? parsed.headerNumber : null
                    )
                  } catch (e: any) {
                    setRows([])
                    setRiceHeaderTotal(null)
                    setError(e?.message || "Failed to parse worksheet")
                  }
                }}
              >
                <SelectTrigger className="h-10 w-[180px] rounded-xl bg-white/70">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {sheetNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={rows.length === 0}
              onClick={() => {
                setRows([])
                setFileName("")
                setError(null)
                setWorkbook(null)
                setSheetNames([])
                setActiveSheet("")
                setRiceHeaderTotal(null)
              }}
            >
              Clear
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
          {fileName ? <div className="mb-3 text-xs text-muted-foreground truncate">{fileName}</div> : null}

          {isLoadingLatest && rows.length === 0 ? (
            <div className="rounded-2xl border bg-white/70 overflow-hidden">
              <div className="p-4 space-y-3">
                <Skeleton className="h-6 w-[320px]" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-white/70 overflow-hidden">
              <div className="max-h-[70vh] overflow-auto touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <Table className="min-w-[720px] w-full border-collapse text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        colSpan={2}
                        className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-left font-bold text-white"
                      >
                        <div>RICE DISTRIBUTION (25kg.)</div>
                      </TableHead>
                      <TableHead className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">
                        Rice ({riceHeaderTotal ?? totals.rice})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="border border-emerald-900/20 p-6 text-center text-muted-foreground"
                        >
                          Import an Excel file to populate the table.
                        </TableCell>
                      </TableRow>
                    ) : (
                      grouped.flatMap(([muni, muniRows]) => {
                      const muniTotals = muniRows.reduce(
                        (acc, r) => {
                          acc.rice += r.rice
                          return acc
                        },
                        { rice: 0 }
                      )

                      const lguRow = (
                        <TableRow key={`lgu-${muni}`}>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 text-center font-semibold">
                            LGU
                          </TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1">BHSS Kitchen</TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 text-right tabular-nums"></TableCell>
                        </TableRow>
                      )

                      const schoolRows = muniRows.map((r, idx) => (
                        <TableRow key={r.id}>
                          {idx === 0 ? (
                            <TableCell
                              rowSpan={muniRows.length}
                              className="border border-emerald-900/20 px-2 py-1 align-middle text-center font-semibold"
                            >
                              {muni}
                            </TableCell>
                          ) : null}
                          <TableCell className="border border-emerald-900/20 px-2 py-1">
                            <div className="max-w-[380px] truncate">{r.school}</div>
                          </TableCell>
                          <TableCell
                            className="border border-emerald-900/20 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() => setEditing({ rowId: r.id, value: String(r.rice ?? "") })}
                          >
                            {r.rice || ""}
                          </TableCell>
                        </TableRow>
                      ))

                      const subtotalRow = (
                        <TableRow key={`sub-${muni}`}>
                          <TableCell className="border border-emerald-900/20 px-2 py-1"></TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1"></TableCell>
                          <TableCell className="border border-emerald-900/20 px-2 py-1 text-right tabular-nums font-semibold">
                            {muniTotals.rice || ""}
                          </TableCell>
                        </TableRow>
                      )

                      return [lguRow, ...schoolRows, subtotalRow]
                    })
                    )}

                    {rows.length > 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="border border-emerald-900/20 bg-emerald-50 px-2 py-2 font-bold text-emerald-950"
                        >
                          Grand Total
                        </TableCell>
                        <TableCell className="border border-emerald-900/20 bg-emerald-50 px-2 py-2 text-right tabular-nums font-bold text-emerald-950">
                          {totals.rice}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <Dialog open={!!editing} onOpenChange={(o) => (!o ? setEditing(null) : null)}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Edit cell</DialogTitle>
                <DialogDescription>Rice (25kg sacks)</DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Input
                  inputMode="decimal"
                  value={editing?.value ?? ""}
                  onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
                  placeholder="Enter number"
                />
                <div className="text-xs text-muted-foreground">Press Save to apply.</div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={isUpdatingCell}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!editing || isUpdatingCell}
                  onClick={async () => {
                    if (!editing) return
                    const nextVal = Number(editing.value)
                    if (!Number.isFinite(nextVal)) {
                      toast.error("Please enter a valid number")
                      return
                    }

                    setIsUpdatingCell(true)
                    setError(null)
                    try {
                      updateLocalCell(editing.rowId, nextVal)
                      if (isLikelyMongoId(editing.rowId)) {
                        await apiFetch(`/api/admin/distribution/rice/rows/${editing.rowId}`, {
                          method: "PATCH",
                          body: JSON.stringify({ field: "rice", value: nextVal }),
                        })
                      }
                      toast.success("Updated")
                      setEditing(null)
                    } catch (e: any) {
                      const msg = e?.message || "Failed to update"
                      setError(msg)
                      toast.error(msg)
                    } finally {
                      setIsUpdatingCell(false)
                    }
                  }}
                >
                  {isUpdatingCell ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}

export function DistributionRice() {
  return <RiceDistributionPage />
}

export function DistributionWater() {
  return <WaterDistributionPage />
}

export function DistributionLpg() {
  return <LpgDistributionPage />
}

export function DistributionFruitsVeggies() {
  return <Distribution title="Fruits & Veggies" description="Manage fruits and vegetables distribution records" />
}

export function DistributionEquipments() {
  return <Distribution title="Equipments" description="Manage equipment distribution records" />
}

export function DistributionGrocery() {
  return <Distribution title="Grocery" description="Manage grocery distribution records" />
}

export function DistributionConsumables() {
  return <Distribution title="Consumables" description="Manage consumables distribution records" />
}

export function DistributionMeat() {
  return <Distribution title="Meat" description="Manage meat distribution records" />
}

type WaterDistributionRow = {
  id: string
  municipality: string
  school: string
  beneficiaries: number
  water: number
  week1: number
  week2: number
  week3: number
  week4: number
  week5: number
  total: number
}

type RiceDistributionRow = {
  id: string
  municipality: string
  school: string
  rice: number
}

type LpgDistributionRow = {
  id: string
  municipality: string
  school: string
  gasul: number
}

function isNumericValue(s: string): boolean {
  if (!s || s.trim() === "") return false
  const num = Number(s.replace(/,/g, ""))
  return Number.isFinite(num) && !isNaN(num)
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim()
    if (!cleaned) return 0
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function WaterDistributionPage() {
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const [rows, setRows] = useState<WaterDistributionRow[]>([])
  const [fileName, setFileName] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState<string>("")
  const [waterHeaderTotal, setWaterHeaderTotal] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingLatest, setIsLoadingLatest] = useState(true)
  const [editing, setEditing] = useState<{
    rowId: string
    field: EditableWaterField
    label: string
    value: string
  } | null>(null)
  const [isUpdatingCell, setIsUpdatingCell] = useState(false)

  const getApiBaseUrl = () => {
    const envAny = (import.meta as any)?.env as any
    const fromEnv = (envAny?.VITE_API_BASE_URL || envAny?.VITE_API_URL) as string | undefined
    return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
  }

  const getAuthToken = (): string | null => {
    try {
      const raw = localStorage.getItem("bhss_auth")
      if (!raw) return null
      const parsed = JSON.parse(raw) as { token?: string }
      return parsed?.token || null
    } catch {
      return null
    }
  }

  const apiFetch = async (path: string, init?: RequestInit) => {
    const token = getAuthToken()
    if (!token) throw new Error("Not authenticated")
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...(init || {}),
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

  const isLikelyMongoId = (s: string) => /^[a-f\d]{24}$/i.test(String(s || ""))

  const updateLocalCell = (rowId: string, field: EditableWaterField, value: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        return { ...r, [field]: value } as WaterDistributionRow
      })
    )
  }

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.water += r.water
        acc.total += r.total
        return acc
      },
      { water: 0, total: 0 }
    )
  }, [rows])

  // Load latest saved data so refresh doesn't clear the table
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setIsLoadingLatest(true)
        const data = await apiFetch("/api/admin/distribution/water/latest")
        if (cancelled) return
        const savedRows = Array.isArray((data as any)?.rows) ? ((data as any).rows as any[]) : []
        if (savedRows.length === 0) return

        setRows(
          savedRows.map((r) => ({
            id: String(r.id || r._id || Math.random()),
            municipality: String(r.municipality || ""),
            school: String(r.schoolName || r.school || ""),
            beneficiaries: Number(r.beneficiaries || 0),
            water: Number(r.water || 0),
            week1: Number(r.week1 || 0),
            week2: Number(r.week2 || 0),
            week3: Number(r.week3 || 0),
            week4: Number(r.week4 || 0),
            week5: Number(r.week5 || 0),
            total: Number(r.total || 0),
          }))
        )
        setFileName(String((data as any)?.batch?.sourceFileName || "Saved data"))
        setActiveSheet(String((data as any)?.batch?.sheetName || ""))
        setWaterHeaderTotal(null)
      } catch {
        // ignore (no saved data yet)
      } finally {
        if (!cancelled) setIsLoadingLatest(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, WaterDistributionRow[]>()
    for (const r of rows) {
      if (!map.has(r.municipality)) map.set(r.municipality, [])
      map.get(r.municipality)!.push(r)
    }
    return Array.from(map.entries())
  }, [rows])

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName]
    if (!ws) throw new Error("Worksheet not found")
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][]

    const hasTemplateHeader = data
      .slice(0, 12)
      .some((r) => r.some((c) => String(c || "").toLowerCase().includes("water distribution")))
    if (!hasTemplateHeader) {
      throw new Error("Invalid template: missing 'WATER DISTRIBUTION' header")
    }

    const headerNumber = (() => {
      for (const r of data.slice(0, 12)) {
        for (const c of r) {
          const s = String(c || "")
          const m = s.match(/water\s*\((\d+(?:[\.,]\d+)?)\)/i)
          if (m?.[1]) return Number(String(m[1]).replace(/,/g, ""))
        }
      }
      return null
    })()

    let municipality = ""
    const out: WaterDistributionRow[] = []

    for (let i = 0; i < data.length; i++) {
      const row = data[i] || []

      const colA = row[0]
      const colB = row[1]

      const a = typeof colA === "string" ? colA.trim() : ""
      const b = typeof colB === "string" ? colB.trim() : ""

      if (a && a.toLowerCase() !== "lgu" && !a.toLowerCase().includes("water distribution")) {
        municipality = a
      }

      if (!b) continue
      if (b.toLowerCase().includes("bhss kitchen")) continue

      const beneficiaries = asNumber(row[2])

      const water = asNumber(row[3])
      const week1 = asNumber(row[4])
      const week2 = asNumber(row[5])
      const week3 = asNumber(row[6])
      const week4 = asNumber(row[7])
      const week5 = asNumber(row[8])
      const total = asNumber(row[9])

      const hasAny = beneficiaries || water || week1 || week2 || week3 || week4 || week5 || total
      if (!hasAny) continue

      out.push({
        id: `${municipality}-${b}-${i}`,
        municipality: municipality || "Unknown",
        school: b,
        beneficiaries,
        water,
        week1,
        week2,
        week3,
        week4,
        week5,
        total,
      })
    }

    if (out.length === 0) throw new Error("No distribution rows found in the file")
    return { rows: out, headerNumber }
  }

  const loadWorkbook = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: "array" })
    const names = (wb.SheetNames || []).slice()
    if (names.length === 0) throw new Error("No worksheet found")

    setWorkbook(wb)
    setSheetNames(names)

    const preferred =
      names.find((n) => n.toLowerCase().trim() === "water") ||
      names.find((n) => n.toLowerCase().includes("water")) ||
      names[0]

    setActiveSheet(preferred)
    const parsed = parseSheet(wb, preferred)
    setRows(parsed.rows)
    setWaterHeaderTotal(typeof parsed.headerNumber === "number" && Number.isFinite(parsed.headerNumber) ? parsed.headerNumber : null)
  }

  const onPickFile = () => {
    setError(null)
    importFileInputRef.current?.click()
  }

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return

    setError(null)
    setFileName(f.name)
    try {
      await loadWorkbook(f)
    } catch (err: any) {
      setRows([])
      setWorkbook(null)
      setSheetNames([])
      setActiveSheet("")
      setError(err?.message || "Failed to import file")
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="rounded-2xl border border-black/5 bg-white/60 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(0,0,0,0.06)]">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" />
              Water Distribution
            </CardTitle>
            <CardDescription className="truncate">
              Import an Excel template and review the distribution records.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />
            <Button type="button" variant="outline" className="rounded-xl" onClick={onPickFile}>
              Import Excel
            </Button>

            <Button
              type="button"
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={rows.length === 0 || isSaving}
              onClick={async () => {
                setIsSaving(true)
                setError(null)
                try {
                  const result = await apiFetch("/api/admin/distribution/water/batches", {
                    method: "POST",
                    body: JSON.stringify({
                      bhssKitchenName: "BHSS Kitchen",
                      sheetName: activeSheet,
                      sourceFileName: fileName,
                      items: rows.map((r) => ({
                        municipality: r.municipality,
                        schoolName: r.school,
                        beneficiaries: r.beneficiaries,
                        water: r.water,
                        week1: r.week1,
                        week2: r.week2,
                        week3: r.week3,
                        week4: r.week4,
                        week5: r.week5,
                        total: r.total,
                      })),
                    }),
                  })
                  if ((result as any)?.unchanged) toast.message("Nothing to be changed")
                  else toast.success("Water distribution saved")
                } catch (e: any) {
                  const msg = e?.message || "Failed to save"
                  setError(msg)
                  toast.error(msg)
                } finally {
                  setIsSaving(false)
                }
              }}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>

            {sheetNames.length > 0 ? (
              <Select
                value={activeSheet}
                onValueChange={(v) => {
                  setError(null)
                  setActiveSheet(v)
                  if (!workbook) return
                  try {
                    const parsed = parseSheet(workbook, v)
                    setRows(parsed.rows)
                    setWaterHeaderTotal(
                      typeof parsed.headerNumber === "number" && Number.isFinite(parsed.headerNumber) ? parsed.headerNumber : null
                    )
                  } catch (e: any) {
                    setRows([])
                    setWaterHeaderTotal(null)
                    setError(e?.message || "Failed to parse worksheet")
                  }
                }}
              >
                <SelectTrigger className="h-10 w-[180px] rounded-xl bg-white/70">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {sheetNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={rows.length === 0}
              onClick={() => {
                setRows([])
                setFileName("")
                setError(null)
                setWorkbook(null)
                setSheetNames([])
                setActiveSheet("")
                setWaterHeaderTotal(null)
              }}
            >
              Clear
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
          {fileName ? <div className="mb-3 text-xs text-muted-foreground truncate">{fileName}</div> : null}

          {isLoadingLatest && rows.length === 0 ? (
            <div className="rounded-2xl border bg-white/70 overflow-hidden">
              <div className="p-4 space-y-3">
                <Skeleton className="h-6 w-[420px]" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-white/70 overflow-hidden">
              <div className="relative w-full max-w-full overflow-x-scroll overflow-y-hidden touch-pan-x overscroll-x-contain pb-3 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                <table className="min-w-[980px] w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th
                            colSpan={3}
                            className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-left font-bold text-white"
                          >
                            <div>WATER DISTRIBUTION</div>
                            <div className="text-xs font-semibold opacity-90">(5gallons)</div>
                          </th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">
                            Water ({waterHeaderTotal ?? totals.water})
                          </th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">Week 1</th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">Week 2</th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">Week 3</th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">Week 4</th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">Week 5</th>
                          <th className="border border-emerald-900/40 bg-emerald-700 px-2 py-2 text-center font-bold text-white">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="border border-emerald-900/30 p-6 text-center text-muted-foreground">
                        Import an Excel file to populate the table.
                      </td>
                    </tr>
                  ) : (
                    grouped.flatMap(([muni, muniRows]) => {
                      const muniTotals = muniRows.reduce(
                        (acc, r) => {
                          acc.water += r.water
                          acc.total += r.total
                          return acc
                        },
                        { water: 0, total: 0 }
                      )

                      const lguRow = (
                        <tr key={`lgu-${muni}`}>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-center font-semibold">LGU</td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1">BHSS Kitchen</td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/70 px-2 py-1 text-right tabular-nums"></td>
                        </tr>
                      )

                      const schoolRows = muniRows.map((r, idx) => (
                        <tr key={r.id}>
                          {idx === 0 ? (
                            <td
                              rowSpan={muniRows.length}
                              className="border border-emerald-900/30 px-2 py-1 align-middle text-center font-semibold"
                            >
                              {muni}
                            </td>
                          ) : null}
                          <td className="border border-emerald-900/30 px-2 py-1">
                            <div className="max-w-[260px] truncate">{r.school}</div>
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "beneficiaries",
                                label: "Beneficiaries",
                                value: String(r.beneficiaries ?? ""),
                              })
                            }
                          >
                            {r.beneficiaries || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "water",
                                label: "Water",
                                value: String(r.water ?? ""),
                              })
                            }
                          >
                            {r.water || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "week1",
                                label: "Week 1",
                                value: String(r.week1 ?? ""),
                              })
                            }
                          >
                            {r.week1 || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "week2",
                                label: "Week 2",
                                value: String(r.week2 ?? ""),
                              })
                            }
                          >
                            {r.week2 || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "week3",
                                label: "Week 3",
                                value: String(r.week3 ?? ""),
                              })
                            }
                          >
                            {r.week3 || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "week4",
                                label: "Week 4",
                                value: String(r.week4 ?? ""),
                              })
                            }
                          >
                            {r.week4 || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "week5",
                                label: "Week 5",
                                value: String(r.week5 ?? ""),
                              })
                            }
                          >
                            {r.week5 || ""}
                          </td>
                          <td
                            className="border border-emerald-900/30 px-2 py-1 text-right tabular-nums cursor-pointer hover:bg-emerald-50"
                            onClick={() =>
                              setEditing({
                                rowId: r.id,
                                field: "total",
                                label: "Total",
                                value: String(r.total ?? ""),
                              })
                            }
                          >
                            {r.total || ""}
                          </td>
                        </tr>
                      ))

                      const subtotalRow = (
                        <tr key={`sub-${muni}`}>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1 text-right tabular-nums font-semibold">
                            {muniTotals.water || ""}
                          </td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1"></td>
                          <td className="border border-emerald-900/30 bg-emerald-50/40 px-2 py-1 text-right tabular-nums font-semibold">
                            {muniTotals.total || ""}
                          </td>
                        </tr>
                      )

                      return [lguRow, ...schoolRows, subtotalRow]
                    })
                  )}

                  {rows.length > 0 ? (
                    <tr>
                      <td colSpan={2} className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2 font-bold">
                        Grand Total
                      </td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2"></td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2 text-right tabular-nums font-bold">
                        {totals.water}
                      </td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2"></td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2"></td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2"></td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2"></td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2"></td>
                      <td className="border border-emerald-900/30 bg-emerald-50/60 px-2 py-2 text-right tabular-nums font-bold">
                        {totals.total}
                      </td>
                    </tr>
                  ) : null}
                      </tbody>
                    </table>
              </div>
            </div>
          )}

          <Dialog open={!!editing} onOpenChange={(o) => (!o ? setEditing(null) : null)}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Edit cell</DialogTitle>
                <DialogDescription>
                  {editing ? `${editing.label}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Input
                  inputMode="decimal"
                  value={editing?.value ?? ""}
                  onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
                  placeholder="Enter number"
                />
                <div className="text-xs text-muted-foreground">Press Save to apply.</div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={isUpdatingCell}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!editing || isUpdatingCell}
                  onClick={async () => {
                    if (!editing) return
                    const nextVal = Number(editing.value)
                    if (!Number.isFinite(nextVal)) {
                      toast.error("Please enter a valid number")
                      return
                    }

                    setIsUpdatingCell(true)
                    setError(null)
                    try {
                      updateLocalCell(editing.rowId, editing.field, nextVal)
                      if (isLikelyMongoId(editing.rowId)) {
                        await apiFetch(`/api/admin/distribution/water/rows/${editing.rowId}`, {
                          method: "PATCH",
                          body: JSON.stringify({ field: editing.field, value: nextVal }),
                        })
                      }
                      toast.success("Updated")
                      setEditing(null)
                    } catch (e: any) {
                      const msg = e?.message || "Failed to update"
                      setError(msg)
                      toast.error(msg)
                    } finally {
                      setIsUpdatingCell(false)
                    }
                  }}
                >
                  {isUpdatingCell ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
