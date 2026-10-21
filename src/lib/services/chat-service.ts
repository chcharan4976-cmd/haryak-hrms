import { createAdminClient } from '@/lib/supabase/admin'
import { searchCompanyDirectory } from '@/lib/services/employee-directory-service'

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

export type ChatReceiptStatus =
  | 'sent'
  | 'delivered'
  | 'read'

export interface ChatMessage {
  id: string
  conversationId: string
  senderUserId: string
  senderEmployeeId?: string
  senderName: string
  content: string

  attachments?: {
    name: string
    url: string
    size?: number
    type?: string
  }[]

  isAiMessage?: boolean

  receiptStatus?: ChatReceiptStatus
  deliveredAt?: string | null
  readAt?: string | null

  createdAt: string
}

export interface ChatConversation {
  id: string
  companyId: string

  type:
    | 'direct'
    | 'group'
    | 'channel'

  title: string

  departmentId?: string | null

  participants: ChatParticipant[]

  lastMessage?: {
    content: string
    senderName: string
    createdAt: string
  } | null

  unreadCount?: number

  createdAt: string
  updatedAt: string
}

interface ChatActor {
  userId: string
  employeeId?: string
  name: string
}

function parseJson<T>(
  value: unknown
): T | null {
  try {
    if (typeof value === 'string') {
      return JSON.parse(value) as T
    }

    if (
      value &&
      typeof value === 'object'
    ) {
      return value as T
    }

    return null
  } catch {
    return null
  }
}

function mapParticipant(
  row: any
): ChatParticipant {
  return {
    userId: String(row.user_id),

    employeeId:
      row.employee_id || undefined,

    name:
      row.display_name ||
      'Colleague',

    role:
      row.participant_role ||
      undefined,
  }
}

function mapMessage(
  row: any
): ChatMessage {
  return {
    id: String(row.id),

    conversationId:
      String(row.conversation_id),

    senderUserId:
      String(row.sender_user_id),

    senderEmployeeId:
      row.sender_employee_id ||
      undefined,

    senderName:
      row.sender_name ||
      'Unknown',

    content:
      row.content || '',

    attachments:
      Array.isArray(row.attachments)
        ? row.attachments
        : [],

    isAiMessage:
      Boolean(row.is_ai_message),

    createdAt:
      row.created_at,
  }
}

/* ============================================================
   DIRECTORY
   ============================================================ */

export async function searchSafeDirectory(
  companyId: string,
  query: string,
  options?: {
    excludeEmployeeId?: string
    currentEmployeeId?: string
  }
): Promise<SafeDirectoryCard[]> {
  const list =
    await searchCompanyDirectory(
      companyId,
      {
        query,

        excludeEmployeeId:
          options?.excludeEmployeeId,

        currentEmployeeId:
          options?.currentEmployeeId,

        includeInactive: false,
      }
    )

  return list.map(employee => ({
    id:
      employee.employeeId,

    employeeCode:
      employee.employeeCode,

    fullName:
      employee.fullName,

    officialEmail:
      employee.officialEmail,

    department:
      employee.department,

    designation:
      employee.designation,

    avatarUrl:
      employee.avatarUrl,
  }))
}

/* ============================================================
   ACTIVE EMPLOYEE VALIDATION
   ============================================================ */

async function getActiveEmployeeIds(
  companyId: string
): Promise<Set<string>> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    return new Set()
  }

  const {
    data,
    error,
  } = await supabase
    .from('employees')
    .select('id')
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'is_active',
      true
    )
    .in(
      'employment_status',
      [
        'active',
        'probation',
      ]
    )

  if (error) {
    console.error(
      '[ChatService] Active employee validation failed:',
      error.message
    )

    return new Set()
  }

  return new Set(
    (data || []).map(
      (row: any) =>
        String(row.id)
    )
  )
}

function conversationHasValidEmployees(
  conversation: ChatConversation,
  activeEmployeeIds: Set<string>
): boolean {
  if (
    conversation.type ===
    'channel'
  ) {
    return true
  }

  if (
    !conversation.participants?.length
  ) {
    return false
  }

  return conversation.participants.every(
    participant =>
      !participant.employeeId ||
      activeEmployeeIds.has(
        participant.employeeId
      )
  )
}

/* ============================================================
   LEGACY MIGRATION

   Existing company_settings records are copied into the new
   dedicated chat tables.

   The legacy records are NOT deleted.

   This makes migration:
   - repeatable
   - non-destructive
   - backwards safe
   ============================================================ */

export async function migrateLegacyChatData(
  companyId: string
): Promise<void> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    return
  }

  /* ----------------------------
     CONVERSATIONS
     ---------------------------- */

  const {
    data: conversationRows,
    error: conversationError,
  } = await supabase
    .from('company_settings')
    .select(
      'setting_value'
    )
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'category',
      'chat_conversation'
    )

  if (conversationError) {
    console.error(
      '[ChatService] Legacy conversation scan failed:',
      conversationError.message
    )

    return
  }

  for (
    const row of
    conversationRows || []
  ) {
    const conversation =
      parseJson<ChatConversation>(
        row.setting_value
      )

    if (
      !conversation?.id
    ) {
      continue
    }

    const {
      error: insertError,
    } = await supabase
      .from(
        'chat_conversations'
      )
      .upsert(
        {
          id:
            conversation.id,

          company_id:
            companyId,

          type:
            conversation.type,

          title:
            conversation.title ||
            'Conversation',

          department_id:
            conversation.departmentId ||
            null,

          created_by:
            null,

          created_at:
            conversation.createdAt ||
            new Date().toISOString(),

          updated_at:
            conversation.updatedAt ||
            conversation.createdAt ||
            new Date().toISOString(),
        },
        {
          onConflict: 'id',
          ignoreDuplicates: true,
        }
      )

    if (insertError) {
      console.error(
        '[ChatService] Legacy conversation migration failed:',
        insertError.message
      )

      continue
    }

    for (
      const participant of
      conversation.participants ||
      []
    ) {
      if (
        !participant.userId
      ) {
        continue
      }

      const {
        error:
          participantError,
      } = await supabase
        .from(
          'chat_participants'
        )
        .upsert(
          {
            conversation_id:
              conversation.id,

            company_id:
              companyId,

            user_id:
              participant.userId,

            employee_id:
              participant.employeeId ||
              null,

            display_name:
              participant.name ||
              'Colleague',

            participant_role:
              participant.role ||
              null,

            joined_at:
              conversation.createdAt ||
              new Date().toISOString(),

            left_at:
              null,
          },
          {
            onConflict:
              'conversation_id,user_id',

            ignoreDuplicates:
              true,
          }
        )

      if (
        participantError
      ) {
        console.error(
          '[ChatService] Legacy participant migration failed:',
          participantError.message
        )
      }
    }
  }

  /* ----------------------------
     MESSAGES
     ---------------------------- */

  const {
    data: messageRows,
    error: messageError,
  } = await supabase
    .from('company_settings')
    .select(
      'setting_value'
    )
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'category',
      'chat_message'
    )

  if (messageError) {
    console.error(
      '[ChatService] Legacy message scan failed:',
      messageError.message
    )

    return
  }

  for (
    const row of
    messageRows || []
  ) {
    const message =
      parseJson<ChatMessage>(
        row.setting_value
      )

    if (
      !message?.id ||
      !message.conversationId
    ) {
      continue
    }

    const {
      error: insertError,
    } = await supabase
      .from(
        'chat_messages'
      )
      .upsert(
        {
          id:
            message.id,

          company_id:
            companyId,

          conversation_id:
            message.conversationId,

          sender_user_id:
            message.senderUserId,

          sender_employee_id:
            message.senderEmployeeId ||
            null,

          sender_name:
            message.senderName ||
            'Unknown',

          content:
            message.content ||
            '',

          attachments:
            message.attachments ||
            [],

          is_ai_message:
            Boolean(
              message.isAiMessage
            ),

          created_at:
            message.createdAt ||
            new Date().toISOString(),
        },
        {
          onConflict: 'id',
          ignoreDuplicates: true,
        }
      )

    if (insertError) {
      console.error(
        '[ChatService] Legacy message migration failed:',
        insertError.message
      )
    }
  }
}

/* ============================================================
   COMPANY ANNOUNCEMENT CHANNEL
   ============================================================ */

async function ensureCompanyBroadcastChannel(
  companyId: string
): Promise<void> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    return
  }

  const {
    data,
  } = await supabase
    .from(
      'chat_conversations'
    )
    .select('id')
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'id',
      'company_announcements'
    )
    .maybeSingle()

  if (data) {
    return
  }

  const now =
    new Date().toISOString()

  const {
    error:
      conversationError,
  } = await supabase
    .from(
      'chat_conversations'
    )
    .insert({
      id:
        'company_announcements',

      company_id:
        companyId,

      type:
        'channel',

      title:
        'Company Announcements',

      created_by:
        null,

      created_at:
        now,

      updated_at:
        now,
    })

  if (
    conversationError
  ) {
    console.error(
      '[ChatService] Announcement channel creation failed:',
      conversationError.message
    )

    return
  }

  const {
    error:
      messageError,
  } = await supabase
    .from(
      'chat_messages'
    )
    .insert({
      id:
        `msg_welcome_${Date.now()}`,

      company_id:
        companyId,

      conversation_id:
        'company_announcements',

      sender_user_id:
        'system',

      sender_employee_id:
        null,

      sender_name:
        'Haryak HR Team',

      content:
        'Welcome to Haryak Technologies internal organization chat. Stay connected with your team and colleagues across departments.',

      attachments:
        [],

      is_ai_message:
        false,

      created_at:
        now,
    })

  if (messageError) {
    console.error(
      '[ChatService] Announcement welcome message failed:',
      messageError.message
    )
  }
}

/* ============================================================
   CONVERSATION ACCESS
   ============================================================ */

async function assertConversationAccess(
  companyId: string,
  conversationId: string,
  userId: string,
  employeeId?: string
): Promise<ChatConversation> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    throw new Error(
      'Database unavailable'
    )
  }

  await migrateLegacyChatData(
    companyId
  )

  const {
    data: conversationRow,
    error:
      conversationError,
  } = await supabase
    .from(
      'chat_conversations'
    )
    .select('*')
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'id',
      conversationId
    )
    .maybeSingle()

  if (
    conversationError ||
    !conversationRow
  ) {
    const error: any =
      new Error(
        'Conversation not found'
      )

    error.status = 404

    throw error
  }

  const {
    data:
      participantRows,
    error:
      participantError,
  } = await supabase
    .from(
      'chat_participants'
    )
    .select('*')
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'conversation_id',
      conversationId
    )
    .is(
      'left_at',
      null
    )

  if (
    participantError
  ) {
    throw new Error(
      participantError.message
    )
  }

  const conversation:
    ChatConversation = {
    id:
      String(
        conversationRow.id
      ),

    companyId:
      String(
        conversationRow.company_id
      ),

    type:
      conversationRow.type,

    title:
      conversationRow.title,

    departmentId:
      conversationRow.department_id,

    participants:
      (
        participantRows ||
        []
      ).map(
        mapParticipant
      ),

    createdAt:
      conversationRow.created_at,

    updatedAt:
      conversationRow.updated_at,
  }

  if (
    conversation.type !==
    'channel'
  ) {
    const isParticipant =
      conversation.participants.some(
        participant =>
          participant.userId ===
            userId ||
          Boolean(
            employeeId &&
            participant.employeeId ===
              employeeId
          )
      )

    if (
      !isParticipant
    ) {
      const error: any =
        new Error(
          'Forbidden: You are not a participant in this conversation.'
        )

      error.status = 403

      throw error
    }

    const activeEmployeeIds =
      await getActiveEmployeeIds(
        companyId
      )

    if (
      !conversationHasValidEmployees(
        conversation,
        activeEmployeeIds
      )
    ) {
      const error: any =
        new Error(
          'This conversation is no longer active because one or more employee participants are no longer part of the active workforce.'
        )

      error.status = 410

      throw error
    }
  }

  return conversation
}

/* ============================================================
   GET CONVERSATIONS
   ============================================================ */

export async function getUserConversations(
  companyId: string,
  userId: string,
  employeeId?: string
): Promise<ChatConversation[]> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    return []
  }

  await migrateLegacyChatData(
    companyId
  )

  await ensureCompanyBroadcastChannel(
    companyId
  )

  const {
    data: rows,
    error,
  } = await supabase
    .from(
      'chat_conversations'
    )
    .select('*')
    .eq(
      'company_id',
      companyId
    )
    .order(
      'updated_at',
      {
        ascending: false,
      }
    )

  if (error) {
    console.error(
      '[ChatService] Unable to load conversations:',
      error.message
    )

    return []
  }

  const activeEmployeeIds =
    await getActiveEmployeeIds(
      companyId
    )

  const result:
    ChatConversation[] = []

  for (
    const row of
    rows || []
  ) {
    const {
      data:
        participantRows,
    } = await supabase
      .from(
        'chat_participants'
      )
      .select('*')
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'conversation_id',
        row.id
      )
      .is(
        'left_at',
        null
      )

    const participants =
      (
        participantRows ||
        []
      ).map(
        mapParticipant
      )

    if (
      row.type !==
      'channel'
    ) {
      const belongs =
        participants.some(
          participant =>
            participant.userId ===
              userId ||
            Boolean(
              employeeId &&
              participant.employeeId ===
                employeeId
            )
        )

      if (!belongs) {
        continue
      }

      const candidate:
        ChatConversation = {
        id:
          String(row.id),

        companyId,

        type:
          row.type,

        title:
          row.title,

        departmentId:
          row.department_id,

        participants,

        createdAt:
          row.created_at,

        updatedAt:
          row.updated_at,
      }

      if (
        !conversationHasValidEmployees(
          candidate,
          activeEmployeeIds
        )
      ) {
        continue
      }
    }

    const {
      data: lastRows,
    } = await supabase
      .from(
        'chat_messages'
      )
      .select(
        'content,sender_name,created_at'
      )
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'conversation_id',
        row.id
      )
      .is(
        'deleted_at',
        null
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(1)

    const {
      count:
        unreadCount,
    } = await supabase
      .from(
        'chat_message_receipts'
      )
      .select(
        'id',
        {
          count: 'exact',
          head: true,
        }
      )
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'conversation_id',
        row.id
      )
      .eq(
        'user_id',
        userId
      )
      .is(
        'read_at',
        null
      )

    const last =
      lastRows?.[0]

    result.push({
      id:
        String(row.id),

      companyId,

      type:
        row.type,

      title:
        row.title,

      departmentId:
        row.department_id,

      participants,

      lastMessage:
        last
          ? {
              content:
                last.content ||
                '',

              senderName:
                last.sender_name ||
                'Unknown',

              createdAt:
                last.created_at,
            }
          : null,

      unreadCount:
        unreadCount || 0,

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,
    })
  }

  return result
}

/* ============================================================
   CREATE DIRECT CONVERSATION
   ============================================================ */

export async function createOrGetConversation(
  companyId: string,
  creator: ChatActor,
  recipientEmployeeId: string,
  options?: {
    type?:
      | 'direct'
      | 'group'
      | 'channel'

    title?: string
  }
): Promise<ChatConversation> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    throw new Error(
      'Database unavailable'
    )
  }

  await migrateLegacyChatData(
    companyId
  )

  const type =
    options?.type ||
    'direct'

  const {
    data: recipient,
    error:
      recipientError,
  } = await supabase
    .from('employees')
    .select(`
      id,
      employee_code,
      full_name,
      user_id,
      is_active,
      employment_status
    `)
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'id',
      recipientEmployeeId
    )
    .eq(
      'is_active',
      true
    )
    .in(
      'employment_status',
      [
        'active',
        'probation',
      ]
    )
    .maybeSingle()

  if (
    recipientError
  ) {
    throw new Error(
      `Unable to validate recipient: ${recipientError.message}`
    )
  }

  if (
    type === 'direct' &&
    !recipient
  ) {
    throw new Error(
      'Recipient employee is not available for messaging.'
    )
  }

  if (
    type === 'direct' &&
    recipient
  ) {
    const conversations =
      await getUserConversations(
        companyId,
        creator.userId,
        creator.employeeId
      )

    const existing =
      conversations.find(
        conversation =>
          conversation.type ===
            'direct' &&

          conversation.participants.some(
            participant =>
              participant.employeeId ===
                recipient.id ||
              participant.userId ===
                recipient.user_id
          ) &&

          conversation.participants.some(
            participant =>
              participant.employeeId ===
                creator.employeeId ||
              participant.userId ===
                creator.userId
          )
      )

    if (existing) {
      return existing
    }
  }

  const conversationId =
    `conv_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`

  const now =
    new Date().toISOString()

  const title =
    options?.title ||
    (
      type === 'direct'
        ? recipient?.full_name ||
          'Colleague'
        : 'Group Chat'
    )

  const {
    error:
      conversationError,
  } = await supabase
    .from(
      'chat_conversations'
    )
    .insert({
      id:
        conversationId,

      company_id:
        companyId,

      type,

      title,

      created_by:
        creator.userId,

      created_at:
        now,

      updated_at:
        now,
    })

  if (
    conversationError
  ) {
    throw new Error(
      conversationError.message
    )
  }

  const participants:
    ChatParticipant[] = [
    {
      userId:
        creator.userId,

      employeeId:
        creator.employeeId,

      name:
        creator.name,
    },
  ]

  if (recipient) {
    participants.push({
      userId:
        recipient.user_id ||
        recipient.id,

      employeeId:
        recipient.id,

      name:
        recipient.full_name ||
        'Colleague',
    })
  }

  const {
    error:
      participantError,
  } = await supabase
    .from(
      'chat_participants'
    )
    .insert(
      participants.map(
        participant => ({
          conversation_id:
            conversationId,

          company_id:
            companyId,

          user_id:
            participant.userId,

          employee_id:
            participant.employeeId ||
            null,

          display_name:
            participant.name,

          participant_role:
            participant.role ||
            null,

          joined_at:
            now,
        })
      )
    )

  if (
    participantError
  ) {
    await supabase
      .from(
        'chat_conversations'
      )
      .delete()
      .eq(
        'id',
        conversationId
      )

    throw new Error(
      participantError.message
    )
  }

  return {
    id:
      conversationId,

    companyId,

    type,

    title,

    participants,

    lastMessage:
      null,

    unreadCount:
      0,

    createdAt:
      now,

    updatedAt:
      now,
  }
}

/* ============================================================
   GET MESSAGES + RECEIPT STATUS
   ============================================================ */

export async function getConversationMessages(
  companyId: string,
  conversationId: string,
  userId: string,
  employeeId?: string
): Promise<ChatMessage[]> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    return []
  }

  await assertConversationAccess(
    companyId,
    conversationId,
    userId,
    employeeId
  )

  const {
    data: rows,
    error,
  } = await supabase
    .from(
      'chat_messages'
    )
    .select('*')
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'conversation_id',
      conversationId
    )
    .is(
      'deleted_at',
      null
    )
    .order(
      'created_at',
      {
        ascending: true,
      }
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  const messages =
    (
      rows ||
      []
    ).map(
      mapMessage
    )

  for (
    const message of
    messages
  ) {
    if (
      message.senderUserId !==
      userId
    ) {
      continue
    }

    const {
      data: receipts,
    } = await supabase
      .from(
        'chat_message_receipts'
      )
      .select(
        'delivered_at,read_at'
      )
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'message_id',
        message.id
      )
      .neq(
        'user_id',
        userId
      )

    const receiptRows =
      receipts || []

    if (
      receiptRows.length ===
      0
    ) {
      message.receiptStatus =
        'sent'

      continue
    }

    const allRead =
      receiptRows.every(
        receipt =>
          Boolean(
            receipt.read_at
          )
      )

    const allDelivered =
      receiptRows.every(
        receipt =>
          Boolean(
            receipt.delivered_at
          )
      )

    message.receiptStatus =
      allRead
        ? 'read'
        : allDelivered
          ? 'delivered'
          : 'sent'

    const deliveredTimes =
      receiptRows
        .map(
          receipt =>
            receipt.delivered_at
        )
        .filter(Boolean)
        .sort()

    const readTimes =
      receiptRows
        .map(
          receipt =>
            receipt.read_at
        )
        .filter(Boolean)
        .sort()

    message.deliveredAt =
      deliveredTimes[
        deliveredTimes.length -
          1
      ] || null

    message.readAt =
      readTimes[
        readTimes.length -
          1
      ] || null
  }

  return messages
}

/* ============================================================
   SEND MESSAGE
   ============================================================ */

export async function sendChatMessage(
  companyId: string,
  conversationId: string,
  sender: ChatActor,
  content: string,
  attachments?: {
    name: string
    url: string
    size?: number
    type?: string
  }[]
): Promise<ChatMessage> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    throw new Error(
      'Database unavailable'
    )
  }

  if (
    !content.trim() &&
    !attachments?.length
  ) {
    throw new Error(
      'Message content or attachment is required'
    )
  }

  const conversation =
    await assertConversationAccess(
      companyId,
      conversationId,
      sender.userId,
      sender.employeeId
    )

  const messageId =
    `msg_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`

  const now =
    new Date().toISOString()

  const {
    error:
      messageError,
  } = await supabase
    .from(
      'chat_messages'
    )
    .insert({
      id:
        messageId,

      company_id:
        companyId,

      conversation_id:
        conversationId,

      sender_user_id:
        sender.userId,

      sender_employee_id:
        sender.employeeId ||
        null,

      sender_name:
        sender.name,

      content:
        content.trim(),

      attachments:
        attachments ||
        [],

      is_ai_message:
        false,

      created_at:
        now,
    })

  if (messageError) {
    throw new Error(
      `Unable to send message: ${messageError.message}`
    )
  }

  /*
   * Receipt rows are created only for recipients.
   *
   * Sender never receives a receipt row for their own message.
   */
  if (
    conversation.type !==
    'channel'
  ) {
    const recipients =
      conversation.participants.filter(
        participant =>
          participant.userId !==
          sender.userId
      )

    if (
      recipients.length >
      0
    ) {
      const {
        error:
          receiptError,
      } = await supabase
        .from(
          'chat_message_receipts'
        )
        .insert(
          recipients.map(
            recipient => ({
              message_id:
                messageId,

              conversation_id:
                conversationId,

              company_id:
                companyId,

              user_id:
                recipient.userId,

              delivered_at:
                null,

              read_at:
                null,

              created_at:
                now,

              updated_at:
                now,
            })
          )
        )

      if (
        receiptError
      ) {
        console.error(
          '[ChatService] Receipt creation failed:',
          receiptError.message
        )
      }
    }
  }

  const {
    error:
      conversationUpdateError,
  } = await supabase
    .from(
      'chat_conversations'
    )
    .update({
      updated_at:
        now,
    })
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'id',
      conversationId
    )

  if (
    conversationUpdateError
  ) {
    console.error(
      '[ChatService] Conversation timestamp update failed:',
      conversationUpdateError.message
    )
  }

  return {
    id:
      messageId,

    conversationId,

    senderUserId:
      sender.userId,

    senderEmployeeId:
      sender.employeeId,

    senderName:
      sender.name,

    content:
      content.trim(),

    attachments:
      attachments ||
      [],

    receiptStatus:
      'sent',

    createdAt:
      now,
  }
}

/* ============================================================
   DELIVERY / READ ACKNOWLEDGEMENT
   ============================================================ */

export async function acknowledgeConversationMessages(
  companyId: string,
  conversationId: string,
  userId: string,
  employeeId: string | undefined,
  mode:
    | 'delivered'
    | 'read'
): Promise<void> {
  const supabase =
    createAdminClient()

  if (!supabase) {
    throw new Error(
      'Database unavailable'
    )
  }

  await assertConversationAccess(
    companyId,
    conversationId,
    userId,
    employeeId
  )

  const now =
    new Date().toISOString()

  const {
    data: receipts,
    error,
  } = await supabase
    .from(
      'chat_message_receipts'
    )
    .select(
      'id,delivered_at,read_at'
    )
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'conversation_id',
      conversationId
    )
    .eq(
      'user_id',
      userId
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  const pending =
    (
      receipts ||
      []
    ).filter(
      receipt =>
        mode === 'read'
          ? !receipt.read_at
          : !receipt.delivered_at
    )

  for (
    const receipt of
    pending
  ) {
    const update =
      mode === 'read'
        ? {
            delivered_at:
              receipt.delivered_at ||
              now,

            read_at:
              now,

            updated_at:
              now,
          }
        : {
            delivered_at:
              now,

            updated_at:
              now,
          }

    const {
      error:
        updateError,
    } = await supabase
      .from(
        'chat_message_receipts'
      )
      .update(update)
      .eq(
        'id',
        receipt.id
      )
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'user_id',
        userId
      )

    if (
      updateError
    ) {
      throw new Error(
        updateError.message
      )
    }
  }
}