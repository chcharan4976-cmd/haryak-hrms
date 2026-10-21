
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
    }
  }, [user, loading, router])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>
  }

  if (!user) {
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
              ? 'min-h-0 flex-1 overflow-hidden p-2.5 md:p-3'
              : 'flex-1 overflow-y-auto p-4 md:p-6 lg:p-8'
          }
        >
          <div
            className={
              isChatRoute
                ? 'mx-auto flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden [&>*]:!m-0 [&>*]:!min-h-0 [&>*]:!w-full [&>*]:!max-w-none [&>*]:flex [&>*]:flex-1 [&>*]:flex-col [&>*]:overflow-hidden'
                : 'mx-auto max-w-7xl'
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
