import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Package } from "lucide-react"

export function Distribution() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Distribution
          </CardTitle>
          <CardDescription>
            Manage distribution and logistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Track and manage distribution of resources and materials to schools.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
