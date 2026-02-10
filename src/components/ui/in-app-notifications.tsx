import { create } from "zustand"
import { AnimatePresence, motion } from "motion/react"
import { X, CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react"

export type InAppNotificationVariant = "success" | "info" | "warning" | "error"

export type InAppNotification = {
  id: string
  title: string
  message?: string
  variant: InAppNotificationVariant
  createdAt: number
  durationMs: number
}

type InAppNotificationsState = {
  items: InAppNotification[]
  push: (input: Omit<InAppNotification, "id" | "createdAt"> & { id?: string }) => void
  remove: (id: string) => void
  clear: () => void
}

function makeId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID()
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const useInAppNotificationsStore = create<InAppNotificationsState>((set, get) => ({
  items: [],
  push: (input) => {
    const id = String(input.id || makeId())
    const createdAt = Date.now()
    const durationMs = Math.max(1000, Number(input.durationMs ?? 4500))

    const next: InAppNotification = {
      id,
      title: String(input.title),
      message: input.message ? String(input.message) : undefined,
      variant: input.variant,
      createdAt,
      durationMs,
    }

    set((s) => ({ items: [next, ...s.items].slice(0, 5) }))

    window.setTimeout(() => {
      get().remove(id)
    }, durationMs)
  },
  remove: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  clear: () => set({ items: [] }),
}))

export function notify(input: {
  title: string
  message?: string
  variant?: InAppNotificationVariant
  durationMs?: number
  id?: string
}) {
  useInAppNotificationsStore.getState().push({
    id: input.id,
    title: input.title,
    message: input.message,
    variant: input.variant || "info",
    durationMs: input.durationMs ?? 4500,
  })
}

export function InAppNotificationsViewport() {
  const items = useInAppNotificationsStore((s) => s.items)
  const remove = useInAppNotificationsStore((s) => s.remove)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((n) => {
          const accent =
            n.variant === "success"
              ? "bg-emerald-500"
              : n.variant === "error"
                ? "bg-rose-500"
                : n.variant === "warning"
                  ? "bg-amber-500"
                  : "bg-slate-500"

          const Icon =
            n.variant === "success"
              ? CircleCheckIcon
              : n.variant === "error"
                ? OctagonXIcon
                : n.variant === "warning"
                  ? TriangleAlertIcon
                  : InfoIcon

          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              className="pointer-events-auto relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
              <div className="flex gap-3 p-4">
                <div className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{n.title}</div>
                      {n.message ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.message}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                      aria-label="Dismiss notification"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      key={`${n.id}-${n.createdAt}`}
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: n.durationMs / 1000, ease: "linear" }}
                      className={`h-full rounded-full ${accent}`}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
