import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
 

export type AuthUser = {
  id: string
  username: string
  email: string
  name: string
  role: string
  school?: string
  municipality?: string
}

type LoginResponse = {
  token: string
  user: AuthUser
}

export function LoginPage({
  onLogin,
  externalError,
}: {
  onLogin: (payload: LoginResponse) => void
  externalError?: string | null
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<"form" | "loading">("form")

  const apiBaseUrl = useMemo(() => {
    const fromEnv = (import.meta as any)?.env?.VITE_API_URL as string | undefined
    return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
  }, [])

  const canSubmit = username.trim().length > 0 && password.length > 0 && !isSubmitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      })

      const data = (await res.json()) as LoginResponse | { message?: string }

      if (!res.ok) {
        const msg = (data as any)?.message || "Login failed"
        throw new Error(msg)
      }

      const payload = data as LoginResponse
      // Show interstitial loading screen before navigating
      setPhase("loading")
      setIsSubmitting(false)
      setTimeout(() => {
        if (payload) onLogin(payload)
      }, 5000)
    } catch (err: any) {
      setError(err?.message || "Login failed")
      setIsSubmitting(false)
    }
  }

  // Explicit carousel images from public/images
  const carouselImages = [
    "/images/410.jpg",
    "/images/411.jpg",
    "/images/444.jpg",
    "/images/445.jpg",
    "/images/446.jpg",
    "/images/447.jpg",
    "/images/448.jpg",
    "/images/449.jpg",
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % carouselImages.length), 4500)
    return () => clearInterval(t)
  }, [])

  if (phase === "loading") {
    return (
      <div
        className="h-screen w-full overflow-hidden relative"
        style={{
          backgroundImage: "url('/images/449.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative h-full w-full flex items-center justify-center p-6">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/30 bg-white/20 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="relative aspect-[16/9] w-full">
              <AnimatePresence mode="wait">
                <motion.img
                  key={`loading-${idx}`}
                  src={carouselImages[idx]}
                  alt="Preparing dashboard"
                  initial={{ opacity: 0, scale: 1.04, x: 24 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 1.02, x: -24 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </AnimatePresence>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.22),transparent_24%)]" />
              <div
                className="pointer-events-none absolute inset-0 mix-blend-multiply"
                style={{
                  background:
                    "radial-gradient(260px 260px at 0% 0%, rgba(16,185,129,0.18), transparent 60%)," +
                    "radial-gradient(260px 260px at 100% 0%, rgba(16,185,129,0.14), transparent 60%)," +
                    "radial-gradient(260px 260px at 0% 100%, rgba(20,184,166,0.14), transparent 60%)," +
                    "radial-gradient(260px 260px at 100% 100%, rgba(14,165,233,0.12), transparent 60%)",
                }}
              />
            </div>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <img src="/images/bhsslogo.png" alt="BHSS" className="h-8 w-8 rounded-md bg-white ring-1 ring-black/5" />
                  <img src="/images/bataanlogo.png" alt="Bataan" className="h-8 w-8 rounded-md bg-white ring-1 ring-black/5" />
                </div>
                <div className="text-white/95 font-medium">Preparing your dashboard…</div>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full bg-[#f6f7f9] overflow-hidden">
      <div className="grid h-full w-full grid-cols-1 md:grid-cols-5 overflow-hidden">
        {/* Left: Form panel */}
        <div className="relative md:col-span-2 px-8 py-10 sm:px-10 flex items-center">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-10 -left-6 h-40 w-40 rounded-full bg-emerald-300/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-24 h-44 w-44 rounded-full bg-teal-300/20 blur-2xl" />
          <div className="mx-auto w-full max-w-sm relative">
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <img src="/images/bhsslogo.png" alt="BHSS" className="h-9 w-9 rounded-md bg-white ring-1 ring-black/5" />
                  <img src="/images/bataanlogo.png" alt="Bataan" className="h-9 w-9 rounded-md bg-white ring-1 ring-black/5" />
                </div>
                <div className="text-lg font-semibold">BHSS Websystem</div>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Welcome <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">back</span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-xl border border-emerald-200/60 bg-emerald-50/80 px-2.5 py-1 text-xs font-medium text-emerald-700">Healthy Meals</span>
                <span className="rounded-xl border border-sky-200/60 bg-sky-50/80 px-2.5 py-1 text-xs font-medium text-sky-700">Live Dashboard</span>
                <span className="rounded-xl border border-teal-200/60 bg-teal-50/80 px-2.5 py-1 text-xs font-medium text-teal-700">School Insights</span>
              </div>
            </div>

            <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/80 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_30px_rgba(0,0,0,0.06)]">
              <CardHeader className="px-6 pt-6 pb-2">
                <div>
                  <div className="mt-0.5 text-lg font-semibold tracking-tight">Sign in to BHSS</div>
                  <div className="mt-1 text-xs text-neutral-500">Use your assigned username and password</div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="rounded-xl"
                    />
                  </div>
                  

                  {(externalError || error) && (
                    <div className="rounded-xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                      {externalError || error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500"
                    disabled={!canSubmit}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
            <p className="mt-4 text-center text-xs text-neutral-500">All rights reserved 2026</p>
          </div>
        </div>

        {/* Right: Carousel panel (rounded card only) */}
        <div className="relative md:col-span-3 overflow-hidden p-6">
          <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-black/10 shadow-[0_16px_40px_rgba(0,0,0,0.08)]">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 via-teal-500/10 to-sky-500/10" />
            <div className="relative h-full w-full">
              <AnimatePresence mode="wait">
                <motion.img
                  key={idx}
                  src={carouselImages[idx]}
                  alt="Healthy meals and schools"
                  initial={{ opacity: 0, scale: 1.02, x: 30 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 1.02, x: -30 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </AnimatePresence>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.22),transparent_24%)]" />
              <div
                className="pointer-events-none absolute inset-0 mix-blend-multiply"
                style={{
                  background:
                    "radial-gradient(260px 260px at 0% 0%, rgba(16,185,129,0.18), transparent 60%)," +
                    "radial-gradient(260px 260px at 100% 0%, rgba(16,185,129,0.14), transparent 60%)," +
                    "radial-gradient(260px 260px at 0% 100%, rgba(20,184,166,0.14), transparent 60%)," +
                    "radial-gradient(260px 260px at 100% 100%, rgba(14,165,233,0.12), transparent 60%)",
                }}
              />
            </div>
            {/* Indicators */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {carouselImages.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/50"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
