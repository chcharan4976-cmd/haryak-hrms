'use client'

import { OrganizationChatWindow } from '@/components/chat/chat-window'

export default function EmployeePortalMessagesPage() {
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="border-b pb-3">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Organization Chat</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect with team members, view company announcements, and coordinate internally.
        </p>
      </div>
      <OrganizationChatWindow />
    </div>
  )
}
