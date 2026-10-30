import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  trend?: {
    value: string
    isPositive?: boolean
    isNeutral?: boolean
  }
  className?: string
}

export function StatCard({ title, value, description, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden shadow-sm transition-shadow hover:shadow-md", className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
            <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate max-w-full">{value}</h3>
              {trend && (
                <span className={cn(
                  "text-xs sm:text-sm font-medium shrink-0",
                  trend.isNeutral ? "text-muted-foreground" : trend.isPositive !== false ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {trend.isPositive !== false && !trend.isNeutral && "+"}
                  {trend.value}
                </span>
              )}
            </div>
            {description && (
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{description}</p>
            )}
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#1e2a78]/8 text-[#1e2a78] dark:bg-blue-950/30 dark:text-blue-300 shrink-0">
            <Icon className="h-5 w-5 text-[#1e2a78] dark:text-blue-300" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
