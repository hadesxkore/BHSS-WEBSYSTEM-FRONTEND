import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
    CheckCircle2,
    ChevronLeft,
    ClipboardList,
    Send,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldInputType = "text" | "textarea" | "number" | "date"

type ActivityField = {
    id: string
    type: FieldInputType      // what the user fills in
    label: string             // question title
    description: string       // question description
    required: boolean
    photoUrl: string          // admin-uploaded image shown to user
    unit: string              // fixed unit (PCS, Unit, Box…) — user just sees this
    placeholder: string
}

type Activity = {
    id: string
    title: string
    description: string
    isActive: boolean
    fields: ActivityField[]
    createdAt: string
}

type AnswerDraft = Record<string, string>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBaseUrl() {
    const e = (import.meta as any)?.env as any
    return ((e?.VITE_API_BASE_URL || e?.VITE_API_URL) as string || "http://localhost:8000").replace(/\/+$/, "")
}

function getAuthToken(): string | null {
    try {
        const raw = localStorage.getItem("bhss_auth")
        if (!raw) return null
        return (JSON.parse(raw) as any)?.token || null
    } catch { return null }
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
    if (!res.ok) throw new Error((data as any)?.message || "Request failed")
    return data
}

// ─── Activity Answer Form ─────────────────────────────────────────────────────

function ActivityAnswerForm({
    activity,
    existingAnswers,
    onSubmitted,
}: {
    activity: Activity
    existingAnswers: AnswerDraft | null
    onSubmitted: (answers: AnswerDraft, submittedAt: string) => void
}) {
    const [answers, setAnswers] = useState<AnswerDraft>(() => {
        if (existingAnswers) return existingAnswers
        const init: AnswerDraft = {}
        for (const f of activity.fields) init[f.id] = ""
        return init
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const set = (fieldId: string, value: string) =>
        setAnswers((prev) => ({ ...prev, [fieldId]: value }))

    const handleSubmit = async () => {
        const missing = activity.fields.filter((f) => f.required && !answers[f.id]?.trim())
        if (missing.length > 0) {
            toast.error(`Please fill in: ${missing.map((f) => f.label || "a required field").join(", ")}`)
            return
        }
        setIsSubmitting(true)
        try {
            const payload = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }))
            const data = await apiFetch(`/api/activities/${activity.id}/submit`, {
                method: "POST",
                body: JSON.stringify({ answers: payload }),
            })
            toast.success("Answers submitted successfully!")
            onSubmitted(answers, data.response?.submittedAt || new Date().toISOString())
        } catch (e: any) {
            toast.error(e?.message || "Submit failed")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Activity description */}
            {activity.description && (
                <p className="text-sm text-gray-500 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                    {activity.description}
                </p>
            )}

            {activity.fields.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                    <ClipboardList className="size-8 text-gray-200" />
                    <p className="text-sm">This activity has no questions yet.</p>
                </div>
            )}

            {activity.fields.map((field, i) => (
                <div key={field.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    {/* Question header */}
                    <div className="px-5 py-4 border-b border-gray-50">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">#{i + 1}</span>
                                    {field.required && (
                                        <span className="text-[10px] font-semibold text-red-400">Required</span>
                                    )}
                                </div>
                                <h3 className="text-sm font-bold text-gray-800">
                                    {field.label || "(No title)"}
                                </h3>
                                {field.description && (
                                    <p className="text-xs text-gray-400 mt-1">{field.description}</p>
                                )}
                            </div>
                            {/* Unit badge — fixed by admin, user just sees it */}
                            {field.unit && (
                                <span className="shrink-0 inline-flex items-center rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                                    {field.unit}
                                </span>
                            )}
                        </div>

                        {/* Question image */}
                        {field.photoUrl && (
                            <div className="mt-3 rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                                <img
                                    src={`${getApiBaseUrl()}${field.photoUrl}`}
                                    alt={field.label}
                                    className="w-full object-cover max-h-64"
                                />
                            </div>
                        )}
                    </div>

                    {/* User input area */}
                    <div className="px-5 py-4 bg-gray-50/30">
                        <Label className="text-xs font-semibold text-gray-400 mb-2 block">Your Answer{field.required ? " *" : ""}</Label>

                        {field.type === "text" && (
                            <Input
                                value={answers[field.id] || ""}
                                onChange={(e) => set(field.id, e.target.value)}
                                placeholder={field.placeholder || "Type your answer…"}
                                className="h-10 rounded-xl border-gray-200 bg-white text-sm focus:border-emerald-400 focus:ring-emerald-100"
                            />
                        )}
                        {field.type === "number" && (
                            <Input
                                type="number"
                                value={answers[field.id] || ""}
                                onChange={(e) => set(field.id, e.target.value)}
                                placeholder={field.placeholder || "Enter a number…"}
                                className="h-10 rounded-xl border-gray-200 bg-white text-sm focus:border-emerald-400 focus:ring-emerald-100"
                            />
                        )}
                        {field.type === "date" && (
                            <Input
                                type="date"
                                value={answers[field.id] || ""}
                                onChange={(e) => set(field.id, e.target.value)}
                                className="h-10 rounded-xl border-gray-200 bg-white text-sm focus:border-emerald-400 focus:ring-emerald-100"
                            />
                        )}
                        {field.type === "textarea" && (
                            <Textarea
                                rows={3}
                                value={answers[field.id] || ""}
                                onChange={(e) => set(field.id, e.target.value)}
                                placeholder={field.placeholder || "Type your answer…"}
                                className="rounded-xl border-gray-200 bg-white text-sm resize-none focus:border-emerald-400 focus:ring-emerald-100"
                            />
                        )}
                    </div>
                </div>
            ))}

            {activity.fields.length > 0 && (
                <div className="flex justify-end pt-2">
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm px-6"
                    >
                        <Send className="mr-2 size-4" />
                        {isSubmitting ? "Submitting…" : "Submit Answers"}
                    </Button>
                </div>
            )}
        </div>
    )
}

// ─── Main User Activities Page ────────────────────────────────────────────────

export function UserActivities() {
    const [activities, setActivities] = useState<Activity[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [openActivity, setOpenActivity] = useState<Activity | null>(null)
    const [existingAnswers, setExistingAnswers] = useState<AnswerDraft | null>(null)
    const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null)
    const [isFetchingExisting, setIsFetchingExisting] = useState(false)

    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await apiFetch("/api/activities")
            setActivities(Array.isArray(data.activities) ? data.activities : [])
        } catch (e: any) {
            toast.error(e?.message || "Failed to load activities")
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { void load() }, [load])

    const openActivityDialog = async (activity: Activity) => {
        setOpenActivity(activity)
        setExistingAnswers(null)
        setLastSubmittedAt(null)
        setIsFetchingExisting(true)
        try {
            const data = await apiFetch(`/api/activities/${activity.id}/my-response`)
            if (data.response) {
                const draft: AnswerDraft = {}
                for (const a of (data.response.answers || [])) draft[a.fieldId] = a.value
                setExistingAnswers(draft)
                setLastSubmittedAt(data.response.submittedAt || null)
            }
        } catch {
            // no existing response — that's fine
        } finally {
            setIsFetchingExisting(false)
        }
    }

    const handleSubmitted = (answers: AnswerDraft, submittedAt: string) => {
        setExistingAnswers(answers)
        setLastSubmittedAt(submittedAt)
    }

    return (
        <div className="space-y-6 px-1">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2.5 shadow-sm ring-1 ring-emerald-200">
                    <ClipboardList className="size-5 text-emerald-700" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Activities</h1>
                    <p className="text-sm text-muted-foreground">Answer the activities created by the admin.</p>
                </div>
            </div>

            {/* Activity cards */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <div className="size-7 animate-spin rounded-full border-2 border-gray-100 border-t-emerald-500 mr-3" />
                    Loading activities…
                </div>
            ) : activities.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 rounded-2xl border border-dashed border-gray-200 bg-white text-gray-400">
                    <div className="rounded-2xl bg-emerald-50 p-5">
                        <ClipboardList className="size-10 text-emerald-200" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-gray-500">No activities yet</p>
                        <p className="text-xs mt-0.5 text-gray-400">The admin has not created any activities yet.</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activities.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => openActivityDialog(a)}
                            className="group relative text-left rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-emerald-200 transition-all p-5 flex flex-col gap-3"
                        >
                            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                                <ClipboardList className="size-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-gray-800 line-clamp-2">{a.title}</h3>
                                {a.description && (
                                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-gray-400">
                                    {a.fields.length} question{a.fields.length !== 1 ? "s" : ""}
                                </span>
                                <span className="text-[10px] text-gray-300">•</span>
                                <span className="text-[10px] text-gray-400">
                                    {new Date(a.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors shadow-sm w-fit">
                                Answer →
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Answer Dialog */}
            <Dialog open={!!openActivity} onOpenChange={(o) => { if (!o) setOpenActivity(null) }}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-0 shadow-xl">
                    <DialogHeader className="border-b border-gray-100 px-6 pb-4 pt-6 sticky top-0 bg-white z-10">
                        <div className="flex items-start gap-3">
                            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                                <ClipboardList className="size-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <DialogTitle className="text-base font-bold text-gray-800 line-clamp-2">
                                    {openActivity?.title}
                                </DialogTitle>
                                {lastSubmittedAt && (
                                    <p className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1 font-medium">
                                        <CheckCircle2 className="size-3.5" />
                                        Submitted {new Date(lastSubmittedAt).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        </div>
                        {lastSubmittedAt && (
                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                                <p className="text-xs text-emerald-700 font-medium">
                                    You already submitted. You can update your answers and resubmit below.
                                </p>
                            </div>
                        )}
                    </DialogHeader>

                    <div className="px-6 py-5">
                        {isFetchingExisting ? (
                            <div className="flex items-center justify-center py-12 text-gray-400">
                                <div className="size-6 animate-spin rounded-full border-2 border-gray-100 border-t-emerald-500 mr-3" />
                                Loading…
                            </div>
                        ) : openActivity ? (
                            <ActivityAnswerForm
                                activity={openActivity}
                                existingAnswers={existingAnswers}
                                onSubmitted={handleSubmitted}
                            />
                        ) : null}
                    </div>

                    <div className="border-t border-gray-100 px-6 py-4 sticky bottom-0 bg-white">
                        <button type="button" onClick={() => setOpenActivity(null)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all">
                            <ChevronLeft className="size-4" />
                            Close
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
