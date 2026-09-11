import { createAdminClient } from '@/lib/supabase/admin'

export interface SafeDirectoryCard {
  id: string
  employeeCode: string
  fullName: string
  officialEmail: string
  department: string
  designation: string
  avatarUrl?: string | null
}

export interface ChatParticipant {
  userId: string
  employeeId?: string
  name: string
  role?: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderUserId: string
  senderEmployeeId?: string
  senderName: string
  content: string
  attachments?: { name: string; url: string; size?: number; type?: string }[]
  isAiMessage?: boolean
  createdAt: string
}

export interface ChatConversation {
  id: string
  companyId: string
  type: 'direct' | 'group' | 'channel'
  title: string
  departmentId?: string | null
  participants: ChatParticipant[]
  lastMessage?: {
    content: string
    senderName: string
    createdAt: string
  } | null
  createdAt: string
  updatedAt: string
}

import { searchCompanyDirectory } from '@/lib/services/employee-directory-service'

/**
 * Perform safe directory search for employee cards.
 * Searches employees by employee_code, full_name, and official_email.
 * STRICT SECURITY INVARIANT: NEVER returns salary, ctc, bank details, PAN, UAN, or personal address.
 */
export async function searchSafeDirectory(
  companyId: string,
  query: string,
  options?: { excludeEmployeeId?: string; currentEmployeeId?: string }
): Promise<SafeDirectoryCard[]> {
  const list = await searchCompanyDirectory(companyId, {
    query,
    excludeEmployeeId: options?.excludeEmployeeId,
    currentEmployeeId: options?.currentEmployeeId,
  })

  return list.map(c => ({
    id: c.employeeId,
    employeeCode: c.employeeCode,
    fullName: c.fullName,
    officialEmail: c.officialEmail,
    department: c.department,
    designation: c.designation,
    avatarUrl: c.avatarUrl,
  }))
}

/**
 * Fetch all conversations for a user
 */
export async function getUserConversations(
  companyId: string,
  userId: string,
  employeeId?: string
): Promise<ChatConversation[]> {
  const supabase = createAdminClient()
  if (!supabase) return []

  // Ensure default company announcement channel exists
  await ensureCompanyBroadcastChannel(companyId)

  const { data, error } = await supabase
    .from('company_settings')
    .select('setting_key, setting_value')
    .eq('company_id', companyId)
    .eq('category', 'chat_conversation')

  if (error || !data) return []

  const conversations: ChatConversation[] = []

  for (const row of data) {
    try {
      const conv: ChatConversation = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value
      if (!conv || !conv.id) continue

      // Company channel is open to all company members
      if (conv.type === 'channel') {
        conversations.push(conv)
        continue
      }

      // Check if user or employee is participant
      const isParticipant = conv.participants?.some(
        p => p.userId === userId || (employeeId && p.employeeId === employeeId)
      )

      if (isParticipant) {
        conversations.push(conv)
      }
    } catch {}
  }

  // Sort by updatedAt descending
  return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * Create or retrieve existing direct 1-to-1 conversation or new group conversation
 */
export async function createOrGetConversation(
  companyId: string,
  creator: { userId: string; employeeId?: string; name: string },
  recipientEmployeeId: string,
  options?: { type?: 'direct' | 'group' | 'channel'; title?: string }
): Promise<ChatConversation> {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  const type = options?.type || 'direct'

  // Fetch recipient employee
  const { data: recipientEmp } = await supabase
    .from('employees')
    .select('id, employee_code, full_name, user_id')
    .eq('company_id', companyId)
    .eq('id', recipientEmployeeId)
    .maybeSingle()

  if (!recipientEmp && type === 'direct') {
    throw new Error('Recipient employee not found')
  }

  const recipientParticipant: ChatParticipant = {
    userId: recipientEmp?.user_id || recipientEmployeeId,
    employeeId: recipientEmp?.id || recipientEmployeeId,
    name: recipientEmp?.full_name || 'Colleague',
  }

  const creatorParticipant: ChatParticipant = {
    userId: creator.userId,
    employeeId: creator.employeeId,
    name: creator.name,
  }

  // For 1-to-1 direct chats, check if conversation already exists
  if (type === 'direct') {
    const existingList = await getUserConversations(companyId, creator.userId, creator.employeeId)
    const existing = existingList.find(c =>
      c.type === 'direct' &&
      c.participants.some(p => p.employeeId === recipientEmp?.id || p.userId === recipientEmp?.user_id) &&
      c.participants.some(p => p.employeeId === creator.employeeId || p.userId === creator.userId)
    )

    if (existing) {
      return existing
    }
  }

  const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  const now = new Date().toISOString()
  const title = options?.title || (type === 'direct' ? recipientParticipant.name : 'Group Chat')

  const newConv: ChatConversation = {
    id: convId,
    companyId,
    type,
    title,
    participants: [creatorParticipant, recipientParticipant],
    lastMessage: null,
    createdAt: now,
    updatedAt: now,
  }

  await supabase
    .from('company_settings')
    .insert({
      company_id: companyId,
      category: 'chat_conversation',
      setting_key: `chat_conv_${convId}`,
      setting_value: newConv,
    })

  return newConv
}

/**
 * Ensure default company-wide announcement channel exists
 */
async function ensureCompanyBroadcastChannel(companyId: string): Promise<void> {
  const supabase = createAdminClient()
  if (!supabase) return

  const defaultKey = 'chat_conv_company_announcements'
  const { data } = await supabase
    .from('company_settings')
    .select('setting_key')
    .eq('company_id', companyId)
    .eq('setting_key', defaultKey)
    .maybeSingle()

  if (!data) {
    const now = new Date().toISOString()
    const broadcastConv: ChatConversation = {
      id: 'company_announcements',
      companyId,
      type: 'channel',
      title: 'Company Announcements',
      participants: [],
      lastMessage: {
        content: 'Welcome to Haryak Technologies internal organization chat.',
        senderName: 'Haryak HR Team',
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    }

    await supabase.from('company_settings').insert({
      company_id: companyId,
      category: 'chat_conversation',
      setting_key: defaultKey,
      setting_value: broadcastConv,
    })

    // Seed welcome message
    const welcomeMsg: ChatMessage = {
      id: `msg_welcome_${Date.now()}`,
      conversationId: 'company_announcements',
      senderUserId: 'system',
      senderName: 'Haryak HR Team',
      content: 'Welcome to Haryak Technologies internal organization chat. Stay connected with your team and colleagues across departments.',
      createdAt: now,
    }

    await supabase.from('company_settings').insert({
      company_id: companyId,
      category: 'chat_message',
      setting_key: `chat_msg_${welcomeMsg.id}`,
      setting_value: welcomeMsg,
    })
  }
}

/**
 * Get messages for a conversation with strict participant-only authorization
 */
export async function getConversationMessages(
  companyId: string,
  conversationId: string,
  userId: string,
  employeeId?: string
): Promise<ChatMessage[]> {
  const supabase = createAdminClient()
  if (!supabase) return []

  // Check conversation authorization
  const { data: convRow, error: convErr } = await supabase
    .from('company_settings')
    .select('setting_value')
    .eq('company_id', companyId)
    .eq('setting_key', `chat_conv_${conversationId}`)
    .maybeSingle()

  if (convErr || !convRow) {
    throw new Error('Conversation not found')
  }

  const conv: ChatConversation = typeof convRow.setting_value === 'string'
    ? JSON.parse(convRow.setting_value)
    : convRow.setting_value

  if (conv.type !== 'channel') {
    const isParticipant = conv.participants?.some(
      p => p.userId === userId || (employeeId && p.employeeId === employeeId)
    )
    if (!isParticipant) {
      const err: any = new Error('Forbidden: You are not a participant in this conversation.')
      err.status = 403
      throw err
    }
  }

  // Fetch messages
  const { data: msgRows, error: msgErr } = await supabase
    .from('company_settings')
    .select('setting_value')
    .eq('company_id', companyId)
    .eq('category', 'chat_message')

  if (msgErr || !msgRows) return []

  const messages: ChatMessage[] = []
  for (const r of msgRows) {
    try {
      const msg: ChatMessage = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value
      if (msg && msg.conversationId === conversationId) {
        messages.push(msg)
      }
    } catch {}
  }

  return messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

/**
 * Send a message in a conversation
 */
export async function sendChatMessage(
  companyId: string,
  conversationId: string,
  sender: { userId: string; employeeId?: string; name: string },
  content: string,
  attachments?: { name: string; url: string; size?: number; type?: string }[]
): Promise<ChatMessage> {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  if (!content.trim() && (!attachments || attachments.length === 0)) {
    throw new Error('Message content or attachment is required')
  }

  // Verify conversation and authorization
  const { data: convRow, error: convErr } = await supabase
    .from('company_settings')
    .select('setting_value')
    .eq('company_id', companyId)
    .eq('setting_key', `chat_conv_${conversationId}`)
    .maybeSingle()

  if (convErr || !convRow) {
    throw new Error('Conversation not found')
  }

  const conv: ChatConversation = typeof convRow.setting_value === 'string'
    ? JSON.parse(convRow.setting_value)
    : convRow.setting_value

  if (conv.type !== 'channel') {
    const isParticipant = conv.participants?.some(
      p => p.userId === sender.userId || (sender.employeeId && p.employeeId === sender.employeeId)
    )
    if (!isParticipant) {
      const err: any = new Error('Forbidden: You are not a participant in this conversation.')
      err.status = 403
      throw err
    }
  }

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  const now = new Date().toISOString()

  const message: ChatMessage = {
    id: msgId,
    conversationId,
    senderUserId: sender.userId,
    senderEmployeeId: sender.employeeId,
    senderName: sender.name,
    content: content.trim(),
    attachments: attachments || [],
    createdAt: now,
  }

  // Insert message
  await supabase
    .from('company_settings')
    .insert({
      company_id: companyId,
      category: 'chat_message',
      setting_key: `chat_msg_${msgId}`,
      setting_value: message,
    })

  // Update conversation lastMessage & updatedAt
  conv.lastMessage = {
    content: message.content,
    senderName: message.senderName,
    createdAt: now,
  }
  conv.updatedAt = now

  await supabase
    .from('company_settings')
    .update({
      setting_value: conv,
      updated_at: now,
    })
    .eq('company_id', companyId)
    .eq('setting_key', `chat_conv_${conversationId}`)

  return message
}
