'use client';

import { Bell, Check, Clock, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NOTIFICATIONS = [
  { id: '1', title: 'Leave Request Approved', msg: 'Your Casual Leave request for Aug 25-26 has been approved by your manager.', time: '2 hours ago', read: false, type: 'leave', icon: Calendar },
  { id: '2', title: 'Payslip Generated', msg: 'Your payslip for July 2026 is now available to download.', time: '1 day ago', read: false, type: 'payroll', icon: FileText },
  { id: '3', title: 'New Announcement', msg: 'Please review the updated company leave policy.', time: '3 days ago', read: true, type: 'system', icon: Bell },
  { id: '4', title: 'Pending Approval', msg: 'You have 3 pending leave requests to approve.', time: '1 week ago', read: true, type: 'action', icon: CheckCircle2 },
];

export default function NotificationsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">Stay updated with system alerts and actions</p>
        </div>
        <div>
          <button className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm">
            <Check className="w-4 h-4 mr-2" /> Mark all as read
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {NOTIFICATIONS.map((notif) => {
            const Icon = notif.icon;
            return (
              <li key={notif.id} className={cn("p-4 hover:bg-gray-50 transition-colors cursor-pointer", !notif.read ? "bg-blue-50/50" : "")}>
                <div className="flex space-x-4">
                  <div className={cn("flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center", 
                    !notif.read ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", !notif.read ? "text-gray-900" : "text-gray-700")}>
                      {notif.title}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{notif.msg}</p>
                    <div className="flex items-center mt-2">
                      <Clock className="w-3.5 h-3.5 text-gray-400 mr-1" />
                      <span className="text-xs text-gray-400">{notif.time}</span>
                    </div>
                  </div>
                  {!notif.read && (
                    <div className="flex-shrink-0 flex items-center">
                      <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
