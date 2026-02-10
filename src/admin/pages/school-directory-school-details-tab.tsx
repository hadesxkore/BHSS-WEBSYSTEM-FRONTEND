import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Eye, Plus, Trash2, Upload } from "lucide-react"
import * as XLSX from "xlsx"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import {
  type SchoolDetailsRow,
  useSchoolDirectoryStore,
} from "@/stores/school-directory-store"

type SchoolDetails = SchoolDetailsRow

const PHONE_FIELDS = new Set<
  Exclude<keyof SchoolDetails, "id" | "municipality" | "schoolYear">
>([
  "principalContact",
  "hlaCoordinatorContact",
  "hlaManagerContact",
  "chiefCookContact",
  "assistantCookContact",
  "nurseContact",
])

function sanitizePhPhone(value: string) {
  const digitsOnly = String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^0-9]/g, "")

  // Keep as digits; PH numbers are commonly 11 digits (09xxxxxxxxx) or 12 digits (63xxxxxxxxxx)
  // We don't hard-block length here to avoid breaking partial input.
  return digitsOnly
}

function displayNA(value: unknown) {
  const v = String(value ?? "").trim()
  return v ? v : "N/A"
}

export function SchoolDirectorySchoolDetailsTab({
  selectedMunicipality,
  schoolYear,
}: {
  selectedMunicipality: string
  schoolYear: string
}) {
  const importFileInputRef = useRef<HTMLInputElement | null>(null)

  const detailsRows = useSchoolDirectoryStore((s) => s.detailsRows)
  const isLoading = useSchoolDirectoryStore((s) => s.isLoading)
  const fetchDetails = useSchoolDirectoryStore((s) => s.fetchDetails)
  const createDetails = useSchoolDirectoryStore((s) => s.createDetails)
  const updateDetails = useSchoolDirectoryStore((s) => s.updateDetails)
  const deleteDetails = useSchoolDirectoryStore((s) => s.deleteDetails)

  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false)
  const [editDetailsSchoolId, setEditDetailsSchoolId] = useState<string | null>(null)
  const [editDetailsField, setEditDetailsField] = useState<
    Exclude<keyof SchoolDetails, "id" | "municipality" | "schoolYear"> | null
  >(null)
  const [editDetailsLabel, setEditDetailsLabel] = useState("")
  const [editDetailsValue, setEditDetailsValue] = useState("")

  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false)
  const [viewDetailsRow, setViewDetailsRow] = useState<SchoolDetails | null>(null)

  const [dinalupihanArea, setDinalupihanArea] = useState<"East" | "West">("East")
  const [isImportAreaDialogOpen, setIsImportAreaDialogOpen] = useState(false)
  const [importTargetMunicipality, setImportTargetMunicipality] = useState<string | null>(
    null
  )

  const [isImporting, setIsImporting] = useState(false)
  const [animatedNewRowIds, setAnimatedNewRowIds] = useState<Set<string>>(() => new Set())
  const importAnimationOrderRef = useRef(new Map<string, number>())
  const importAnimationCounterRef = useRef(0)
  const seenRowIdsRef = useRef(new Set<string>())

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const [detailsFormData, setDetailsFormData] = useState<Partial<SchoolDetails>>({
    completeName: "",
    principalName: "",
    principalContact: "",
    hlaCoordinatorName: "",
    hlaCoordinatorContact: "",
    hlaCoordinatorFacebook: "",
    hlaManagerName: "",
    hlaManagerContact: "",
    hlaManagerFacebook: "",
    chiefCookName: "",
    chiefCookContact: "",
    chiefCookFacebook: "",
    assistantCookName: "",
    assistantCookContact: "",
    assistantCookFacebook: "",
    nurseName: "",
    nurseContact: "",
    nurseFacebook: "",
  })

  const getErrorMessage = (e: unknown) => {
    if (typeof e === "string") return e
    if (e && typeof e === "object" && "message" in e) {
      const msg = (e as any).message
      if (typeof msg === "string") return msg
    }
    return "Something went wrong."
  }

  const normalizeKey = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")

  const normalizeName = (v: string) =>
    String(v || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()

  const effectiveMunicipality =
    selectedMunicipality === "Dinalupihan"
      ? `Dinalupihan ${dinalupihanArea}`
      : selectedMunicipality

  useEffect(() => {
    fetchDetails(effectiveMunicipality, schoolYear).catch(() => {
      // error surfaced via store and handler toasts
    })
  }, [fetchDetails, schoolYear, effectiveMunicipality])

  const currentDetailsData = useMemo(() => {
    return (detailsRows || []).filter(
      (r) => r.municipality === effectiveMunicipality && r.schoolYear === schoolYear
    )
  }, [detailsRows, schoolYear, effectiveMunicipality])

  useEffect(() => {
    const ids = new Set(currentDetailsData.map((r) => r.id))

    if (isImporting) {
      const newIds: string[] = []
      for (const id of ids) {
        if (!seenRowIdsRef.current.has(id)) {
          newIds.push(id)
        }
      }

      if (newIds.length > 0) {
        setAnimatedNewRowIds((prev) => {
          const next = new Set(prev)
          for (const id of newIds) next.add(id)
          return next
        })
        for (const id of newIds) {
          if (!importAnimationOrderRef.current.has(id)) {
            importAnimationOrderRef.current.set(id, importAnimationCounterRef.current)
            importAnimationCounterRef.current += 1
          }
        }
      }
    }

    seenRowIdsRef.current = ids
  }, [currentDetailsData, isImporting])

  const handleSaveSchoolDetails = () => {
    createDetails({
      municipality: selectedMunicipality,
      schoolYear,
      completeName: detailsFormData.completeName || "",
      principalName: detailsFormData.principalName || "",
      principalContact: detailsFormData.principalContact || "",
      hlaCoordinatorName: detailsFormData.hlaCoordinatorName || "",
      hlaCoordinatorContact: detailsFormData.hlaCoordinatorContact || "",
      hlaCoordinatorFacebook: detailsFormData.hlaCoordinatorFacebook || "",
      hlaManagerName: detailsFormData.hlaManagerName || "",
      hlaManagerContact: detailsFormData.hlaManagerContact || "",
      hlaManagerFacebook: detailsFormData.hlaManagerFacebook || "",
      chiefCookName: detailsFormData.chiefCookName || "",
      chiefCookContact: detailsFormData.chiefCookContact || "",
      chiefCookFacebook: detailsFormData.chiefCookFacebook || "",
      assistantCookName: detailsFormData.assistantCookName || "",
      assistantCookContact: detailsFormData.assistantCookContact || "",
      assistantCookFacebook: detailsFormData.assistantCookFacebook || "",
      nurseName: detailsFormData.nurseName || "",
      nurseContact: detailsFormData.nurseContact || "",
      nurseFacebook: detailsFormData.nurseFacebook || "",
    })
      .then(() => {
        toast.success("School details saved successfully")
        setIsDetailsDialogOpen(false)
        setDetailsFormData({
          completeName: "",
          principalName: "",
          principalContact: "",
          hlaCoordinatorName: "",
          hlaCoordinatorContact: "",
          hlaCoordinatorFacebook: "",
          hlaManagerName: "",
          hlaManagerContact: "",
          hlaManagerFacebook: "",
          chiefCookName: "",
          chiefCookContact: "",
          chiefCookFacebook: "",
          assistantCookName: "",
          assistantCookContact: "",
          assistantCookFacebook: "",
          nurseName: "",
          nurseContact: "",
          nurseFacebook: "",
        })
      })
      .catch((e) => {
        toast.error(getErrorMessage(e))
      })
  }

  const handleDeleteSchoolDetails = (id: string) => {
    deleteDetails(id)
      .then(() => {
        toast.success("School details deleted successfully")
      })
      .catch((e) => {
        toast.error(getErrorMessage(e))
      })
  }

  const handleRequestDeleteSchoolDetails = (id: string) => {
    setPendingDeleteId(id)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDeleteSchoolDetails = () => {
    if (!pendingDeleteId) return
    handleDeleteSchoolDetails(pendingDeleteId)
    setIsDeleteConfirmOpen(false)
    setPendingDeleteId(null)
  }

  const handleOpenEditDetails = (
    schoolId: string,
    field: Exclude<keyof SchoolDetails, "id" | "municipality" | "schoolYear">,
    label: string,
    currentValue: string
  ) => {
    setEditDetailsSchoolId(schoolId)
    setEditDetailsField(field)
    setEditDetailsLabel(label)
    setEditDetailsValue(currentValue)
    setIsEditDetailsOpen(true)
  }

  const handleOpenViewDetails = (row: SchoolDetails) => {
    setViewDetailsRow(row)
    setIsViewDetailsOpen(true)
  }

  const handleSaveEditDetails = () => {
    if (!editDetailsSchoolId || !editDetailsField) return

    updateDetails(editDetailsSchoolId, {
      [editDetailsField]: editDetailsValue,
    } as any)
      .then(() => {
        toast.success("Updated successfully")
        setIsEditDetailsOpen(false)
        setEditDetailsSchoolId(null)
        setEditDetailsField(null)
        setEditDetailsLabel("")
        setEditDetailsValue("")
      })
      .catch((e) => {
        toast.error(getErrorMessage(e))
      })
  }

  const handleImportExcelClick = () => {
    if (selectedMunicipality === "Dinalupihan") {
      setIsImportAreaDialogOpen(true)
      return
    }
    setImportTargetMunicipality(selectedMunicipality)
    importFileInputRef.current?.click()
  }

  const handleImportExcelFile = async (file: File, targetMunicipality: string) => {
    setIsImporting(true)
    setAnimatedNewRowIds(new Set())
    importAnimationOrderRef.current = new Map()
    importAnimationCounterRef.current = 0
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

      const headerRowIndex = rows.findIndex((r) => {
        const keys = (r || []).map((c) => normalizeKey(c))
        const hasMunicipality = keys.some((k) => k === "municipality")
        const hasSchool = keys.some((k) => k.includes("completenameofschool") || k.includes("school"))
        const hasPrincipal = keys.some((k) => k.includes("nameofschoolprincipal") || k.includes("principal"))
        const hasManager = keys.some((k) => k.includes("nameofhlamanager") || (k.includes("hlamanager") && k.includes("name")))
        return hasMunicipality && hasSchool && hasPrincipal && hasManager
      })

      if (headerRowIndex === -1) {
        toast.error("Could not detect the header row for School Details import.")
        return
      }

      const header = rows[headerRowIndex] || []
      const headerKeys = header.map((c) => normalizeKey(c))
      const findCol = (pred: (key: string) => boolean) =>
        headerKeys.findIndex((key) => pred(key))

      const findCols = (pred: (key: string) => boolean) => {
        const out: number[] = []
        for (let i = 0; i < headerKeys.length; i += 1) {
          if (pred(headerKeys[i])) out.push(i)
        }
        return out
      }

      const municipalityCol = findCol((k) => k === "municipality")
      const completeNameCol = findCol((k) => k.includes("completenameofschool") || k === "completename")
      const principalNameCol = findCol((k) => k.includes("nameofschoolprincipal") || k.includes("principalhead"))
      const hlaCoordinatorNameCol = findCol((k) => k.includes("nameofhlacoordinator") || (k.includes("hlacoordinator") && k.includes("name")))
      const hlaManagerNameCol = findCol((k) => k.includes("nameofhlamanager") || (k.includes("hlamanager") && k.includes("name")))
      const chiefCookNameCol = findCol((k) => k.includes("nameofchiefcook") || (k.includes("chiefcook") && k.includes("name")))
      const assistantCookNameCol = findCol((k) => k.includes("nameofassistantchiefcook") || (k.includes("assistant") && k.includes("cook") && k.includes("name")))
      const nurseNameCol = findCol((k) => k.includes("nameofschoolnurse") || (k.includes("nurse") && k.includes("name")))

      // These headers repeat in the sheet, so we must map them by ORDER.
      // Order in your template:
      // Principal Contact, Coordinator Contact, Manager Contact, Chief Cook Contact, Assistant Cook Contact, Nurse Phone
      const contactCols = findCols(
        (k) => k === "activecontactnumber" || (k.includes("active") && k.includes("contact") && k.includes("number"))
      )

      const phoneCols = findCols(
        (k) => k === "activephonenumber" || (k.includes("active") && k.includes("phone") && k.includes("number"))
      )

      // Facebook columns (Account / Link / Facebook Link), also repeated.
      // Order in your template:
      // Coordinator FB, Manager FB, Chief Cook FB, Assistant Cook FB, Nurse FB
      const facebookCols = findCols(
        (k) => k.includes("facebookaccount") || k.includes("facebooklink") || (k.includes("facebook") && (k.includes("account") || k.includes("link")))
      )

      const principalContactCol = contactCols[0] ?? -1
      const hlaCoordinatorContactCol = contactCols[1] ?? -1
      const hlaManagerContactCol = contactCols[2] ?? -1
      const chiefCookContactCol = contactCols[3] ?? -1
      const assistantCookContactCol = contactCols[4] ?? -1
      const nurseContactCol = phoneCols[0] ?? contactCols[5] ?? -1

      const hlaCoordinatorFacebookCol = facebookCols[0] ?? -1
      const hlaManagerFacebookCol = facebookCols[1] ?? -1
      const chiefCookFacebookCol = facebookCols[2] ?? -1
      const assistantCookFacebookCol = facebookCols[3] ?? -1
      const nurseFacebookCol = facebookCols[4] ?? -1

      if ([municipalityCol, completeNameCol].some((i) => i < 0)) {
        toast.error(
          `Missing required columns. Found headers: ${headerKeys
            .filter(Boolean)
            .slice(0, 30)
            .join(", ")}`
        )
        return
      }

      const selectedMunicipalityKey = normalizeKey(targetMunicipality)
      let lastMunicipality = ""

      const existingKeys = new Set(
        (currentDetailsData || []).map(
          (r) => `${normalizeKey(r.municipality)}||${normalizeName(r.completeName)}`
        )
      )
      const importedKeys = new Set<string>()
      let skippedDuplicates = 0
      let skipped = 0

      const items: Array<Omit<SchoolDetails, "id" | "createdAt" | "updatedAt">> = []

      for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        const r = rows[i] || []

        const municipalityCell = String(r[municipalityCol] ?? "").trim()
        if (municipalityCell) lastMunicipality = municipalityCell
        if (normalizeKey(lastMunicipality) !== selectedMunicipalityKey) {
          continue
        }

        const completeName = String(r[completeNameCol] ?? "").trim()
        if (!completeName) {
          skipped += 1
          continue
        }

        const key = `${selectedMunicipalityKey}||${normalizeName(completeName)}`
        if (existingKeys.has(key) || importedKeys.has(key)) {
          skippedDuplicates += 1
          continue
        }
        importedKeys.add(key)

        items.push({
          municipality: targetMunicipality,
          schoolYear,
          completeName,
          principalName: principalNameCol >= 0 ? String(r[principalNameCol] ?? "").trim() : "",
          principalContact:
            principalContactCol >= 0
              ? sanitizePhPhone(String(r[principalContactCol] ?? ""))
              : "",
          hlaCoordinatorName:
            hlaCoordinatorNameCol >= 0 ? String(r[hlaCoordinatorNameCol] ?? "").trim() : "",
          hlaCoordinatorContact:
            hlaCoordinatorContactCol >= 0
              ? sanitizePhPhone(String(r[hlaCoordinatorContactCol] ?? ""))
              : "",
          hlaCoordinatorFacebook:
            hlaCoordinatorFacebookCol >= 0 ? String(r[hlaCoordinatorFacebookCol] ?? "").trim() : "",
          hlaManagerName: hlaManagerNameCol >= 0 ? String(r[hlaManagerNameCol] ?? "").trim() : "",
          hlaManagerContact:
            hlaManagerContactCol >= 0
              ? sanitizePhPhone(String(r[hlaManagerContactCol] ?? ""))
              : "",
          hlaManagerFacebook:
            hlaManagerFacebookCol >= 0 ? String(r[hlaManagerFacebookCol] ?? "").trim() : "",
          chiefCookName: chiefCookNameCol >= 0 ? String(r[chiefCookNameCol] ?? "").trim() : "",
          chiefCookContact:
            chiefCookContactCol >= 0 ? sanitizePhPhone(String(r[chiefCookContactCol] ?? "")) : "",
          chiefCookFacebook:
            chiefCookFacebookCol >= 0 ? String(r[chiefCookFacebookCol] ?? "").trim() : "",
          assistantCookName:
            assistantCookNameCol >= 0 ? String(r[assistantCookNameCol] ?? "").trim() : "",
          assistantCookContact:
            assistantCookContactCol >= 0
              ? sanitizePhPhone(String(r[assistantCookContactCol] ?? ""))
              : "",
          assistantCookFacebook:
            assistantCookFacebookCol >= 0 ? String(r[assistantCookFacebookCol] ?? "").trim() : "",
          nurseName: nurseNameCol >= 0 ? String(r[nurseNameCol] ?? "").trim() : "",
          nurseContact:
            nurseContactCol >= 0 ? sanitizePhPhone(String(r[nurseContactCol] ?? "")) : "",
          nurseFacebook:
            nurseFacebookCol >= 0 ? String(r[nurseFacebookCol] ?? "").trim() : "",
        } as any)
      }

      if (items.length === 0) {
        toast.error(
          skippedDuplicates > 0
            ? `No new rows to import. Skipped ${skippedDuplicates} duplicate rows.`
            : "No valid rows found to import."
        )
        return
      }

      let createdCount = 0
      for (const it of items) {
        await createDetails(it as any)
        createdCount += 1

        // Gives a "video-editing" feel: slight stagger between inserts.
        await new Promise((r) => setTimeout(r, 120))
      }

      const parts: string[] = [`Imported ${createdCount} rows.`]
      if (skippedDuplicates > 0) parts.push(`Skipped ${skippedDuplicates} duplicates.`)
      if (skipped > 0) parts.push(`Skipped ${skipped} invalid/blank rows.`)
      toast.success(parts.join(" "))
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{selectedMunicipality} - School Details</CardTitle>
          <div className="flex items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const target =
                  importTargetMunicipality || effectiveMunicipality || selectedMunicipality
                handleImportExcelFile(file, target)
                  .catch(() => {
                    // toast handled in handler
                  })
                  .finally(() => {
                    if (importFileInputRef.current) {
                      importFileInputRef.current.value = ""
                    }
                    setImportTargetMunicipality(null)
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

            <Dialog
              open={isImportAreaDialogOpen}
              onOpenChange={(open) => {
                setIsImportAreaDialogOpen(open)
                if (!open) setImportTargetMunicipality(null)
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Select Dinalupihan Area</DialogTitle>
                  <DialogDescription>
                    Choose which area to import. Your Excel uses "Dinalupihan East" and "Dinalupihan West".
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDinalupihanArea("East")
                      setImportTargetMunicipality("Dinalupihan East")
                      setIsImportAreaDialogOpen(false)
                      importFileInputRef.current?.click()
                    }}
                  >
                    Dinalupihan East
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDinalupihanArea("West")
                      setImportTargetMunicipality("Dinalupihan West")
                      setIsImportAreaDialogOpen(false)
                      importFileInputRef.current?.click()
                    }}
                  >
                    Dinalupihan West
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                Add School Details
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add School Details</DialogTitle>
                <DialogDescription>
                  Add school details for {selectedMunicipality} - S.Y {schoolYear}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4 px-2">
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="completeName" className="text-sm font-semibold">
                      Complete Name of School
                    </Label>
                    <Input
                      id="completeName"
                      value={detailsFormData.completeName}
                      onChange={(e) =>
                        setDetailsFormData({
                          ...detailsFormData,
                          completeName: e.target.value,
                        })
                      }
                      placeholder="Enter complete school name"
                      className="w-full"
                    />
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="font-semibold mb-3 text-sm">School Principal / Head</h3>
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={detailsFormData.principalName}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              principalName: e.target.value,
                            })
                          }
                          placeholder="Principal name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Active Contact Number</Label>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={detailsFormData.principalContact}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              principalContact: sanitizePhPhone(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            e.preventDefault()
                            const raw = e.clipboardData.getData("text")
                            setDetailsFormData({
                              ...detailsFormData,
                              principalContact: sanitizePhPhone(raw),
                            })
                          }}
                          placeholder="Contact number"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="font-semibold mb-3 text-sm">HLA Coordinator</h3>
                    <div className="grid md:grid-cols-3 gap-5">
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={detailsFormData.hlaCoordinatorName}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaCoordinatorName: e.target.value,
                            })
                          }
                          placeholder="Coordinator name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Active Contact Number</Label>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={detailsFormData.hlaCoordinatorContact}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaCoordinatorContact: sanitizePhPhone(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            e.preventDefault()
                            const raw = e.clipboardData.getData("text")
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaCoordinatorContact: sanitizePhPhone(raw),
                            })
                          }}
                          placeholder="Contact number"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Facebook Account</Label>
                        <Input
                          value={detailsFormData.hlaCoordinatorFacebook}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaCoordinatorFacebook: e.target.value,
                            })
                          }
                          placeholder="Facebook link"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="font-semibold mb-3 text-sm">HLA Manager</h3>
                    <div className="grid md:grid-cols-3 gap-5">
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={detailsFormData.hlaManagerName}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaManagerName: e.target.value,
                            })
                          }
                          placeholder="Manager name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Active Contact Number</Label>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={detailsFormData.hlaManagerContact}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaManagerContact: sanitizePhPhone(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            e.preventDefault()
                            const raw = e.clipboardData.getData("text")
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaManagerContact: sanitizePhPhone(raw),
                            })
                          }}
                          placeholder="Contact number"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Facebook Account</Label>
                        <Input
                          value={detailsFormData.hlaManagerFacebook}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              hlaManagerFacebook: e.target.value,
                            })
                          }
                          placeholder="Facebook link"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="font-semibold mb-3 text-sm">Chief Cook</h3>
                    <div className="grid md:grid-cols-3 gap-5">
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={detailsFormData.chiefCookName}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              chiefCookName: e.target.value,
                            })
                          }
                          placeholder="Chief cook name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Active Contact Number</Label>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={detailsFormData.chiefCookContact}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              chiefCookContact: sanitizePhPhone(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            e.preventDefault()
                            const raw = e.clipboardData.getData("text")
                            setDetailsFormData({
                              ...detailsFormData,
                              chiefCookContact: sanitizePhPhone(raw),
                            })
                          }}
                          placeholder="Contact number"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Facebook Account</Label>
                        <Input
                          value={detailsFormData.chiefCookFacebook}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              chiefCookFacebook: e.target.value,
                            })
                          }
                          placeholder="Facebook link"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="font-semibold mb-3 text-sm">Assistant Chief Cook</h3>
                    <div className="grid md:grid-cols-3 gap-5">
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={detailsFormData.assistantCookName}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              assistantCookName: e.target.value,
                            })
                          }
                          placeholder="Assistant cook name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Active Contact Number</Label>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={detailsFormData.assistantCookContact}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              assistantCookContact: sanitizePhPhone(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            e.preventDefault()
                            const raw = e.clipboardData.getData("text")
                            setDetailsFormData({
                              ...detailsFormData,
                              assistantCookContact: sanitizePhPhone(raw),
                            })
                          }}
                          placeholder="Contact number"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Facebook Account / Link</Label>
                        <Input
                          value={detailsFormData.assistantCookFacebook}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              assistantCookFacebook: e.target.value,
                            })
                          }
                          placeholder="Facebook link"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="font-semibold mb-3 text-sm">School Nurse</h3>
                    <div className="grid md:grid-cols-3 gap-5">
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={detailsFormData.nurseName}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              nurseName: e.target.value,
                            })
                          }
                          placeholder="Nurse name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Active Phone Number</Label>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={detailsFormData.nurseContact}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              nurseContact: sanitizePhPhone(e.target.value),
                            })
                          }
                          onPaste={(e) => {
                            e.preventDefault()
                            const raw = e.clipboardData.getData("text")
                            setDetailsFormData({
                              ...detailsFormData,
                              nurseContact: sanitizePhPhone(raw),
                            })
                          }}
                          placeholder="Phone number"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs font-medium">Facebook Link</Label>
                        <Input
                          value={detailsFormData.nurseFacebook}
                          onChange={(e) =>
                            setDetailsFormData({
                              ...detailsFormData,
                              nurseFacebook: e.target.value,
                            })
                          }
                          placeholder="Facebook link"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveSchoolDetails} disabled={isLoading}>
                  Save School Details
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {selectedMunicipality === "Dinalupihan" && (
          <div className="mb-3 flex items-center gap-2">
            <Button
              size="sm"
              variant={dinalupihanArea === "East" ? "default" : "outline"}
              onClick={() => setDinalupihanArea("East")}
              disabled={isLoading}
            >
              East
            </Button>
            <Button
              size="sm"
              variant={dinalupihanArea === "West" ? "default" : "outline"}
              onClick={() => setDinalupihanArea("West")}
              disabled={isLoading}
            >
              West
            </Button>
          </div>
        )}

        <AlertDialog
          open={isDeleteConfirmOpen}
          onOpenChange={(open) => {
            setIsDeleteConfirmOpen(open)
            if (!open) setPendingDeleteId(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this record?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDeleteSchoolDetails}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {currentDetailsData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No school details available for {selectedMunicipality}</p>
            <p className="text-sm mt-2">Click "Add School Details" to get started</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-green-100 hover:bg-green-100">
                  <TableHead className="font-bold border-r whitespace-nowrap">Municipality</TableHead>
                  <TableHead className="font-bold border-r whitespace-nowrap">School Name</TableHead>
                  <TableHead className="font-bold border-r whitespace-nowrap">School Principal</TableHead>
                  <TableHead className="font-bold border-r whitespace-nowrap">Active Contact Number</TableHead>
                  <TableHead className="font-bold border-r whitespace-nowrap">HLA Manager</TableHead>
                  <TableHead className="font-bold border-r whitespace-nowrap">Active Contact Number</TableHead>
                  <TableHead className="font-bold border-r whitespace-nowrap">Facebook</TableHead>
                  <TableHead className="whitespace-nowrap"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {currentDetailsData.map((school) => {
                    const shouldAnimate = isImporting && animatedNewRowIds.has(school.id)
                    const order = importAnimationOrderRef.current.get(school.id) ?? 0
                    return (
                      <motion.tr
                        key={school.id}
                        className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
                        initial={shouldAnimate ? { opacity: 0, y: 10, filter: "blur(2px)" } : false}
                        animate={shouldAnimate ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={
                          shouldAnimate
                            ? {
                                duration: 0.28,
                                ease: [0.22, 1, 0.36, 1],
                                delay: Math.min(0.8, order * 0.06),
                              }
                            : { duration: 0 }
                        }
                      >
                    <TableCell className="border-r whitespace-nowrap">
                      {school.municipality}
                    </TableCell>
                    <TableCell
                      className="font-medium border-r whitespace-nowrap cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        handleOpenEditDetails(
                          school.id,
                          "completeName",
                          "School Name",
                          school.completeName
                        )
                      }
                    >
                      {school.completeName}
                    </TableCell>
                    <TableCell
                      className="border-r whitespace-nowrap cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        handleOpenEditDetails(
                          school.id,
                          "principalName",
                          "School Principal",
                          school.principalName
                        )
                      }
                    >
                      {displayNA(school.principalName)}
                    </TableCell>
                    <TableCell
                      className="border-r whitespace-nowrap cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        handleOpenEditDetails(
                          school.id,
                          "principalContact",
                          "Active Contact Number",
                          school.principalContact
                        )
                      }
                    >
                      {displayNA(school.principalContact)}
                    </TableCell>
                    <TableCell
                      className="border-r whitespace-nowrap cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        handleOpenEditDetails(
                          school.id,
                          "hlaManagerName",
                          "HLA Manager",
                          school.hlaManagerName
                        )
                      }
                    >
                      {displayNA(school.hlaManagerName)}
                    </TableCell>
                    <TableCell
                      className="border-r whitespace-nowrap cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        handleOpenEditDetails(
                          school.id,
                          "hlaManagerContact",
                          "Active Contact Number",
                          school.hlaManagerContact
                        )
                      }
                    >
                      {displayNA(school.hlaManagerContact)}
                    </TableCell>
                    <TableCell
                      className="border-r whitespace-nowrap text-blue-600 cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        handleOpenEditDetails(
                          school.id,
                          "hlaManagerFacebook",
                          "Facebook",
                          school.hlaManagerFacebook
                        )
                      }
                    >
                      <span
                        className="block max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap"
                        title={school.hlaManagerFacebook}
                      >
                        {displayNA(school.hlaManagerFacebook)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenViewDetails(school)}
                        disabled={isLoading}
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRequestDeleteSchoolDetails(school.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog
          open={isViewDetailsOpen}
          onOpenChange={(open) => {
            setIsViewDetailsOpen(open)
            if (!open) setViewDetailsRow(null)
          }}
        >
          <DialogContent className="w-[calc(100vw-2rem)] max-w-xl sm:max-w-2xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>School Details</DialogTitle>
              <DialogDescription>
                View the full details for this school record.
              </DialogDescription>
            </DialogHeader>

            {viewDetailsRow && (
              <div className="grid gap-6 py-2 overflow-y-auto pr-1 max-h-[calc(85vh-9rem)]">
                <div className="grid gap-1">
                  <p className="text-sm text-muted-foreground">School</p>
                  <p className="text-base font-semibold">{viewDetailsRow.completeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {viewDetailsRow.municipality} • S.Y {viewDetailsRow.schoolYear}
                  </p>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-semibold">School Principal / Head</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.principalName)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.principalContact)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-semibold">HLA Coordinator</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.hlaCoordinatorName)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.hlaCoordinatorContact)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Facebook</p>
                        <p className="text-sm break-words">{displayNA(viewDetailsRow.hlaCoordinatorFacebook)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-semibold">HLA Manager</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.hlaManagerName)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.hlaManagerContact)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Facebook</p>
                        <p className="text-sm break-words">{displayNA(viewDetailsRow.hlaManagerFacebook)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-semibold">Chief Cook</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.chiefCookName)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.chiefCookContact)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Facebook</p>
                        <p className="text-sm break-words">{displayNA(viewDetailsRow.chiefCookFacebook)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-semibold">Assistant Chief Cook</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.assistantCookName)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.assistantCookContact)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Facebook</p>
                        <p className="text-sm break-words">{displayNA(viewDetailsRow.assistantCookFacebook)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-semibold">School Nurse</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.nurseName)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="text-sm">{displayNA(viewDetailsRow.nurseContact)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Facebook</p>
                        <p className="text-sm break-words">{displayNA(viewDetailsRow.nurseFacebook)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDetailsOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDetailsOpen} onOpenChange={setIsEditDetailsOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit Field</DialogTitle>
              <DialogDescription>
                Update the selected value for {selectedMunicipality}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label className="text-xs font-medium">{editDetailsLabel}</Label>
              <Input
                value={editDetailsValue}
                type={editDetailsField && PHONE_FIELDS.has(editDetailsField) ? "tel" : "text"}
                inputMode={
                  editDetailsField && PHONE_FIELDS.has(editDetailsField)
                    ? "numeric"
                    : undefined
                }
                pattern={editDetailsField && PHONE_FIELDS.has(editDetailsField) ? "[0-9]*" : undefined}
                onChange={(e) => {
                  const next = e.target.value
                  setEditDetailsValue(
                    editDetailsField && PHONE_FIELDS.has(editDetailsField)
                      ? sanitizePhPhone(next)
                      : next
                  )
                }}
                onPaste={(e) => {
                  if (!editDetailsField || !PHONE_FIELDS.has(editDetailsField)) return
                  e.preventDefault()
                  const raw = e.clipboardData.getData("text")
                  setEditDetailsValue(sanitizePhPhone(raw))
                }}
                placeholder="Enter value"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDetailsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEditDetails}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
