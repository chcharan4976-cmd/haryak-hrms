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
import {
  Home, User, Clock, CalendarOff, FileText, IndianRupee,
  FolderOpen, Megaphone, Calendar, HelpCircle,
  Menu, Bell, Sun, Moon, Monitor, LogOut, ChevronLeft, ChevronRight, Circle,
  MessageSquare, CheckSquare
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
    }
  }, [user, loading, router])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>
  }

  if (!user) {
    return null
  }

  const initials = profile?.first_name 
    ? `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || 'U'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#1e3a8a] text-white transition-all duration-300 md:relative",
          collapsed ? "w-[70px]" : "w-64",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between px-3.5 py-4 shrink-0 border-b border-white/10">
          <Link href="/portal/home" className="flex items-center gap-3 overflow-hidden">
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
            {!collapsed && (
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

        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => mobileMenuOpen && setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-white/10 text-white" 
                      : "text-blue-100/70 hover:bg-white/5 hover:text-white",
                    collapsed && "justify-center px-0"
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t border-white/10 shrink-0">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <Avatar className="h-9 w-9 border border-white/20">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="bg-white/10 text-white">{initials}</AvatarFallback>
            </Avatar>
            
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.email}
                </p>
                <p className="text-xs text-blue-200/70 truncate">Employee</p>
              </div>
            )}

            {!collapsed && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10 hover:text-white shrink-0"
                onClick={() => signOut()}
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
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 items-center justify-end space-x-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-600" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}><Sun className="mr-2 h-4 w-4" />Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}><Moon className="mr-2 h-4 w-4" />Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}><Monitor className="mr-2 h-4 w-4" />System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
      <HaryakAiWidget />
    </div>
  )
}
