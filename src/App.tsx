import { useEffect, useRef, useState } from "react"
import "./App.css"
import { AdminSidebarLayout } from "./admin/admin-sidebar-layout"
import { LoginPage, type AuthUser } from "./login/login-page"
import { UserSidebarLayout } from "./users/user-sidebar-layout"
import { Toaster, toast } from "sonner"

type AuthState = {
  token: string
  user: AuthUser
}

// ─── Global fetch interceptor for expired tokens ──────────────────────────────
// Patches window.fetch once so ANY api call that returns 401 with an
// "Invalid token" or "Missing Authorization header" body will auto-logout.
function installTokenExpiryInterceptor(onExpired: () => void) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    if (response.status === 401) {
      try {
        const clone = response.clone()
        const body = await clone.json().catch(() => ({}))
        const msg = String((body as any)?.message || "")
        if (
          msg === "Invalid token" ||
          msg === "Missing Authorization header" ||
          msg.toLowerCase().includes("token expired")
        ) {
          onExpired()
        }
      } catch {
        // ignore parse errors
      }
    }
    return response
  }
  // Return a cleanup that restores the original
  return () => { window.fetch = originalFetch }
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const interceptorInstalledRef = useRef(false)

  // Restore persisted session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bhss_auth")
      if (!raw) return
      const parsed = JSON.parse(raw) as AuthState
      if (parsed?.token && parsed?.user) {
        setAuth(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  // Install the global fetch interceptor once, wired to handleExpiredToken
  useEffect(() => {
    if (interceptorInstalledRef.current) return
    interceptorInstalledRef.current = true

    const cleanup = installTokenExpiryInterceptor(() => {
      localStorage.removeItem("bhss_auth")
      setAuth(null)
      toast.error("Your session has expired. Please log in again.", {
        duration: 5000,
        position: "top-center",
      })
    })
    return cleanup
  }, [])

  const handleLogin = (payload: AuthState) => {
    localStorage.setItem("bhss_auth", JSON.stringify(payload))
    setAuth(payload)
    setAuthError(null)
  }

  const handleLogout = () => {
    localStorage.removeItem("bhss_auth")
    setAuth(null)
  }

  if (!auth) {
    return (
      <>
        <Toaster richColors position="top-center" />
        <LoginPage
          externalError={authError}
          onLogin={(payload) => {
            handleLogin(payload)
          }}
        />
      </>
    )
  }

  if (auth.user.role === "admin") {
    return (
      <>
        <Toaster richColors position="top-center" />
        <AdminSidebarLayout
          userEmail={auth.user.email}
          onLogout={handleLogout}
        />
      </>
    )
  }

  return (
    <>
      <Toaster richColors position="top-center" />
      <UserSidebarLayout
        userEmail={auth.user.email}
        userSchool={auth.user.school}
        userMunicipality={auth.user.municipality}
        onLogout={handleLogout}
      />
    </>
  )
}

export default App
