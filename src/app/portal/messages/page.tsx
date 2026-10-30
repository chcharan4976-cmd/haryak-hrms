'use client'

import { OrganizationChatWindow } from '@/components/chat/chat-window'

export default function EmployeeMessagesPage() {
  return (
    <div className="flex h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-7rem)] min-h-[500px] w-full flex-1 flex-col overflow-hidden">
      <OrganizationChatWindow />
    </div>
  )
}
