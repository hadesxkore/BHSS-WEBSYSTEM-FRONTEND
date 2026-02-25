import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"

type IdleScreensaverProps = {
  children: React.ReactNode
  images?: readonly string[]
  idleMs?: number
  intervalMs?: number
  title?: string
  subtitle?: string
}

const DEFAULT_IMAGES = [
  "/images/410.jpg",
  "/images/411.jpg",
  "/images/444.jpg",
  "/images/445.jpg",
  "/images/446.jpg",
  "/images/447.jpg",
  "/images/448.jpg",
  "/images/449.jpg",
  "/images/450.jpg",
  "/images/451.jpg",
  "/images/452.jpg",
  "/images/bataanlogo.png",
  "/images/bhsslogo.png",
] as const

/** Fixed background image — always visible, never changes */
const BG_IMAGE = "/images/449.jpg"

/** How many seconds before idle to start showing the countdown badge */
const WARN_BEFORE_S = 10

export function IdleScreensaver({
  children,
  images,
  idleMs = 15_000,
  intervalMs = 4_000,
  title = "Admin Dashboard",
  subtitle = "BHSS Web System",
}: IdleScreensaverProps) {
  const allSources = useMemo(
    () => (images && images.length > 0 ? images : DEFAULT_IMAGES),
    [images]
  )

  // Carousel = every image EXCEPT the fixed background (449)
  const carouselSources = useMemo(
    () => allSources.filter((s) => !s.includes("449")),
    [allSources]
  )

  const [isIdle, setIsIdle] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const deadlineRef = useRef<number>(Date.now() + idleMs)

  // ── Idle / activity tracking ──
  useEffect(() => {
    if (typeof window === "undefined") return

    let idleTimer: number | null = null
    let tickTimer: number | null = null

    const clearTimers = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      if (tickTimer) window.clearInterval(tickTimer)
    }

    const startTick = () => {
      if (tickTimer) window.clearInterval(tickTimer)
      tickTimer = window.setInterval(() => {
        const remaining = Math.ceil((deadlineRef.current - Date.now()) / 1000)
        setSecsLeft(remaining <= WARN_BEFORE_S && remaining > 0 ? remaining : null)
      }, 250)
    }

    const scheduleIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      deadlineRef.current = Date.now() + idleMs
      idleTimer = window.setTimeout(() => {
        setIsIdle(true)
        setSecsLeft(null)
      }, idleMs)
      startTick()
    }

    const onActivity = () => {
      setIsIdle(false)
      setSecsLeft(null)
      scheduleIdle()
    }

    const events: Array<keyof WindowEventMap> = [
      "mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll",
    ]
    events.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }))
    scheduleIdle()

    return () => {
      clearTimers()
      events.forEach((evt) => window.removeEventListener(evt, onActivity as any))
    }
  }, [idleMs])

  // ── Carousel auto-advance ──
  useEffect(() => {
    if (!isIdle || carouselSources.length === 0) return
    setCarouselIndex(0)
    const id = window.setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % carouselSources.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [isIdle, intervalMs, carouselSources.length])

  // ── Countdown ring math ──
  const RADIUS = 10
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const progress = secsLeft !== null ? secsLeft / WARN_BEFORE_S : 1
  const strokeDash = CIRCUMFERENCE * progress

  return (
    <div className="relative">

      {/* ── Countdown badge (top-right corner) ── */}
      <AnimatePresence>
        {!isIdle && secsLeft !== null && (
          <motion.div
            key="idle-badge"
            initial={{ opacity: 0, scale: 0.75, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.75, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 right-4 z-[9998] flex items-center gap-2 rounded-2xl border border-amber-200 bg-white/95 px-3 py-2 shadow-lg shadow-amber-100/60 backdrop-blur-sm"
          >
            <div className="relative size-8 shrink-0">
              <svg viewBox="0 0 24 24" className="absolute inset-0 size-full -rotate-90" aria-hidden>
                <circle cx="12" cy="12" r={RADIUS} fill="none" stroke="#fde68a" strokeWidth="2.5" />
                <circle
                  cx="12" cy="12" r={RADIUS} fill="none"
                  stroke={secsLeft <= 3 ? "#ef4444" : secsLeft <= 6 ? "#f97316" : "#d97706"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${strokeDash} ${CIRCUMFERENCE}`}
                  className="transition-all duration-[240ms]"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold leading-none text-amber-700">
                {secsLeft}
              </span>
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-gray-700">Screen sleeping in</p>
              <p className="text-[10px] text-gray-400">Move mouse to reset</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Screensaver overlay ── */}
      <AnimatePresence>
        {isIdle && (
          <motion.div
            key="screensaver"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-black"
          >
            {/* ══ TOP: Fixed hero background (449.jpg) — ~62% height ══ */}
            <div className="relative min-h-0 flex-1">
              <img
                src={BG_IMAGE}
                alt="Background"
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* Gradient darkens bottom so it blends into the strip */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80" />

              {/* Title overlay — sits above the gradient at the bottom */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.55 }}
                className="absolute bottom-8 left-8 right-8"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                  {subtitle}
                </p>
                <h1 className="mt-1.5 text-3xl font-bold leading-tight text-white drop-shadow-lg sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-2 text-sm text-white/50">
                  Move the mouse or press any key to continue
                </p>
              </motion.div>
            </div>

            {/* ══ BOTTOM: Carousel strip — ~38% height ══ */}
            <div
              className="relative shrink-0 bg-black px-6 pt-4 pb-5"
              style={{ height: "38%" }}
            >
              {/* Top edge glow line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              {/* Strip header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-0.5 rounded-full bg-white/40" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                    Photo Gallery
                  </p>
                </div>

                {/* Dot / pill indicators */}
                <div className="flex items-center gap-1.5">
                  {carouselSources.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCarouselIndex(i)}
                      aria-label={`Photo ${i + 1}`}
                      className={`rounded-full transition-all duration-300 ${
                        i === carouselIndex
                          ? "h-1.5 w-5 bg-white"
                          : "h-1.5 w-1.5 bg-white/25 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Scrolling carousel track */}
              <div className="relative h-[calc(100%-2.25rem)] overflow-hidden">
                {/* Fade edges */}
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-black to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-black to-transparent" />

                <div
                  className="flex h-full gap-3 transition-transform duration-700 ease-in-out"
                  style={{
                    transform: `translateX(calc(-${carouselIndex} * (calc(100% / 3.4 + 0.75rem))))`,
                  }}
                >
                  {carouselSources.map((src, i) => {
                    const isActive = i === carouselIndex
                    return (
                      <motion.button
                        key={src}
                        type="button"
                        onClick={() => setCarouselIndex(i)}
                        animate={{ scale: isActive ? 1 : 0.9, opacity: isActive ? 1 : 0.45 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        className="relative shrink-0 overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        style={{ width: "calc(100% / 3.4)", height: "100%" }}
                      >
                        <img
                          src={src}
                          alt={`Gallery ${i + 1}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />

                        {/* Active: white ring + subtle shine */}
                        {isActive && (
                          <>
                            <motion.div
                              layoutId="active-ring"
                              className="absolute inset-0 rounded-2xl ring-2 ring-white/80"
                              transition={{ duration: 0.35 }}
                            />
                            <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl bg-gradient-to-b from-white/10 to-transparent" />
                          </>
                        )}

                        {/* Inactive: dark scrim */}
                        {!isActive && (
                          <div className="absolute inset-0 rounded-2xl bg-black/40" />
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  )
}