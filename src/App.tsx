import { useEffect, useState } from "react"
import "./App.css"
import { AdminSidebarLayout } from "./admin/admin-sidebar-layout"
import { LoginPage, type AuthUser } from "./login/login-page"
import { UserSidebarLayout } from "./users/user-sidebar-layout"

type AuthState = {
  token: string
  user: AuthUser
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

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
      <LoginPage
        externalError={authError}
        onLogin={(payload) => {
          handleLogin(payload)
        }}
      />
    )
  }

  if (auth.user.role === "admin") {
    return (
      <AdminSidebarLayout
        userEmail={auth.user.email}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <UserSidebarLayout
      userEmail={auth.user.email}
      userSchool={auth.user.school}
      userMunicipality={auth.user.municipality}
      onLogout={handleLogout}
    />
  )
}

export default App
