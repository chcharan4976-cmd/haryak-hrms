'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import React from 'react'

export function Breadcrumbs() {
  const pathname = usePathname()
  const paths = pathname.split('/').filter(Boolean)

  if (paths.length === 0) return null

  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground hidden sm:flex">
      <Link href="/dashboard" className="hover:text-foreground flex items-center">
        <Home className="h-4 w-4" />
      </Link>
      {paths.map((path, index) => {
        const isLast = index === paths.length - 1
        const href = `/${paths.slice(0, index + 1).join('/')}`
        const label = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ')

        return (
          <React.Fragment key={path}>
            <ChevronRight className="h-4 w-4" />
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link href={href} className="hover:text-foreground">
                {label}
              </Link>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
