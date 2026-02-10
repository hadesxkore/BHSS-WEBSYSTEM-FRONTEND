import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Camera,
  Bell,
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Save,
  Shield,
  User as UserIcon,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EnablePushNotifications } from "@/components/enable-push-notifications"

type AuthState = {
  token: string
  user: {
    id: string
    username: string
    email: string
    name: string
    role: string
    school?: string
    municipality?: string
    avatarUrl?: string
  }
}

type UserProfile = {
  id: string
  email: string
  username: string
  name: string
  school?: string
  municipality?: string
  province?: string
  contactNumber?: string
  schoolAddress?: string
  profileImageUrl?: string
  avatarUrl?: string
}

function getApiBaseUrl() {
  const fromEnv = (import.meta as any)?.env?.VITE_API_URL as string | undefined
  return (fromEnv || "http://localhost:8000").replace(/\/+$/, "")
}

function resolveAvatarUrl(raw?: string | null) {
  const v = String(raw || "").trim()
  if (!v) return ""
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith("/")) return `${getApiBaseUrl()}${v}`
  return v
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

async function apiFetch(path: string, init?: RequestInit) {
  const auth = getAuth()
  if (!auth?.token) throw new Error("Not authenticated")

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${auth.token}`,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

function initials(name?: string) {
  const n = (name || "").trim()
  if (!n) return "U"
  const parts = n.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || "U"
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : ""
  return `${first}${second}`.toUpperCase()
}

export function UserAccount() {
  const auth = useMemo(() => getAuth(), [])

  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile")
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [draft, setDraft] = useState<UserProfile | null>(null)

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    if (!auth?.user) return

    const authAvatarUrl = resolveAvatarUrl((auth.user as any)?.avatarUrl)

    const seed: UserProfile = {
      id: auth.user.id,
      email: auth.user.email,
      username: auth.user.username,
      name: auth.user.name,
      school: auth.user.school,
      municipality: auth.user.municipality,
      avatarUrl: (auth.user as any)?.avatarUrl,
      profileImageUrl: authAvatarUrl || undefined,
    }

    setProfile(seed)
    setDraft(seed)

    ;(async () => {
      try {
        const data = (await apiFetch(`/api/users/${encodeURIComponent(auth.user.id)}`)) as any
        const u = (data as any)?.user || (data as any)
        if (!u) return
        const next: UserProfile = {
          ...seed,
          id: u.id || u._id || seed.id,
          email: u.email ?? seed.email,
          username: u.username ?? seed.username,
          name: (u.name ?? u.hlaManagerName ?? seed.name) as string,
          school: u.school ?? seed.school,
          municipality: u.municipality ?? seed.municipality,
          province: u.province,
          contactNumber: u.contactNumber,
          schoolAddress: u.schoolAddress,
          avatarUrl: u.avatarUrl ?? seed.avatarUrl,
          profileImageUrl: resolveAvatarUrl(u.profileImageUrl || u.profileImage || u.avatarUrl || seed.profileImageUrl),
        }
        setProfile(next)
        setDraft(next)

        try {
          const raw = localStorage.getItem("bhss_auth")
          if (raw) {
            const parsed = JSON.parse(raw) as AuthState
            const updatedAuth: AuthState = {
              ...parsed,
              user: {
                ...parsed.user,
                email: next.email,
                username: next.username,
                name: next.name,
                school: next.school,
                municipality: next.municipality,
                avatarUrl: next.avatarUrl,
              },
            }
            localStorage.setItem("bhss_auth", JSON.stringify(updatedAuth))
            window.dispatchEvent(new Event("bhss_auth_updated"))
          }
        } catch {
          // ignore
        }
      } catch {
        // ignore; use seeded auth user
      }
    })()
  }, [auth?.user])

  const canSaveProfile = isEditMode && !!draft && !isSavingProfile

  const handleCancelEdit = () => {
    setDraft(profile)
    setAvatarPreview(null)
    setAvatarFile(null)
    setIsEditMode(false)
  }

  const handlePickAvatar = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = (file: File | null) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setAvatarPreview(url)
    setAvatarFile(file)
  }

  const handleSaveProfile = async () => {
    if (!draft) return
    if (!auth?.user?.id) {
      toast.error("Not authenticated")
      return
    }

    setIsSavingProfile(true)
    try {
      await apiFetch(`/api/users/${encodeURIComponent(auth.user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.email,
          username: draft.username,
          name: draft.name,
          contactNumber: draft.contactNumber,
          schoolAddress: draft.schoolAddress,
        }),
      })

      let nextProfile: UserProfile = { ...draft }

      if (avatarFile) {
        const fd = new FormData()
        fd.set("avatar", avatarFile)
        const data = (await apiFetch(`/api/users/${encodeURIComponent(auth.user.id)}/avatar`, {
          method: "POST",
          body: fd,
        })) as any
        const u = (data as any)?.user || (data as any)
        if (u?.avatarUrl) {
          const absolute = `${getApiBaseUrl()}${String(u.avatarUrl)}`
          nextProfile = {
            ...nextProfile,
            avatarUrl: String(u.avatarUrl),
            profileImageUrl: absolute,
          }
        }
      }

      setProfile(nextProfile)
      setDraft(nextProfile)
      setIsEditMode(false)

      try {
        const raw = localStorage.getItem("bhss_auth")
        if (raw) {
          const parsed = JSON.parse(raw) as AuthState
          const updatedAuth: AuthState = {
            ...parsed,
            user: {
              ...parsed.user,
              email: nextProfile.email,
              username: nextProfile.username,
              name: nextProfile.name,
              school: nextProfile.school,
              municipality: nextProfile.municipality,
              avatarUrl: nextProfile.avatarUrl,
            },
          }
          localStorage.setItem("bhss_auth", JSON.stringify(updatedAuth))
          window.dispatchEvent(new Event("bhss_auth_updated"))
        }
      } catch {
        // ignore
      }

      toast.success("Profile updated")

      setAvatarPreview(null)
      setAvatarFile(null)
    } catch (e: any) {
      toast.error(e?.message || "Failed to update profile")
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!auth?.user?.id) {
      toast.error("Not authenticated")
      return
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill out all password fields")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match")
      return
    }

    setIsChangingPassword(true)
    try {
      await apiFetch(`/api/users/${encodeURIComponent(auth.user.id)}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      toast.success("Password updated")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (e: any) {
      toast.error(e?.message || "Failed to update password")
    } finally {
      setIsChangingPassword(false)
    }
  }

  const displayAvatarUrl =
    avatarPreview ||
    resolveAvatarUrl(profile?.profileImageUrl || profile?.avatarUrl || (auth?.user as any)?.avatarUrl)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="rounded-2xl border bg-gradient-to-br from-slate-50 to-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="size-16 border bg-white shadow-sm">
                <AvatarImage src={displayAvatarUrl} />
                <AvatarFallback className="text-sm font-semibold">
                  {initials(profile?.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={handlePickAvatar}
                className="absolute -bottom-2 -right-2 rounded-full border bg-white p-2 shadow-sm transition hover:bg-muted"
              >
                <Camera className="size-4" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  handleAvatarChange(f)
                }}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xl font-semibold leading-tight">
                {profile?.name || auth?.user?.name || "Account"}
              </div>
              <div className="text-sm text-muted-foreground">
                {profile?.email || auth?.user?.email || ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {(profile?.school || auth?.user?.school || "") && (
                  <span>{profile?.school || auth?.user?.school}</span>
                )}
                {(profile?.municipality || auth?.user?.municipality || "") && (
                  <span>
                    {(profile?.school || auth?.user?.school) ? " • " : ""}
                    {profile?.municipality || auth?.user?.municipality}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditMode ? (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setIsEditMode(true)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            ) : (
              <AnimatePresence mode="popLayout">
                <motion.div
                  key="edit-actions"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-2"
                >
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={handleCancelEdit}
                    disabled={isSavingProfile}
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                  <Button
                    className="rounded-xl"
                    onClick={handleSaveProfile}
                    disabled={!canSaveProfile}
                  >
                    {isSavingProfile ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        Save
                      </>
                    )}
                  </Button>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="space-y-3"
      >
        <TabsList className="rounded-xl">
          <TabsTrigger value="profile">
            <UserIcon className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="size-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="size-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="acc-name">HLA Manager</Label>
                  <Input
                    id="acc-name"
                    value={draft?.name || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acc-username">Username</Label>
                  <Input
                    id="acc-username"
                    value={draft?.username || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, username: e.target.value } : d))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acc-email">Email</Label>
                  <Input
                    id="acc-email"
                    type="email"
                    value={draft?.email || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, email: e.target.value } : d))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acc-contact">Contact Number</Label>
                  <Input
                    id="acc-contact"
                    value={draft?.contactNumber || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, contactNumber: e.target.value } : d
                      )
                    }
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>School</Label>
                  <Input value={profile?.school || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Municipality</Label>
                  <Input value={profile?.municipality || ""} disabled />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="acc-address">School Address</Label>
                  <Input
                    id="acc-address"
                    value={draft?.schoolAddress || ""}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, schoolAddress: e.target.value } : d
                      )
                    }
                  />
                </div>

                <div />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5" />
                Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Bell className="size-5" />
                    </div>
                    <div>
                      <div className="font-medium">Notifications</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Enable push notifications to receive announcements and event updates.
                      </div>
                    </div>
                  </div>

                  <EnablePushNotifications />
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Shield className="size-5" />
                  </div>
                  <div>
                    <div className="font-medium">Change Password</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Use a strong password you don’t use elsewhere.
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="curr-pass">Current Password</Label>
                  <Input
                    id="curr-pass"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-pass">New Password</Label>
                  <Input
                    id="new-pass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-pass">Confirm Password</Label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  className="rounded-xl"
                  onClick={handleChangePassword}
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Updating
                    </>
                  ) : (
                    <>
                      <Shield className="size-4" />
                      Update Password
                    </>
                  )}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                If password change fails, the backend may not yet support user-initiated password updates.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!auth?.user && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Not Authenticated</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Please log in again.
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
