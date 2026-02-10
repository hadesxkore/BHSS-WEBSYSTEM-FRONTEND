import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import {
  type SchoolBeneficiaryRow,
  useSchoolDirectoryStore,
} from "@/stores/school-directory-store"

type SchoolData = {
  id: string
  bhssKitchenName: string
  schoolName: string
  grade2: number
  grade3: number
  grade4: number
  total: number
  schoolYear: string
}

export function SchoolDirectoryBeneficiariesTab({
  selectedMunicipality,
  schoolYear,
}: {
  selectedMunicipality: string
  schoolYear: string
}) {
  const importFileInputRef = useRef<HTMLInputElement | null>(null)

  const beneficiaryRows = useSchoolDirectoryStore((s) => s.beneficiaryRows)
  const isLoading = useSchoolDirectoryStore((s) => s.isLoading)
  const fetchBeneficiaries = useSchoolDirectoryStore((s) => s.fetchBeneficiaries)
  const bulkCreateBeneficiaries = useSchoolDirectoryStore(
    (s) => s.bulkCreateBeneficiaries
  )
  const updateBeneficiary = useSchoolDirectoryStore((s) => s.updateBeneficiary)
  const updateManyBeneficiaries = useSchoolDirectoryStore(
    (s) => s.updateManyBeneficiaries
  )
  const deleteBeneficiary = useSchoolDirectoryStore((s) => s.deleteBeneficiary)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [currentKitchenName, setCurrentKitchenName] = useState("")
  const [tempSchools, setTempSchools] = useState<SchoolData[]>([])
  const [isKitchenLocked, setIsKitchenLocked] = useState(false)

  const [isEditSchoolOpen, setIsEditSchoolOpen] = useState(false)
  const [editSchoolId, setEditSchoolId] = useState<string | null>(null)
  const [editSchoolForm, setEditSchoolForm] = useState({
    bhssKitchenName: "",
    schoolName: "",
    grade2: 0,
    grade3: 0,
    grade4: 0,
  })

  const [formData, setFormData] = useState({
    schoolName: "",
    grade2: 0,
    grade3: 0,
    grade4: 0,
  })

  const [isEditCellOpen, setIsEditCellOpen] = useState(false)
  const [editCell, setEditCell] = useState<
    | {
        type: "school"
        schoolId: string
        field: "schoolName" | "grade2" | "grade3" | "grade4"
        label: string
        value: string
        inputType: "text" | "number"
      }
    | {
        type: "kitchen"
        kitchenName: string
        label: string
        value: string
        inputType: "text"
      }
    | null
  >(null)

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const getErrorMessage = (e: unknown) => {
    if (typeof e === "string") return e
    if (e && typeof e === "object" && "message" in e) {
      const msg = (e as any).message
      if (typeof msg === "string") return msg
    }
    return "Something went wrong."
  }

  useEffect(() => {
    fetchBeneficiaries(selectedMunicipality, schoolYear).catch(() => {
      // error surfaced via store + toast from handlers
    })
  }, [fetchBeneficiaries, schoolYear, selectedMunicipality])

  const currentData = useMemo(() => {
    return (beneficiaryRows || [])
      .filter((r) => r.municipality === selectedMunicipality && r.schoolYear === schoolYear)
      .map((r: SchoolBeneficiaryRow) => ({
        id: r.id,
        bhssKitchenName: r.bhssKitchenName,
        schoolName: r.schoolName,
        grade2: r.grade2,
        grade3: r.grade3,
        grade4: r.grade4,
        total: r.total,
        schoolYear: r.schoolYear,
      }))
  }, [beneficiaryRows, schoolYear, selectedMunicipality])

  const kitchenNameOptions = useMemo(
    () =>
      Array.from(
        new Set((currentData || []).map((s) => s.bhssKitchenName).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [currentData]
  )

  const groupedByKitchen = useMemo(
    () =>
      currentData.reduce((acc, school) => {
        if (!acc[school.bhssKitchenName]) {
          acc[school.bhssKitchenName] = []
        }
        acc[school.bhssKitchenName].push(school)
        return acc
      }, {} as Record<string, SchoolData[]>),
    [currentData]
  )

  const calculatePerSK = (schools: SchoolData[]) => {
    return schools.reduce((sum, school) => sum + school.total, 0)
  }

  const handleOpenDialog = () => {
    setIsDialogOpen(true)
    setIsKitchenLocked(false)
    setCurrentKitchenName("")
    setTempSchools([])
    setFormData({
      schoolName: "",
      grade2: 0,
      grade3: 0,
      grade4: 0,
    })
  }

  const handleOpenAddSchoolForKitchen = (kitchenName: string) => {
    setIsDialogOpen(true)
    setIsKitchenLocked(true)
    setCurrentKitchenName(kitchenName)
    setTempSchools([])
    setFormData({
      schoolName: "",
      grade2: 0,
      grade3: 0,
      grade4: 0,
    })
  }

  const handleAddSchoolToList = () => {
    const total = formData.grade2 + formData.grade3 + formData.grade4
    const newSchool: SchoolData = {
      id: Date.now().toString() + Math.random(),
      bhssKitchenName: currentKitchenName,
      schoolName: formData.schoolName,
      grade2: formData.grade2,
      grade3: formData.grade3,
      grade4: formData.grade4,
      total,
      schoolYear,
    }

    setTempSchools([...tempSchools, newSchool])
    setFormData({
      schoolName: "",
      grade2: 0,
      grade3: 0,
      grade4: 0,
    })
  }

  const handleRemoveTempSchool = (id: string) => {
    setTempSchools(tempSchools.filter((school) => school.id !== id))
  }

  const handleSaveAllSchools = () => {
    if (tempSchools.length === 0) return

    bulkCreateBeneficiaries({
      municipality: selectedMunicipality,
      schoolYear,
      items: tempSchools.map((s) => ({
        bhssKitchenName: s.bhssKitchenName,
        schoolName: s.schoolName,
        grade2: s.grade2,
        grade3: s.grade3,
        grade4: s.grade4,
      })),
    })
      .then(() => {
        toast.success("Schools saved successfully")
        setIsDialogOpen(false)
        setIsKitchenLocked(false)
        setCurrentKitchenName("")
        setTempSchools([])
        setFormData({
          schoolName: "",
          grade2: 0,
          grade3: 0,
          grade4: 0,
        })
      })
      .catch((e) => {
        toast.error(getErrorMessage(e))
      })
  }

  const handleDeleteSchool = (id: string) => {
    deleteBeneficiary(id)
      .then(() => {
        toast.success("School deleted successfully")
      })
      .catch((e) => {
        toast.error(getErrorMessage(e))
      })
  }

  const handleRequestDeleteSchool = (id: string) => {
    setPendingDeleteId(id)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDeleteSchool = () => {
    if (!pendingDeleteId) return
    handleDeleteSchool(pendingDeleteId)
    setIsDeleteConfirmOpen(false)
    setPendingDeleteId(null)
  }

  const handleImportExcelClick = () => {
    importFileInputRef.current?.click()
  }

  const handleImportExcelFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const firstSheetName = wb.SheetNames?.[0]
      if (!firstSheetName) {
        toast.error("No sheet found in the uploaded file.")
        return
      }

      const ws = wb.Sheets[firstSheetName]
      const rows = (XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        blankrows: false,
      }) || []) as Array<Array<string | number>>

      const normalize = (v: unknown) => String(v ?? "").trim().toLowerCase()
      const normalizeKey = (v: unknown) =>
        normalize(v)
          .replace(/[^a-z0-9]+/g, "")
          .trim()

      const headerRowIndex = rows.findIndex((r) => {
        const keys = (r || []).map((c) => normalizeKey(c))
        const hasKitchen = keys.some((k) => k.includes("kitchen") && k.includes("bhss"))
        const hasSchools = keys.some((k) => k === "schools" || k.includes("school"))
        const hasGrade2 = keys.some((k) => k === "grade2" || k.includes("grade2") || k === "g2")
        const hasGrade3 = keys.some((k) => k === "grade3" || k.includes("grade3") || k === "g3")
        const hasGrade4 = keys.some((k) => k === "grade4" || k.includes("grade4") || k === "g4")
        return hasKitchen && hasSchools && hasGrade2 && hasGrade3 && hasGrade4
      })

      if (headerRowIndex === -1) {
        toast.error(
          "Could not detect the header row. Please upload the BHSS template Excel (with 'BHSS Kitchen' and 'Schools' headers)."
        )
        return
      }

      const header = rows[headerRowIndex] || []
      const headerKeys = header.map((c) => normalizeKey(c))

      const findCol = (pred: (key: string) => boolean) =>
        headerKeys.findIndex((key) => pred(key))

      const lguCol = findCol((k) => k === "lgu")
      const kitchenCol = findCol((k) => (k.includes("bhss") && k.includes("kitchen")) || k === "kitchen")
      const schoolCol = findCol((k) => k === "schools" || k === "school" || k.includes("schoolname"))
      const grade2Col = findCol((k) => k === "grade2" || k.includes("grade2") || k === "g2")
      const grade3Col = findCol((k) => k === "grade3" || k.includes("grade3") || k === "g3")
      const grade4Col = findCol((k) => k === "grade4" || k.includes("grade4") || k === "g4")

      if ([kitchenCol, schoolCol, grade2Col, grade3Col, grade4Col].some((i) => i < 0)) {
        toast.error(
          `Missing required columns. Found headers: ${headerKeys
            .filter(Boolean)
            .slice(0, 30)
            .join(", ")}`
        )
        return
      }

      const toNumber = (v: unknown) => {
        const n = typeof v === "number" ? v : Number(String(v ?? "").trim())
        return Number.isFinite(n) ? n : 0
      }

      const selectedMunicipalityKey = normalizeKey(selectedMunicipality)

      let lastKitchen = ""
      let lastLGU = ""
      const items: Array<{
        bhssKitchenName: string
        schoolName: string
        grade2: number
        grade3: number
        grade4: number
      }> = []
      let skipped = 0

      const normalizeName = (v: string) =>
        String(v || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase()

      const existingKeys = new Set(
        (currentData || []).map(
          (r) =>
            `${normalizeName(r.bhssKitchenName)}||${normalizeName(r.schoolName)}`
        )
      )

      const importedKeys = new Set<string>()
      let skippedDuplicates = 0

      for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        const r = rows[i] || []

        if (lguCol >= 0) {
          const lguCell = String(r[lguCol] ?? "").trim()
          if (lguCell) lastLGU = lguCell
          if (normalizeKey(lastLGU) !== selectedMunicipalityKey) {
            continue
          }
        }

        const kitchenCell = String(r[kitchenCol] ?? "").trim()
        if (kitchenCell) lastKitchen = kitchenCell
        const schoolName = String(r[schoolCol] ?? "").trim()

        if (!lastKitchen || !schoolName) {
          skipped += 1
          continue
        }

        const key = `${normalizeName(lastKitchen)}||${normalizeName(schoolName)}`
        if (existingKeys.has(key) || importedKeys.has(key)) {
          skippedDuplicates += 1
          continue
        }
        importedKeys.add(key)

        items.push({
          bhssKitchenName: lastKitchen,
          schoolName,
          grade2: toNumber(r[grade2Col]),
          grade3: toNumber(r[grade3Col]),
          grade4: toNumber(r[grade4Col]),
        })
      }

      if (items.length === 0) {
        toast.error(
          skippedDuplicates > 0
            ? `No new rows to import. Skipped ${skippedDuplicates} duplicate rows.`
            : "No valid rows found to import."
        )
        return
      }

      await bulkCreateBeneficiaries({
        municipality: selectedMunicipality,
        schoolYear,
        items,
      })

      const parts: string[] = [`Imported ${items.length} rows.`]
      if (skippedDuplicates > 0) parts.push(`Skipped ${skippedDuplicates} duplicates.`)
      if (skipped > 0) parts.push(`Skipped ${skipped} invalid/blank rows.`)
      toast.success(parts.join(" "))
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const handleOpenEditSchool = (school: SchoolData) => {
    setEditSchoolId(school.id)
    setEditSchoolForm({
      bhssKitchenName: school.bhssKitchenName,
      schoolName: school.schoolName,
      grade2: school.grade2,
      grade3: school.grade3,
      grade4: school.grade4,
    })
    setIsEditSchoolOpen(true)
  }

  const handleSaveEditedSchool = () => {
    if (!editSchoolId) return

    updateBeneficiary(editSchoolId, {
      bhssKitchenName: editSchoolForm.bhssKitchenName,
      schoolName: editSchoolForm.schoolName,
      grade2: editSchoolForm.grade2,
      grade3: editSchoolForm.grade3,
      grade4: editSchoolForm.grade4,
    })
      .then(() => {
        toast.success("School updated successfully")
        setIsEditSchoolOpen(false)
        setEditSchoolId(null)
      })
      .catch((e) => {
        toast.error(getErrorMessage(e))
      })
  }

  const handleOpenEditCell = (
    schoolId: string,
    field: "schoolName" | "grade2" | "grade3" | "grade4",
    label: string,
    currentValue: string | number
  ) => {
    setEditCell({
      type: "school",
      schoolId,
      field,
      label,
      value: String(currentValue ?? ""),
      inputType: field === "schoolName" ? "text" : "number",
    })
    setIsEditCellOpen(true)
  }

  const handleOpenEditKitchen = (kitchenName: string) => {
    setEditCell({
      type: "kitchen",
      kitchenName,
      label: "BHSS Kitchen",
      value: kitchenName,
      inputType: "text",
    })
    setIsEditCellOpen(true)
  }

  const handleSaveEditCell = () => {
    if (!editCell) return

    if (editCell.type === "school") {
      const nextValue = editCell.value
      const input: any = {}

      if (editCell.field === "schoolName") {
        input.schoolName = nextValue
      } else {
        const n = Number(nextValue)
        input[editCell.field] = Number.isFinite(n) ? n : 0
      }

      updateBeneficiary(editCell.schoolId, input)
        .then(() => {
          toast.success("Updated successfully")
        })
        .catch((e) => {
          toast.error(getErrorMessage(e))
        })
    }

    if (editCell.type === "kitchen") {
      const newKitchen = editCell.value.trim()
      if (newKitchen) {
        const affected = currentData.filter(
          (s) => s.bhssKitchenName === editCell.kitchenName
        )

        updateManyBeneficiaries(
          affected.map((s) => ({
            id: s.id,
            input: { bhssKitchenName: newKitchen },
          }))
        )
          .then(() => {
            toast.success("Kitchen updated successfully")
          })
          .catch((e) => {
            toast.error(getErrorMessage(e))
          })
      }
    }

    setIsEditCellOpen(false)
    setEditCell(null)
  }

  const handleExportToExcel = () => {
    if (currentData.length === 0) {
      toast.error("No data to export.")
      return
    }

    const getKitchenCategory = (schoolName: string) => {
      const v = String(schoolName || "").trim()
      if (v.startsWith("XS")) return "Satellite"
      if (v.startsWith("S")) return "Central Kitchen"
      if (v.startsWith("M")) return "Central Kitchen"
      return ""
    }

    const aoa: (string | number)[][] = []
    const merges: XLSX.Range[] = []

    // Columns:
    // A LGU
    // B BHSS Kitchen
    // C Schools
    // D Kitchen Category
    // E (spacer)
    // F Grade 2
    // G Grade 3
    // H Grade 4
    // I Total
    // J Per SK

    aoa.push([
      "",
      "CENTRAL AND STANDALONE KITCHEN",
      "",
      "",
      "",
      `Actual Beneficiaries S.Y ${schoolYear}`,
      "",
      "",
      "",
      "Per SK",
    ])

    aoa.push([
      "LGU",
      "BHSS Kitchen",
      "Schools",
      "Kitchen Category",
      "",
      "Grade 2",
      "Grade 3",
      "Grade 4",
      "Total",
      "",
    ])

    merges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: 3 } })
    merges.push({ s: { r: 0, c: 5 }, e: { r: 0, c: 8 } })
    merges.push({ s: { r: 0, c: 9 }, e: { r: 1, c: 9 } })

    const kitchenEntries = Object.entries(groupedByKitchen).sort(([a], [b]) =>
      a.localeCompare(b)
    )

    let rowCursor = 2
    const municipalityStart = rowCursor

    kitchenEntries.forEach(([kitchenName, schools]) => {
      const perSK = calculatePerSK(schools)
      const groupStart = rowCursor

      schools.forEach((school, idx) => {
        aoa.push([
          idx === 0 && kitchenEntries[0]?.[0] === kitchenName
            ? selectedMunicipality.toUpperCase()
            : "",
          idx === 0 ? kitchenName : "",
          school.schoolName,
          getKitchenCategory(school.schoolName),
          "",
          school.grade2,
          school.grade3,
          school.grade4,
          school.total,
          idx === 0 ? perSK : "",
        ])
        rowCursor += 1
      })

      const groupEnd = rowCursor - 1
      if (schools.length > 1) {
        merges.push({ s: { r: groupStart, c: 1 }, e: { r: groupEnd, c: 1 } })
        merges.push({ s: { r: groupStart, c: 9 }, e: { r: groupEnd, c: 9 } })
      }
    })

    const municipalityEnd = rowCursor - 1
    if (municipalityEnd >= municipalityStart) {
      merges.push({ s: { r: municipalityStart, c: 0 }, e: { r: municipalityEnd, c: 0 } })
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!merges"] = merges
    ws["!cols"] = [
      { wch: 16 },
      { wch: 22 },
      { wch: 30 },
      { wch: 22 },
      { wch: 3 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, selectedMunicipality)

    const safeMunicipality = selectedMunicipality.replace(/[\\/:*?"<>|]/g, "-")
    XLSX.writeFile(wb, `School-Directory_${safeMunicipality}_${schoolYear}.xlsx`)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{selectedMunicipality}</CardTitle>
          <div className="flex items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                handleImportExcelFile(file)
                  .catch(() => {
                    // toast handled in handler
                  })
                  .finally(() => {
                    if (importFileInputRef.current) {
                      importFileInputRef.current.value = ""
                    }
                  })
              }}
            />

            <Button
              size="sm"
              variant="outline"
              onClick={handleImportExcelClick}
              disabled={isLoading}
            >
              <Upload className="size-4" />
              Import Excel
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleExportToExcel}
              disabled={isLoading}
            >
              <Download className="size-4" />
              Export to Excel
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={handleOpenDialog}>
                  <Plus className="size-4" />
                  Add School
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Schools to Kitchen</DialogTitle>
                  <DialogDescription>
                    Add school data for {selectedMunicipality} - S.Y {schoolYear}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="bhssKitchenName">BHSS Kitchen Name</Label>
                    <Input
                      id="bhssKitchenName"
                      list="bhssKitchenNameOptions"
                      value={currentKitchenName}
                      onChange={(e) => setCurrentKitchenName(e.target.value)}
                      placeholder="Enter kitchen name"
                      disabled={tempSchools.length > 0 || isKitchenLocked}
                    />
                    <datalist id="bhssKitchenNameOptions">
                      {kitchenNameOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>

                  {currentKitchenName && (
                    <>
                      <div className="border-t pt-4 space-y-4">
                        <h3 className="font-semibold">Add School</h3>
                        <div className="grid gap-2">
                          <Label htmlFor="schoolName">School Name</Label>
                          <Input
                            id="schoolName"
                            value={formData.schoolName}
                            onChange={(e) =>
                              setFormData({ ...formData, schoolName: e.target.value })
                            }
                            placeholder="Enter school name"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="grade2">Grade 2</Label>
                            <Input
                              id="grade2"
                              type="number"
                              value={formData.grade2}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  grade2: parseInt(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="grade3">Grade 3</Label>
                            <Input
                              id="grade3"
                              type="number"
                              value={formData.grade3}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  grade3: parseInt(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="grade4">Grade 4</Label>
                            <Input
                              id="grade4"
                              type="number"
                              value={formData.grade4}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  grade4: parseInt(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </div>
                        <Button
                          onClick={handleAddSchoolToList}
                          variant="outline"
                          className="w-full"
                          disabled={!formData.schoolName}
                        >
                          <Plus className="size-4" />
                          Add Another School
                        </Button>
                      </div>

                      {tempSchools.length > 0 && (
                        <div className="border-t pt-4 space-y-2">
                          <h3 className="font-semibold">Schools Added ({tempSchools.length})</h3>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {tempSchools.map((school) => (
                              <div
                                key={school.id}
                                className="flex items-center justify-between bg-muted/50 p-3 rounded-md"
                              >
                                <div className="flex-1">
                                  <p className="font-medium">{school.schoolName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    G2: {school.grade2} | G3: {school.grade3} | G4: {school.grade4} | Total:{" "}
                                    {school.total}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleRemoveTempSchool(school.id)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAllSchools} disabled={tempSchools.length === 0 || isLoading}>
                    Save All Schools ({tempSchools.length})
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <AlertDialog
          open={isDeleteConfirmOpen}
          onOpenChange={(open) => {
            setIsDeleteConfirmOpen(open)
            if (!open) setPendingDeleteId(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this school?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDeleteSchool}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {currentData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No data available for {selectedMunicipality}</p>
            <p className="text-sm mt-2">Click "Add School" to get started</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/5 bg-white/50 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-white/60 hover:bg-white/70">
                  <TableHead className="text-center font-bold border-r" rowSpan={2}>
                    BHSS Kitchen
                  </TableHead>
                  <TableHead className="text-center font-bold border-r" rowSpan={2}>
                    Schools
                  </TableHead>
                  <TableHead className="text-center font-bold border-r" colSpan={4}>
                    Actual Beneficiaries S.Y {schoolYear}
                  </TableHead>
                  <TableHead className="text-center font-bold" rowSpan={2}>
                    Per SK
                  </TableHead>
                  <TableHead rowSpan={2}></TableHead>
                </TableRow>
                <TableRow className="bg-white/60 hover:bg-white/70">
                  <TableHead className="text-center font-semibold border-r">Grade 2</TableHead>
                  <TableHead className="text-center font-semibold border-r">Grade 3</TableHead>
                  <TableHead className="text-center font-semibold border-r">Grade 4</TableHead>
                  <TableHead className="text-center font-semibold border-r">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedByKitchen).map(([kitchenName, schools]) => {
                  const perSK = calculatePerSK(schools)
                  return schools.map((school, index) => (
                    <TableRow key={school.id} className="border-b">
                      {index === 0 && (
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <TableCell
                              className="font-semibold text-center bg-white/50 border-r align-middle cursor-pointer hover:bg-white/70"
                              rowSpan={schools.length}
                              onClick={() => handleOpenEditKitchen(kitchenName)}
                            >
                              {kitchenName}
                            </TableCell>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onSelect={() => handleOpenAddSchoolForKitchen(kitchenName)}
                            >
                              Add school under this kitchen
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )}
                      <TableCell
                        className="border-r align-middle cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          handleOpenEditCell(
                            school.id,
                            "schoolName",
                            "School Name",
                            school.schoolName
                          )
                        }
                      >
                        {school.schoolName}
                      </TableCell>
                      <TableCell
                        className="text-center border-r align-middle cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          handleOpenEditCell(school.id, "grade2", "Grade 2", school.grade2)
                        }
                      >
                        {school.grade2}
                      </TableCell>
                      <TableCell
                        className="text-center border-r align-middle cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          handleOpenEditCell(school.id, "grade3", "Grade 3", school.grade3)
                        }
                      >
                        {school.grade3}
                      </TableCell>
                      <TableCell
                        className="text-center border-r align-middle cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          handleOpenEditCell(school.id, "grade4", "Grade 4", school.grade4)
                        }
                      >
                        {school.grade4}
                      </TableCell>
                      <TableCell className="text-center font-semibold border-r align-middle">
                        {school.total}
                      </TableCell>
                      {index === 0 && (
                        <TableCell
                          className="text-center font-bold text-lg bg-white/50 border-r align-middle"
                          rowSpan={schools.length}
                        >
                          {perSK}
                        </TableCell>
                      )}
                      <TableCell className="text-center align-middle">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleOpenEditSchool(school)}
                          disabled={isLoading}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRequestDeleteSchool(school.id)}
                          disabled={isLoading}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={isEditSchoolOpen} onOpenChange={setIsEditSchoolOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit School Row</DialogTitle>
              <DialogDescription>
                Update school data for {selectedMunicipality} - S.Y {schoolYear}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="editKitchenName">BHSS Kitchen Name</Label>
                <Input
                  id="editKitchenName"
                  list="bhssKitchenNameOptions"
                  value={editSchoolForm.bhssKitchenName}
                  onChange={(e) =>
                    setEditSchoolForm({
                      ...editSchoolForm,
                      bhssKitchenName: e.target.value,
                    })
                  }
                  placeholder="Enter kitchen name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editSchoolName">School Name</Label>
                <Input
                  id="editSchoolName"
                  value={editSchoolForm.schoolName}
                  onChange={(e) =>
                    setEditSchoolForm({
                      ...editSchoolForm,
                      schoolName: e.target.value,
                    })
                  }
                  placeholder="Enter school name"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="editGrade2">Grade 2</Label>
                  <Input
                    id="editGrade2"
                    type="number"
                    value={editSchoolForm.grade2}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setEditSchoolForm({
                        ...editSchoolForm,
                        grade2: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editGrade3">Grade 3</Label>
                  <Input
                    id="editGrade3"
                    type="number"
                    value={editSchoolForm.grade3}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setEditSchoolForm({
                        ...editSchoolForm,
                        grade3: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editGrade4">Grade 4</Label>
                  <Input
                    id="editGrade4"
                    type="number"
                    value={editSchoolForm.grade4}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setEditSchoolForm({
                        ...editSchoolForm,
                        grade4: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditSchoolOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEditedSchool}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditCellOpen}
          onOpenChange={(open) => {
            setIsEditCellOpen(open)
            if (!open) setEditCell(null)
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit Field</DialogTitle>
              <DialogDescription>Update the selected value for {selectedMunicipality}.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label className="text-xs font-medium">{editCell?.label ?? ""}</Label>
              <Input
                type={editCell?.inputType ?? "text"}
                value={editCell?.value ?? ""}
                onChange={(e) =>
                  setEditCell((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                onFocus={(e) => e.currentTarget.select()}
                placeholder="Enter value"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditCellOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEditCell} disabled={!editCell || editCell.value.trim() === ""}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
