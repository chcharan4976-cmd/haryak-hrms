
'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/components/providers/auth-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useTheme } from 'next-themes'
import { HaryakAiWidget } from '@/components/ai/haryak-ai-widget'
import { ChatNotificationListener } from '@/components/chat/chat-notification-listener'
import {
  Home, User, Clock, CalendarOff, FileText, IndianRupee,
  FolderOpen, Megaphone, Calendar, HelpCircle,
  Menu, Bell, Sun, Moon, Monitor, LogOut, ChevronLeft, ChevronRight, Circle,
  MessageSquare, CheckSquare, X
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/notifications/notification-bell'

const navItems = [
  { name: 'Home', href: '/portal/home', icon: Home },
  { name: 'Organization Chat', href: '/portal/messages', icon: MessageSquare },
  { name: 'My Profile', href: '/portal/my-profile', icon: User },
  { name: 'My Attendance', href: '/portal/my-attendance', icon: Clock },
  { name: 'My Timesheet', href: '/portal/timesheet', icon: CheckSquare },
  { name: 'My Leaves', href: '/portal/my-leaves', icon: CalendarOff },
  { name: 'My Payslips', href: '/portal/my-payslips', icon: FileText },
  { name: 'My Salary', href: '/portal/my-salary', icon: IndianRupee },
  { name: 'My Documents', href: '/portal/my-documents', icon: FolderOpen },
  { name: 'Announcements', href: '/portal/announcements', icon: Megaphone },
  { name: 'Company Calendar', href: '/portal/company-calendar', icon: Calendar },
  { name: 'Help / HR Requests', href: '/portal/help', icon: HelpCircle },
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }

    if (!loading && user) {
      const mustChangePassword = Boolean(
        (user as any)?.user_metadata?.must_change_password ||
        (user as any)?.mustChangePassword ||
        (user as any)?.user_metadata?.must_change_credentials ||
        (user as any)?.mustChangeCredentials
      )

      if (mustChangePassword) {
        router.replace('/first-login/change-password')
        return
      }

      const roles: string[] = (user as any)?.roles || (user as any)?.user_metadata?.roles || []
      const userRole = (user as any)?.role || (user as any)?.user_metadata?.role
      const hasAdminRole = 
        roles.some((r: string) => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(r)) ||
        ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(userRole)
      const hasEmployeeRole = roles.includes('EMPLOYEE') || userRole === 'EMPLOYEE'
      const hasEmployeeProfile = Boolean(profile?.employee_code || (user as any)?.employeeCode)

      // Administrators without employee profile should stay in the administration console
      if (hasAdminRole && !hasEmployeeRole && !hasEmployeeProfile) {
        router.replace('/dashboard')
        return
      }
    }
  }, [user, profile, loading, router])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>
  }

  const mustChangePassword = Boolean(
    (user as any)?.user_metadata?.must_change_password ||
    (user as any)?.mustChangePassword ||
    (user as any)?.user_metadata?.must_change_credentials ||
    (user as any)?.mustChangeCredentials
  )

  if (!user || mustChangePassword) {
    return null
  }

  const initials = profile?.first_name 
    ? `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || 'U'

  const isChatRoute = pathname === '/portal/messages' || pathname.startsWith('/portal/messages/')

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#1e2a78] text-white transition-all duration-300 md:relative",
          collapsed ? "w-[72px]" : "w-72 max-w-[85vw] md:w-64",
          mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between px-3.5 py-4 shrink-0 border-b border-white/10">
          <Link href="/portal/home" className="flex items-center gap-3 overflow-hidden" onClick={() => mobileMenuOpen && setMobileMenuOpen(false)}>
            <div className="bg-white p-1 rounded-lg shrink-0 shadow-sm">
              <Image
                src="/logo.jpg"
                alt="Haryak Technologies India Private Limited"
                width={30}
                height={30}
                className="w-7 h-7 object-contain"
                priority
              />
            </div>
            {(!collapsed || mobileMenuOpen) && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold tracking-tight text-white truncate">
                  Haryak Technologies
                </span>
                <span className="text-[10px] text-blue-200/80 tracking-wide uppercase truncate font-medium">
                  Employee Portal
                </span>
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="flex md:hidden text-white hover:bg-white/10 hover:text-white shrink-0 h-9 w-9"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="hidden md:flex text-white hover:bg-white/10 hover:text-white shrink-0 h-8 w-8"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const showCollapsed = collapsed && !mobileMenuOpen
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => mobileMenuOpen && setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors min-h-[40px]",
                    isActive 
                      ? "bg-white/15 text-white shadow-sm font-semibold" 
                      : "text-blue-100/75 hover:bg-white/10 hover:text-white",
                    showCollapsed && "justify-center px-0 h-10 w-10 mx-auto min-h-0"
                  )}
                  title={showCollapsed ? item.name : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!showCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>

        <div className="p-3 border-t border-white/10 shrink-0 bg-black/10">
          <div className={cn("flex items-center gap-3", (collapsed && !mobileMenuOpen) && "justify-center")}>
            <Avatar className="h-8 w-8 border border-white/20">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            
            {(!collapsed || mobileMenuOpen) && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : (user?.email || 'Employee')}
                </p>
                <p className="text-[10px] text-blue-200/70 truncate">Employee</p>
              </div>
            )}

            {(!collapsed || mobileMenuOpen) && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10 hover:text-white shrink-0 h-8 w-8"
                onClick={() => signOut()}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Nav */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-4 border-b bg-background px-3 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 shrink-0" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          {isChatRoute ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold tracking-tight text-foreground">
                Organization Chat
              </p>
              <p className="truncate text-[10px] text-muted-foreground hidden sm:block">
                Connect with team members, announcements, and internal conversations.
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1 flex items-center">
              <span className="text-sm font-semibold tracking-tight text-foreground truncate">
                Employee Portal
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-1 sm:gap-3 shrink-0">
            <NotificationBell portal={true} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                  <Sun className="h-[1.1rem] w-[1.1rem] sm:h-[1.2rem] sm:w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-[1.1rem] w-[1.1rem] sm:h-[1.2rem] sm:w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}><Sun className="mr-2 h-4 w-4" />Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}><Moon className="mr-2 h-4 w-4" />Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}><Monitor className="mr-2 h-4 w-4" />System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full shrink-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || ''} alt={profile?.first_name || 'User'} />
                    <AvatarFallback className="bg-blue-100 text-blue-900">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.email}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/portal/my-profile" className="flex items-center cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>My Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        
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
                : 'mx-auto max-w-5xl'
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
