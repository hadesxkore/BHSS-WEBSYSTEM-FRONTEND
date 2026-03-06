import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Eye,
    FileText,
    GripVertical,
    Image as ImageIcon,
    MapPin,
    Pencil,
    Plus,
    Search,
    ToggleLeft,
    ToggleRight,
    Trash2,
    X,
    CheckCircle2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldInputType = "text" | "textarea" | "number" | "date"

type ActivityField = {
    id: string
    type: FieldInputType
    label: string
    description: string
    required: boolean
    photoUrl: string
    unit: string
    placeholder: string
}

type Activity = {
    id: string
    title: string
    description: string
    isActive: boolean
    fields: ActivityField[]
    createdAt: string
    updatedAt: string
}

type ResponseUser = { name: string; school: string; municipality: string; hlaRoleType: string }
type ActivityResponseRow = {
    id: string; activityId: string; userId: string; user: ResponseUser
    answers: Array<{ fieldId: string; value: string }>; submittedAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_OPTIONS = ["PCS", "Unit", "Box", "Set", "Bag", "Bottle", "Pack", "Kg", "Liter", "Meter", "Roll", "Ream", "Pair", "Dozen"]
const INPUT_TYPE_LABELS: Record<FieldInputType, string> = { text: "Short Text", textarea: "Long Text", number: "Number", date: "Date" }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBaseUrl() {
    const e = (import.meta as any)?.env as any
    return ((e?.VITE_API_BASE_URL || e?.VITE_API_URL) as string || "http://localhost:8000").replace(/\/+$/, "")
}
function getAuthToken(): string | null {
    try { const raw = localStorage.getItem("bhss_auth"); if (!raw) return null; return (JSON.parse(raw) as any)?.token || null }
    catch { return null }
}
async function apiFetch(path: string, init?: RequestInit) {
    const token = getAuthToken()
    if (!token) throw new Error("Not authenticated")
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.message || "Request failed")
    return data
}
async function apiMultipart(path: string, body: FormData) {
    const token = getAuthToken()
    if (!token) throw new Error("Not authenticated")
    const res = await fetch(`${getApiBaseUrl()}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.message || "Request failed")
    return data
}
function uuid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

// ─── Question Editor (inline, inside activity detail) ─────────────────────────

function QuestionEditor({
    field, index, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast,
}: {
    field: ActivityField; index: number
    onUpdate: (f: ActivityField) => void; onRemove: () => void
    onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean
}) {
    const [isUploading, setIsUploading] = useState(false)
    const [isDragOver, setIsDragOver] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const dropRef = useRef<HTMLDivElement>(null)

    const handlePhotoUpload = useCallback(async (file: File) => {
        setIsUploading(true)
        try {
            const fd = new FormData(); fd.append("photo", file)
            const data = await apiMultipart("/api/admin/activities/upload-photo", fd)
            onUpdate({ ...field, photoUrl: String(data.url || "") })
            toast.success("Photo uploaded")
        } catch (e: any) { toast.error(e?.message || "Upload failed") }
        finally { setIsUploading(false) }
    }, [field, onUpdate])

    // ── Document-level paste listener (active while hovering the zone) ──
    const handlePasteEvent = useCallback((e: ClipboardEvent | React.ClipboardEvent) => {
        const clipboardData = (e as ClipboardEvent).clipboardData || (e as React.ClipboardEvent).clipboardData;
        if (!clipboardData) return;

        // 1. Check for files (e.g. copied image file from Explorer)
        const files = Array.from(clipboardData.files || []);
        const imgFile = files.find(f => f.type.startsWith("image/"));
        if (imgFile) {
            e.preventDefault();
            handlePhotoUpload(imgFile);
            return;
        }

        // 2. Check for items (e.g. screenshot, copied image from browser)
        const items = Array.from(clipboardData.items);
        const imgItem = items.find((i) => i.type.startsWith("image/"));
        if (imgItem) {
            e.preventDefault();
            const file = imgItem.getAsFile();
            if (file) handlePhotoUpload(file);
        }
    }, [handlePhotoUpload]);

    // Explicitly read clipboard (for the 'Paste' button)
    const handlePasteFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imgTypes = item.types.filter(t => t.startsWith("image/"));
                if (imgTypes.length > 0) {
                    const blob = await item.getType(imgTypes[0]);
                    const file = new File([blob], "pasted-image.png", { type: imgTypes[0] });
                    await handlePhotoUpload(file);
                    return;
                }
            }
            toast.error("No image found in clipboard");
        } catch (e: any) {
            toast.error("Clipboard access denied or not supported. Try Ctrl+V.");
        }
    };

    useEffect(() => {
        if (!isHovered || field.photoUrl) return;
        const handler = (e: ClipboardEvent) => handlePasteEvent(e);
        document.addEventListener("paste", handler);
        return () => document.removeEventListener("paste", handler);
    }, [isHovered, field.photoUrl, handlePasteEvent]);

    return (
        <div className="group relative rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-violet-200">
            {/* Minimal Drag Handle + Label */}
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical className="size-4 text-gray-300 cursor-grab active:cursor-grabbing" />
            </div>

            <div className="space-y-4">
                {/* Header: Label + Actions */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-lg bg-violet-50 text-[10px] font-semibold text-violet-600">
                            #{index + 1}
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer ml-1">
                            <input type="checkbox" checked={field.required}
                                onChange={(e) => onUpdate({ ...field, required: e.target.checked })}
                                className="rounded accent-violet-600 size-3" />
                            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Required</span>
                        </label>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={onMoveUp} disabled={isFirst}
                            className="p-1 rounded-md text-gray-300 hover:text-gray-600 disabled:opacity-30">
                            <ChevronUp className="size-3.5" />
                        </button>
                        <button type="button" onClick={onMoveDown} disabled={isLast}
                            className="p-1 rounded-md text-gray-300 hover:text-gray-600 disabled:opacity-30">
                            <ChevronDown className="size-3.5" />
                        </button>
                        <button type="button" onClick={onRemove}
                            className="p-1 rounded-md text-gray-300 hover:text-red-500">
                            <Trash2 className="size-3.5" />
                        </button>
                    </div>
                </div>

                <div className="space-y-3 px-1">
                    {/* Title */}
                    <div>
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Question Title</Label>
                        <Input value={field.label} onChange={(e) => onUpdate({ ...field, label: e.target.value })}
                            placeholder="e.g. Total quantity" className="h-9 border-gray-100 bg-gray-50/30 focus:bg-white text-xs font-semibold rounded-lg shadow-none" />
                    </div>

                    {/* Type */}
                    <div>
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Answer Type</Label>
                        <Select value={field.type} onValueChange={(v) => onUpdate({ ...field, type: v as FieldInputType })}>
                            <SelectTrigger className="h-9 border-gray-100 bg-gray-50/30 focus:bg-white text-[11px] font-medium rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(INPUT_TYPE_LABELS).map(([v, l]) => (
                                    <SelectItem key={v} value={v}>{l}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Description */}
                    <div>
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Sub-text / Instructions</Label>
                        <Textarea rows={1} value={field.description}
                            onChange={(e) => onUpdate({ ...field, description: e.target.value })}
                            placeholder="Helpful hint for users..."
                            className="min-h-[36px] h-9 border-gray-100 bg-gray-50/30 focus:bg-white text-[11px] rounded-lg resize-none py-2" />
                    </div>

                    {/* Unit & Placeholder (shorter row) */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Unit</Label>
                            <Select value={field.unit || "__none__"}
                                onValueChange={(v) => onUpdate({ ...field, unit: v === "__none__" ? "" : v })}>
                                <SelectTrigger className="h-9 border-gray-100 bg-gray-50/30 focus:bg-white text-[11px] rounded-lg">
                                    <SelectValue placeholder="No Unit" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">None</SelectItem>
                                    {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Placeholder</Label>
                            <Input value={field.placeholder}
                                onChange={(e) => onUpdate({ ...field, placeholder: e.target.value })}
                                placeholder="e.g. 0.00" className="h-9 border-gray-100 bg-gray-50/30 focus:bg-white text-[11px] rounded-lg" />
                        </div>
                    </div>

                    {/* Row 4: Image Upload (click / drag-drop / paste) */}
                    <div>
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <ImageIcon className="size-3" /> Reference Photo
                        </Label>
                        {field.photoUrl ? (
                            <div className="relative w-full rounded-lg overflow-hidden border border-gray-100 shadow-sm">
                                <img src={`${getApiBaseUrl()}${field.photoUrl}`} alt="" className="w-full object-cover max-h-32" />
                                <button type="button" onClick={() => onUpdate({ ...field, photoUrl: "" })}
                                    className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow hover:text-red-500 transition-colors">
                                    <X className="size-3" />
                                </button>
                            </div>
                        ) : (
                            <div
                                ref={dropRef}
                                tabIndex={0}
                                onPaste={(e) => handlePasteEvent(e)}
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault(); setIsDragOver(false)
                                    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"))
                                    if (file) handlePhotoUpload(file)
                                }}
                                onClick={() => !isUploading && fileRef.current?.click()}
                                className={`w-full flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-3.5 text-xs cursor-pointer transition-all outline-none
                                focus:ring-2 focus:ring-violet-200 focus:border-violet-400
                                ${isDragOver
                                        ? "border-violet-400 bg-violet-50 text-violet-600"
                                        : isUploading
                                            ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                                            : "border-gray-100 bg-gray-50 text-gray-400 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-500"
                                    }`}
                            >
                                {isUploading ? (
                                    <div className="size-4 animate-spin rounded-full border-2 border-gray-200 border-t-violet-500" />
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-center">
                                                <p className="text-[10px] font-semibold">{isDragOver ? "Drop" : "Upload"}</p>
                                            </div>
                                            <span className="text-[10px] text-gray-400">or</span>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handlePasteFromClipboard(); }}
                                                className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 hover:bg-violet-100 border border-violet-100 shadow-sm"
                                            >
                                                Paste
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-gray-400 font-medium mt-1">JPG, PNG (max 5MB)</p>
                                    </>
                                )}
                            </div>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = "" }} />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Responses Panel ───────────────────────────────────────────────────────────

function ResponsesPanel({ activity }: { activity: Activity }) {
    const [responses, setResponses] = useState<ActivityResponseRow[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedMunicipality, setSelectedMunicipality] = useState("all")
    const [selectedSchool, setSelectedSchool] = useState("all")
    const [search, setSearch] = useState("")
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const qs = new URLSearchParams()
            if (selectedMunicipality !== "all") qs.set("municipality", selectedMunicipality)
            if (selectedSchool !== "all") qs.set("school", selectedSchool)
            if (search.trim()) qs.set("search", search.trim())
            const data = await apiFetch(`/api/admin/activities/${activity.id}/responses?${qs}`)
            setResponses(Array.isArray(data.responses) ? data.responses : [])
        } catch (e: any) { toast.error(e?.message || "Failed to load responses") }
        finally { setIsLoading(false) }
    }, [activity.id, selectedMunicipality, selectedSchool, search])

    useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

    const municipalityOptions = useMemo(() => {
        const set = new Set<string>(); for (const r of responses) if (r.user.municipality) set.add(r.user.municipality)
        return Array.from(set).sort()
    }, [responses])

    const schoolOptions = useMemo(() => {
        const set = new Set<string>()
        for (const r of responses) { if (selectedMunicipality !== "all" && r.user.municipality !== selectedMunicipality) continue; if (r.user.school) set.add(r.user.school) }
        return Array.from(set).sort()
    }, [responses, selectedMunicipality])

    const grouped = useMemo(() => {
        const map = new Map<string, Map<string, ActivityResponseRow[]>>()
        for (const r of responses) {
            const mun = r.user.municipality || "Unknown"; const sch = r.user.school || "Unknown"
            if (!map.has(mun)) map.set(mun, new Map())
            const sm = map.get(mun)!; if (!sm.has(sch)) sm.set(sch, []); sm.get(sch)!.push(r)
        }
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mun, schools]) => ({
            municipality: mun,
            schools: Array.from(schools.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([sch, rows]) => ({ school: sch, rows })),
        }))
    }, [responses])

    const getAnswer = (r: ActivityResponseRow, fieldId: string) => r.answers.find((a) => a.fieldId === fieldId)?.value || "—"

    return (
        <div className="space-y-6">
            {/* Filters bar */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 px-1">
                    <Search className="size-4 text-gray-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name..."
                        className="w-48 bg-transparent text-sm font-medium outline-none placeholder:text-gray-300"
                    />
                </div>
                <div className="h-4 w-px bg-gray-100 mx-1 hidden sm:block" />
                <Select value={selectedMunicipality} onValueChange={(v) => { setSelectedMunicipality(v); setSelectedSchool("all") }}>
                    <SelectTrigger className="h-8 w-44 rounded-lg border-none bg-gray-50/50 hover:bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500 shadow-none ring-0 focus:ring-0">
                        <div className="flex items-center gap-2"><MapPin className="size-3 text-violet-500" /><SelectValue placeholder="Municipality" /></div>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-gray-100 shadow-xl">
                        <SelectItem value="all">All Municipalities</SelectItem>
                        {municipalityOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={selectedSchool} onValueChange={setSelectedSchool} disabled={selectedMunicipality === "all"}>
                    <SelectTrigger className="h-8 w-44 rounded-lg border-none bg-gray-50/50 hover:bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500 shadow-none ring-0 focus:ring-0">
                        <div className="flex items-center gap-2"><Building2 className="size-3 text-violet-500" /><SelectValue placeholder="School" /></div>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-gray-100 shadow-xl">
                        <SelectItem value="all">All Schools</SelectItem>
                        {schoolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2">
                    {responses.length} total responses
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                    <div className="size-8 animate-spin rounded-full border-2 border-gray-100 border-t-violet-500" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Syncing data...</p>
                </div>
            ) : grouped.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 rounded-3xl border border-dashed border-gray-100 bg-white">
                    <div className="rounded-2xl bg-gray-50 p-6"><FileText className="size-12 text-gray-200" /></div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-gray-500">No matching responses</p>
                        <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or search terms.</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-8">
                    {grouped.map(({ municipality, schools }) => (
                        <div key={municipality} className="space-y-4">
                            <div className="flex items-center gap-3 px-1">
                                <div className="size-8 rounded-xl bg-violet-600 grid place-items-center shadow-lg shadow-violet-200">
                                    <MapPin className="size-4 text-white" />
                                </div>
                                <h3 className="text-base font-semibold text-gray-800 tracking-tight">{municipality}</h3>
                                <div className="h-px flex-1 bg-gradient-to-r from-gray-100 to-transparent" />
                            </div>

                            <div className="grid grid-cols-1 gap-4 pl-1">
                                {schools.map(({ school, rows }) => (
                                    <div key={school} className="group/school space-y-3">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Building2 className="size-3.5" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">{school}</span>
                                            <span className="text-[9px] font-medium text-gray-400">— {rows.length} records</span>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3">
                                            {rows.map((r) => (
                                                <div key={r.id} className={`overflow-hidden rounded-2xl border transition-all duration-300 ${expandedId === r.id ? "border-violet-200 bg-white shadow-xl shadow-violet-500/5 ring-1 ring-violet-100/50" : "border-gray-100 bg-white hover:border-violet-200 shadow-sm"}`}>
                                                    <div
                                                        className="flex cursor-pointer items-center justify-between px-5 py-4"
                                                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="size-10 rounded-full bg-violet-50 flex items-center justify-center font-bold text-violet-600 text-sm">
                                                                {r.user.name?.[0].toUpperCase() || "?"}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-800">{r.user.name || "Unknown User"}</h4>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[10px] text-gray-400 font-medium">{new Date(r.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                                    <span className="size-1 rounded-full bg-gray-200" />
                                                                    <span className="text-[10px] text-gray-400 font-medium">{new Date(r.submittedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <button type="button" className={`p-2 rounded-xl transition-all ${expandedId === r.id ? "bg-violet-600 text-white" : "bg-gray-50 text-gray-400 hover:bg-violet-50 hover:text-violet-600"}`}>
                                                                {expandedId === r.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {expandedId === r.id && (
                                                        <div className="border-t border-gray-50 bg-gray-50/30 p-5">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                {activity.fields.map((field) => (
                                                                    <div key={field.id} className="flex flex-col gap-2 rounded-xl border border-gray-100/80 bg-white p-3.5 shadow-sm transition-all hover:border-violet-100">
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div className="flex-1 min-w-0">
                                                                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1 truncate">{field.label || "Untitled"}</label>
                                                                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                                                                    <span className="text-sm font-medium text-gray-800 leading-tight">{getAnswer(r, field.id)}</span>
                                                                                    {field.unit && <span className="text-[10px] font-medium text-violet-600 uppercase tracking-wider">{field.unit}</span>}
                                                                                </div>
                                                                            </div>
                                                                            {field.photoUrl && (
                                                                                <div className="size-10 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                                                                                    <img
                                                                                        src={`${getApiBaseUrl()}${field.photoUrl}`}
                                                                                        className="h-full w-full object-cover"
                                                                                        alt=""
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {field.description && <p className="text-[10px] text-gray-400 font-medium line-clamp-2 italic">{field.description}</p>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Activity Detail View (questions + responses) ─────────────────────────────

function ActivityDetailView({
    activity: initialActivity,
    onBack,
    onUpdated,
}: {
    activity: Activity
    onBack: () => void
    onUpdated: (a: Activity) => void
}) {
    const [activity, setActivity] = useState(initialActivity)
    const [fields, setFields] = useState<ActivityField[]>(initialActivity.fields)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState<"questions" | "responses">("questions")
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState(initialActivity.title)
    const [editDesc, setEditDesc] = useState(initialActivity.description)

    // track unsaved changes
    const isDirty = JSON.stringify(fields) !== JSON.stringify(activity.fields)

    const addQuestion = (type: FieldInputType) => {
        setFields((prev) => [
            ...prev,
            { id: uuid(), type, label: "", description: "", required: false, photoUrl: "", unit: "", placeholder: "" },
        ])
    }

    const updateField = useCallback((idx: number, f: ActivityField) => {
        setFields((prev) => prev.map((old, i) => (i === idx ? f : old)))
    }, [])

    const removeField = useCallback((idx: number) => {
        setFields((prev) => prev.filter((_, i) => i !== idx))
    }, [])

    const moveUp = useCallback((idx: number) => {
        if (idx === 0) return
        setFields((prev) => { const next = [...prev];[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next })
    }, [])

    const moveDown = useCallback((idx: number) => {
        setFields((prev) => {
            if (idx >= prev.length - 1) return prev
            const next = [...prev];[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next
        })
    }, [])

    const saveQuestions = async () => {
        setIsSaving(true)
        try {
            const data = await apiFetch(`/api/admin/activities/${activity.id}`, {
                method: "PUT",
                body: JSON.stringify({ fields }),
            })
            setActivity(data.activity)
            setFields(data.activity.fields)
            onUpdated(data.activity)
            toast.success("Questions saved!")
        } catch (e: any) { toast.error(e?.message || "Save failed") }
        finally { setIsSaving(false) }
    }

    const saveInfo = async () => {
        try {
            const data = await apiFetch(`/api/admin/activities/${activity.id}`, {
                method: "PUT",
                body: JSON.stringify({ title: editTitle, description: editDesc }),
            })
            setActivity(data.activity)
            onUpdated(data.activity)
            setIsEditing(false)
            toast.success("Activity updated")
        } catch (e: any) { toast.error(e?.message || "Update failed") }
    }

    const toggleActive = async () => {
        try {
            const data = await apiFetch(`/api/admin/activities/${activity.id}`, {
                method: "PUT",
                body: JSON.stringify({ isActive: !activity.isActive }),
            })
            setActivity(data.activity)
            onUpdated(data.activity)
            toast.success(data.activity.isActive ? "Activity activated" : "Activity deactivated")
        } catch (e: any) { toast.error(e?.message || "Toggle failed") }
    }

    return (
        <div className="space-y-5">
            {/* Back + activity info header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between py-2">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={onBack}
                        className="grid size-9 place-items-center rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-gray-600 hover:border-gray-200 transition-all shadow-sm">
                        <ArrowLeft className="size-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold tracking-tight text-gray-800">{activity.title}</h2>
                            <span className={`size-2 rounded-full ${activity.isActive ? "bg-emerald-500" : "bg-gray-300"}`} />
                        </div>
                        {activity.description && <p className="text-xs text-gray-400 font-medium">{activity.description}</p>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIsEditing(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 transition-all">
                        <Pencil className="size-3.5" /> Edit Info
                    </button>
                    <button type="button" onClick={toggleActive}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${activity.isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-gray-50 text-gray-400 border border-gray-100"}`}>
                        {activity.isActive ? "Active" : "Inactive"}
                    </button>
                </div>
            </div>

            {/* Editing state inline (minimal) */}
            {isEditing && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50/30 p-4 space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Activity Name</Label>
                            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" className="rounded-xl border-gray-200 bg-white shadow-sm" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Short Description</Label>
                            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" className="rounded-xl border-gray-200 bg-white shadow-sm" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setIsEditing(false)} className="text-xs font-bold text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                        <Button type="button" onClick={saveInfo} className="h-8 rounded-lg bg-violet-600 px-4 text-xs shadow-sm">Save Changes</Button>
                    </div>
                </div>
            )}

            {/* Tabs (minimal) */}
            <div className="flex gap-4 border-b border-gray-100 mb-2">
                {(["questions", "responses"] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                        className={`pb-3 text-sm font-bold tracking-tight transition-all border-b-2 -mb-px ${activeTab === tab ? "border-violet-600 text-violet-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                        {tab === "questions" ? `Questions (${fields.length})` : "View Responses"}
                    </button>
                ))}
            </div>

            {/* Questions tab */}
            {activeTab === "questions" && (
                <div className="space-y-4">
                    {fields.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 flex flex-col items-center gap-3 text-gray-400">
                            <ClipboardList className="size-10 text-gray-200" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-gray-500">No questions yet</p>
                                <p className="text-xs text-gray-400 mt-0.5">Add a question below to get started.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {fields.map((f, i) => (
                                <QuestionEditor key={f.id} field={f} index={i}
                                    onUpdate={(nf) => updateField(i, nf)}
                                    onRemove={() => setDeleteConfirmId(f.id)}
                                    onMoveUp={() => moveUp(i)}
                                    onMoveDown={() => moveDown(i)}
                                    isFirst={i === 0} isLast={i === fields.length - 1} />
                            ))}
                        </div>
                    )}

                    {/* Add question (minimal horizontal bar) */}
                    <div className="flex items-center gap-3 py-2 px-1">
                        <div className="h-px flex-1 bg-gray-100" />
                        <div className="flex items-center gap-1.5">
                            {Object.entries(INPUT_TYPE_LABELS).map(([type, label]) => (
                                <button key={type} type="button" onClick={() => addQuestion(type as FieldInputType)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:border-violet-200 hover:text-violet-600 hover:bg-violet-50 transition-all shadow-sm">
                                    <Plus className="size-3" />{label}
                                </button>
                            ))}
                        </div>
                        <div className="h-px flex-1 bg-gray-100" />
                    </div>

                    {/* Save bar */}
                    {isDirty && (
                        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <div className="flex items-center gap-2 text-amber-700">
                                <AlertTriangle className="size-4 shrink-0" />
                                <span className="text-sm font-medium">You have unsaved changes to your questions.</span>
                            </div>
                            <Button type="button" onClick={saveQuestions} disabled={isSaving}
                                className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm h-8 px-4 text-xs">
                                {isSaving ? "Saving…" : "Save Questions"}
                            </Button>
                        </div>
                    )}

                    {!isDirty && fields.length > 0 && (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="size-4" /> All questions saved
                        </div>
                    )}
                </div>
            )}

            {/* Responses tab */}
            {activeTab === "responses" && <ResponsesPanel activity={activity} />}

            {/* Delete question confirm */}
            <Dialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
                <DialogContent className="max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="grid size-10 place-items-center rounded-xl bg-red-50"><AlertTriangle className="size-5 text-red-500" /></div>
                            <DialogTitle className="text-base font-bold text-gray-800">Remove Question?</DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-gray-500">This question will be removed from the activity.</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={() => setDeleteConfirmId(null)}
                            className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300">Cancel</button>
                        <button type="button" onClick={() => {
                            if (deleteConfirmId) {
                                const idx = fields.findIndex((f) => f.id === deleteConfirmId)
                                if (idx >= 0) removeField(idx)
                                setDeleteConfirmId(null)
                            }
                        }} className="inline-flex items-center rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 shadow-sm">Remove</button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ─── Main Admin Activities Page ───────────────────────────────────────────────

export function AdminActivities() {
    const [activities, setActivities] = useState<Activity[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)

    // Create activity dialog state
    const [createOpen, setCreateOpen] = useState(false)
    const [newTitle, setNewTitle] = useState("")
    const [newDesc, setNewDesc] = useState("")
    const [isCreating, setIsCreating] = useState(false)

    // Delete activity confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await apiFetch("/api/admin/activities")
            setActivities(Array.isArray(data.activities) ? data.activities : [])
        } catch (e: any) { toast.error(e?.message || "Failed to load activities") }
        finally { setIsLoading(false) }
    }, [])

    useEffect(() => { void load() }, [load])

    const handleCreate = async () => {
        if (!newTitle.trim()) { toast.error("Activity name is required"); return }
        setIsCreating(true)
        try {
            const data = await apiFetch("/api/admin/activities", {
                method: "POST",
                body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim(), fields: [] }),
            })
            setActivities((prev) => [data.activity, ...prev])
            setCreateOpen(false)
            setNewTitle(""); setNewDesc("")
            // immediately open detail view
            setSelectedActivity(data.activity)
            toast.success("Activity created! Now add your questions.")
        } catch (e: any) { toast.error(e?.message || "Create failed") }
        finally { setIsCreating(false) }
    }

    const handleDelete = async (id: string) => {
        try {
            await apiFetch(`/api/admin/activities/${id}`, { method: "DELETE" })
            setActivities((prev) => prev.filter((a) => a.id !== id))
            if (selectedActivity?.id === id) setSelectedActivity(null)
            toast.success("Activity deleted")
        } catch (e: any) { toast.error(e?.message || "Delete failed") }
        finally { setDeleteConfirmId(null) }
    }

    const handleToggleActive = async (a: Activity, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            const data = await apiFetch(`/api/admin/activities/${a.id}`, {
                method: "PUT", body: JSON.stringify({ isActive: !a.isActive }),
            })
            setActivities((prev) => prev.map((x) => (x.id === a.id ? data.activity : x)))
            toast.success(data.activity.isActive ? "Activated" : "Deactivated")
        } catch (e: any) { toast.error(e?.message || "Toggle failed") }
    }

    // ── If an activity is selected, show detail view ──────────────────────────
    if (selectedActivity) {
        return (
            <ActivityDetailView
                activity={selectedActivity}
                onBack={() => setSelectedActivity(null)}
                onUpdated={(updated) => {
                    setSelectedActivity(updated)
                    setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
                }}
            />
        )
    }

    // ── Activities List ───────────────────────────────────────────────────────
    return (
        <div className="space-y-6 px-1">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-violet-100 p-2.5 shadow-sm ring-1 ring-violet-200">
                        <ClipboardList className="size-5 text-violet-700" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Activities</h1>
                        <p className="text-sm text-muted-foreground">Create activities and add questions for users to answer.</p>
                    </div>
                </div>
                <Button type="button" onClick={() => setCreateOpen(true)}
                    className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm">
                    <Plus className="mr-2 size-4" />New Activity
                </Button>
            </div>

            {/* List (Minimalist Rows) */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <div className="size-7 animate-spin rounded-full border-2 border-gray-100 border-t-violet-500 mr-3" />Loading…
                </div>
            ) : activities.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 rounded-2xl border border-dashed border-gray-200 bg-white text-gray-400">
                    <div className="rounded-2xl bg-violet-50 p-5"><ClipboardList className="size-10 text-violet-300" /></div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-gray-500">No activities yet</p>
                        <p className="text-xs mt-0.5">Click "New Activity" to create your first one.</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {activities.map((a) => (
                        <div key={a.id}
                            className="group flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-violet-200 hover:shadow-sm cursor-pointer"
                            onClick={() => setSelectedActivity(a)}>

                            {/* Icon/Status */}
                            <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${a.isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"}`}>
                                <ClipboardList className="size-5" />
                            </div>

                            {/* Main Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-gray-800 truncate">{a.title}</h3>
                                    {!a.isActive && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Draft</span>}
                                </div>
                                {a.description && <p className="text-[11px] text-gray-400 truncate mt-0.5">{a.description}</p>}
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-6 shrink-0 md:px-4">
                                <div className="text-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Questions</p>
                                    <p className="text-sm font-bold text-gray-700">{a.fields.length}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Created</p>
                                    <p className="text-xs font-semibold text-gray-600">{new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                                </div>
                            </div>

                            {/* Action Bar (inline, subtle) */}
                            <div className="flex items-center gap-1 shrink-0 bg-gray-50/50 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={(e) => handleToggleActive(a, e)} className="p-1.5 text-gray-400 hover:text-emerald-600 transition-colors">
                                    {a.isActive ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                                </button>
                                <button type="button" onClick={() => setSelectedActivity(a)} className="p-1.5 text-gray-400 hover:text-violet-600 transition-colors">
                                    <Eye className="size-4" />
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(a.id) }} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Activity Dialog — SIMPLE: just name + description */}
            <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setNewTitle(""); setNewDesc("") } }}>
                <DialogContent className="max-w-md rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
                    <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6">
                        <DialogTitle className="text-base font-bold text-gray-800">Create New Activity</DialogTitle>
                        <DialogDescription className="text-sm text-gray-500">
                            Give your activity a name. You can add questions after creating it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 py-5 space-y-4">
                        <div>
                            <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Activity Name *</Label>
                            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g. Monthly Inventory Check"
                                className="rounded-xl border-gray-200"
                                onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
                        </div>
                        <div>
                            <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Description <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                            <Textarea rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                                placeholder="Brief overview for users…" className="rounded-xl border-gray-200 resize-none" />
                        </div>
                    </div>
                    <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
                        <button type="button" onClick={() => { setCreateOpen(false); setNewTitle(""); setNewDesc("") }}
                            className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all">
                            Cancel
                        </button>
                        <Button type="button" onClick={handleCreate} disabled={isCreating}
                            className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm">
                            {isCreating ? "Creating…" : "Create & Add Questions →"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm */}
            <Dialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
                <DialogContent className="max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="grid size-10 place-items-center rounded-xl bg-red-50"><AlertTriangle className="size-5 text-red-500" /></div>
                            <DialogTitle className="text-base font-bold text-gray-800">Delete Activity?</DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-gray-500">
                            This will permanently delete the activity and <strong>all its responses</strong>. Cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={() => setDeleteConfirmId(null)}
                            className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300">Cancel</button>
                        <button type="button" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            className="inline-flex items-center rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 shadow-sm">Delete</button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
