import { useEffect, useMemo, useRef, useState } from "react"
import type { ComponentType } from "react"
import { format, parseISO } from "date-fns"
import { motion, AnimatePresence } from "motion/react"
import { toast } from "sonner"
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ImagePlus,
  Info,
  Images,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  TriangleAlert,
  Truck,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type DeliveryStatus =
  | "Pending"
  | "Delivered"
  | "Delayed"
  | "Cancelled"

const CATEGORY_OPTIONS = [
  { key: "fruits", label: "Fruits" },
  { key: "vegetables", label: "Vegetables" },
  { key: "meat", label: "Meat" },
  { key: "nutribun", label: "NutriBun" },
  { key: "patties", label: "Patties" },
  { key: "groceries", label: "Groceries" },
  { key: "consumables", label: "Consumables" },
  { key: "water", label: "Water" },
  { key: "lpg", label: "LPG" },
  { key: "rice", label: "Rice" },
  { key: "others", label: "Others" },
] as const

type DeliveryCategoryKey = (typeof CATEGORY_OPTIONS)[number]["key"]

type DeliveryItem = {
  key: DeliveryCategoryKey
  label: string
  status: DeliveryStatus
  statusTouched: boolean
  statusReason: string
  statusUpdatedAt: string
  uploadedAt: string
  concerns: string[]
  remarks: string
  images: Array<{ file: File | null; url: string }>
}

async function apiFetchNoJson(path: string, init?: RequestInit) {
  const token = getAuthToken()
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

type DeliveryImageDto = {
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
}

type DeliveryRecordDto = {
  dateKey: string
  categoryKey: DeliveryCategoryKey
  categoryLabel: string
  status: DeliveryStatus
  statusReason?: string
  statusUpdatedAt?: string
  uploadedAt?: string
  concerns?: string[]
  remarks?: string
  images?: DeliveryImageDto[]
}

function getApiBaseUrl() {
  const fromEnv = (import.meta as any)?.env?.VITE_API_URL as string | undefined
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

async function deleteItemFromBackend(dateKey: string, categoryKey: DeliveryCategoryKey) {
  return apiFetchNoJson("/api/delivery/item", {
    method: "DELETE",
    body: JSON.stringify({ dateKey, categoryKey }),
  })
}

async function apiFetch(path: string, init?: RequestInit) {
  const token = getAuthToken()
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

async function apiFetchFormData(path: string, formData: FormData) {
  const token = getAuthToken()
  if (!token) throw new Error("Not authenticated")

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

const STATUS_OPTIONS: Array<{
  value: DeliveryStatus
  label: string
  icon: ComponentType<{ className?: string }>
  badgeClass: string
}> = [
  {
    value: "Pending",
    label: "Pending",
    icon: Clock,
    badgeClass: "bg-muted text-foreground border",
  },
  {
    value: "Delivered",
    label: "Delivered",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  {
    value: "Delayed",
    label: "Delayed",
    icon: TriangleAlert,
    badgeClass: "bg-amber-50 text-amber-800 border border-amber-200",
  },
  {
    value: "Cancelled",
    label: "Cancelled",
    icon: XCircle,
    badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
  },
]

function statusMeta(status: DeliveryStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0]
}

const PRESET_CONCERNS = [
  "Missing items",
  "Late arrival",
  "Damaged packaging",
  "Wrong quantity",
  "Driver unreachable",
  "Need signature",
]

function startOfDayKey(d: Date) {
  return format(d, "yyyy-MM-dd")
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

function toggleItem(list: string[], value: string) {
  if (list.includes(value)) return list.filter((x) => x !== value)
  return [...list, value]
}

type PendingStatusChange = {
  dateKey: string
  categoryKey: DeliveryCategoryKey
  from: DeliveryStatus
  to: DeliveryStatus
}

function createEmptyItem(key: DeliveryCategoryKey, label: string): DeliveryItem {
  return {
    key,
    label,
    status: "Pending",
    statusTouched: false,
    statusReason: "",
    statusUpdatedAt: "",
    uploadedAt: "",
    concerns: [],
    remarks: "",
    images: [],
  }
}

export function UserDelivery() {
  const today = useMemo(() => new Date(), [])
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), [])
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const initialDateKey = useMemo(() => startOfDayKey(today), [today])
  const initialRecords = useMemo(() => {
    const items = Object.fromEntries(
      CATEGORY_OPTIONS.map(({ key, label }) => [key, createEmptyItem(key, label)])
    ) as Record<DeliveryCategoryKey, DeliveryItem>

    return {
      [initialDateKey]: items,
    } as Record<string, Record<DeliveryCategoryKey, DeliveryItem>>
  }, [initialDateKey])

  const [recordsByDate, setRecordsByDate] = useState<
    Record<string, Record<DeliveryCategoryKey, DeliveryItem>>
  >(initialRecords)
  const [customConcern, setCustomConcern] = useState<Record<string, string>>({})

  const [activeTab, setActiveTab] = useState<"upload" | "history">("upload")

  const [activeCategory, setActiveCategory] = useState<DeliveryCategoryKey>(
    CATEGORY_OPTIONS[0].key
  )

  const [historyDate, setHistoryDate] = useState<Date | undefined>(today)
  const [isHistoryDatePickerOpen, setIsHistoryDatePickerOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState("")
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest")

  const [isStatusSelectOpen, setIsStatusSelectOpen] = useState(false)
  const [needsStatusSelection, setNeedsStatusSelection] = useState(false)

  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(
    null
  )
  const [statusReasonDraft, setStatusReasonDraft] = useState("")
  const [statusTimestampDraft, setStatusTimestampDraft] = useState("")

  const [viewImagesTarget, setViewImagesTarget] = useState<{
    dateKey: string
    categoryKey: DeliveryCategoryKey
  } | null>(null)

  const [imagePreview, setImagePreview] = useState<{
    dateKey: string
    categoryKey: DeliveryCategoryKey
    index: number
  } | null>(null)

  const [viewDetailsTarget, setViewDetailsTarget] = useState<{
    dateKey: string
    categoryKey: DeliveryCategoryKey
  } | null>(null)

  const [detailsTab, setDetailsTab] = useState<"details" | "concerns">("details")

  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<{
    dateKey: string
    categoryKey: DeliveryCategoryKey
    categoryLabel: string
  } | null>(null)

  const [viewStatusReasonTarget, setViewStatusReasonTarget] = useState<{
    dateKey: string
    categoryLabel: string
    status: DeliveryStatus
    reason: string
  } | null>(null)

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [historyRecords, setHistoryRecords] = useState<DeliveryRecordDto[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)

  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const successTimerRef = useRef<number | null>(null)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
  const [wizardCategory, setWizardCategory] = useState<DeliveryCategoryKey>(CATEGORY_OPTIONS[0].key)
  const [wizardIsSaving, setWizardIsSaving] = useState(false)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
  }, [])

  const makeKey = (dateKey: string, categoryKey: DeliveryCategoryKey) =>
    `${dateKey}::${categoryKey}`

  const selectedDateKey = useMemo(() => startOfDayKey(selectedDate), [selectedDate])

  const openWizard = (categoryKey?: DeliveryCategoryKey) => {
    const key = categoryKey || activeCategory
    ensureDateRecord(selectedDateKey)
    setWizardCategory(key)
    setActiveCategory(key)
    setWizardStep(1)
    setWizardOpen(true)
  }

  const closeWizard = () => {
    setWizardOpen(false)
    setWizardStep(1)
    setWizardIsSaving(false)
  }

  const ensureDateRecord = (dateKey: string) => {
    setRecordsByDate((prev) => {
      if (prev[dateKey]) return prev
      const items = Object.fromEntries(
        CATEGORY_OPTIONS.map(({ key, label }) => [key, createEmptyItem(key, label)])
      ) as Record<DeliveryCategoryKey, DeliveryItem>
      return { ...prev, [dateKey]: items }
    })
  }

  const dtoToItem = (dto: DeliveryRecordDto): DeliveryItem => {
    const images = Array.isArray(dto.images)
      ? dto.images.map((img) => ({ file: null, url: `${apiBaseUrl}${img.url}` }))
      : []

    return {
      key: dto.categoryKey,
      label: dto.categoryLabel,
      status: dto.status ?? "Pending",
      statusTouched: true,
      statusReason: dto.statusReason || "",
      statusUpdatedAt: dto.statusUpdatedAt || "",
      uploadedAt: dto.uploadedAt || "",
      concerns: Array.isArray(dto.concerns) ? dto.concerns : [],
      remarks: dto.remarks || "",
      images,
    }
  }

  const loadDateFromBackend = async (dateKey: string) => {
    ensureDateRecord(dateKey)
    try {
      const data = (await apiFetch(
        `/api/delivery/by-date/${encodeURIComponent(dateKey)}`
      )) as { records?: DeliveryRecordDto[] }
      const recs = Array.isArray(data.records) ? data.records : []

      setRecordsByDate((prev) => {
        const day = prev[dateKey]
        if (!day) return prev

        const nextDay = { ...day }
        for (const r of recs) {
          nextDay[r.categoryKey] = {
            ...nextDay[r.categoryKey],
            ...dtoToItem(r),
          }
        }

        return { ...prev, [dateKey]: nextDay }
      })
    } catch (e: any) {
      toast.error(e?.message || "Failed to load delivery records")
    }
  }

  const saveActiveItemToBackend = async (dateKey: string, categoryKey: DeliveryCategoryKey) => {
    const day = recordsByDate[dateKey]
    const item = day?.[categoryKey]
    if (!item) return

    const nowIso = new Date().toISOString()
    const effectiveUploadedAt = item.uploadedAt || nowIso

    const fd = new FormData()
    fd.set("dateKey", dateKey)
    fd.set("categoryKey", categoryKey)
    fd.set("categoryLabel", item.label)
    fd.set("status", item.status)
    fd.set("statusReason", item.statusReason || "")
    fd.set("statusUpdatedAt", item.statusUpdatedAt || nowIso)
    fd.set("uploadedAt", effectiveUploadedAt)
    fd.set("concerns", JSON.stringify(item.concerns || []))
    fd.set("remarks", item.remarks || "")

    const newFiles = item.images.filter((x) => x.file instanceof File)
    for (const img of newFiles) {
      if (img.file instanceof File) fd.append("images", img.file)
    }

    const data = (await apiFetchFormData("/api/delivery/item", fd)) as {
      record?: DeliveryRecordDto
    }
    if (!data.record) return

    const normalized = dtoToItem(data.record)
    setRecordsByDate((prev) => {
      const day2 = prev[dateKey]
      if (!day2) return prev
      return {
        ...prev,
        [dateKey]: {
          ...day2,
          [categoryKey]: {
            ...day2[categoryKey],
            ...normalized,
            statusTouched: true,
          },
        },
      }
    })
  }

  const getActiveItem = () => {
    const day = recordsByDate[selectedDateKey]
    return day?.[activeCategory] || null
  }

  const updateDeliveryItem = (
    dateKey: string,
    categoryKey: DeliveryCategoryKey,
    patch: Partial<DeliveryItem>
  ) => {
    setRecordsByDate((prev) => {
      const day = prev[dateKey]
      if (!day) return prev
      const current = day[categoryKey]
      return {
        ...prev,
        [dateKey]: {
          ...day,
          [categoryKey]: {
            ...current,
            ...patch,
          },
        },
      }
    })
  }

  const requestStatusChange = (
    dateKey: string,
    categoryKey: DeliveryCategoryKey,
    nextStatus: DeliveryStatus
  ) => {
    const day = recordsByDate[dateKey]
    const current = day?.[categoryKey]
    if (!day || !current) return

    if (current.status === nextStatus) {
      updateDeliveryItem(dateKey, categoryKey, { statusTouched: true })
      return
    }

    updateDeliveryItem(dateKey, categoryKey, { statusTouched: true })

    setPendingStatusChange({
      dateKey,
      categoryKey,
      from: current.status,
      to: nextStatus,
    })
    setStatusReasonDraft("")
    setStatusTimestampDraft(new Date().toISOString())
  }

  const confirmStatusChange = () => {
    if (!pendingStatusChange) return
    const { dateKey, categoryKey, to } = pendingStatusChange
    const reason = statusReasonDraft.trim()

    const day = recordsByDate[dateKey]
    const item = day?.[categoryKey]
    if (!day || !item) return
    if (item.images.length === 0) {
      toast.warning(
        "No proof image uploaded. You can still confirm the status, but it’s recommended to upload one."
      )
    }

    updateDeliveryItem(dateKey, categoryKey, {
      status: to,
      statusTouched: true,
      statusReason: to === "Cancelled" || to === "Delayed" ? reason : "",
      statusUpdatedAt: statusTimestampDraft,
    })
    setPendingStatusChange(null)
    setStatusReasonDraft("")
    setStatusTimestampDraft("")
  }

  const handleAddCustomConcern = (dateKey: string, categoryKey: DeliveryCategoryKey) => {
    const key = makeKey(dateKey, categoryKey)
    const value = (customConcern[key] || "").trim()
    if (!value) {
      toast.error("Please type a concern before adding.")
      return
    }

    setRecordsByDate((prev) => {
      const day = prev[dateKey]
      const item = day?.[categoryKey]
      if (!day || !item) return prev
      return {
        ...prev,
        [dateKey]: {
          ...day,
          [categoryKey]: {
            ...item,
            concerns: item.concerns.includes(value) ? item.concerns : [...item.concerns, value],
          },
        },
      }
    })
    setCustomConcern((prev) => ({ ...prev, [key]: "" }))
    toast.success("Concern added.")
  }

  const handleFilesSelected = (
    dateKey: string,
    categoryKey: DeliveryCategoryKey,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    setRecordsByDate((prev) => {
      const day = prev[dateKey]
      const item = day?.[categoryKey]
      if (!day || !item) return prev
      return {
        ...prev,
        [dateKey]: {
          ...day,
          [categoryKey]: {
            ...item,
            images: [...item.images, ...next],
          },
        },
      }
    })
  }

  const handleRemoveImage = (dateKey: string, categoryKey: DeliveryCategoryKey, index: number) => {
    setRecordsByDate((prev) => {
      const day = prev[dateKey]
      const item = day?.[categoryKey]
      if (!day || !item) return prev
      return {
        ...prev,
        [dateKey]: {
          ...day,
          [categoryKey]: {
            ...item,
            images: item.images.filter((img, i) => {
              if (i !== index) return true
              try {
                URL.revokeObjectURL(img.url)
              } catch {
                // ignore
              }
              return false
            }),
          },
        },
      }
    })
  }

  const goNextCategory = () => {
    const idx = CATEGORY_OPTIONS.findIndex((c) => c.key === activeCategory)
    const next = CATEGORY_OPTIONS[idx + 1]
    if (next) setActiveCategory(next.key)
  }

  const goPrevCategory = () => {
    const idx = CATEGORY_OPTIONS.findIndex((c) => c.key === activeCategory)
    const prev = CATEGORY_OPTIONS[idx - 1]
    if (prev) setActiveCategory(prev.key)
  }

  const submitAndNext = async () => {
    const item = getActiveItem()
    if (!item) {
      goNextCategory()
      return
    }

    if (!item.statusTouched) {
      setNeedsStatusSelection(true)
      setIsStatusSelectOpen(true)
      toast.error("Please select a status before continuing.")
      return
    }

    if (!item.uploadedAt) {
      updateDeliveryItem(selectedDateKey, activeCategory, {
        uploadedAt: new Date().toISOString(),
      })
    }

    try {
      await saveActiveItemToBackend(selectedDateKey, activeCategory)

      setSuccessModalOpen(true)
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
      successTimerRef.current = window.setTimeout(() => {
        setSuccessModalOpen(false)
        goNextCategory()
      }, 900)
    } catch (e: any) {
      toast.error(e?.message || "Failed to save")
    }
  }

  const historyRows = useMemo(() => {
    return historyRecords.map((r) => ({
      dateKey: r.dateKey,
      categoryKey: r.categoryKey,
      categoryLabel: r.categoryLabel,
      status: r.status,
      statusReason: r.statusReason || "",
      statusUpdatedAt: r.statusUpdatedAt || "",
      uploadedAt: r.uploadedAt || "",
      imagesCount: Array.isArray(r.images) ? r.images.length : 0,
      concerns: Array.isArray(r.concerns) ? r.concerns : [],
      remarks: r.remarks || "",
    }))
  }, [historyRecords])

  const formatHistoryDateKey = (dateKey: string) => {
    try {
      return format(parseISO(dateKey), "MMMM dd, yyyy")
    } catch {
      return dateKey
    }
  }

  useEffect(() => {
    loadDateFromBackend(selectedDateKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateKey])

  useEffect(() => {
    if (activeTab !== "history") return

    const t = setTimeout(async () => {
      setIsHistoryLoading(true)
      try {
        const qs = new URLSearchParams()
        if (historyDate) qs.set("dateKey", startOfDayKey(historyDate))
        if (historySearch.trim()) qs.set("search", historySearch.trim())
        qs.set("sort", historySort)

        const data = (await apiFetch(`/api/delivery/history?${qs.toString()}`)) as {
          records?: DeliveryRecordDto[]
        }
        setHistoryRecords(Array.isArray(data.records) ? data.records : [])
      } catch (e: any) {
        toast.error(e?.message || "Failed to load history")
      } finally {
        setIsHistoryLoading(false)
      }
    }, 250)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, historyDate, historySearch, historySort])

  const categoryOptionClass = (status: DeliveryStatus) => {
    switch (status) {
      case "Delivered":
        return "bg-emerald-50 text-emerald-800"
      case "Delayed":
        return "bg-amber-50 text-amber-900"
      case "Cancelled":
        return "bg-rose-50 text-rose-900"
      default:
        return ""
    }
  }

  const dayItems = recordsByDate[selectedDateKey]

  const submittedKeys = useMemo(() => {
    if (!dayItems) return [] as DeliveryCategoryKey[]
    return CATEGORY_OPTIONS.map((c) => c.key).filter((k) => {
      const it = dayItems[k]
      if (!it) return false
      return Boolean(
        it.statusTouched ||
          it.uploadedAt ||
          it.statusUpdatedAt ||
          it.remarks.trim() ||
          it.concerns.length ||
          it.images.length
      )
    })
  }, [dayItems])

  const submittedCount = submittedKeys.length
  const pendingCount = CATEGORY_OPTIONS.length - submittedCount

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5" />
                Delivery
              </CardTitle>
              <CardDescription>
                Submit your daily delivery log per item.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upload" | "history")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-6">
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="text-sm font-medium">Date</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" className="rounded-xl">
                            <CalendarDays className="size-4" />
                            {format(selectedDate, "MMM dd, yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0 rounded-xl border shadow-lg overflow-hidden"
                          align="start"
                        >
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            className="p-2 [--cell-size:--spacing(7)]"
                            onSelect={(d) => {
                              if (!d) return
                              setSelectedDate(d)
                              const k = startOfDayKey(d)
                              ensureDateRecord(k)
                              setActiveCategory(CATEGORY_OPTIONS[0].key)
                              setIsDatePickerOpen(false)
                            }}
                          />
                        </PopoverContent>
                      </Popover>

                      <div className="w-full sm:w-[260px]">
                        <Select
                          value={activeCategory}
                          onValueChange={(v) => setActiveCategory(v as DeliveryCategoryKey)}
                        >
                          <SelectTrigger className="w-full rounded-xl">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((c) => {
                              const status = recordsByDate[selectedDateKey]?.[c.key]?.status ?? "Pending"
                              return (
                                <SelectItem
                                  key={c.key}
                                  value={c.key}
                                  className={categoryOptionClass(status)}
                                >
                                  {c.label}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-muted/20 px-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Submitted</div>
                      <div className="text-sm font-semibold">{submittedCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Pending</div>
                      <div className="text-sm font-semibold">{pendingCount}</div>
                    </div>
                  </div>
                </div>

                {submittedKeys.length ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Submitted items</div>
                        <div className="text-xs text-muted-foreground">
                          Tap an item to view or edit details.
                        </div>
                      </div>
                      <Badge className="rounded-xl bg-muted text-foreground border">
                        {submittedCount} total
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {submittedKeys.map((k) => {
                        const c = CATEGORY_OPTIONS.find((x) => x.key === k)
                        const it = recordsByDate[selectedDateKey]?.[k]
                        const meta = statusMeta(it?.status ?? "Pending")
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => openWizard(k)}
                            className={`rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted/30 ${
                              activeCategory === k ? "border-black/15 bg-muted/20" : "border-black/5 bg-white"
                            }`}
                          >
                            <div className="text-sm font-semibold leading-tight">{c?.label || k}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {meta.label}
                              {it?.uploadedAt ? ` • ${formatDateTime(it.uploadedAt)}` : ""}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed bg-white/60 p-6">
                    <div className="text-sm font-semibold">No submissions yet</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Select an item above, choose a status, add optional remarks, and upload proof images.
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" className="rounded-xl" onClick={() => openWizard(activeCategory)}>
                    <Plus className="size-4" />
                    Add / Edit item delivery
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Quick tip: Submit once per day per item.
                  </div>
                </div>

                <Dialog
                  open={wizardOpen}
                  onOpenChange={(v) => {
                    if (!v) closeWizard()
                    else setWizardOpen(true)
                  }}
                >
                  <DialogContent className="max-w-2xl rounded-2xl p-0 max-h-[85vh] overflow-hidden">
                    <div className="flex max-h-[85vh] flex-col">
                      <DialogHeader className="px-6 pb-4 pt-6">
                        <DialogTitle>Daily delivery log</DialogTitle>
                        <DialogDescription>
                          Step {wizardStep} of 4 • {format(selectedDate, "MMM dd, yyyy")}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex-1 overflow-y-auto px-6 pb-4">
                        {(() => {
                          const day = recordsByDate[selectedDateKey]
                          const item = day?.[wizardCategory]
                          if (!day || !item) return null

                          const meta = statusMeta(item.status)
                          const StatusIcon = meta.icon
                          const customKey = makeKey(selectedDateKey, wizardCategory)

                          return (
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">{item.label}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {item.uploadedAt
                                      ? `Last saved: ${formatDateTime(item.uploadedAt)}`
                                      : "Not saved yet"}
                                  </div>
                                </div>
                                <Badge className={`rounded-xl ${meta.badgeClass}`}>
                                  <StatusIcon className="mr-1 size-3.5" />
                                  {meta.label}
                                </Badge>
                              </div>

                              {wizardStep === 1 ? (
                                <div className="grid gap-3">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Item</Label>
                                    <div className="mt-2">
                                      <Select
                                        value={wizardCategory}
                                        onValueChange={(v) => {
                                          setWizardCategory(v as DeliveryCategoryKey)
                                          setActiveCategory(v as DeliveryCategoryKey)
                                        }}
                                      >
                                        <SelectTrigger className="w-full rounded-xl">
                                          <SelectValue placeholder="Select item" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {CATEGORY_OPTIONS.map((c) => {
                                            const st =
                                              recordsByDate[selectedDateKey]?.[c.key]?.status ?? "Pending"
                                            return (
                                              <SelectItem
                                                key={c.key}
                                                value={c.key}
                                                className={categoryOptionClass(st)}
                                              >
                                                {c.label}
                                              </SelectItem>
                                            )
                                          })}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border bg-muted/10 p-4">
                                    <div className="flex items-start gap-2">
                                      <Info className="mt-0.5 size-4 text-muted-foreground" />
                                      <div className="text-sm text-muted-foreground">
                                        Choose the fruit/item you want to submit for today.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {wizardStep === 2 ? (
                                <div className="grid gap-3">
                                  <div className="text-sm font-semibold">Status</div>
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {STATUS_OPTIONS.map((opt) => {
                                      const Icon = opt.icon
                                      const isActive = item.status === opt.value
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          className={`rounded-2xl border p-3 text-left transition-colors hover:bg-muted/20 ${
                                            isActive
                                              ? "border-black/15 bg-muted/20"
                                              : "border-black/5 bg-white"
                                          }`}
                                          onClick={() =>
                                            updateDeliveryItem(selectedDateKey, wizardCategory, {
                                              status: opt.value,
                                              statusTouched: true,
                                              statusUpdatedAt: new Date().toISOString(),
                                            })
                                          }
                                        >
                                          <div className="flex items-center gap-2">
                                            <div
                                              className={`grid size-9 place-items-center rounded-xl ${opt.badgeClass}`}
                                            >
                                              <Icon className="size-4" />
                                            </div>
                                            <div>
                                              <div className="text-sm font-semibold leading-tight">
                                                {opt.label}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                Tap to select
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      )
                                    })}
                                  </div>

                                  {item.status === "Cancelled" || item.status === "Delayed" ? (
                                    <div className="grid gap-2">
                                      <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
                                      <Input
                                        value={item.statusReason}
                                        onChange={(e) =>
                                          updateDeliveryItem(selectedDateKey, wizardCategory, {
                                            statusReason: e.target.value,
                                          })
                                        }
                                        placeholder="Reason for cancelled/delayed"
                                        className="rounded-xl"
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              {wizardStep === 3 ? (
                                <div className="grid gap-4">
                                  <div className="grid gap-2">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-xs text-muted-foreground">Concerns (optional)</Label>
                                      <Badge className="rounded-xl bg-muted text-foreground border">
                                        {item.concerns.length} selected
                                      </Badge>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {PRESET_CONCERNS.map((c) => {
                                        const active = item.concerns.includes(c)
                                        return (
                                          <button
                                            key={c}
                                            type="button"
                                            className={`rounded-xl border px-3 py-1 text-xs transition-colors ${
                                              active
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-background hover:bg-muted"
                                            }`}
                                            onClick={() =>
                                              updateDeliveryItem(selectedDateKey, wizardCategory, {
                                                concerns: toggleItem(item.concerns, c),
                                              })
                                            }
                                          >
                                            {c}
                                          </button>
                                        )
                                      })}
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                      <Input
                                        value={customConcern[customKey] || ""}
                                        onChange={(e) =>
                                          setCustomConcern((prev) => ({
                                            ...prev,
                                            [customKey]: e.target.value,
                                          }))
                                        }
                                        placeholder="Add custom concern"
                                        className="rounded-xl"
                                      />
                                      <Button
                                        type="button"
                                        variant="default"
                                        className="rounded-xl bg-black text-white hover:bg-black/90"
                                        onClick={() =>
                                          handleAddCustomConcern(selectedDateKey, wizardCategory)
                                        }
                                      >
                                        <Plus className="size-4" />
                                        Add
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="grid gap-2">
                                    <Label className="text-xs text-muted-foreground">Remarks (optional)</Label>
                                    <Textarea
                                      value={item.remarks}
                                      onChange={(e) =>
                                        updateDeliveryItem(selectedDateKey, wizardCategory, {
                                          remarks: e.target.value,
                                        })
                                      }
                                      placeholder={`Remarks for ${item.label}`}
                                      className="min-h-[96px] rounded-xl"
                                    />
                                  </div>

                                  <div className="grid gap-2">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-xs text-muted-foreground">Proof / Images</Label>
                                      <Badge className="rounded-xl bg-muted text-foreground border">
                                        {item.images.length} images
                                      </Badge>
                                    </div>

                                    <input
                                      ref={(el) => {
                                        fileInputRefs.current[makeKey(selectedDateKey, wizardCategory)] = el
                                      }}
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => {
                                        handleFilesSelected(
                                          selectedDateKey,
                                          wizardCategory,
                                          e.target.files
                                        )
                                        e.currentTarget.value = ""
                                      }}
                                    />

                                    <button
                                      type="button"
                                      className="group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/10 px-4 py-6 text-left transition-colors hover:bg-muted/20"
                                      onClick={() =>
                                        fileInputRefs.current[
                                          makeKey(selectedDateKey, wizardCategory)
                                        ]?.click()
                                      }
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
                                          <ImagePlus className="size-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                          <div className="text-sm font-medium">Upload images</div>
                                          <div className="text-xs text-muted-foreground">
                                            Click to select one or more proof photos.
                                          </div>
                                        </div>
                                      </div>
                                    </button>

                                    {item.images.length ? (
                                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {item.images.map((img, imgIndex) => (
                                          <div
                                            key={`${selectedDateKey}-${wizardCategory}-img-${imgIndex}`}
                                            className="group relative overflow-hidden rounded-xl border bg-muted/20"
                                          >
                                            <img
                                              src={img.url}
                                              alt={img.file?.name ?? "Uploaded image"}
                                              className="h-24 w-full object-cover"
                                            />
                                            <button
                                              type="button"
                                              className="absolute right-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-xs shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                                              onClick={() =>
                                                handleRemoveImage(
                                                  selectedDateKey,
                                                  wizardCategory,
                                                  imgIndex
                                                )
                                              }
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}

                              {wizardStep === 4 ? (
                                <div className="grid gap-3">
                                  <div className="rounded-2xl border bg-white p-4">
                                    <div className="text-sm font-semibold">Review</div>
                                    <div className="mt-2 text-sm text-muted-foreground">
                                      Item:{" "}
                                      <span className="font-medium text-foreground">{item.label}</span>
                                    </div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      Status:{" "}
                                      <span className="font-medium text-foreground">{meta.label}</span>
                                    </div>
                                    {item.statusReason ? (
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        Reason:{" "}
                                        <span className="font-medium text-foreground">{item.statusReason}</span>
                                      </div>
                                    ) : null}
                                    {item.concerns.length ? (
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        Concerns:{" "}
                                        <span className="font-medium text-foreground">
                                          {item.concerns.join(", ")}
                                        </span>
                                      </div>
                                    ) : null}
                                    {item.remarks.trim() ? (
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        Remarks:{" "}
                                        <span className="font-medium text-foreground">{item.remarks}</span>
                                      </div>
                                    ) : null}
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      Images:{" "}
                                      <span className="font-medium text-foreground">{item.images.length}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )
                        })()}
                      </div>

                      <div className="border-t bg-background px-6 py-4">
                        {(() => {
                          const item = recordsByDate[selectedDateKey]?.[wizardCategory]
                          if (!item) return null

                          const canContinueFromStatus = wizardStep === 2 ? item.statusTouched : true

                          const goBack = () =>
                            setWizardStep((s) => (s > 1 ? ((s - 1) as any) : s))

                          const goNext = () => {
                            if (wizardStep === 2 && !item.statusTouched) {
                              toast.error("Please select a status")
                              return
                            }
                            setWizardStep((s) => (s < 4 ? ((s + 1) as any) : s))
                          }

                          const submitWizard = async () => {
                            if (!item.statusTouched) {
                              toast.error("Please select a status")
                              return
                            }
                            setWizardIsSaving(true)
                            try {
                              if (!item.uploadedAt) {
                                updateDeliveryItem(selectedDateKey, wizardCategory, {
                                  uploadedAt: new Date().toISOString(),
                                })
                              }
                              await saveActiveItemToBackend(selectedDateKey, wizardCategory)
                              toast.success("Saved")
                              closeWizard()
                            } catch (e: any) {
                              toast.error(e?.message || "Failed to save")
                            } finally {
                              setWizardIsSaving(false)
                            }
                          }

                          return (
                            <DialogFooter className="gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl"
                                onClick={goBack}
                                disabled={wizardStep === 1 || wizardIsSaving}
                              >
                                <ChevronLeft className="size-4" />
                                Back
                              </Button>
                              {wizardStep < 4 ? (
                                <Button
                                  type="button"
                                  className="rounded-xl"
                                  onClick={goNext}
                                  disabled={wizardIsSaving || !canContinueFromStatus}
                                >
                                  Next
                                  <ChevronRight className="size-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  className="rounded-xl"
                                  onClick={submitWizard}
                                  disabled={wizardIsSaving}
                                >
                                  {wizardIsSaving ? "Saving…" : "Submit"}
                                </Button>
                              )}
                            </DialogFooter>
                          )
                        })()}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid gap-2">
                    <div className="text-sm font-medium">Filter by date</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Popover
                        open={isHistoryDatePickerOpen}
                        onOpenChange={setIsHistoryDatePickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" className="rounded-xl">
                            <CalendarDays className="size-4" />
                            {historyDate ? format(historyDate, "MMM dd, yyyy") : "All dates"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0 rounded-xl border shadow-lg overflow-hidden"
                          align="start"
                        >
                          <Calendar
                            mode="single"
                            selected={historyDate}
                            className="p-2 [--cell-size:--spacing(7)]"
                            onSelect={(d) => {
                              setHistoryDate(d)
                              if (d) ensureDateRecord(startOfDayKey(d))
                              setIsHistoryDatePickerOpen(false)
                            }}
                          />
                        </PopoverContent>
                      </Popover>

                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => setHistoryDate(undefined)}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <div className="w-full sm:w-[280px]">
                      <Input
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search category, status, remarks..."
                        className="rounded-xl"
                      />
                    </div>
                    <div className="w-full sm:w-[180px]">
                      <Select
                        value={historySort}
                        onValueChange={(v) => setHistorySort(v as "newest" | "oldest")}
                      >
                        <SelectTrigger className="w-full rounded-xl">
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

                <div className="rounded-xl border overflow-hidden hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uploaded At</TableHead>
                        <TableHead>Images</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isHistoryLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : historyRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            No records found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        historyRows.map((r) => {
                          const meta = statusMeta(r.status)
                          const StatusIcon = meta.icon
                          return (
                            <TableRow key={`${r.dateKey}-${r.categoryKey}-${r.uploadedAt}`}>
                              <TableCell className="whitespace-nowrap">
                                {formatHistoryDateKey(r.dateKey)}
                              </TableCell>
                              <TableCell className="font-medium whitespace-nowrap">
                                {r.categoryLabel}
                              </TableCell>
                              <TableCell>
                                <Badge className={`rounded-xl ${meta.badgeClass}`}>
                                  <StatusIcon className="mr-1 size-3.5" />
                                  {meta.label}
                                </Badge>
                                {(r.status === "Cancelled" || r.status === "Delayed") && r.statusReason ? (
                                  <div className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
                                    {r.statusReason}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatDateTime(r.uploadedAt)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{r.imagesCount}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl px-2"
                                    onClick={() =>
                                      (setDetailsTab("details"),
                                      setViewDetailsTarget({
                                        dateKey: r.dateKey,
                                        categoryKey: r.categoryKey,
                                      }))
                                    }
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center">
                                          <Info className="size-4" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent sideOffset={6}>Details</TooltipContent>
                                    </Tooltip>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl px-2"
                                    disabled={r.imagesCount === 0}
                                    onClick={() =>
                                      setViewImagesTarget({
                                        dateKey: r.dateKey,
                                        categoryKey: r.categoryKey,
                                      })
                                    }
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center">
                                          <Images className="size-4" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent sideOffset={6}>Images</TooltipContent>
                                    </Tooltip>
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl px-2 text-rose-700 hover:text-rose-800"
                                    onClick={() =>
                                      setPendingDeleteTarget({
                                        dateKey: r.dateKey,
                                        categoryKey: r.categoryKey,
                                        categoryLabel: r.categoryLabel,
                                      })
                                    }
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center">
                                          <Trash2 className="size-4" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent sideOffset={6}>Delete</TooltipContent>
                                    </Tooltip>
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

                <div className="grid gap-3 md:hidden">
                  {isHistoryLoading ? (
                    <div className="rounded-xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                      Loading...
                    </div>
                  ) : historyRows.length === 0 ? (
                    <div className="rounded-xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                      No records found.
                    </div>
                  ) : (
                    historyRows.map((r) => {
                      const meta = statusMeta(r.status)
                      const StatusIcon = meta.icon
                      return (
                        <div key={`${r.dateKey}-${r.categoryKey}-${r.uploadedAt}`} className="rounded-xl border bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-muted-foreground">{formatHistoryDateKey(r.dateKey)}</div>
                              <div className="truncate text-sm font-semibold">{r.categoryLabel}</div>
                            </div>
                            <Badge className={`shrink-0 rounded-xl ${meta.badgeClass}`}>
                              <StatusIcon className="mr-1 size-3.5" />
                              {meta.label}
                            </Badge>
                          </div>

                          <div className="mt-3 grid gap-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Uploaded</span>
                              <span className="font-medium text-right">{formatDateTime(r.uploadedAt)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Images</span>
                              <span className="font-medium">{r.imagesCount}</span>
                            </div>
                          </div>

                          {(r.status === "Cancelled" || r.status === "Delayed") && r.statusReason ? (
                            <div className="mt-3">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full rounded-xl"
                                onClick={() =>
                                  setViewStatusReasonTarget({
                                    dateKey: r.dateKey,
                                    categoryLabel: r.categoryLabel,
                                    status: r.status,
                                    reason: r.statusReason,
                                  })
                                }
                              >
                                View reason
                              </Button>
                            </div>
                          ) : null}

                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() =>
                                (setDetailsTab("details"),
                                setViewDetailsTarget({
                                  dateKey: r.dateKey,
                                  categoryKey: r.categoryKey,
                                }))
                              }
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              disabled={r.imagesCount === 0}
                              onClick={() =>
                                setViewImagesTarget({
                                  dateKey: r.dateKey,
                                  categoryKey: r.categoryKey,
                                })
                              }
                            >
                              Images
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-rose-700 hover:text-rose-800"
                              onClick={() =>
                                setPendingDeleteTarget({
                                  dateKey: r.dateKey,
                                  categoryKey: r.categoryKey,
                                  categoryLabel: r.categoryLabel,
                                })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={!!viewStatusReasonTarget}
        onOpenChange={(open) => {
          if (!open) setViewStatusReasonTarget(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Status Reason</DialogTitle>
            <DialogDescription>
              {viewStatusReasonTarget
                ? `${viewStatusReasonTarget.dateKey} • ${viewStatusReasonTarget.categoryLabel} • ${viewStatusReasonTarget.status}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/10 p-4 text-sm whitespace-pre-wrap break-words">
            {viewStatusReasonTarget?.reason || "N/A"}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setViewStatusReasonTarget(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewDetailsTarget}
        onOpenChange={(open) => {
          if (!open) setViewDetailsTarget(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-hidden p-0">
          {(() => {
            const day = viewDetailsTarget ? recordsByDate[viewDetailsTarget.dateKey] : null
            const item = viewDetailsTarget ? day?.[viewDetailsTarget.categoryKey] : null

            const meta = item ? statusMeta(item.status) : statusMeta("Pending")
            const StatusIcon = meta.icon

            return (
              <div className="flex max-h-[85vh] flex-col">
                <DialogHeader className="px-6 pb-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <DialogTitle className="truncate">
                        {item?.label || "Upload details"}
                      </DialogTitle>
                      <DialogDescription className="truncate">
                        {viewDetailsTarget ? viewDetailsTarget.dateKey : ""}
                      </DialogDescription>
                    </div>
                    <Badge className={`shrink-0 rounded-xl ${meta.badgeClass}`}>
                      <StatusIcon className="mr-1 size-3.5" />
                      {meta.label}
                    </Badge>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-4">
                  {!day || !item ? (
                    <div className="rounded-2xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                      No details found.
                    </div>
                  ) : (
                    <Tabs
                      value={detailsTab}
                      onValueChange={(v) => setDetailsTab(v as "details" | "concerns")}
                    >
                      <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/20 p-1">
                        <TabsTrigger value="details" className="rounded-lg">
                          Details
                        </TabsTrigger>
                        <TabsTrigger value="concerns" className="rounded-lg">
                          Concerns
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="details" className="mt-4">
                        <div className="grid gap-4">
                          <div className="rounded-2xl border bg-white p-4">
                            <div className="grid gap-3 text-sm">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs text-muted-foreground">Date</div>
                                  <div className="mt-1 font-medium">{viewDetailsTarget?.dateKey}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Status</div>
                                  <div className="mt-1 font-medium">{meta.label}</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs text-muted-foreground">Uploaded at</div>
                                  <div className="mt-1 font-medium">
                                    {item.uploadedAt ? formatDateTime(item.uploadedAt) : "N/A"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Status updated</div>
                                  <div className="mt-1 font-medium">
                                    {item.statusUpdatedAt ? formatDateTime(item.statusUpdatedAt) : "N/A"}
                                  </div>
                                </div>
                              </div>

                              {(item.status === "Cancelled" || item.status === "Delayed") && item.statusReason ? (
                                <div>
                                  <div className="text-xs text-muted-foreground">Reason</div>
                                  <div className="mt-2 rounded-xl border bg-muted/10 p-3 text-sm whitespace-pre-wrap break-words">
                                    {item.statusReason}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="rounded-2xl border bg-white p-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">Remarks</div>
                              <Badge className="rounded-xl bg-muted text-foreground border">
                                {(item.remarks || "").trim() ? "Provided" : "None"}
                              </Badge>
                            </div>
                            <div className="mt-3 rounded-xl border bg-muted/10 p-3 text-sm whitespace-pre-wrap break-words">
                              {(item.remarks || "").trim() ? item.remarks : "No remarks."}
                            </div>
                          </div>

                          <div className="rounded-2xl border bg-white p-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">Images</div>
                              <Badge className="rounded-xl bg-muted text-foreground border">
                                {item.images.length}
                              </Badge>
                            </div>
                            <div className="mt-3 text-sm text-muted-foreground">
                              Use the Images button in the table/card to preview uploads.
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="concerns" className="mt-4">
                        {item.concerns.length === 0 ? (
                          <div className="rounded-2xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                            No concerns.
                          </div>
                        ) : (
                          <div className="rounded-2xl border bg-white p-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">Concerns</div>
                              <Badge className="rounded-xl bg-muted text-foreground border">
                                {item.concerns.length}
                              </Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.concerns.map((c) => (
                                <span
                                  key={c}
                                  className="inline-flex items-center rounded-full border bg-muted/10 px-3 py-1 text-xs font-medium text-foreground"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  )}
                </div>

                <div className="border-t bg-background px-6 py-4">
                  <DialogFooter>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setViewDetailsTarget(null)}
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingDeleteTarget}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTarget(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Delete record?</DialogTitle>
            <DialogDescription>
              This will permanently delete the record and its uploaded images.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/10 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{pendingDeleteTarget?.dateKey}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium">{pendingDeleteTarget?.categoryLabel}</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setPendingDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={async () => {
                if (!pendingDeleteTarget) return
                try {
                  await deleteItemFromBackend(
                    pendingDeleteTarget.dateKey,
                    pendingDeleteTarget.categoryKey
                  )
                  toast.success("Deleted.")

                  setRecordsByDate((prev) => {
                    const day = prev[pendingDeleteTarget.dateKey]
                    if (!day) return prev
                    const key = pendingDeleteTarget.categoryKey
                    const current = day[key]
                    return {
                      ...prev,
                      [pendingDeleteTarget.dateKey]: {
                        ...day,
                        [key]: createEmptyItem(
                          key,
                          current?.label ||
                            CATEGORY_OPTIONS.find((c) => c.key === key)?.label ||
                            ""
                        ),
                      },
                    }
                  })

                  setHistoryRecords((prev) =>
                    prev.filter(
                      (r) =>
                        !(r.dateKey === pendingDeleteTarget.dateKey && r.categoryKey === pendingDeleteTarget.categoryKey)
                    )
                  )

                  setPendingDeleteTarget(null)
                  setViewDetailsTarget(null)
                } catch (e: any) {
                  toast.error(e?.message || "Failed to delete")
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingStatusChange}
        onOpenChange={(open) => {
          if (!open) {
            setPendingStatusChange(null)
            setStatusReasonDraft("")
            setStatusTimestampDraft("")
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm status update</DialogTitle>
            <DialogDescription>
              This will update the delivery status.
            </DialogDescription>
          </DialogHeader>

          {pendingStatusChange && (
            <div className="grid gap-4">
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium">{pendingStatusChange.from}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-semibold">{pendingStatusChange.to}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Date & Time</span>
                  <span className="font-medium">
                    {formatDateTime(statusTimestampDraft || new Date().toISOString())}
                  </span>
                </div>
              </div>

              {(pendingStatusChange.to === "Cancelled" ||
                pendingStatusChange.to === "Delayed") && (
                <div className="grid gap-2">
                  <Label className="text-sm">
                    {pendingStatusChange.to === "Cancelled"
                      ? "Reason of cancellation (required)"
                      : "Reason of delay (optional)"}
                  </Label>
                  <Textarea
                    value={statusReasonDraft}
                    onChange={(e) => setStatusReasonDraft(e.target.value)}
                    placeholder={
                      pendingStatusChange.to === "Cancelled"
                        ? "Type the reason of cancellation"
                        : "Add a short note (optional)"
                    }
                    className="min-h-[90px] rounded-xl"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setPendingStatusChange(null)
                setStatusReasonDraft("")
                setStatusTimestampDraft("")
              }}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={confirmStatusChange}
              disabled={
                (pendingStatusChange?.to === "Cancelled" &&
                  statusReasonDraft.trim().length === 0) ||
                !pendingStatusChange
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewImagesTarget}
        onOpenChange={(open) => {
          if (!open) {
            setViewImagesTarget(null)
            setImagePreview(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Delivery Images</DialogTitle>
            <DialogDescription>Proof images attached to this record.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 overflow-y-auto pr-1 max-h-[calc(85vh-10rem)]">
            {(() => {
              const day = viewImagesTarget ? recordsByDate[viewImagesTarget.dateKey] : null
              const item = viewImagesTarget ? day?.[viewImagesTarget.categoryKey] : null
              if (!day || !item || item.images.length === 0) {
                return (
                  <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No images.
                  </div>
                )
              }

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {item.images.map((img, idx) => (
                    <button
                      key={`view-${viewImagesTarget?.dateKey}-${item.key}-${idx}`}
                      type="button"
                      className="overflow-hidden rounded-xl border bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() =>
                        setImagePreview({
                          dateKey: viewImagesTarget!.dateKey,
                          categoryKey: viewImagesTarget!.categoryKey,
                          index: idx,
                        })
                      }
                    >
                      <img
                        src={img.url}
                        alt={img.file?.name ?? "Uploaded image"}
                        className="h-32 w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setViewImagesTarget(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!imagePreview}
        onOpenChange={(open) => {
          if (!open) setImagePreview(null)
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
            <DialogDescription>Use Next/Prev to browse images.</DialogDescription>
          </DialogHeader>

          {(() => {
            const day = imagePreview ? recordsByDate[imagePreview.dateKey] : null
            const item = imagePreview ? day?.[imagePreview.categoryKey] : null
            const img = imagePreview && item ? item.images[imagePreview.index] : null
            if (!imagePreview || !item || !img) {
              return (
                <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No image.
                </div>
              )
            }

            const canPrev = imagePreview.index > 0
            const canNext = imagePreview.index < item.images.length - 1

            return (
              <div className="grid gap-3">
                <div className="rounded-xl border bg-muted/10 overflow-hidden">
                  <img
                    src={img.url}
                    alt={img.file?.name ?? "Uploaded image"}
                    className="w-full max-h-[50vh] sm:max-h-[60vh] object-contain bg-black/90"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground truncate">
                    {(img.file?.name ?? "Uploaded image") +
                      ` (${imagePreview.index + 1}/${item.images.length})`}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl w-full sm:w-auto"
                      disabled={!canPrev}
                      onClick={() =>
                        setImagePreview((prev) =>
                          prev ? { ...prev, index: Math.max(0, prev.index - 1) } : prev
                        )
                      }
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl w-full sm:w-auto"
                      disabled={!canNext}
                      onClick={() =>
                        setImagePreview((prev) =>
                          prev
                            ? {
                                ...prev,
                                index: Math.min(item.images.length - 1, prev.index + 1),
                              }
                            : prev
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

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setImagePreview(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={successModalOpen}
        onOpenChange={(open) => {
          setSuccessModalOpen(open)
        }}
      >
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

            <div className="mt-4 text-lg font-semibold">Successfully saved</div>
            <div className="mt-1 text-sm text-muted-foreground">Moving to the next category…</div>

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
