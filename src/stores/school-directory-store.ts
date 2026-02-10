import { create } from "zustand"

export type SchoolBeneficiaryRow = {
  id: string
  municipality: string
  schoolYear: string
  bhssKitchenName: string
  schoolName: string
  grade2: number
  grade3: number
  grade4: number
  total: number
  createdAt?: string
  updatedAt?: string
}

export type SchoolDetailsRow = {
  id: string
  municipality: string
  schoolYear: string
  completeName: string
  principalName: string
  principalContact: string
  hlaCoordinatorName: string
  hlaCoordinatorContact: string
  hlaCoordinatorFacebook: string
  hlaManagerName: string
  hlaManagerContact: string
  hlaManagerFacebook: string
  chiefCookName: string
  chiefCookContact: string
  chiefCookFacebook: string
  assistantCookName: string
  assistantCookContact: string
  assistantCookFacebook: string
  nurseName: string
  nurseContact: string
  nurseFacebook: string
  createdAt?: string
  updatedAt?: string
}

export type CreateBeneficiaryBulkInput = {
  municipality: string
  schoolYear: string
  items: Array<
    Pick<
      SchoolBeneficiaryRow,
      "bhssKitchenName" | "schoolName" | "grade2" | "grade3" | "grade4"
    >
  >
}

export type UpdateBeneficiaryInput = Partial<
  Pick<
    SchoolBeneficiaryRow,
    "bhssKitchenName" | "schoolName" | "grade2" | "grade3" | "grade4"
  >
>

export type CreateDetailsInput = Omit<
  SchoolDetailsRow,
  "id" | "createdAt" | "updatedAt"
>

export type UpdateDetailsInput = Partial<
  Omit<SchoolDetailsRow, "id" | "municipality" | "schoolYear" | "createdAt" | "updatedAt">
>

type SchoolDirectoryStoreState = {
  beneficiaryRows: SchoolBeneficiaryRow[]
  detailsRows: SchoolDetailsRow[]
  isLoading: boolean
  error: string | null

  fetchBeneficiaries: (municipality: string, schoolYear: string) => Promise<void>
  bulkCreateBeneficiaries: (input: CreateBeneficiaryBulkInput) => Promise<void>
  updateBeneficiary: (id: string, input: UpdateBeneficiaryInput) => Promise<void>
  updateManyBeneficiaries: (
    updates: Array<{ id: string; input: UpdateBeneficiaryInput }>
  ) => Promise<void>
  deleteBeneficiary: (id: string) => Promise<void>

  fetchDetails: (municipality: string, schoolYear: string) => Promise<void>
  createDetails: (input: CreateDetailsInput) => Promise<void>
  updateDetails: (id: string, input: UpdateDetailsInput) => Promise<void>
  deleteDetails: (id: string) => Promise<void>
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
  if (!res.ok) {
    throw new Error((data as any)?.message || "Request failed")
  }
  return data
}

export const useSchoolDirectoryStore = create<SchoolDirectoryStoreState>((set, get) => ({
  beneficiaryRows: [],
  detailsRows: [],
  isLoading: false,
  error: null,

  fetchBeneficiaries: async (municipality, schoolYear) => {
    set({ isLoading: true, error: null })
    try {
      const qs = new URLSearchParams({ municipality, schoolYear })
      const data = (await apiFetch(
        `/api/school-directory/beneficiaries?${qs.toString()}`
      )) as { rows: SchoolBeneficiaryRow[] }
      set({ beneficiaryRows: Array.isArray(data.rows) ? data.rows : [] })
    } catch (e: any) {
      set({ error: e?.message || "Failed to load beneficiaries" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  updateManyBeneficiaries: async (updates) => {
    if (!updates || updates.length === 0) return
    set({ isLoading: true, error: null })
    try {
      await Promise.all(
        updates.map(({ id, input }) =>
          apiFetch(`/api/school-directory/beneficiaries/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          })
        )
      )

      set((state) => ({
        beneficiaryRows: state.beneficiaryRows.map((r) => {
          const u = updates.find((x) => x.id === r.id)
          if (!u) return r
          const input = u.input
          return {
            ...r,
            ...input,
            total:
              (input.grade2 ?? r.grade2) +
              (input.grade3 ?? r.grade3) +
              (input.grade4 ?? r.grade4),
          }
        }),
      }))
    } catch (e: any) {
      set({ error: e?.message || "Failed to update schools" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  bulkCreateBeneficiaries: async (input) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/school-directory/beneficiaries/bulk`, {
        method: "POST",
        body: JSON.stringify(input),
      })
      await get().fetchBeneficiaries(input.municipality, input.schoolYear)
    } catch (e: any) {
      set({ error: e?.message || "Failed to save schools" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  updateBeneficiary: async (id, input) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/school-directory/beneficiaries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })

      // Optimistic local update to avoid refetching on every inline edit
      set((state) => ({
        beneficiaryRows: state.beneficiaryRows.map((r) =>
          r.id === id
            ? {
                ...r,
                ...input,
                total:
                  (input.grade2 ?? r.grade2) +
                  (input.grade3 ?? r.grade3) +
                  (input.grade4 ?? r.grade4),
              }
            : r
        ),
      }))
    } catch (e: any) {
      set({ error: e?.message || "Failed to update school" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  deleteBeneficiary: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/school-directory/beneficiaries/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      set((state) => ({
        beneficiaryRows: state.beneficiaryRows.filter((r) => r.id !== id),
      }))
    } catch (e: any) {
      set({ error: e?.message || "Failed to delete school" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  fetchDetails: async (municipality, schoolYear) => {
    set({ isLoading: true, error: null })
    try {
      const qs = new URLSearchParams({ municipality, schoolYear })
      const data = (await apiFetch(
        `/api/school-directory/details?${qs.toString()}`
      )) as { rows: SchoolDetailsRow[] }
      set({ detailsRows: Array.isArray(data.rows) ? data.rows : [] })
    } catch (e: any) {
      set({ error: e?.message || "Failed to load school details" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  createDetails: async (input) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/school-directory/details`, {
        method: "POST",
        body: JSON.stringify(input),
      })
      await get().fetchDetails(input.municipality, input.schoolYear)
    } catch (e: any) {
      set({ error: e?.message || "Failed to add school details" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  updateDetails: async (id, input) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/school-directory/details/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
      set((state) => ({
        detailsRows: state.detailsRows.map((r) => (r.id === id ? { ...r, ...input } : r)),
      }))
    } catch (e: any) {
      set({ error: e?.message || "Failed to update details" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  deleteDetails: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch(`/api/school-directory/details/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      set((state) => ({
        detailsRows: state.detailsRows.filter((r) => r.id !== id),
      }))
    } catch (e: any) {
      set({ error: e?.message || "Failed to delete details" })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },
}))
