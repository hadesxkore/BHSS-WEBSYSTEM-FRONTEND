import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingCart } from "lucide-react"

export function Procurement() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5" />
            Procurement
          </CardTitle>
          <CardDescription>
            Manage procurement and purchasing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Handle procurement processes, purchase orders, and vendor management.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
