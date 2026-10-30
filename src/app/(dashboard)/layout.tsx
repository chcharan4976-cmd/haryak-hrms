
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { TopNav } from '@/components/layout/top-nav'
import { HaryakAiWidget } from '@/components/ai/haryak-ai-widget'
import { ChatNotificationListener } from '@/components/chat/chat-notification-listener'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }

    const roles: string[] = (user as any)?.roles || (user as any)?.user_metadata?.roles || []
    const userRole = (user as any)?.role || (user as any)?.user_metadata?.role
    const hasEmployeeRole = roles.includes('EMPLOYEE') || userRole === 'EMPLOYEE'
    const hasAdminRole = 
      roles.some((r: string) => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(r)) ||
      ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(userRole)

    const isEmployeeOnly = (hasEmployeeRole || Boolean((user as any)?.employeeCode)) && !hasAdminRole

    const mustChangeCredentials = Boolean(
      (user as any)?.user_metadata?.must_change_credentials ||
      (user as any)?.mustChangeCredentials
    )

    const mustChangePassword = Boolean(
      (user as any)?.user_metadata?.must_change_password ||
      (user as any)?.mustChangePassword
    )

    if (isEmployeeOnly) {
      if (mustChangePassword || mustChangeCredentials) {
        router.replace('/first-login/change-password')
      } else {
        router.replace('/portal/home')
      }
      return
    }

    if (mustChangeCredentials) {
      router.replace('/first-login/change-credentials')
      return
    }

    if (mustChangePassword) {
      router.replace('/first-login/change-password')
      return
    }
  }, [user, loading, router])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>
  }

  const roles: string[] = (user as any)?.roles || (user as any)?.user_metadata?.roles || []
  const userRole = (user as any)?.role || (user as any)?.user_metadata?.role
  const hasEmployeeRole = roles.includes('EMPLOYEE') || userRole === 'EMPLOYEE'
  const hasAdminRole = 
    roles.some((r: string) => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(r)) ||
    ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(userRole)

  const isEmployeeOnly = (hasEmployeeRole || Boolean((user as any)?.employeeCode)) && !hasAdminRole

  const mustChange = Boolean(
    (user as any)?.user_metadata?.must_change_credentials ||
    (user as any)?.mustChangeCredentials ||
    (user as any)?.user_metadata?.must_change_password ||
    (user as any)?.mustChangePassword
  )

  if (!user || mustChange || isEmployeeOnly) {
    return null
  }

  const isChatRoute = pathname === '/messages' || pathname.startsWith('/messages/')

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar 
        collapsed={collapsed} 
        onToggle={() => setCollapsed(!collapsed)} 
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav onMobileMenuToggle={() => setMobileMenuOpen(true)} />
        
        <main
          className={
            isChatRoute
              ? 'min-h-0 flex-1 overflow-hidden p-2 sm:p-2.5 md:p-3 min-w-0'
              : 'flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 min-w-0'
          }
        >
          <div
            className={
              isChatRoute
                ? 'mx-auto flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden [&>*]:!m-0 [&>*]:!min-h-0 [&>*]:!w-full [&>*]:!max-w-none [&>*]:flex [&>*]:flex-1 [&>*]:flex-col [&>*]:overflow-hidden'
                : 'mx-auto max-w-7xl w-full min-w-0'
            }
          >
            {children}
          </div>
        </main>
      </div>
      <ChatNotificationListener />
      {!isChatRoute && <HaryakAiWidget />}
    </div>
  )
}
