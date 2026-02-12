import { useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { type SubmitHandler, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Pencil, Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Switch } from "@/components/ui/switch"
import { type BhssUser, useUserStore } from "@/stores/user-store"
import { useSchoolDirectoryStore } from "@/stores/school-directory-store"

const BATAAN_MUNICIPALITIES = [
  "Abucay",
  "Bagac",
  "Balanga City",
  "Dinalupihan",
  "Dinalupihan East",
  "Dinalupihan West",
  "Hermosa",
  "Limay",
  "Mariveles",
  "Morong",
  "Orani",
  "Orion",
  "Pilar",
  "Samal",
]

const createUserSchema = z
  .object({
    email: z.string().optional(),
    contactNumber: z.string().optional(),
    schoolAddress: z.string().optional(),
    municipality: z.string().min(2, "Municipality is required"),
    schoolName: z.string().min(2, "School name is required"),
    name: z.string().optional(),
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm password is required"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type CreateUserFormValues = z.infer<typeof createUserSchema>

const editUserSchema = z.object({
  email: z.string().optional(),
  contactNumber: z.string().optional(),
  schoolAddress: z.string().optional(),
  username: z.string().optional(),
  name: z.string().optional(),
  role: z.enum(["user", "admin"]).optional(),
  school: z.string().optional(),
  municipality: z.string().optional(),
  province: z.string().optional(),
  isActive: z.boolean().optional(),
})

type EditUserFormValues = z.infer<typeof editUserSchema>

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z
      .string()
      .min(6, "Confirm password must be at least 6 characters"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function AdminUsers() {
  const users = useUserStore((s) => s.users)
  const isLoading = useUserStore((s) => s.isLoading)
  const error = useUserStore((s) => s.error)
  const fetchUsers = useUserStore((s) => s.fetchUsers)
  const createUser = useUserStore((s) => s.createUser)
  const toggleActive = useUserStore((s) => s.toggleActive)
  const updateUser = useUserStore((s) => s.updateUser)
  const resetUserPassword = useUserStore((s) => s.resetUserPassword)
  const deleteUser = useUserStore((s) => s.deleteUser)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<BhssUser | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [roleTab, setRoleTab] = useState<"all" | "admin" | "user">("all")
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [createDialogTab, setCreateDialogTab] = useState<"info" | "account">(
    "info"
  )

  const schoolYear = "2025-2026"
  const detailsRows = useSchoolDirectoryStore((s) => s.detailsRows)
  const fetchDetails = useSchoolDirectoryStore((s) => s.fetchDetails)

  const pageSize = 10

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema) as any,
    defaultValues: {
      email: "",
      contactNumber: "",
      schoolAddress: "",
      municipality: "",
      schoolName: "",
      name: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  })

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema) as any,
    defaultValues: {
      email: "",
      contactNumber: "",
      schoolAddress: "",
      username: "",
      name: "",
      role: "user",
      school: "",
      municipality: "",
      province: "Bataan",
      isActive: true,
    },
    mode: "onSubmit",
  })

  const passwordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema) as any,
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  })

  const stats = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.isActive).length
    const inactive = total - active
    return { total, active, inactive }
  }, [users])

  const municipalityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const u of users) {
      const m = (u.municipality || "").trim()
      if (m) set.add(m)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [users])

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleTab !== "all" && u.role !== roleTab) return false
      if (selectedMunicipality !== "all" && u.municipality !== selectedMunicipality) return false
      return true
    })
  }, [roleTab, selectedMunicipality, users])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  }, [filteredUsers.length])

  const pagedUsers = useMemo(() => {
    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    const start = (safePage - 1) * pageSize
    return filteredUsers.slice(start, start + pageSize)
  }, [currentPage, filteredUsers, totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [roleTab, selectedMunicipality])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const createMunicipality = form.watch("municipality")
  const createSchoolName = form.watch("schoolName")

  const norm = (v: unknown) => String(v || "").trim().toLowerCase()

  useEffect(() => {
    if (!isDialogOpen) return
    form.setValue("schoolName", "", { shouldDirty: true })
  }, [createMunicipality, form, isDialogOpen])

  useEffect(() => {
    if (!isDialogOpen) return
    const m = String(createMunicipality || "").trim()
    if (!m) return
    fetchDetails(m, schoolYear).catch(() => {
      // ignore
    })
  }, [createMunicipality, fetchDetails, isDialogOpen, schoolYear])

  const schoolOptions = useMemo(() => {
    const m = String(createMunicipality || "").trim()
    if (!m) return []

    const taken = new Set(
      (users || [])
        .filter((u) => norm(u.municipality) === norm(m))
        .map((u) => norm(u.school))
        .filter(Boolean)
    )

    return (detailsRows || [])
      .filter((r) => r.municipality === m && r.schoolYear === schoolYear)
      .map((r) => ({
        id: r.id,
        label: r.completeName,
      }))
      .filter((x) => String(x.label || "").trim())
      .filter((x) => !taken.has(norm(x.label)))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [createMunicipality, detailsRows, schoolYear, users])

  useEffect(() => {
    if (!isDialogOpen) return
    const cur = String(createSchoolName || "").trim()
    if (!cur) return
    if (schoolOptions.some((s) => String(s.label || "").trim() === cur)) return
    form.setValue("schoolName", "", { shouldDirty: true })
  }, [createSchoolName, form, isDialogOpen, schoolOptions])

  const onSubmit: SubmitHandler<CreateUserFormValues> = async (values) => {
    try {
      await createUser({
        email: values.email,
        username: values.username,
        password: values.password,
        name: values.name || values.username,
        school: values.schoolName,
        municipality: values.municipality,
        province: "Bataan",
        contactNumber: values.contactNumber,
        schoolAddress: values.schoolAddress,
      })
      toast.success("User created successfully")
      setIsDialogOpen(false)
      setCreateDialogTab("info")
      form.reset({
        email: "",
        contactNumber: "",
        schoolAddress: "",
        municipality: "",
        schoolName: "",
        name: "",
        username: "",
        password: "",
        confirmPassword: "",
      })
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const openEdit = (u: BhssUser) => {
    setEditingUser(u)
    setIsEditDialogOpen(true)
    editForm.reset({
      email: u.email,
      contactNumber: u.contactNumber || "",
      schoolAddress: u.schoolAddress || "",
      username: u.username,
      name: u.name || u.hlaManagerName || "",
      role: u.role,
      school: u.school,
      municipality: u.municipality,
      province: u.province,
      isActive: u.isActive,
    })
    passwordForm.reset({ password: "", confirmPassword: "" })
  }

  const getErrorMessage = (e: unknown) => {
    if (typeof e === "string") return e
    if (e && typeof e === "object" && "message" in e) {
      const msg = (e as any).message
      if (typeof msg === "string") return msg
    }
    return "Something went wrong."
  }

  const onEditSubmit: SubmitHandler<EditUserFormValues> = async (values) => {
    if (!editingUser) return
    try {
      const dirty = (editForm.formState.dirtyFields || {}) as any
      const next: any = {}

      const maybeSet = (key: keyof EditUserFormValues, value: any) => {
        if (!dirty?.[key]) return
        next[key] = value
      }

      maybeSet("contactNumber", values.contactNumber)
      maybeSet("schoolAddress", values.schoolAddress)
      maybeSet("username", values.username)
      maybeSet("name", values.name)
      maybeSet("role", values.role)
      maybeSet("school", values.school)
      maybeSet("municipality", values.municipality)
      maybeSet("province", values.province)
      maybeSet("isActive", values.isActive)

      if (dirty?.email) {
        const email = String(values.email || "").trim()
        if (email) next.email = email
      }

      if (Object.keys(next).length === 0) {
        toast.message("No changes to save")
        return
      }

      await updateUser(editingUser.id, next)
      toast.success("User updated successfully")
      setIsEditDialogOpen(false)
      setEditingUser(null)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const onPasswordSubmit: SubmitHandler<ResetPasswordFormValues> = async (
    values
  ) => {
    if (!editingUser) return
    try {
      await resetUserPassword(editingUser.id, values.password)
      passwordForm.reset({ password: "", confirmPassword: "" })
      toast.success("Password updated successfully")
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage user accounts.
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={isLoading}>
              <Plus className="size-4" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Create User Account</DialogTitle>
              <DialogDescription>
                Enter the required details.
              </DialogDescription>
            </DialogHeader>

            <form
              className="grid gap-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <Tabs value={createDialogTab} onValueChange={(v) => setCreateDialogTab(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger className="flex-1" value="info">
                    User Info
                  </TabsTrigger>
                  <TabsTrigger className="flex-1" value="account">
                    Account
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="mt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email Address/Facebook</Label>
                      <Input id="email" type="text" {...form.register("email")} />
                      {form.formState.errors.email?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="contactNumber">Contact Number</Label>
                      <Input id="contactNumber" {...form.register("contactNumber")} />
                      {form.formState.errors.contactNumber?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.contactNumber.message as any}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="schoolAddress">School Address</Label>
                      <Input id="schoolAddress" {...form.register("schoolAddress")} />
                      {form.formState.errors.schoolAddress?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.schoolAddress.message as any}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="municipality">Municipality</Label>
                      <Select
                        value={form.watch("municipality")}
                        onValueChange={(value) =>
                          form.setValue("municipality", value, {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                      >
                        <SelectTrigger id="municipality">
                          <SelectValue placeholder="Select municipality" />
                        </SelectTrigger>
                        <SelectContent>
                          {BATAAN_MUNICIPALITIES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.municipality?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.municipality.message}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="schoolName">School Name</Label>
                      <Select
                        value={createSchoolName}
                        onValueChange={(value) => {
                          form.setValue("schoolName", value, {
                            shouldValidate: true,
                            shouldDirty: true,
                          })

                          const m = String(createMunicipality || "").trim()
                          const row = (detailsRows || []).find(
                            (r) => r.municipality === m && r.schoolYear === schoolYear && r.completeName === value
                          )

                          if (row) {
                            const maybeSet = (key: keyof CreateUserFormValues, v: string) => {
                              const dirty = !!(form.formState.dirtyFields as any)?.[key]
                              if (dirty) return
                              form.setValue(key as any, v, { shouldValidate: true })
                            }

                            maybeSet("name", String(row.hlaManagerName || "").trim())
                            maybeSet("contactNumber", String(row.hlaManagerContact || "").trim())
                            maybeSet("email", String(row.hlaManagerFacebook || "").trim())
                          }
                        }}
                        disabled={!createMunicipality}
                      >
                        <SelectTrigger id="schoolName">
                          <SelectValue placeholder={createMunicipality ? "Select school" : "Select municipality first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {schoolOptions.map((s) => (
                            <SelectItem key={s.id} value={s.label}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.schoolName?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.schoolName.message as any}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="name">HLA Manager</Label>
                      <Input id="name" {...form.register("name")} />
                      {form.formState.errors.name?.message && (
                        <p className="text-sm text-destructive">{form.formState.errors.name.message as any}</p>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false)
                        setCreateDialogTab("info")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={isLoading}
                      onClick={async () => {
                        const ok = await form.trigger([
                          "contactNumber",
                          "schoolAddress",
                          "municipality",
                          "schoolName",
                          "name",
                        ] as any)
                        if (ok) setCreateDialogTab("account")
                      }}
                    >
                      Next
                    </Button>
                  </DialogFooter>
                </TabsContent>

                <TabsContent value="account" className="mt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" {...form.register("username")} />
                      {form.formState.errors.username?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.username.message}
                        </p>
                      )}
                    </div>

                    <div />

                    <div className="grid gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        {...form.register("password")}
                      />
                      {form.formState.errors.password?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.password.message}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        {...form.register("confirmPassword")}
                      />
                      {form.formState.errors.confirmPassword?.message && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <DialogFooter className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogTab("info")}
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      Create Account
                    </Button>
                  </DialogFooter>
                </TabsContent>
              </Tabs>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Registered Accounts
            </CardTitle>
            <Users className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total created accounts
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
            <Users className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Accounts currently active
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Inactive Accounts
            </CardTitle>
            <Users className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground mt-1">Disabled accounts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>User Accounts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage registered accounts.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="admin">Admins</TabsTrigger>
                <TabsTrigger value="user">Users</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="w-full sm:w-[220px]">
                <Select value={selectedMunicipality} onValueChange={(v) => setSelectedMunicipality(v)}>
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue placeholder="Municipality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Municipalities</SelectItem>
                    {municipalityOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-sm text-muted-foreground">
                Showing {pagedUsers.length} of {filteredUsers.length} (Total: {users.length})
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Municipality</TableHead>
                <TableHead>Province</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground"
                  >
                    {isLoading
                      ? "Loading users..."
                      : roleTab === "all"
                        ? "No users yet. Click \"Create User\" to add one."
                        : "No users found for this tab."}
                  </TableCell>
                </TableRow>
              ) : (
                pagedUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Badge variant={u.isActive ? "default" : "outline"}>
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{u.email}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{u.school}</TableCell>
                    <TableCell>{u.municipality}</TableCell>
                    <TableCell>{u.province}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Switch
                          checked={u.isActive}
                          disabled={isLoading}
                          onCheckedChange={(checked) => toggleActive(u.id, checked)}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-lg"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="size-4" />
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-lg"
                                disabled={isLoading}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently
                                  delete the user account.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    try {
                                      await deleteUser(u.id)
                                      toast.success("User deleted successfully")
                                    } catch (e) {
                                      toast.error(getErrorMessage(e))
                                    }
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {filteredUsers.length > 0 && totalPages > 1 && (
            <div className="mt-4 flex justify-end">
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }}
                      aria-disabled={currentPage === 1}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === currentPage}
                          onClick={(e) => {
                            e.preventDefault()
                            setCurrentPage(page)
                          }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }}
                      aria-disabled={currentPage === totalPages}
                      className={
                        currentPage === totalPages
                          ? "pointer-events-none opacity-50"
                          : ""
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) {
            setEditingUser(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details or reset password.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="password">Change Password</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <form
                className="grid gap-4"
                onSubmit={editForm.handleSubmit(onEditSubmit)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      {...editForm.register("email")}
                    />
                    {editForm.formState.errors.email?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-contactNumber">Contact Number</Label>
                    <Input
                      id="edit-contactNumber"
                      {...editForm.register("contactNumber")}
                    />
                    {editForm.formState.errors.contactNumber?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.contactNumber.message as any}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-username">Username</Label>
                    <Input
                      id="edit-username"
                      {...editForm.register("username")}
                    />
                    {editForm.formState.errors.username?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-name">HLA Manager</Label>
                    <Input id="edit-name" {...editForm.register("name")} />
                    {editForm.formState.errors.name?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-role">Role</Label>
                    <Select
                      value={editForm.watch("role")}
                      onValueChange={(value) =>
                        editForm.setValue("role", value as any, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                    >
                      <SelectTrigger id="edit-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">user</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                    {editForm.formState.errors.role?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.role.message as any}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-school">School</Label>
                    <Input
                      id="edit-school"
                      {...editForm.register("school")}
                    />
                    {editForm.formState.errors.school?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.school.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="edit-schoolAddress">School Address</Label>
                    <Input
                      id="edit-schoolAddress"
                      {...editForm.register("schoolAddress")}
                    />
                    {editForm.formState.errors.schoolAddress?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.schoolAddress.message as any}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-municipality">Municipality</Label>
                    <Select
                      value={editForm.watch("municipality")}
                      onValueChange={(value) =>
                        editForm.setValue("municipality", value, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                    >
                      <SelectTrigger id="edit-municipality">
                        <SelectValue placeholder="Select municipality" />
                      </SelectTrigger>
                      <SelectContent>
                        {BATAAN_MUNICIPALITIES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editForm.formState.errors.municipality?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.municipality.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-province">Province</Label>
                    <Input
                      id="edit-province"
                      {...editForm.register("province")}
                    />
                    {editForm.formState.errors.province?.message && (
                      <p className="text-sm text-destructive">
                        {editForm.formState.errors.province.message as any}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                    <div>
                      <div className="text-sm font-medium">Active</div>
                      <div className="text-xs text-muted-foreground">
                        Disable to prevent login.
                      </div>
                    </div>
                    <Switch
                      checked={editForm.watch("isActive")}
                      onCheckedChange={(checked) =>
                        editForm.setValue("isActive", checked, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    Close
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="password">
              <form
                className="grid gap-4"
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="reset-password">New Password</Label>
                    <Input
                      id="reset-password"
                      type="password"
                      {...passwordForm.register("password")}
                    />
                    {passwordForm.formState.errors.password?.message && (
                      <p className="text-sm text-destructive">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reset-confirm">Confirm Password</Label>
                    <Input
                      id="reset-confirm"
                      type="password"
                      {...passwordForm.register("confirmPassword")}
                    />
                    {passwordForm.formState.errors.confirmPassword?.message && (
                      <p className="text-sm text-destructive">
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <DialogFooter>
                  <Button type="submit" disabled={isLoading}>
                    Update Password
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
