import { useMemo, useState } from "react"
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Image as ImageIcon,
  Truck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type InstructionStep = {
  step: number
  title: string
  description: string
  imageSrc?: string
}

function StepCard({
  s,
  onPreview,
}: {
  s: InstructionStep
  onPreview: (src: string) => void
}) {
  return (
    <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-xl">
                Step {s.step}
              </Badge>
              <CardTitle className="text-base sm:text-lg truncate">{s.title}</CardTitle>
            </div>
            <CardDescription className="mt-1 text-sm">{s.description}</CardDescription>
          </div>
          <div className="rounded-xl bg-background/70 p-2 shadow-sm">
            <BookOpen className="size-5" />
          </div>
        </div>
      </CardHeader>

      {s.imageSrc ? (
        <CardContent className="pt-0">
          <button
            type="button"
            className="group w-full text-left"
            onClick={() => onPreview(s.imageSrc as string)}
          >
            <div className="relative overflow-hidden rounded-2xl border bg-muted/30">
              <img
                src={s.imageSrc}
                alt={`Step ${s.step}: ${s.title}`}
                loading="lazy"
                className="w-full h-auto object-contain transition-transform duration-200 group-hover:scale-[1.01]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-xl bg-black/65 px-3 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <ImageIcon className="size-4" />
                Tap to preview
              </div>
            </div>
          </button>
        </CardContent>
      ) : null}
    </Card>
  )
}

export function UserInstructions() {
  const [tab, setTab] = useState<"delivery" | "attendance">("delivery")
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  const deliverySteps = useMemo<InstructionStep[]>(() => {
    const base = "/deliveryimage"

    return [
      {
        step: 1,
        title: "Open the Delivery page",
        description: "Go to Delivery to start creating your daily delivery log.",
        imageSrc: `${base}/DeliveryStep1.png`,
      },
      {
        step: 2,
        title: "Select materials / goods",
        description: "Use the dropdown to choose the category/materials you will log.",
        imageSrc: `${base}/DeliveryStep2.png`,
      },
      {
        step: 3,
        title: "Click Add/Edit Item Delivery",
        description: "Open the form to add details for the selected goods/materials.",
        imageSrc: `${base}/DeliveryStep3.png`,
      },
      {
        step: 4,
        title: "Review selected goods and edit if needed",
        description: "The modal shows the selected goods/materials and you can still change them using the dropdown.",
        imageSrc: `${base}/DeliveryStep4.png`,
      },
      {
        step: 5,
        title: "Select delivery status",
        description: "Choose the current status of the delivery, then click Next.",
        imageSrc: `${base}/DeliveryStep5.png`,
      },
      {
        step: 6,
        title: "Add concerns (optional)",
        description: "Select from the list, or click Add more if your concern is not listed.",
        imageSrc: `${base}/DeliveryStep6.png`,
      },
      {
        step: 7,
        title: "Upload delivery proof images",
        description: "Upload images for proof of delivery and supporting photos.",
        imageSrc: `${base}/DeliveryStep7.png`,
      },
      {
        step: 8,
        title: "Review and submit",
        description: "Verify the information you entered, then click Submit to save the delivery record.",
        imageSrc: `${base}/DeliveryStep8.png`,
      },
      {
        step: 9,
        title: "Open the History tab",
        description: "Switch to the History tab to review your submitted deliveries.",
        imageSrc: `${base}/DeliveryStep9.png`,
      },
      {
        step: 10,
        title: "View past submissions",
        description: "Browse the list to see your previous delivery submissions.",
        imageSrc: `${base}/DeliveryStep10.png`,
      },
    ]
  }, [])

  const attendanceSteps = useMemo<InstructionStep[]>(() => {
    const base = "/attendanceimage"
    return [
      {
        step: 1,
        title: "Open the Attendance page",
        description: "This is the main Attendance page where you will record daily attendance.",
        imageSrc: `${base}/attendancestep1.png`,
      },
      {
        step: 2,
        title: "Select the grade level",
        description: "Use the dropdown list to choose the grade level.",
        imageSrc: `${base}/attendancestep2.png`,
      },
      {
        step: 3,
        title: "Input present and absent",
        description: "After selecting the grade level, enter the attendance counts for Present and Absent.",
        imageSrc: `${base}/attendancestep3.png`,
      },
      {
        step: 4,
        title: "Add another grade level (optional)",
        description: "If you need to add more grades, click Add another to add a new entry.",
        imageSrc: `${base}/attendancestep4.png`,
      },
      {
        step: 5,
        title: "Input the next grade level",
        description: "After clicking Add another, the input fields reset so you can select another grade and enter new counts.",
        imageSrc: `${base}/attendancestep5.png`,
      },
      {
        step: 6,
        title: "Save to pending entries",
        description: "Click Save or Add another to store the entry in Pending entries (not yet submitted).",
        imageSrc: `${base}/attendancestep6.png`,
      },
      {
        step: 7,
        title: "Add notes (optional)",
        description: "You can type notes for the attendance entry here.",
        imageSrc: `${base}/attendancestep7.png`,
      },
      {
        step: 8,
        title: "Verify pending entries and submit",
        description: "Review Pending entries. You can Clear list or click Save all to save them to the record.",
        imageSrc: `${base}/attendancestep8.png`,
      },
      {
        step: 9,
        title: "Open the History tab",
        description: "Switch to the History tab to review saved attendance records.",
        imageSrc: `${base}/attendancestep9.png`,
      },
      {
        step: 10,
        title: "View attendance history",
        description: "The History tab shows all recorded attendance entries.",
        imageSrc: `${base}/attendancestep10.png`,
      },
    ]
  }, [])

  const steps = tab === "delivery" ? deliverySteps : attendanceSteps

  const [activePreviewIndex, setActivePreviewIndex] = useState(0)

  const previewList = useMemo(() => {
    const imgs = steps.map((s) => s.imageSrc).filter(Boolean) as string[]
    return imgs
  }, [steps])

  const canPrev = activePreviewIndex > 0
  const canNext = activePreviewIndex < previewList.length - 1

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Instructions</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            Step-by-step guides for Delivery and Attendance.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-xl">
            HLA Manager
          </Badge>
        </div>
      </div>

      <Card className="rounded-2xl border border-black/5 bg-white/70 [@supports(backdrop-filter:blur(0))]:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3 sm:p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2 rounded-2xl">
              <TabsTrigger value="delivery" className="rounded-2xl">
                <Truck className="mr-2 size-4" />
                Delivery
              </TabsTrigger>
              <TabsTrigger value="attendance" className="rounded-2xl">
                <ClipboardCheck className="mr-2 size-4" />
                Attendance
              </TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {steps.map((s) => (
                  <StepCard
                    key={`${tab}-${s.step}`}
                    s={s}
                    onPreview={(src) => {
                      setPreviewSrc(src)
                      const idx = previewList.findIndex((x) => x === src)
                      setActivePreviewIndex(Math.max(0, idx))
                    }}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={!!previewSrc}
        onOpenChange={(v) => {
          if (!v) setPreviewSrc(null)
        }}
      >
        <DialogContent className="max-w-4xl p-3 sm:p-4 flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Preview</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-muted/30">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Preview"
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>

          {previewList.length > 1 ? (
            <div className="pt-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={!canPrev}
                onClick={() => {
                  if (!canPrev) return
                  const nextIdx = Math.max(0, activePreviewIndex - 1)
                  setActivePreviewIndex(nextIdx)
                  setPreviewSrc(previewList[nextIdx])
                }}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>

              <div className="text-xs text-muted-foreground">
                {activePreviewIndex + 1} / {previewList.length}
              </div>

              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={!canNext}
                onClick={() => {
                  if (!canNext) return
                  const nextIdx = Math.min(previewList.length - 1, activePreviewIndex + 1)
                  setActivePreviewIndex(nextIdx)
                  setPreviewSrc(previewList[nextIdx])
                }}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
