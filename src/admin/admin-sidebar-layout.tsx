import type React from "react"
import { useState } from "react"
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  CalendarDays,
  Megaphone,
  ShoppingCart,
  Package,
  ClipboardCheck,
  Truck,
  LogOut,
  Users,
  FileText,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Dashboard } from "./pages/dashboard"
import { SchoolDirectory } from "./pages/school-directory"
import { DataAnalysis } from "./pages/data-analysis"
import { Procurement } from "./pages/procurement"
import { Distribution } from "./pages/distribution"
import { Attendance } from "./pages/attendance"
import { AdminUsers } from "./pages/users"
import { AdminDelivery } from "./pages/delivery"
import { AdminDeliverySummary } from "./pages/delivery-summary"
import { AdminEventCalendar } from "./pages/event-calendar"
import { AdminEventAnnouncements } from "./pages/event-announcements"
import { AdminGlobalNotifications } from "./components/admin-global-notifications"

type AdminSidebarLayoutProps = {
  userEmail?: string
  onLogout: () => void
}

type MenuSubItem = {
  title: string
  icon?: any
  component: () => React.ReactElement
}

type MenuItem = {
  title: string
  icon: any
  component?: () => React.ReactElement
  subItems?: MenuSubItem[]
}

const menuItems: MenuItem[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    component: Dashboard,
  },
  {
    title: "Event Calendar",
    icon: CalendarDays,
    component: AdminEventCalendar,
    subItems: [
      {
        title: "Announcements",
        icon: Megaphone,
        component: AdminEventAnnouncements,
      },
    ],
  },
  {
    title: "School Directory",
    icon: Building2,
    component: SchoolDirectory,
  },
  {
    title: "Data Analysis",
    icon: BarChart3,
    component: DataAnalysis,
  },
  {
    title: "Procurement",
    icon: ShoppingCart,
    component: Procurement,
  },
  {
    title: "Delivery",
    icon: Truck,
    component: AdminDelivery,
    subItems: [
      {
        title: "Summary",
        icon: FileText,
        component: AdminDeliverySummary,
      },
    ],
  },
  {
    title: "Distribution",
    icon: Package,
    component: Distribution,
  },
  {
    title: "Attendance",
    icon: ClipboardCheck,
    component: Attendance,
  },
  {
    title: "Users",
    icon: Users,
    component: AdminUsers,
  },
]

export function AdminSidebarLayout({
  userEmail,
  onLogout,
}: AdminSidebarLayoutProps) {
  const [activeItem, setActiveItem] = useState("Dashboard")

  const ActiveComponent = (() => {
    for (const item of menuItems) {
      if (item.title === activeItem && item.component) return item.component
      if (item.subItems) {
        const match = item.subItems.find((s) => `${item.title}:${s.title}` === activeItem)
        if (match) return match.component
      }
    }
    return Dashboard
  })()

  const activeHeaderLabel = (() => {
    for (const item of menuItems) {
      if (item.title === activeItem) return item.title
      if (item.subItems) {
        const match = item.subItems.find((s) => `${item.title}:${s.title}` === activeItem)
        if (match) return `${item.title} / ${match.title}`
      }
    }
    return activeItem
  })()

  return (
    <SidebarProvider
      className="bg-[#f5faf7] has-data-[variant=inset]:!bg-[#f5faf7]"
      style={{ fontFamily: '"Artico Soft-Medium","Mona Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
    >
      <AdminGlobalNotifications />
      <Sidebar
        collapsible="icon"
        variant="inset"
        className="
          [@supports(backdrop-filter:blur(0))]:[&_[data-slot=sidebar-inner]]:backdrop-blur-xl
          [&_[data-slot=sidebar-inner]]:!bg-[#f5faf7]/70
          [&_[data-slot=sidebar-inner]]:rounded-2xl
          [&_[data-slot=sidebar-inner]]:border
          [&_[data-slot=sidebar-inner]]:border-black/5
          [&_[data-slot=sidebar-inner]]:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_8px_24px_rgba(0,0,0,0.04)]
        "
      >
        <SidebarHeader className="border-b border-black/5 bg-transparent">
          <div className="flex items-center gap-2 px-2 py-4">
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Building2 className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
              <span className="font-semibold text-neutral-900">BHSS Admin</span>
              <span className="text-xs text-neutral-500">Management System</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => {
                  const hasSub = Array.isArray(item.subItems) && item.subItems.length > 0
                  const isParentActive =
                    activeItem === item.title ||
                    (hasSub && item.subItems!.some((s) => `${item.title}:${s.title}` === activeItem))

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        className="w-full my-0.5 text-[15px] text-neutral-800 [&>svg]:size-5 rounded-2xl border border-transparent bg-transparent hover:bg-emerald-600 hover:text-white hover:[&>svg]:text-white data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-transparent data-[active=true]:shadow-none transition-colors px-3.5 py-2.5 h-11 gap-2.5"
                        isActive={isParentActive}
                        onClick={() => setActiveItem(item.title)}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>

                      {hasSub ? (
                        <SidebarMenuSub>
                          {item.subItems!.map((sub) => (
                            <SidebarMenuSubItem key={sub.title}>
                              <SidebarMenuSubButton
                                href="#"
                                isActive={`${item.title}:${sub.title}` === activeItem}
                                className="rounded-xl border border-transparent bg-transparent hover:bg-emerald-600 hover:text-white hover:[&>svg]:text-white data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-transparent data-[active=true]:shadow-none data-[active=true]:[&>svg]:text-white px-3 py-1.5 my-0.5"
                                onClick={(e) => {
                                  e.preventDefault()
                                  setActiveItem(`${item.title}:${sub.title}`)
                                }}
                              >
                                {sub.icon ? <sub.icon /> : null}
                                <span>{sub.title}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-emerald-200/40 bg-transparent">
          <div className="flex flex-col gap-2">
            <div className="px-2 text-xs text-neutral-500 group-data-[collapsible=icon]:hidden">
              {userEmail || ""}
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-base rounded-xl border border-emerald-200/50 bg-white/30 hover:bg-white/60"
              onClick={onLogout}
            >
              <LogOut className="size-5" />
              <span className="group-data-[collapsible=icon]:hidden">Logout</span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-[#f5faf7]">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-emerald-200/40 px-4 bg-[#f5faf7]">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-lg font-semibold">{activeHeaderLabel}</h1>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 bg-[#f5faf7]">
          <ActiveComponent />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
