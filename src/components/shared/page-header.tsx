import { cn } from '@/lib/utils'

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children, className, ...props }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 min-w-0", className)} {...props}>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{title}</h2>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {children}
        </div>
      )}
    </div>
  )
}
