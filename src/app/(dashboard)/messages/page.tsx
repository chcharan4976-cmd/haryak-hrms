'use client'

import { PageHeader } from '@/components/shared/page-header'
import { OrganizationChatWindow } from '@/components/chat/chat-window'

export default function AdminMessagesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Organization Messaging"
        description="Encrypted internal communication, team coordination, and company announcements."
      />
      <OrganizationChatWindow />
    </div>
  )
}
