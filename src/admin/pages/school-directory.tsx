import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SchoolDirectoryBeneficiariesTab } from "./school-directory-beneficiaries-tab"
import { SchoolDirectorySchoolDetailsTab } from "./school-directory-school-details-tab"

const BATAAN_MUNICIPALITIES = [
  "Abucay",
  "Bagac",
  "Balanga City",
  "Dinalupihan",
  "Hermosa",
  "Limay",
  "Mariveles",
  "Morong",
  "Orani",
  "Orion",
  "Pilar",
  "Samal",
]

export function SchoolDirectory() {
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>(
    BATAAN_MUNICIPALITIES[0]
  )
  const [schoolYear, setSchoolYear] = useState("2025-2026")
  const [activeTab, setActiveTab] = useState("beneficiaries")
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">School Directory</h2>
          <p className="text-muted-foreground">
            Manage schools by municipality
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="schoolYear" className="whitespace-nowrap">
              School Year:
            </Label>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger id="schoolYear" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024-2025">2024-2025</SelectItem>
                <SelectItem value="2025-2026">2025-2026</SelectItem>
                <SelectItem value="2026-2027">2026-2027</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {BATAAN_MUNICIPALITIES.map((municipality) => (
          <Button
            key={municipality}
            variant="outline"
            onClick={() => setSelectedMunicipality(municipality)}
            className={`w-full rounded-2xl border transition-colors ${
              selectedMunicipality === municipality
                ? "bg-emerald-600 text-white border-transparent hover:bg-emerald-700"
                : "bg-emerald-50 text-neutral-800 border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            {municipality}
          </Button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-transparent">
          <TabsTrigger
            value="beneficiaries"
            className="rounded-xl border border-transparent data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:border-transparent hover:bg-emerald-50"
          >
            Beneficiaries
          </TabsTrigger>
          <TabsTrigger
            value="school-details"
            className="rounded-xl border border-transparent data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:border-transparent hover:bg-emerald-50"
          >
            School Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="beneficiaries" className="mt-6">
          <SchoolDirectoryBeneficiariesTab
            selectedMunicipality={selectedMunicipality}
            schoolYear={schoolYear}
          />
        </TabsContent>

        <TabsContent value="school-details" className="mt-6">
          <SchoolDirectorySchoolDetailsTab
            selectedMunicipality={selectedMunicipality}
            schoolYear={schoolYear}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
