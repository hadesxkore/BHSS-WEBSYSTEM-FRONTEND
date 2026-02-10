import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3 } from "lucide-react"

export function DataAnalysis() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" />
            Data Analysis
          </CardTitle>
          <CardDescription>
            Analyze system data and generate reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Access comprehensive data analysis tools and generate detailed reports for insights.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
