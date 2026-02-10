import { create } from "zustand"

export type BhssUser = {
  id: string
  email: string
  username: string
  name: string
  school: string
  contactNumber?: string
  schoolAddress?: string
  hlaManagerName?: string
  municipality: string
  province: string
  role: "user" | "admin"
  isActive: boolean
  createdAt?: string
}

export type CreateBhssUserInput = {
  email: string
  username: string
  password: string
  name: string
  school: string
  municipality: string
  contactNumber?: string
  schoolAddress?: string
  hlaManagerName?: string
  province?: string
  role?: "user" | "admin"
}

export type UpdateBhssUserInput = Partial<
  Pick<
    BhssUser,
    | "email"
    | "username"
    | "school"
    | "municipality"
    | "province"
    | "role"
    | "isActive"
    | "contactNumber"
    | "schoolAddress"
    | "hlaManagerName"
  > & { name: string }
>

type UserStoreState = {
  users: BhssUser[]
  isLoading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
  createUser: (input: CreateBhssUserInput) => Promise<void>
  toggleActive: (id: string, isActive: boolean) => Promise<void>
  updateUser: (id: string, input: UpdateBhssUserInput) => Promise<void>
  resetUserPassword: (id: string, password: string) => Promise<void>
  deleteUser: (id: string) => Promise<void>
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

async function apiFetch(path: string, init?: RequestInit) {
  const token = getAuthToken()
  if (!token) {
    throw new Error("Not authenticated")
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

export const useUserStore = create<UserStoreState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = (await apiFetch("/api/users")) as { users: BhssUser[] }
      set({ users: Array.isArray(data.users) ? data.users : [] })
    } catch (e: any) {
      set({ error: e?.message || "Failed to load users" })
    } finally {
      set({ isLoading: false })
    }
  },

  createUser: async (input) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          username: input.username,
          password: input.password,
          name: input.name,
          school: input.school,
          municipality: input.municipality,
          contactNumber: input.contactNumber,
          schoolAddress: input.schoolAddress,
          hlaManagerName: input.hlaManagerName,
          province: input.province || "Bataan",
          role: input.role || "user",
        }),
      })

      await get().fetchUsers()
    } catch (e: any) {
      set({ error: e?.message || "Failed to create user" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  toggleActive: async (id, isActive) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/users/${encodeURIComponent(id)}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      })
      await get().fetchUsers()
    } catch (e: any) {
      set({ error: e?.message || "Failed to update user" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  updateUser: async (id, input) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
      await get().fetchUsers()
    } catch (e: any) {
      set({ error: e?.message || "Failed to update user" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  resetUserPassword: async (id, password) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/users/${encodeURIComponent(id)}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      })
    } catch (e: any) {
      set({ error: e?.message || "Failed to reset password" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  deleteUser: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      await get().fetchUsers()
    } catch (e: any) {
      set({ error: e?.message || "Failed to delete user" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },
}))
