import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
  Folder,
  FolderOpen,
  Upload,
  X,
  File as FileIcon,
  Image,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  Loader2,
  Trash2,
  Search,
  Grid3X3,
  List,
  ArrowLeft,
  CalendarIcon,
} from "lucide-react"
import { toast } from "sonner"
import imageCompression from "browser-image-compression"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type AuthState = {
  token: string
  user: {
    id: string
    username: string
    email: string
    name: string
    role: string
    position?: string
    school?: string
    municipality?: string
    hlaRoleType?: string
  }
}

type FolderType =
  | "Fruits & Vegetables"
  | "Meat"
  | "NutriBun"
  | "Patties"
  | "Groceries"
  | "Consumables"
  | "Water"
  | "LPG"
  | "Rice"
  | "Others"

type UploadedFile = {
  id: string
  name: string
  size: number
  type: string
  description: string
  uploadedAt: string
  status: "pending" | "uploaded" | "rejected"
  folder: FolderType
  url?: string
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const
const MAX_UPLOAD_FILES = 15

const FOLDERS: FolderType[] = [
  "Fruits & Vegetables",
  "Meat",
  "NutriBun",
  "Patties",
  "Groceries",
  "Consumables",
  "Water",
  "LPG",
  "Rice",
  "Others",
]

const FOLDER_COLORS: Record<FolderType, string> = {
  "Fruits & Vegetables": "bg-orange-100 text-orange-600",
  Meat: "bg-red-100 text-red-600",
  NutriBun: "bg-yellow-100 text-yellow-600",
  Patties: "bg-amber-100 text-amber-600",
  Groceries: "bg-blue-100 text-blue-600",
  Consumables: "bg-purple-100 text-purple-600",
  Water: "bg-cyan-100 text-cyan-600",
  LPG: "bg-gray-100 text-gray-600",
  Rice: "bg-stone-100 text-stone-600",
  Others: "bg-slate-100 text-slate-600",
}

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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return Image
  if (type.includes("spreadsheet") || type.includes("excel")) return FileSpreadsheet
  if (type.includes("pdf")) return FileIcon
  if (type.includes("code") || type.includes("json")) return FileCode
  return FileIcon
}

export function FileSubmission() {
  const auth = useMemo(() => getAuth(), [])
  const userHlaRoleType = auth?.user?.hlaRoleType || ""
  const isCoordinator = userHlaRoleType === "HLA Coordinator"

  const [isCompressing, setIsCompressing] = useState(false)
  const [compressText, setCompressText] = useState("")

  const [currentFolder, setCurrentFolder] = useState<FolderType | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [description, setDescription] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [viewFile, setViewFile] = useState<UploadedFile | null>(null)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isLoading, setIsLoading] = useState(false)
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})

  const apiFetch = async (url: string, options?: RequestInit) => {
    const res = await fetch(`${getApiBaseUrl()}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth?.token}`,
        ...options?.headers,
      },
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  useEffect(() => {
    if (!isCoordinator) return
    fetchFiles()
    fetchFolderCounts()
  }, [isCoordinator, selectedDate, currentFolder])

  const fetchFiles = async () => {
    setIsLoading(true)
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd")
      const folderParam = currentFolder ? `&folder=${encodeURIComponent(currentFolder)}` : ""
      const data = await apiFetch(
        `/api/file-submissions?date=${dateStr}${folderParam}`
      )
      setUploadedFiles(data.files || [])
    } catch (err) {
      toast.error("Failed to fetch files")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchFolderCounts = async () => {
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd")
      const data = await apiFetch(`/api/file-submissions/stats/counts?date=${dateStr}`)
      setFolderCounts(data.folderCounts || {})
    } catch (err) {
      console.error("Failed to fetch folder counts", err)
    }
  }

  const handleUpload = async () => {
    if (files.length === 0 || !currentFolder) return

    if (files.length > MAX_UPLOAD_FILES) {
      toast.error(`You can only upload up to ${MAX_UPLOAD_FILES} images at a time`)
      return
    }

    const invalidFiles = files.filter((f) => !ALLOWED_IMAGE_TYPES.includes(f.type as any))
    if (invalidFiles.length > 0) {
      toast.error("Only JPEG/PNG images are allowed")
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))
      formData.append("folder", currentFolder)
      formData.append("description", description)
      formData.append("uploadDate", format(selectedDate, "yyyy-MM-dd"))

      const res = await fetch(`${getApiBaseUrl()}/api/file-submissions/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth?.token}`,
        },
        body: formData,
      })

      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      toast.success(data.message)
      setFiles([])
      setDescription("")
      setIsUploadDialogOpen(false)
      fetchFiles()
      fetchFolderCounts()
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload files")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (fileId: string) => {
    try {
      await apiFetch(`/api/file-submissions/${fileId}`, { method: "DELETE" })
      setDeleteFileId(null)
      toast.success("File deleted successfully")
      fetchFiles()
      fetchFolderCounts()
    } catch {
      toast.error("Failed to delete file")
    }
  }

  const handleDownload = async (file: UploadedFile) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/file-submissions/download/${file.id}`, {
        headers: { Authorization: `Bearer ${auth?.token}` },
      })
      if (!res.ok) throw new Error("Download failed")

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      toast.error("Failed to download file")
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredFiles = uploadedFiles.filter(
    (file) =>
      (!currentFolder || file.folder === currentFolder) &&
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const derivedFolderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const f of uploadedFiles) {
      const key = String(f.folder)
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [uploadedFiles])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (!selectedFiles.length) return

    const remainingSlots = Math.max(0, MAX_UPLOAD_FILES - files.length)
    if (selectedFiles.length > remainingSlots) {
      toast.error(`You can only upload up to ${MAX_UPLOAD_FILES} images at a time`)
    }

    const filesToProcess = selectedFiles.slice(0, remainingSlots)
    if (filesToProcess.length === 0) {
      try {
        e.target.value = ""
      } catch {
        // ignore
      }
      return
    }

    const MAX_FILE_BYTES = 10 * 1024 * 1024
    const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

    const validFiles = filesToProcess.filter((file) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
        toast.error(`${file.name} is not a JPEG/PNG image`)
        return false
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is too large (max 10MB)`)
        return false
      }
      return true
    })

    const imageFiles = validFiles.filter((f) => f.type.startsWith("image/"))

    const compressOne = async (file: File, index: number, total: number): Promise<File> => {
      if (file.size <= MAX_IMAGE_BYTES) return file

      setIsCompressing(true)
      setCompressText(`Compressing image ${index + 1} of ${total}…`)

      const options = {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.92,
        fileType: "image/jpeg",
        onProgress: (p: number) => {
          setCompressText(`Compressing image ${index + 1} of ${total}… ${Math.round(p)}%`)
        },
      } satisfies Parameters<typeof imageCompression>[1]

      const compressed = await imageCompression(file, options)
      if (compressed.size > MAX_IMAGE_BYTES) {
        throw new Error("Image is too large. Please select a smaller image.")
      }

      const name = file.name.replace(/\.[^.]+$/, "") || "image"
      return new File([compressed], `${name}.jpg`, { type: "image/jpeg" })
    }

    try {
      const processedImages: File[] = []
      for (let i = 0; i < imageFiles.length; i += 1) {
        const f = imageFiles[i]
        processedImages.push(await compressOne(f, i, imageFiles.length))
      }

      setFiles((prev) => [...prev, ...processedImages])
    } catch (err: any) {
      toast.error(err?.message || "Failed to process image")
    } finally {
      setIsCompressing(false)
      setCompressText("")
      try {
        e.target.value = ""
      } catch {
        // ignore
      }
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  if (!isCoordinator) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-slate-100 p-4">
              <Folder className="size-8 text-slate-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Access Denied</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              This page is only available for users with HLA Coordinator role.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Folder Browser View
  if (!currentFolder) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">File Submission</h1>
            <p className="text-sm text-muted-foreground">
              Select a folder to upload and manage your files
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Folders</CardTitle>
                <CardDescription>
                  {FOLDERS.length} folders available
                </CardDescription>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-xl w-full sm:w-[200px]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {FOLDERS.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase())).map((folder) => (
                <button
                  key={folder}
                  onClick={() => setCurrentFolder(folder)}
                  className="group flex flex-col items-center gap-3 p-4 rounded-2xl border border-transparent bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 transition-all"
                >
                  <div
                    className={cn(
                      "size-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                      FOLDER_COLORS[folder]
                    )}
                  >
                    <FolderOpen className="size-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-neutral-800">{folder}</p>
                    <p className="text-xs text-muted-foreground">
                      {derivedFolderCounts[folder] ?? folderCounts[folder] ?? 0} files
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Folder Contents View
  return (
    <div className="container mx-auto p-3 sm:p-4 lg:p-6">
      {/* Header with Back Button */}
      <div className="mb-4 sm:mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentFolder(null)}
          className="mb-2 -ml-2 text-muted-foreground hover:text-emerald-600"
        >
          <ArrowLeft className="mr-1 size-4" />
          Back to Folders
        </Button>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={cn(
                "size-8 sm:size-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0",
                FOLDER_COLORS[currentFolder!]
              )}
            >
              <Folder className="size-4 sm:size-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight">{currentFolder}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="sm:hidden rounded-xl"
                  aria-label="Pick a date"
                >
                  <CalendarIcon className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <div className="relative flex-1 sm:w-auto">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 size-3.5 sm:size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 sm:pl-9 rounded-lg sm:rounded-xl w-full sm:w-[180px] h-9 sm:h-10 text-sm"
              />
            </div>
            <div className="flex items-center border rounded-xl overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "rounded-none px-2.5 sm:px-3 h-9",
                  viewMode === "grid" && "bg-slate-100"
                )}
              >
                <Grid3X3 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-none px-2.5 sm:px-3 h-9",
                  viewMode === "list" && "bg-slate-100"
                )}
              >
                <List className="size-4" />
              </Button>
            </div>
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              className="rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-700 h-9 sm:h-10 px-3 sm:px-4"
              size="sm"
            >
              <Upload className="mr-1 sm:mr-2 size-4" />
              <span className="hidden sm:inline">Upload</span>
              <span className="sm:hidden">Upload</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Files Display */}
      {isLoading ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
            <Loader2 className="size-8 sm:size-12 animate-spin text-emerald-600 mb-4" />
            <p className="text-sm text-muted-foreground">Loading files...</p>
          </CardContent>
        </Card>
      ) : filteredFiles.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
            <div
              className={cn(
                "rounded-full p-5 sm:p-6 mb-4",
                FOLDER_COLORS[currentFolder!]
              )}
            >
              <FolderOpen className="size-10 sm:size-12" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold">No files yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground max-w-xs sm:max-w-md">
              This folder is empty. Click "Upload" to add images.
            </p>
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              className="mt-4 sm:mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              <Upload className="mr-2 size-4" />
              Upload Files
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredFiles.map((file) => {
            const Icon = getFileIcon(file.type)
            const isImage = file.type.startsWith("image/")
            return (
              <div
                key={file.id}
                className="group relative flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
                onClick={() => setViewFile(file)}
              >
                <div className="relative aspect-square rounded-lg sm:rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    file.url ? (
                      <img
                        src={`${getApiBaseUrl()}${file.url}`}
                        alt={file.name}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <Image className="size-8 sm:size-12 text-slate-400" />
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg sm:rounded-xl bg-emerald-50 p-2 sm:p-4">
                      <Icon className="size-6 sm:size-10 text-emerald-600" />
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="size-7 sm:size-8 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteFileId(file.id)
                      }}
                    >
                      <Trash2 className="size-3 sm:size-4" />
                    </Button>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">{file.name}</p>
                  <div className="flex items-center justify-between mt-0.5 sm:mt-1">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1.5 py-0">
                      {format(new Date(file.uploadedAt), "MMM d")}
                    </Badge>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredFiles.map((file) => {
                const Icon = getFileIcon(file.type)
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer group"
                    onClick={() => setViewFile(file)}
                  >
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <Icon className="size-6 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(file.uploadedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteFileId(file.id)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Upload className="size-4 sm:size-5" />
              Upload to {currentFolder}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Select multiple images (JPEG/PNG) to upload
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6 py-3 sm:py-4">
            {/* File Drop Zone */}
            <div
              className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 sm:p-8 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const droppedFiles = Array.from(e.dataTransfer.files)

                const remainingSlots = Math.max(0, MAX_UPLOAD_FILES - files.length)
                if (droppedFiles.length > remainingSlots) {
                  toast.error(`You can only upload up to ${MAX_UPLOAD_FILES} images at a time`)
                }

                const filesToProcess = droppedFiles.slice(0, remainingSlots)
                if (filesToProcess.length === 0) return

                const validFiles = filesToProcess.filter((file) => {
                  if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
                    toast.error(`${file.name} is not a JPEG/PNG image`)
                    return false
                  }
                  if (file.size > 10 * 1024 * 1024) {
                    toast.error(`${file.name} is too large (max 10MB)`)
                    return false
                  }
                  return true
                })
                setFiles((prev) => [...prev, ...validFiles])
              }}
            >
              <div className="rounded-full bg-emerald-100 p-3 sm:p-4">
                <Upload className="size-6 sm:size-8 text-emerald-600" />
              </div>
              <p className="mt-3 sm:mt-4 text-sm font-medium">Drag & drop images here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/jpeg,image/png"
              />
            </div>

            {/* Selected Files */}
            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Selected Files ({files.length})
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles([])}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="mr-1 size-4" />
                    Clear all
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border p-3">
                  {files.map((file, index) => {
                    const Icon = getFileIcon(file.type)
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-lg bg-slate-50 p-3"
                      >
                        <div className="rounded-lg bg-white p-2 shadow-sm">
                          <Icon className="size-4 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0 w-0">
                          <p className="block w-full text-sm font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-full p-0"
                          onClick={() => removeFile(index)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for these files..."
                className="min-h-[80px] rounded-xl resize-none"
              />
            </div>

            {/* Upload Summary */}
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Target folder:</span>
                <Badge
                  variant="secondary"
                  className={cn("font-medium", FOLDER_COLORS[currentFolder!])}
                >
                  {currentFolder}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total files:</span>
                <span className="font-medium">{files.length}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total size:</span>
                <span className="font-medium">
                  {formatFileSize(files.reduce((acc, f) => acc + f.size, 0))}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false)
                setFiles([])
                setDescription("")
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || isUploading}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 min-w-[120px]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Upload {files.length > 0 && `(${files.length})`}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View File Dialog */}
      <Dialog open={!!viewFile} onOpenChange={(open) => !open && setViewFile(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>File Details</DialogTitle>
            <DialogDescription>{viewFile?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 rounded-xl border bg-slate-50 p-4">
              {viewFile?.type?.startsWith("image/") && viewFile?.url ? (
                <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm">
                  <img
                    src={`${getApiBaseUrl()}${viewFile.url}`}
                    alt={viewFile.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                viewFile && (() => {
                  const Icon = getFileIcon(viewFile.type)
                  return (
                    <div className="rounded-lg bg-white p-3 shadow-sm">
                      <Icon className="size-6 text-slate-600" />
                    </div>
                  )
                })()
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{viewFile?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {viewFile && formatFileSize(viewFile.size)}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{viewFile?.description || "No description"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Folder</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      viewFile && FOLDER_COLORS[viewFile.folder]
                    )}
                  >
                    {viewFile?.folder}
                  </Badge>
                </div>
                <div className="rounded-xl border bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Uploaded</p>
                  <p className="text-sm font-medium">
                    {viewFile && format(new Date(viewFile.uploadedAt), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-500" />
                  <span className="text-sm font-medium capitalize">
                    {viewFile?.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setViewFile(null)}
              className="rounded-xl"
            >
              Close
            </Button>
            <Button 
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => viewFile && handleDownload(viewFile)}
            >
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteFileId} onOpenChange={(open) => !open && setDeleteFileId(null)}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center sm:justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteFileId(null)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteFileId && handleDelete(deleteFileId)}
              className="rounded-xl"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCompressing} onOpenChange={() => {}}>
        <DialogContent className="w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-black text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
            <div className="mt-4 text-base font-semibold">Optimizing image</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {compressText || "Compressing…"}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
