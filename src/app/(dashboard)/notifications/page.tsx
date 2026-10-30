'use client';

import { Bell, Check, Clock, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const NOTIFICATIONS = [
  { id: '1', title: 'Leave Request Approved', msg: 'Your Casual Leave request for Aug 25-26 has been approved by your manager.', time: '2 hours ago', read: false, type: 'leave', icon: Calendar },
  { id: '2', title: 'Payslip Generated', msg: 'Your payslip for July 2026 is now available to download.', time: '1 day ago', read: false, type: 'payroll', icon: FileText },
  { id: '3', title: 'New Announcement', msg: 'Please review the updated company leave policy.', time: '3 days ago', read: true, type: 'system', icon: Bell },
  { id: '4', title: 'Pending Approval', msg: 'You have 3 pending leave requests to approve.', time: '1 week ago', read: true, type: 'action', icon: CheckCircle2 },
];

export default function NotificationsPage() {
  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      <PageHeader
        title="Notifications"
        description="Stay updated with organizational alerts, requests, and system actions."
      >
        <Button variant="outline" size="sm" className="h-9 w-full sm:w-auto text-xs">
          <Check className="w-3.5 h-3.5 mr-1.5" /> Mark all as read
        </Button>
      </PageHeader>

      <Card className="overflow-hidden shadow-xs">
        <ul className="divide-y divide-border">
          {NOTIFICATIONS.map((notif) => {
            const Icon = notif.icon;
            return (
              <li key={notif.id} className={cn("p-3.5 sm:p-4 hover:bg-muted/30 transition-colors cursor-pointer", !notif.read ? "bg-blue-50/40 dark:bg-blue-950/20" : "")}>
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={cn("shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center", 
                    !notif.read ? "bg-[#1e2a78]/10 text-[#1e2a78] dark:bg-blue-950/40 dark:text-blue-300" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-semibold", !notif.read ? "text-foreground" : "text-muted-foreground")}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{notif.msg}</p>
                    <div className="flex items-center mt-2">
                      <Clock className="w-3 h-3 text-muted-foreground mr-1" />
                      <span className="text-[11px] text-muted-foreground">{notif.time}</span>
                    </div>
                  </div>
                  {!notif.read && (
                    <div className="shrink-0 flex items-center pt-1">
                      <span className="w-2 h-2 bg-[#1e2a78] dark:bg-blue-400 rounded-full"></span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
