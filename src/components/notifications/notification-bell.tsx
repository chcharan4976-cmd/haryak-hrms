'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Check,
  Calendar,
  FileText,
  FileCheck,
  Clock,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface NotificationItem {
  id: string
  company_id: string
  user_id: string
  title: string
  message: string | null
  type: string
  reference_type: string | null
  reference_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

interface NotificationBellProps {
  portal?: boolean
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  const minutes = Math.floor(diffInSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function getNotificationIcon(type: string) {
  const lower = (type || '').toLowerCase()
  if (lower.includes('leave')) return Calendar
  if (lower.includes('payslip') || lower.includes('payroll') || lower.includes('salary')) return FileText
  if (lower.includes('doc')) return FileCheck
  if (lower.includes('timesheet') || lower.includes('attendance')) return Clock
  if (lower.includes('alert') || lower.includes('warning') || lower.includes('error')) return AlertTriangle
  if (lower.includes('chat') || lower.includes('message')) return MessageSquare
  return Bell
}

export function NotificationBell({ portal = false }: NotificationBellProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications)
        setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0)
      }
    } catch {
      // Background poll failure handled silently
    }
  }, [])

  useEffect(() => {
    void fetchNotifications()
    const interval = setInterval(() => {
      void fetchNotifications()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      setLoading(true)
      fetchNotifications().finally(() => setLoading(false))
    }
  }

  const markAsRead = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      // Optimistic update
      setNotifications(prev =>
        prev.map(n => (n.id === notification.id ? { ...n, is_read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))

      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notification.id }),
        })
      } catch {
        // Silently tolerate network glitch
      }
    }

    setOpen(false)

    // Route based on portal vs admin context and notification type
    const lowerType = (notification.type || '').toLowerCase()
    const lowerRef = (notification.reference_type || '').toLowerCase()

    if (portal) {
      if (lowerType.includes('leave') || lowerRef.includes('leave')) {
        router.push('/portal/my-leaves')
      } else if (lowerType.includes('payslip') || lowerType.includes('salary') || lowerRef.includes('payslip')) {
        router.push('/portal/my-payslips')
      } else if (lowerType.includes('doc') || lowerRef.includes('doc')) {
        router.push('/portal/my-documents')
      } else if (lowerType.includes('timesheet') || lowerRef.includes('timesheet')) {
        router.push('/portal/timesheet')
      } else if (lowerType.includes('attendance')) {
        router.push('/portal/my-attendance')
      } else {
        router.push('/portal/home')
      }
    } else {
      if (lowerType.includes('leave') || lowerRef.includes('leave')) {
        router.push('/leave')
      } else if (lowerType.includes('payslip') || lowerType.includes('salary') || lowerType.includes('payroll')) {
        router.push('/payroll')
      } else if (lowerType.includes('doc') || lowerRef.includes('doc')) {
        router.push('/documents')
      } else if (lowerType.includes('timesheet') || lowerRef.includes('timesheet')) {
        router.push('/timesheets')
      } else if (lowerType.includes('employee')) {
        router.push('/employees')
      } else {
        router.push('/notifications')
      }
    }
  }

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return
    setMarkingAll(true)

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)

    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('All notifications marked as read')
      }
    } catch {
      toast.error('Failed to mark all as read')
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0 text-foreground hover:bg-muted"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-xs',
                'bg-red-600 dark:bg-red-500 animate-in zoom-in-75'
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(380px,calc(100vw-32px))] p-0 shadow-lg border rounded-xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-bold">
                {unreadCount} unread
              </Badge>
            )}
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {markingAll ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[360px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-[#1e2a78] mb-2" />
              <p className="text-xs">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-2">
                <Bell className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-foreground">No notifications yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                You will receive alerts here when requests or records update.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map(item => {
                const Icon = getNotificationIcon(item.type)
                return (
                  <button
                    key={item.id}
                    onClick={() => void markAsRead(item)}
                    className={cn(
                      'w-full text-left p-3 sm:p-3.5 transition-colors flex items-start gap-3 hover:bg-muted/40 cursor-pointer',
                      !item.is_read && 'bg-blue-50/60 dark:bg-blue-950/20'
                    )}
                  >
                    <div
                      className={cn(
                        'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5',
                        !item.is_read
                          ? 'bg-[#1e2a78]/10 text-[#1e2a78] dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={cn(
                            'text-xs font-semibold truncate',
                            !item.is_read ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {item.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </div>

                      {item.message && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {item.message}
                        </p>
                      )}
                    </div>

                    {!item.is_read && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-[#1e2a78] dark:bg-blue-400 mt-2" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {!portal && (
          <div className="border-t p-2 bg-muted/20 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
                router.push('/notifications')
              }}
              className="w-full text-xs h-7 text-muted-foreground hover:text-foreground justify-center gap-1"
            >
              <span>View all notifications</span>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
