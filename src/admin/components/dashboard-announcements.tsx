import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Image as ImageIcon, Megaphone } from "lucide-react"
import { io, type Socket } from "socket.io-client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type DashboardAnnouncementsProps = {
  onViewAll?: () => void
}

type Announcement = {
  _id?: string
  id?: string
  title?: string
  message?: string
  priority?: string
  audience?: string
  createdAt?: string
  attachments?: Array<{
    url?: string
    mimeType?: string
    originalName?: string
  }>
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

function AutoCarousel({
  className,
  children,
  delayMs = 3500,
}: {
  className?: string
  children: React.ReactNode
  delayMs?: number
}) {
  const [api, setApi] = useState<CarouselApi | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!api || paused) return
    const t = window.setInterval(() => {
      try {
        api.scrollNext()
      } catch {
        // ignore
      }
    }, Math.max(1200, delayMs))
    return () => window.clearInterval(t)
  }, [api, paused, delayMs])

  return (
    <div
      className={className}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Carousel
        setApi={(a) => setApi(a || null)}
        opts={{ loop: true, align: "start" }}
        className="h-full w-full"
      >
        {children}
      </Carousel>
    </div>
  )
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

function resolveAssetUrl(url: string) {
  const base = getApiBaseUrl()
  const u = String(url || "").trim()
  if (!u) return ""
  if (u.startsWith("http://") || u.startsWith("https://")) return u
  return `${base}${u.startsWith("/") ? "" : "/"}${u}`
}

function getImageUrls(a: Announcement) {
  const imgs = (a.attachments || []).filter((x) =>
    String(x?.mimeType || "")
      .toLowerCase()
      .startsWith("image/")
  )
  return imgs.map((x) => resolveAssetUrl(String(x?.url || ""))).filter(Boolean)
}

function pickPreviewImageUrl(a: Announcement) {
  const base = getApiBaseUrl()
  const img = (a.attachments || []).find((x) => String(x?.mimeType || "").toLowerCase().startsWith("image/"))
  const url = String(img?.url || "").trim()
  if (!url) return ""
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`
}

function safeText(x: unknown) {
  return String(x || "").trim()
}

function formatCreatedAt(createdAt?: string) {
  const raw = safeText(createdAt)
  if (!raw) return ""
  try {
    return new Date(raw).toLocaleString([], {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return raw
  }
}

export function DashboardAnnouncements({ onViewAll }: DashboardAnnouncementsProps) {
  const [items, setItems] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selected, setSelected] = useState<Announcement | null>(null)

  const loadAnnouncements = async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading !== false
    if (showLoading) setIsLoading(true)
    setError(null)
    const res = (await apiFetch("/api/announcements")) as { announcements?: Announcement[] }
    const list = Array.isArray(res?.announcements) ? res.announcements : []
    list.sort((a, b) => {
      const aTs = a?.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTs = b?.createdAt ? new Date(b.createdAt).getTime() : 0
      return bTs - aTs
    })
    setItems(list)
    if (showLoading) setIsLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        await loadAnnouncements({ showLoading: true })
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || "Failed to load announcements")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let socket: Socket | null = null

    try {
      socket = io(getApiBaseUrl(), { transports: ["websocket"] })
      socket.on("announcement:created", () => {
        loadAnnouncements({ showLoading: false }).catch(() => {
          // ignore (keeps existing list)
        })
      })
    } catch {
      // ignore
    }

    return () => {
      try {
        socket?.disconnect()
      } catch {
        // ignore
      }
    }
  }, [])

  const top = useMemo(() => items.slice(0, 8), [items])

  const selectedImageUrls = useMemo(() => (selected ? getImageUrls(selected) : []), [selected])
  const selectedOtherAttachments = useMemo(() => {
    if (!selected?.attachments?.length) return []
    return selected.attachments
      .filter((a) => !String(a?.mimeType || "").toLowerCase().startsWith("image/"))
      .map((a) => ({
        name: safeText(a?.originalName) || safeText(a?.url) || "Attachment",
        url: resolveAssetUrl(String(a?.url || "")),
      }))
      .filter((x) => x.url)
  }, [selected])

  return (
    <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-5" />
            Latest Announcements
          </CardTitle>
          <div className="mt-1 text-sm text-muted-foreground whitespace-normal break-words">
            Recent updates posted to your announcements feed.
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onViewAll ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={() => onViewAll()}
            >
              View all
              <ChevronRight className="ml-2 size-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading announcements…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : top.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {top.map((a) => {
              const id = String(a._id || a.id || "")
              const title = safeText(a.title) || "Announcement"
              const message = safeText(a.message)
              const imageUrls = getImageUrls(a)
              const previewUrl = imageUrls[0] || pickPreviewImageUrl(a)
              const extraCount = Math.max(0, imageUrls.length - 1)

              return (
                <button
                  key={id || title}
                  type="button"
                  onClick={() => {
                    setSelected(a)
                    setDetailsOpen(true)
                  }}
                  className="group w-full overflow-hidden rounded-2xl border border-black/5 bg-white/60 hover:bg-white/75 transition-colors"
                >
                  <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 sm:h-44">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={title}
                        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <ImageIcon className="size-4" />
                          No image
                        </div>
                      </div>
                    )}

                    {extraCount > 0 ? (
                      <div className="absolute bottom-3 right-3">
                        <Badge
                          variant="secondary"
                          className="rounded-xl border border-black/5 bg-white/75 text-slate-800"
                        >
                          +{extraCount}
                        </Badge>
                      </div>
                    ) : null}

                    <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5">
                      {a.priority ? (
                        <Badge
                          variant="secondary"
                          className="rounded-xl border border-black/5 bg-white/70 text-slate-800"
                        >
                          {a.priority}
                        </Badge>
                      ) : null}
                      {a.audience ? (
                        <Badge variant="outline" className="rounded-xl bg-white/60">
                          {a.audience}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2 whitespace-normal break-words">
                      {message || "—"}
                    </div>
                    <div className="mt-3 text-[11px] text-muted-foreground">{formatCreatedAt(a.createdAt)}</div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">No announcements yet.</div>
        )}
      </CardContent>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          if (!open) setSelected(null)
        }}
      >
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{safeText(selected?.title) || "Announcement"}</DialogTitle>
            <DialogDescription>
              {selected?.createdAt ? formatCreatedAt(selected.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            {safeText(selected?.priority) ? (
              <Badge variant="secondary" className="rounded-xl">
                {safeText(selected?.priority)}
              </Badge>
            ) : null}
            {safeText(selected?.audience) ? (
              <Badge variant="outline" className="rounded-xl">
                {safeText(selected?.audience)}
              </Badge>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/50">
            <div className="relative w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-2">
              {selectedImageUrls.length > 1 ? (
                <AutoCarousel className="h-full w-full" delayMs={3200}>
                  <CarouselContent className="h-full">
                    {selectedImageUrls.map((url, idx) => (
                      <CarouselItem key={`selected-img-${idx}`} className="h-full">
                        <div className="flex h-full w-full items-center justify-center">
                          <img
                            src={url}
                            alt={`${safeText(selected?.title) || "Announcement"} image ${idx + 1}`}
                            className="h-auto w-auto max-h-[55vh] max-w-full object-contain sm:max-h-[60vh]"
                            loading="lazy"
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious
                    variant="secondary"
                    className="left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/75 hover:bg-white"
                  />
                  <CarouselNext
                    variant="secondary"
                    className="right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/75 hover:bg-white"
                  />
                </AutoCarousel>
              ) : selectedImageUrls.length === 1 ? (
                <div className="flex h-full w-full items-center justify-center">
                  <img
                    src={selectedImageUrls[0]}
                    alt={safeText(selected?.title) || "Announcement"}
                    className="h-auto w-auto max-h-[55vh] max-w-full object-contain sm:max-h-[60vh]"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <ImageIcon className="size-4" />
                    No image
                  </div>
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="whitespace-pre-wrap break-words text-sm text-slate-700">
                {safeText(selected?.message) || "—"}
              </div>

              {selectedOtherAttachments.length ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-700">Attachments</div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {selectedOtherAttachments.map((a) => (
                      <a
                        key={a.url}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-emerald-700 hover:underline"
                      >
                        {a.name}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
