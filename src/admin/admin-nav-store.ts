import { create } from "zustand"

type AdminNavState = {
  activeItem: string
  setActiveItem: (item: string) => void
}

export const useAdminNavStore = create<AdminNavState>((set) => ({
  activeItem: "Dashboard",
  setActiveItem: (item) => set({ activeItem: item }),
}))
