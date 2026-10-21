'use client'

import { OrganizationChatWindow } from '@/components/chat/chat-window'

export default function EmployeeMessagesPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <OrganizationChatWindow />
    </div>
  )
}
