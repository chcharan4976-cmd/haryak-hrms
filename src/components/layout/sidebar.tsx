'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/components/providers/auth-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  CalendarOff,
  CalendarDays,
  Wallet,
  FileText,
  IndianRupee,
  FolderOpen,
  BarChart3,
  Megaphone,
  CheckSquare,
  Shield,
  Settings,
  LifeBuoy,
  ShieldAlert,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare
} from 'lucide-react'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  isMobileOpen: boolean
  onMobileClose: () => void
}

const navSections = [
  {
    title: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Employees', href: '/employees', icon: Users },
      { name: 'Organization', href: '/organization', icon: Building2 },
    ]
  },
  {
  title: 'OPERATIONS',
  items: [
    { name: 'Attendance', href: '/attendance', icon: Clock },
    { name: 'Timesheets', href: '/timesheets', icon: CheckSquare },
    { name: 'Leave', href: '/leave', icon: CalendarOff },
    { name: 'Company Calendar', href: '/calendar', icon: CalendarDays },
    { name: 'Payroll Control', href: '/payroll', icon: Wallet },
    { name: 'Payslips', href: '/payslips', icon: FileText },
  ]
},
  {
    title: 'MANAGEMENT',
    items: [
      { name: 'Organization Chat', href: '/messages', icon: MessageSquare },
      { name: 'Compensation', href: '/compensation', icon: IndianRupee },
      { name: 'Documents', href: '/documents', icon: FolderOpen },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
      { name: 'Announcements', href: '/announcements', icon: Megaphone },
      { name: 'Approvals', href: '/approvals', icon: CheckSquare },
    ]
  },
  {
    title: 'GOVERNANCE & ADMIN',
    items: [
      { name: 'Audit Logs', href: '/audit', icon: Shield },
      { name: 'Security Center', href: '/settings', icon: ShieldAlert },
      { name: 'Company Settings', href: '/settings', icon: Settings },
    ]
  }
]

export function Sidebar({ collapsed, onToggle, isMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()

  const initials = profile?.first_name 
    ? `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || 'A'

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#1e2a78] text-white transition-all duration-300 md:relative",
          collapsed ? "w-[72px]" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-3.5 py-4 shrink-0 border-b border-white/10">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
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
                  Administration
                </span>
              </div>
            )}
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            className="hidden md:flex text-white hover:bg-white/10 hover:text-white shrink-0 h-8 w-8"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-6 px-2">
            {navSections.map((section, idx) => (
              <div key={idx}>
                {!collapsed && (
                  <h4 className="mb-2 px-3 text-[11px] font-semibold text-blue-200/70 tracking-wider">
                    {section.title}
                  </h4>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
                    return (
                      <Link
                        key={item.href + item.name}
                        href={item.href}
                        prefetch={true}
                        onClick={onMobileClose}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                          isActive 
                            ? "bg-white/15 text-white shadow-sm font-semibold" 
                            : "text-blue-100/75 hover:bg-white/10 hover:text-white",
                          collapsed && "justify-center px-0 h-10 w-10 mx-auto"
                        )}
                        title={collapsed ? item.name : undefined}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.name}</span>}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* User Profile & Logout at Bottom */}
        <div className="p-3 border-t border-white/10 shrink-0 bg-black/10">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <Avatar className="h-8 w-8 border border-white/20">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : (user?.email || 'Administrator')}
                </p>
                <p className="text-[10px] text-blue-200/70 truncate">
                  {profile?.role || 'Super Admin'}
                </p>
              </div>
            )}

            {!collapsed && (
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
    </>
  )
}
