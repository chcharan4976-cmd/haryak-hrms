'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import React from 'react'

export function Breadcrumbs() {
  const pathname = usePathname()
  const paths = pathname.split('/').filter(Boolean)

  if (paths.length === 0) return null

  const currentLabel = paths[paths.length - 1].charAt(0).toUpperCase() + paths[paths.length - 1].slice(1).replace(/-/g, ' ')

  return (
    <>
      {/* Mobile view: compact current page label */}
      <div className="flex items-center sm:hidden min-w-0">
        <span className="text-xs font-semibold text-foreground truncate max-w-[130px]">
          {currentLabel}
        </span>
      </div>

      {/* Tablet & Desktop: full breadcrumb trail */}
      <nav aria-label="Breadcrumbs" className="items-center space-x-1 text-sm text-muted-foreground hidden sm:flex min-w-0">
        <Link href="/dashboard" className="hover:text-foreground flex items-center shrink-0">
          <Home className="h-4 w-4" />
        </Link>
        {paths.map((path, index) => {
          const isLast = index === paths.length - 1
          const href = `/${paths.slice(0, index + 1).join('/')}`
          const label = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ')

          return (
            <React.Fragment key={path}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              {isLast ? (
                <span className="font-medium text-foreground truncate max-w-[200px]">{label}</span>
              ) : (
                <Link href={href} className="hover:text-foreground truncate max-w-[140px]">
                  {label}
                </Link>
              )}
            </React.Fragment>
          )
        })}
      </nav>
    </>
  )
}
