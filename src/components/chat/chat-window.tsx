
'use client'

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Hash,
  Inbox,
  Loader2,
  MessageCircleMore,
  MoreVertical,
  Pencil,
  Trash2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  UserRound,
  Mail,
  BriefcaseBusiness,
  IdCard,
  Shield,
  Users,
  Clock,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'

interface ChatConversation {
  id: string
  companyId: string
  type: 'direct' | 'group' | 'channel'
  title: string
  participants: {
    userId: string
    employeeId?: string
    name: string
    role?: string
  }[]
  lastMessage?: {
    content: string
    senderName: string
    createdAt: string
  } | null
  createdAt: string
  unreadCount?: number
  updatedAt: string
}

interface ChatMessage {
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
  receiptStatus?: 'sent' | 'delivered' | 'read'
  deliveredAt?: string | null
  readAt?: string | null
  editedAt?: string | null
  createdAt: string
}

interface SafeDirectoryResult {
  id: string
  employeeCode: string
  fullName: string
  officialEmail: string
  department: string
  designation: string
  avatarUrl?: string | null
}

type LoadState = 'idle' | 'loading' | 'error'

function renderMessageContent(content: string, isMine: boolean) {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi
  const parts = content.split(urlRegex)

  return parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) {
      return <span key={`text-${index}`}>{part}</span>
    }

    return (
      <a
        key={`link-${index}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={`break-all font-medium underline decoration-1 underline-offset-2 transition-opacity hover:opacity-80 ${
          isMine
            ? 'text-primary-foreground'
            : 'text-primary'
        }`}
        onClick={event => event.stopPropagation()}
        title={part}
      >
        {part}
      </a>
    )
  })
}

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return 'HT'

  return parts
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

function formatConversationTime(value?: string): string {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) return 'Yesterday'

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
    })
  }

  return date.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
}

function formatMessageTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMessageDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()

  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return 'Today'
  }

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return 'Yesterday'
  }

  return date.toLocaleDateString([], {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function getDateKey(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function ConversationAvatar({
  conversation,
  large = false,
  displayTitle,
}: {
  conversation: ChatConversation
  large?: boolean
  displayTitle?: string
}) {
  const size = large ? 'h-11 w-11' : 'h-10 w-10'

  if (conversation.type === 'channel') {
    return (
      <div
        className={`${size} relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-sky-500/15 text-indigo-700 shadow-sm dark:text-indigo-300`}
      >
        <Building2 className={large ? 'h-5 w-5' : 'h-4 w-4'} />
        <span className="absolute inset-x-1 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
      </div>
    )
  }

  if (conversation.type === 'group') {
    return (
      <div
        className={`${size} flex shrink-0 items-center justify-center rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/15 to-blue-500/10 text-cyan-700 shadow-sm dark:text-cyan-300`}
      >
        <Users className={large ? 'h-5 w-5' : 'h-4 w-4'} />
      </div>
    )
  }

  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent text-[11px] font-bold tracking-wide text-primary shadow-sm`}
    >
      {initials(displayTitle || conversation.title)}
    </div>
  )
}

function DirectoryAvatar({
  name,
}: {
  name: string
}) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent text-xs font-bold text-primary">
      {initials(name)}
    </div>
  )
}

export function OrganizationChatWindow() {
  const { user, profile } = useAuth()
  const reduceMotion = useReducedMotion()
  const currentUserId = user?.id || ''
  const currentEmployeeId =
    (profile as { employee_id?: string; employeeId?: string } | null)?.employee_id ||
    (profile as { employee_id?: string; employeeId?: string } | null)?.employeeId ||
    ''

  const getOtherParticipant = useCallback(
    (conversation: ChatConversation) => {
      if (conversation.type !== 'direct') return null

      return (
        conversation.participants.find(
          participant =>
            participant.userId !== currentUserId &&
            (!currentEmployeeId ||
              participant.employeeId !== currentEmployeeId)
        ) ||
        conversation.participants.find(
          participant =>
            participant.userId !== currentUserId
        ) ||
        null
      )
    },
    [currentEmployeeId, currentUserId]
  )

  const getConversationDisplayTitle = useCallback(
    (conversation: ChatConversation) => {
      if (conversation.type !== 'direct') {
        return conversation.title
      }

      const other = getOtherParticipant(conversation)
      return other?.name?.trim() || conversation.title
    },
    [getOtherParticipant]
  )

  const getConversationDisplayRole = useCallback(
    (conversation: ChatConversation) => {
      if (conversation.type === 'channel') return 'Organization channel'
      if (conversation.type === 'group') {
        return `${conversation.participants.length} participants`
      }

      const other = getOtherParticipant(conversation)
      const normalized = other?.role?.replace(/_/g, ' ').trim()
      return normalized || 'Organization member'
    },
    [getOtherParticipant]
  )

  const openParticipantProfile = useCallback(
    async (conversation: ChatConversation) => {
      if (conversation.type !== 'direct') return

      const other = getOtherParticipant(conversation)
      if (!other) return

      setProfileFallbackName(other.name || 'Organization member')
      setProfileFallbackRole(
        other.role?.replace(/_/g, ' ') || 'Organization member'
      )
      setProfileCard(null)
      setProfileOpen(true)

      if (!other.employeeId) return

      setProfileLoading(true)
      try {
        const response = await fetch(
          `/api/chat/directory?query=${encodeURIComponent(other.employeeId)}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        )
        const data = await response.json()

        if (!response.ok || !data?.success) {
          return
        }

        const results = Array.isArray(data.results)
          ? (data.results as SafeDirectoryResult[])
          : []

        const exact =
          results.find(item => item.id === other.employeeId) ||
          results.find(
            item =>
              item.fullName.trim().toLowerCase() ===
              other.name.trim().toLowerCase()
          ) ||
          null

        setProfileCard(exact)
      } catch (error) {
        console.error('Unable to load chat participant profile:', error)
      } finally {
        setProfileLoading(false)
      }
    },
    [getOtherParticipant]
  )


  const [conversations, setConversations] = useState<
    ChatConversation[]
  >([])
  const [selectedConv, setSelectedConv] =
    useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const [conversationState, setConversationState] =
    useState<LoadState>('loading')
  const [messageState, setMessageState] =
    useState<LoadState>('idle')

  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationQuery, setConversationQuery] =
    useState('')
  const [showMobileThread, setShowMobileThread] =
    useState(false)

  const [isSearchOpen, setIsSearchOpen] =
    useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [directoryResults, setDirectoryResults] =
    useState<SafeDirectoryResult[]>([])
  const [searchingDir, setSearchingDir] =
    useState(false)

  const [profileOpen, setProfileOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileCard, setProfileCard] = useState<SafeDirectoryResult | null>(null)
  const [profileFallbackName, setProfileFallbackName] = useState('')
  const [profileFallbackRole, setProfileFallbackRole] = useState('')
  const [startingChatId, setStartingChatId] =
    useState<string | null>(null)

  const [editingMessageId, setEditingMessageId] =
    useState<string | null>(null)
  const [editingMessageText, setEditingMessageText] =
    useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [messageToDelete, setMessageToDelete] =
    useState<ChatMessage | null>(null)
  const [deletingMessage, setDeletingMessage] =
    useState(false)

  const [conversationMenuId, setConversationMenuId] =
    useState<string | null>(null)
  const [conversationMenuPosition, setConversationMenuPosition] =
    useState<{ top: number; left: number } | null>(null)
  const [conversationToRename, setConversationToRename] =
    useState<ChatConversation | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renamingConversation, setRenamingConversation] =
    useState(false)

  const [conversationToDelete, setConversationToDelete] =
    useState<ChatConversation | null>(null)
  const [deletingConversation, setDeletingConversation] =
    useState(false)

  const messagesViewportRef =
    useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationMenuId) return

    const closeMenu = () => {
      setConversationMenuId(null)
      setConversationMenuPosition(null)
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }

    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [conversationMenuId])

  const composerRef = useRef<HTMLInputElement>(null)
  const searchRequestRef = useRef(0)

  const fetchConversations = useCallback(
    async (options?: {
      preserveLoading?: boolean
      selectFirst?: boolean
    }) => {
      const preserveLoading =
        options?.preserveLoading ?? false
      const selectFirst =
        options?.selectFirst ?? true

      if (!preserveLoading) {
        setConversationState('loading')
      }

      try {
        const response = await fetch(
          '/api/chat/conversations',
          {
            credentials: 'include',
            cache: 'no-store',
          }
        )

        const data = await response.json()

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error ||
              'Unable to load organization conversations.'
          )
        }

        const nextConversations: ChatConversation[] =
          Array.isArray(data.conversations)
            ? data.conversations
            : []

        setConversations(nextConversations)
        setConversationState('idle')

        setSelectedConv(current => {
          if (current) {
            const refreshed = nextConversations.find(
              conversation =>
                conversation.id === current.id
            )

            if (refreshed) return refreshed
          }

          if (
            selectFirst &&
            nextConversations.length > 0
          ) {
            return nextConversations[0]
          }

          return current
        })
      } catch (error) {
        console.error(
          'Error loading conversations:',
          error
        )

        setConversationState('error')
      }
    },
    []
  )

  const acknowledgeMessages = useCallback(
    async (conversationId: string, mode: 'delivered' | 'read') => {
      try {
        await fetch('/api/chat/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ conversationId, mode }),
        })
      } catch (error) {
        console.error(`Unable to mark messages as ${mode}:`, error)
      }
    },
    []
  )

  const fetchMessages = useCallback(
    async (
      conversationId: string,
      options?: { preserveLoading?: boolean }
    ) => {
      const preserveLoading =
        options?.preserveLoading ?? false

      if (!preserveLoading) {
        setMessageState('loading')
      }

      try {
        const response = await fetch(
          `/api/chat/messages?conversationId=${encodeURIComponent(
            conversationId
          )}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        )

        const data = await response.json()

        if (
          response.status === 403
        ) {
          setMessages([])
          setMessageState('error')
          toast.error(
            'You no longer have access to this conversation.'
          )
          return
        }

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error ||
              'Unable to load chat history.'
          )
        }

        setMessages(
          Array.isArray(data.messages)
            ? data.messages
            : []
        )
        setMessageState('idle')

        // Delivery/read acknowledgement is handled by the selected-thread
        // focus effect below, not by every polling fetch.
      } catch (error) {
        console.error(
          'Error loading messages:',
          error
        )
        setMessages([])
        setMessageState('error')
      }
    },
    [acknowledgeMessages]
  )

  useEffect(() => {
    void fetchConversations()
  }, [fetchConversations])

  // Foreground thread refresh. Keep this separate from the heavier
  // conversation-list refresh so chat does not create duplicate request bursts.
  useEffect(() => {
    if (!selectedConv?.id) return

    let cancelled = false
    let inFlight = false

    const refreshOpenThread = async () => {
      if (
        cancelled ||
        inFlight ||
        document.visibilityState !== 'visible'
      ) {
        return
      }

      inFlight = true
      try {
        await fetchMessages(selectedConv.id, {
          preserveLoading: true,
        })
      } finally {
        inFlight = false
      }
    }

    const timer = window.setInterval(() => {
      void refreshOpenThread()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [fetchMessages, selectedConv?.id])

  // Conversation metadata/unread counters do not need to be reloaded with
  // every message refresh.
  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const refreshConversationList = async () => {
      if (
        cancelled ||
        inFlight ||
        document.visibilityState !== 'visible'
      ) {
        return
      }

      inFlight = true
      try {
        await fetchConversations({
          preserveLoading: true,
          selectFirst: false,
        })
      } finally {
        inFlight = false
      }
    }

    const timer = window.setInterval(() => {
      void refreshConversationList()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [fetchConversations])

  useEffect(() => {
    if (conversations.length === 0) return
    const requestedId = new URLSearchParams(window.location.search).get('conversation')
    if (!requestedId) return
    const requested = conversations.find(conversation => conversation.id === requestedId)
    if (requested && selectedConv?.id !== requested.id) {
      setSelectedConv(requested)
      setShowMobileThread(true)
    }
  }, [conversations, selectedConv?.id])

  useEffect(() => {
    if (!selectedConv?.id) return

    let acknowledging = false

    const markRead = async () => {
      if (
        acknowledging ||
        document.visibilityState !== 'visible'
      ) {
        return
      }

      acknowledging = true
      try {
        await acknowledgeMessages(
          selectedConv.id,
          'delivered'
        )
        await acknowledgeMessages(
          selectedConv.id,
          'read'
        )
      } finally {
        acknowledging = false
      }
    }

    markRead()
    document.addEventListener('visibilitychange', markRead)
    window.addEventListener('focus', markRead)
    return () => {
      document.removeEventListener('visibilitychange', markRead)
      window.removeEventListener('focus', markRead)
    }
  }, [selectedConv?.id, acknowledgeMessages])

  useEffect(() => {
    if (!selectedConv?.id) {
      setMessages([])
      setMessageState('idle')
      return
    }

    setMessages([])
    void fetchMessages(selectedConv.id)
  }, [selectedConv?.id, fetchMessages])

  useEffect(() => {
    if (messageState !== 'idle') return

    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'end',
      })
    })

    return () =>
      window.cancelAnimationFrame(frame)
  }, [
    messages,
    messageState,
    reduceMotion,
  ])

  useEffect(() => {
    if (!isSearchOpen) {
      setSearchQuery('')
      setDirectoryResults([])
      setSearchingDir(false)
      setStartingChatId(null)
      return
    }

    const timer = window.setTimeout(() => {
      void searchDirectory(searchQuery)
    }, 250)

    return () => window.clearTimeout(timer)
    // searchDirectory intentionally uses the latest query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, isSearchOpen])

  const filteredConversations = useMemo(() => {
    const query =
      conversationQuery.trim().toLowerCase()

    if (!query) return conversations

    return conversations.filter(conversation => {
      const participantNames =
        conversation.participants
          ?.map(participant => participant.name)
          .join(' ')
          .toLowerCase() || ''

      const lastMessage =
        conversation.lastMessage?.content
          ?.toLowerCase() || ''

      return (
        conversation.title
          .toLowerCase()
          .includes(query) ||
        participantNames.includes(query) ||
        lastMessage.includes(query)
      )
    })
  }, [conversations, conversationQuery])

  const selectedParticipantCount =
    selectedConv?.participants?.length ?? 0

  const handleSelectConversation = (
    conversation: ChatConversation
  ) => {
    setSelectedConv(conversation)
    setShowMobileThread(true)

    window.setTimeout(() => {
      composerRef.current?.focus()
    }, 150)
  }

  const handleSendMessage = async (
    event: FormEvent
  ) => {
    event.preventDefault()

    const content = inputText.trim()

    if (
      !content ||
      !selectedConv ||
      sending
    ) {
      return
    }

    const conversationId = selectedConv.id

    setSending(true)
    setInputText('')

    try {
      const response = await fetch(
        '/api/chat/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            conversationId,
            content,
          }),
        }
      )

      const data = await response.json()

      if (
        !response.ok ||
        !data?.success ||
        !data?.message
      ) {
        throw new Error(
          data?.error ||
            'Failed to send message.'
        )
      }

      setMessages(previous => [
        ...previous,
        data.message,
      ])

      void fetchConversations({
        preserveLoading: true,
        selectFirst: false,
      })
    } catch (error) {
      setInputText(content)

      toast.error(
        error instanceof Error
          ? error.message
          : 'Network error while sending message.'
      )
    } finally {
      setSending(false)
    }
  }

  const handleComposerKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !sending
    ) {
      event.preventDefault()

      const form =
        event.currentTarget.form

      form?.requestSubmit()
    }
  }

  const searchDirectory = async (
    query: string
  ) => {
    const requestId =
      ++searchRequestRef.current

    setSearchingDir(true)

    try {
      const response = await fetch(
        `/api/chat/directory?query=${encodeURIComponent(
          query.trim()
        )}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      const data = await response.json()

      if (
        requestId !== searchRequestRef.current
      ) {
        return
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            'Unable to search the company directory.'
        )
      }

      setDirectoryResults(
        Array.isArray(data.results)
          ? data.results
          : []
      )
    } catch (error) {
      if (
        requestId !== searchRequestRef.current
      ) {
        return
      }

      console.error(
        'Directory search error:',
        error
      )

      setDirectoryResults([])
    } finally {
      if (
        requestId === searchRequestRef.current
      ) {
        setSearchingDir(false)
      }
    }
  }

  const openNewChatWith = async (
    employee: SafeDirectoryResult
  ) => {
    if (startingChatId) return

    setStartingChatId(employee.id)

    try {
      const response = await fetch(
        '/api/chat/conversations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            recipientEmployeeId: employee.id,
            type: 'direct',
          }),
        }
      )

      const data = await response.json()

      if (
        !response.ok ||
        !data?.success ||
        !data?.conversation
      ) {
        throw new Error(
          data?.error ||
            'Could not start conversation.'
        )
      }

      setIsSearchOpen(false)
      setSelectedConv(data.conversation)
      setShowMobileThread(true)

      await fetchConversations({
        preserveLoading: true,
        selectFirst: false,
      })

      window.setTimeout(() => {
        composerRef.current?.focus()
      }, 180)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Error starting conversation.'
      )
    } finally {
      setStartingChatId(null)
    }
  }

  const beginEditMessage = (message: ChatMessage) => {
    setEditingMessageId(message.id)
    setEditingMessageText(message.content)
  }

  const cancelEditMessage = () => {
    if (savingEdit) return
    setEditingMessageId(null)
    setEditingMessageText('')
  }

  const saveEditedMessage = async () => {
    if (!editingMessageId) return
    const content = editingMessageText.trim()
    if (!content) {
      toast.error('Message cannot be empty.')
      return
    }

    setSavingEdit(true)

    try {
      const response = await fetch('/api/chat/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'edit-message',
          messageId: editingMessageId,
          content,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to edit message.')
      }

      setMessages(current =>
        current.map(item =>
          item.id === editingMessageId
            ? {
                ...item,
                content,
                editedAt: data?.message?.editedAt || new Date().toISOString(),
              }
            : item
        )
      )

      setEditingMessageId(null)
      setEditingMessageText('')
      toast.success('Message updated')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to edit message.'
      )
    } finally {
      setSavingEdit(false)
    }
  }

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return

    setDeletingMessage(true)

    try {
      const response = await fetch('/api/chat/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'delete-message',
          messageId: messageToDelete.id,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to delete message.')
      }

      setMessages(current =>
        current.filter(item => item.id !== messageToDelete.id)
      )
      setMessageToDelete(null)
      void fetchConversations({ preserveLoading: true, selectFirst: false })
      toast.success('Message deleted')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to delete message.'
      )
    } finally {
      setDeletingMessage(false)
    }
  }

  const openRenameConversation = (conversation: ChatConversation) => {
    setConversationMenuId(null)
    setConversationMenuPosition(null)
    setConversationToRename(conversation)
    setRenameTitle(conversation.title)
  }

  const saveConversationRename = async () => {
    if (!conversationToRename) return
    const title = renameTitle.trim()

    if (!title) {
      toast.error('Conversation name cannot be empty.')
      return
    }

    setRenamingConversation(true)

    try {
      const response = await fetch('/api/chat/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'rename-conversation',
          conversationId: conversationToRename.id,
          title,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to rename conversation.')
      }

      setConversations(current =>
        current.map(item =>
          item.id === conversationToRename.id ? { ...item, title } : item
        )
      )

      setSelectedConv(current =>
        current?.id === conversationToRename.id
          ? { ...current, title }
          : current
      )

      setConversationToRename(null)
      setRenameTitle('')
      toast.success('Conversation renamed')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to rename conversation.'
      )
    } finally {
      setRenamingConversation(false)
    }
  }

  const confirmDeleteConversation = async () => {
    if (!conversationToDelete) return

    setDeletingConversation(true)

    try {
      const response = await fetch('/api/chat/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'delete-conversation',
          conversationId: conversationToDelete.id,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to delete conversation.')
      }

      setConversations(current =>
        current.filter(item => item.id !== conversationToDelete.id)
      )

      if (selectedConv?.id === conversationToDelete.id) {
        setSelectedConv(null)
        setMessages([])
        setShowMobileThread(false)
      }

      setConversationToDelete(null)
      toast.success('Conversation deleted')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to delete conversation.'
      )
    } finally {
      setDeletingConversation(false)
    }
  }

  const renderConversationList = () => {
    if (conversationState === 'loading') {
      return (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3, 4].map(index => (
            <motion.div
              key={index}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, y: 8 }
              }
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                delay: index * 0.04,
              }}
              className="flex items-center gap-3 rounded-2xl border border-border/40 p-3"
            >
              <div className="h-10 w-10 animate-pulse rounded-2xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
                <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-muted/70" />
              </div>
            </motion.div>
          ))}
        </div>
      )
    }

    if (conversationState === 'error') {
      return (
        <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <CircleAlert className="h-5 w-5" />
          </div>

          <p className="text-sm font-semibold">
            Conversations unavailable
          </p>

          <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
            We could not load your organization
            conversations.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 h-8 gap-2 text-xs"
            onClick={() =>
              void fetchConversations()
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        </div>
      )
    }

    if (
      conversations.length === 0
    ) {
      return (
        <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    scale: 0.88,
                  }
            }
            animate={{
              opacity: 1,
              scale: 1,
            }}
            className="relative mb-4"
          >
            <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border bg-background shadow-lg">
              <MessageCircleMore className="h-6 w-6 text-primary" />
            </div>
          </motion.div>

          <p className="text-sm font-semibold">
            Start your first conversation
          </p>

          <p className="mt-1 max-w-60 text-xs leading-5 text-muted-foreground">
            Find an active colleague in the company
            directory and start collaborating.
          </p>

          <Button
            type="button"
            size="sm"
            className="mt-4 h-8 gap-1.5 text-xs"
            onClick={() =>
              setIsSearchOpen(true)
            }
          >
            <Plus className="h-3.5 w-3.5" />
            New Conversation
          </Button>
        </div>
      )
    }

    if (
      filteredConversations.length === 0
    ) {
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
          <Search className="mb-3 h-6 w-6 text-muted-foreground/50" />
          <p className="text-xs font-semibold">
            No matching conversations
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Try a different name or message.
          </p>
        </div>
      )
    }

    return (
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: reduceMotion
                ? 0
                : 0.035,
            },
          },
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] space-y-1.5 p-2.5"
      >
        {filteredConversations.map(
          conversation => {
            const isSelected =
              selectedConv?.id ===
              conversation.id

            return (
              <motion.div
                layout={!reduceMotion}
                variants={{
                  hidden: {
                    opacity: 0,
                    x: -10,
                  },
                  show: {
                    opacity: 1,
                    x: 0,
                  },
                }}
                whileHover={
                  reduceMotion
                    ? undefined
                    : { x: 2 }
                }
                whileTap={
                  reduceMotion
                    ? undefined
                    : { scale: 0.99 }
                }
                key={conversation.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  handleSelectConversation(
                    conversation
                  )
                }
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleSelectConversation(conversation)
                  }
                }}
                className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-primary/20 bg-primary/[0.07] shadow-sm'
                    : 'border-transparent hover:border-border/60 hover:bg-muted/45'
                }`}
              >
                {isSelected && (
                  <motion.span
                    layoutId="active-conversation"
                    className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary"
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 35,
                    }}
                  />
                )}

                <ConversationAvatar
                  conversation={conversation}
                  displayTitle={getConversationDisplayTitle(conversation)}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                      {getConversationDisplayTitle(conversation)}
                    </p>

                    {conversation.lastMessage && (
                      <span className="shrink-0 text-[9px] font-medium text-muted-foreground">
                        {formatConversationTime(
                          conversation.lastMessage
                            .createdAt
                        )}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1.5">
                    {conversation.type ===
                      'channel' && (
                      <Hash className="h-3 w-3 shrink-0 text-indigo-500" />
                    )}

                    <p className="min-w-0 flex-1 truncate text-[10px] leading-4 text-muted-foreground">
                      {conversation.lastMessage
                        ? `${
                            conversation.lastMessage
                              .senderName
                          }: ${
                            conversation.lastMessage
                              .content
                          }`
                        : conversation.type ===
                            'channel'
                          ? 'Organization channel'
                          : 'Start the conversation'}
                    </p>

                    {(conversation.unreadCount ?? 0) > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground shadow-sm">
                        {conversation.unreadCount! > 99 ? '99+' : conversation.unreadCount}
                      </span>
                    )}

                    {conversation.type !== 'channel' && (
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation()
                          const rect = event.currentTarget.getBoundingClientRect()
                          const menuWidth = 224
                          const menuHeight = 154
                          const gap = 8
                          const left = Math.max(
                            12,
                            Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)
                          )
                          const top =
                            rect.bottom + gap + menuHeight <= window.innerHeight
                              ? rect.bottom + gap
                              : Math.max(12, rect.top - menuHeight - gap)

                          setConversationMenuPosition({ top, left })
                          setConversationMenuId(current =>
                            current === conversation.id ? null : conversation.id
                          )
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-70 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                        aria-label={`Options for ${getConversationDisplayTitle(conversation)}`}
                        title="Conversation options"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 transition-all ${
                        isSelected
                          ? 'translate-x-0 opacity-100 text-primary'
                          : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                      }`}
                    />
                  </div>
                </div>
              </motion.div>
            )
          }
        )}
      </motion.div>
    )
  }

  return (
    <>
      <div className="relative isolate min-h-0 w-full flex-1 overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-[0_24px_80px_-42px_rgba(15,23,42,0.45)]">
        {/* Ambient background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <motion.div
            animate={
              reduceMotion
                ? undefined
                : {
                    x: [0, 35, 0],
                    y: [0, -18, 0],
                  }
            }
            transition={{
              duration: 14,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-primary/[0.08] blur-3xl"
          />

          <motion.div
            animate={
              reduceMotion
                ? undefined
                : {
                    x: [0, -25, 0],
                    y: [0, 25, 0],
                  }
            }
            transition={{
              duration: 18,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -bottom-40 right-10 h-96 w-96 rounded-full bg-violet-500/[0.06] blur-3xl"
          />

          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.12)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.12)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        </div>

        <div className="relative flex h-full">
          {/* Conversation workspace */}
          <aside
className={`w-full shrink-0 border-r border-border/70 bg-background/75 backdrop-blur-xl md:flex md:w-[340px] md:flex-col lg:w-[370px] xl:w-[390px] ${
              showMobileThread
                ? 'hidden'
                : 'flex flex-col'
            }`}
          >
            <div className="border-b border-border/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <motion.div
                    initial={
                      reduceMotion
                        ? false
                        : {
                            rotate: -8,
                            scale: 0.9,
                          }
                    }
                    animate={{
                      rotate: 0,
                      scale: 1,
                    }}
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  >
                    <MessageSquare className="h-4.5 w-4.5" />
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                  </motion.div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate text-sm font-bold tracking-tight">
                        Organization Chat
                      </h2>
                      <Sparkles className="h-3 w-3 text-amber-500" />
                    </div>

                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Haryak internal workspace
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl shadow-sm"
                  onClick={() =>
                    setIsSearchOpen(true)
                  }
                  aria-label="Start new conversation"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

                <Input
                  value={conversationQuery}
                  onChange={event =>
                    setConversationQuery(
                      event.target.value
                    )
                  }
                  placeholder="Search conversations..."
                  className="h-9 rounded-xl border-border/70 bg-muted/35 pl-9 pr-9 text-xs shadow-none"
                />

                {conversationQuery && (
                  <button
                    type="button"
                    onClick={() =>
                      setConversationQuery('')
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Conversations
                </span>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    {conversations.length}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      void fetchConversations()
                    }
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label="Refresh conversations"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {renderConversationList()}
            </div>

            <div className="border-t border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Organization access controls applied
                </span>
              </div>
            </div>
          </aside>

          {/* Chat pane */}
          <main
            className={`min-w-0 flex-1 flex-col ${
              showMobileThread
                ? 'flex'
                : 'hidden md:flex'
            }`}
          >
            <AnimatePresence mode="wait">
              {selectedConv ? (
                <motion.div
                  key={selectedConv.id}
                  initial={
                    reduceMotion
                      ? false
                      : {
                          opacity: 0,
                          x: 12,
                        }
                  }
                  animate={{
                    opacity: 1,
                    x: 0,
                  }}
                  exit={
                    reduceMotion
                      ? undefined
                      : {
                          opacity: 0,
                          x: -8,
                        }
                  }
                  transition={{
                    duration: 0.22,
                    ease: 'easeOut',
                  }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {/* Chat header */}
                  <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-xl md:hidden"
                        onClick={() =>
                          setShowMobileThread(false)
                        }
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>

                      <button
                        type="button"
                        onClick={() => void openParticipantProfile(selectedConv)}
                        disabled={selectedConv.type !== 'direct'}
                        className="rounded-2xl text-left disabled:cursor-default"
                        title={selectedConv.type === 'direct' ? 'View profile' : undefined}
                        aria-label={selectedConv.type === 'direct' ? `View ${getConversationDisplayTitle(selectedConv)} profile` : undefined}
                      >
                        <ConversationAvatar
                          conversation={selectedConv}
                          large
                          displayTitle={getConversationDisplayTitle(selectedConv)}
                        />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void openParticipantProfile(selectedConv)}
                            disabled={selectedConv.type !== 'direct'}
                            className="truncate text-left text-sm font-bold transition hover:text-primary disabled:cursor-default disabled:hover:text-foreground"
                            title={selectedConv.type === 'direct' ? 'View profile' : undefined}
                          >
                            {getConversationDisplayTitle(selectedConv)}
                          </button>

                          {selectedConv.type ===
                            'channel' && (
                            <Badge
                              variant="outline"
                              className="hidden h-5 shrink-0 border-indigo-500/20 bg-indigo-500/10 px-1.5 text-[8px] font-bold tracking-wide text-indigo-700 sm:inline-flex dark:text-indigo-300"
                            >
                              COMPANY CHANNEL
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {selectedConv.type ===
                          'channel' ? (
                            <>
                              <Building2 className="h-3 w-3" />
                              <span>
                                Organization-wide conversation
                              </span>
                            </>
                          ) : (
                            <>
                              <Users className="h-3 w-3" />
                              <span>
                                {selectedParticipantCount}{' '}
                                {selectedParticipantCount ===
                                1
                                  ? 'participant'
                                  : 'participants'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        onClick={() =>
                          void fetchMessages(
                            selectedConv.id
                          )
                        }
                        aria-label="Refresh messages"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>

                      <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1.5 text-[9px] font-medium text-emerald-700 lg:flex dark:text-emerald-400">
                        <ShieldCheck className="h-3 w-3" />
                        Internal workspace
                      </div>
                    </div>
                  </header>

                  {/* 14-day message retention policy banner */}
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span>
                      Chat messages are automatically deleted after 14 days. Official documents, payslips, and HR records are retained separately.
                    </span>
                  </div>

                  {/* Messages */}
                  <div
                    ref={messagesViewportRef}
                    className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/25 via-transparent to-muted/15" />

                    <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6">
                      {messageState ===
                      'loading' ? (
                        <div className="flex flex-1 flex-col items-center justify-center">
                          <motion.div
                            animate={
                              reduceMotion
                                ? undefined
                                : {
                                    rotate: 360,
                                  }
                            }
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                            className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border bg-background shadow-sm"
                          >
                            <Loader2 className="h-4 w-4 text-primary" />
                          </motion.div>

                          <p className="text-xs font-medium">
                            Loading conversation
                          </p>

                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Retrieving message history…
                          </p>
                        </div>
                      ) : messageState ===
                        'error' ? (
                        <div className="flex flex-1 flex-col items-center justify-center text-center">
                          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                            <CircleAlert className="h-5 w-5" />
                          </div>

                          <p className="text-sm font-semibold">
                            Messages unavailable
                          </p>

                          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                            The conversation could not be
                            loaded. Your existing history
                            has not been modified.
                          </p>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-4 h-8 gap-2 text-xs"
                            onClick={() =>
                              void fetchMessages(
                                selectedConv.id
                              )
                            }
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Try Again
                          </Button>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                          <motion.div
                            initial={
                              reduceMotion
                                ? false
                                : {
                                    opacity: 0,
                                    y: 12,
                                    scale: 0.92,
                                  }
                            }
                            animate={{
                              opacity: 1,
                              y: 0,
                              scale: 1,
                            }}
                            className="relative"
                          >
                            <div className="absolute inset-0 rounded-full bg-primary/15 blur-3xl" />

                            <div className="relative flex h-16 w-16 items-center justify-center rounded-[22px] border bg-background shadow-xl">
                              <MessageCircleMore className="h-7 w-7 text-primary" />
                            </div>
                          </motion.div>

                          <h4 className="mt-5 text-sm font-bold">
                            Start the conversation
                          </h4>

                          <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
                            There are no messages here yet.
                            Send the first message to begin
                            collaborating.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-auto space-y-1">
                          <AnimatePresence initial={false}>
                            {messages.map(
                              (message, index) => {
                                const previous =
                                  messages[index - 1]

                                const showDate =
                                  !previous ||
                                  getDateKey(
                                    previous.createdAt
                                  ) !==
                                    getDateKey(
                                      message.createdAt
                                    )

                                const isMine =
                                  message.senderUserId ===
                                    user?.id ||
                                  Boolean(
                                    profile?.full_name &&
                                      message.senderName ===
                                        profile.full_name
                                  )

                                const previousSameSender =
                                  Boolean(
                                    previous &&
                                      previous.senderUserId ===
                                        message.senderUserId &&
                                      getDateKey(
                                        previous.createdAt
                                      ) ===
                                        getDateKey(
                                          message.createdAt
                                        ) &&
                                      Math.abs(
                                        new Date(message.createdAt).getTime() -
                                          new Date(previous.createdAt).getTime()
                                      ) <=
                                        2 * 60 * 1000
                                  )

                                return (
                                  <div key={message.id}>
                                    {showDate && (
                                      <div className="my-5 flex items-center gap-3">
                                        <div className="h-px flex-1 bg-border/70" />

                                        <span className="rounded-full border bg-background/90 px-3 py-1 text-[9px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
                                          {formatMessageDate(
                                            message.createdAt
                                          )}
                                        </span>

                                        <div className="h-px flex-1 bg-border/70" />
                                      </div>
                                    )}

                                    <motion.div
                                      layout={
                                        !reduceMotion
                                      }
                                      initial={
                                        reduceMotion
                                          ? false
                                          : {
                                              opacity: 0,
                                              y: 10,
                                              scale:
                                                0.985,
                                            }
                                      }
                                      animate={{
                                        opacity: 1,
                                        y: 0,
                                        scale: 1,
                                      }}
                                      exit={
                                        reduceMotion
                                          ? undefined
                                          : {
                                              opacity: 0,
                                              scale:
                                                0.98,
                                            }
                                      }
                                      transition={{
                                        duration: 0.2,
                                      }}
                                      className={`flex ${
                                        isMine
                                          ? 'justify-end'
                                          : 'justify-start'
                                      } ${
                                        previousSameSender
                                          ? 'mt-1'
                                          : 'mt-3'
                                      }`}
                                    >
                                      <div
                                        className={`flex max-w-[88%] items-end gap-2 sm:max-w-[76%] ${
                                          isMine
                                            ? 'flex-row-reverse'
                                            : ''
                                        }`}
                                      >
                                        {!previousSameSender ? (
                                          <div
                                            className={`mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[9px] font-bold ${
                                              isMine
                                                ? 'bg-primary/10 text-primary'
                                                : 'border bg-background text-muted-foreground'
                                            }`}
                                          >
                                            {isMine
                                              ? 'ME'
                                              : initials(
                                                  message.senderName
                                                )}
                                          </div>
                                        ) : (
                                          <div className="w-7 shrink-0" />
                                        )}

                                        <div
                                          className={`min-w-0 ${
                                            isMine
                                              ? 'text-right'
                                              : 'text-left'
                                          }`}
                                        >
                                          {!previousSameSender && (
                                            <div
                                              className={`mb-1 flex items-center gap-2 px-1 ${
                                                isMine
                                                  ? 'justify-end'
                                                  : 'justify-start'
                                              }`}
                                            >
                                              <span className="text-[9px] font-semibold text-muted-foreground">
                                                {isMine
                                                  ? 'You'
                                                  : message.senderName}
                                              </span>

                                              <span className="text-[9px] text-muted-foreground/70">
                                                {formatMessageTime(
                                                  message.createdAt
                                                )}
                                              </span>
                                            </div>
                                          )}

                                          {isMine && (
                                            <div className="mb-1 flex justify-end gap-1 opacity-70 transition hover:opacity-100">
                                              <button
                                                type="button"
                                                onClick={() => beginEditMessage(message)}
                                                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                                aria-label="Edit message"
                                                title="Edit message"
                                              >
                                                <Pencil className="h-3 w-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setMessageToDelete(message)}
                                                className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                                                aria-label="Delete message"
                                                title="Delete message"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </div>
                                          )}

                                          {editingMessageId === message.id ? (
                                            <motion.div
                                              initial={{ opacity: 0, scale: 0.98, y: 4 }}
                                              animate={{ opacity: 1, scale: 1, y: 0 }}
                                              className="w-[min(420px,72vw)] overflow-hidden rounded-2xl border border-primary/20 bg-background shadow-xl shadow-primary/5"
                                            >
                                              <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3.5 py-2.5">
                                                <div className="flex items-center gap-2">
                                                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                  </span>
                                                  <div>
                                                    <p className="text-[11px] font-semibold">
                                                      Edit message
                                                    </p>
                                                    <p className="text-[9px] text-muted-foreground">
                                                      Update your message without leaving the chat
                                                    </p>
                                                  </div>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={cancelEditMessage}
                                                  disabled={savingEdit}
                                                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                                                  aria-label="Cancel edit"
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </button>
                                              </div>

                                              <div className="p-3">
                                                <textarea
                                                  autoFocus
                                                  value={editingMessageText}
                                                  onChange={event =>
                                                    setEditingMessageText(event.target.value)
                                                  }
                                                  onKeyDown={event => {
                                                    if (event.key === 'Escape') {
                                                      event.preventDefault()
                                                      cancelEditMessage()
                                                    }

                                                    if (
                                                      event.key === 'Enter' &&
                                                      (event.ctrlKey || event.metaKey)
                                                    ) {
                                                      event.preventDefault()
                                                      void saveEditedMessage()
                                                    }
                                                  }}
                                                  rows={3}
                                                  className="min-h-[84px] w-full resize-none rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-xs leading-5 outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                                                />

                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                  <span className="hidden text-[9px] text-muted-foreground sm:block">
                                                    Esc to cancel · Ctrl/⌘ + Enter to save
                                                  </span>

                                                  <div className="ml-auto flex items-center gap-2">
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={cancelEditMessage}
                                                      disabled={savingEdit}
                                                      className="h-8 rounded-xl px-3 text-[10px]"
                                                    >
                                                      Cancel
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      onClick={() => void saveEditedMessage()}
                                                      disabled={
                                                        savingEdit ||
                                                        !editingMessageText.trim()
                                                      }
                                                      className="h-8 gap-2 rounded-xl px-3 text-[10px] shadow-sm"
                                                    >
                                                      {savingEdit ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                      ) : (
                                                        <Check className="h-3 w-3" />
                                                      )}
                                                      Save changes
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            </motion.div>
                                          ) : (
                                          <div
                                            className={`relative overflow-hidden rounded-2xl px-3.5 py-2.5 text-left text-xs leading-5 shadow-sm ${
                                              isMine
                                                ? 'rounded-br-md bg-primary text-primary-foreground shadow-primary/10'
                                                : 'rounded-bl-md border border-border/70 bg-background/95 text-foreground'
                                            }`}
                                          >
                                            <p className="whitespace-pre-wrap break-words">
                                              {renderMessageContent(
                                                message.content,
                                                isMine
                                              )}
                                            </p>

                                            {Array.isArray(
                                              message.attachments
                                            ) &&
                                              message
                                                .attachments
                                                .length >
                                                0 && (
                                                <div className="mt-2 space-y-1.5 border-t border-current/10 pt-2">
                                                  {message.attachments.map(
                                                    (
                                                      attachment,
                                                      attachmentIndex
                                                    ) => (
                                                      <a
                                                        key={`${attachment.url}-${attachmentIndex}`}
                                                        href={
                                                          attachment.url
                                                        }
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block truncate rounded-lg bg-black/5 px-2 py-1.5 text-[10px] underline-offset-2 hover:underline dark:bg-white/10"
                                                      >
                                                        {
                                                          attachment.name
                                                        }
                                                      </a>
                                                    )
                                                  )}
                                                </div>
                                              )}

                                            <div className={`mt-1 flex items-center gap-1 text-[8px] ${isMine ? 'justify-end text-primary-foreground/75' : 'justify-end text-muted-foreground/70'}`}>
                                              <span>{formatMessageTime(message.createdAt)}</span>
                                              {isMine && (
                                                <span
                                                  className={`inline-flex items-center font-bold tracking-[-0.18em] ${
                                                    message.receiptStatus === 'read'
                                                      ? 'text-sky-300'
                                                      : 'text-primary-foreground/80'
                                                  }`}
                                                  title={
                                                    message.receiptStatus === 'read'
                                                      ? 'Read'
                                                      : message.receiptStatus === 'delivered'
                                                        ? 'Delivered'
                                                        : 'Sent'
                                                  }
                                                >
                                                  {message.receiptStatus === 'delivered' || message.receiptStatus === 'read' ? '✓✓' : '✓'}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          )}

                                          {previousSameSender && !isMine && (
                                            <span className="mt-0.5 block px-1 text-[8px] text-muted-foreground/60">
                                              {formatMessageTime(
                                                message.createdAt
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  </div>
                                )
                              }
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      <div
                        ref={messagesEndRef}
                        className="h-1"
                      />
                    </div>
                  </div>

                  {/* Composer */}
                  <div className="shrink-0 border-t border-border/70 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-3">
                    <form
                      onSubmit={handleSendMessage}
                      className="mx-auto max-w-5xl"
                    >
                      <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-muted/25 p-1.5 shadow-sm transition focus-within:border-primary/30 focus-within:bg-background focus-within:shadow-md">
                        <Input
                          ref={composerRef}
                          value={inputText}
                          onChange={event =>
                            setInputText(
                              event.target.value
                            )
                          }
                          onKeyDown={
                            handleComposerKeyDown
                          }
                          placeholder={`Message ${getConversationDisplayTitle(selectedConv)}…`}
                          className="h-10 flex-1 border-0 bg-transparent px-3 text-xs shadow-none focus-visible:ring-0"
                          disabled={sending}
                          autoComplete="off"
                        />

                        <motion.div
                          whileTap={
                            reduceMotion
                              ? undefined
                              : { scale: 0.94 }
                          }
                        >
                          <Button
                            type="submit"
                            size="icon"
                            className="h-10 w-10 rounded-xl shadow-md shadow-primary/15"
                            disabled={
                              sending ||
                              !inputText.trim()
                            }
                            aria-label="Send message"
                          >
                            {sending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </motion.div>
                      </div>

                      <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-muted-foreground">
                        <span>
                          Enter to send
                        </span>

                        <span className="hidden sm:inline">
                          14-day auto-deletion policy active • Official HR records retained separately
                        </span>
                      </div>
                    </form>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty-chat"
                  initial={
                    reduceMotion
                      ? false
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1 }}
                  className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center"
                >
                  <motion.div
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            y: [0, -7, 0],
                          }
                    }
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="relative"
                  >
                    <div className="absolute inset-0 scale-150 rounded-full bg-primary/10 blur-3xl" />

                    <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border bg-background shadow-2xl">
                      <Inbox className="h-8 w-8 text-primary" />
                    </div>
                  </motion.div>

                  <h3 className="mt-6 text-base font-bold">
                    Your organization workspace
                  </h3>

                  <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
                    Select a conversation or start a
                    secure internal discussion with an
                    active colleague.
                  </p>

                  <Button
                    type="button"
                    size="sm"
                    className="mt-5 gap-2"
                    onClick={() =>
                      setIsSearchOpen(true)
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Start Conversation
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        conversationMenuId &&
        conversationMenuPosition &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close conversation menu"
              className="fixed inset-0 z-[190] cursor-default bg-transparent"
              onClick={() => {
                setConversationMenuId(null)
                setConversationMenuPosition(null)
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{
                top: conversationMenuPosition.top,
                left: conversationMenuPosition.left,
              }}
              className="fixed z-[200] w-56 overflow-hidden rounded-2xl border border-border/80 bg-popover/98 p-1.5 text-popover-foreground shadow-[0_24px_70px_-18px_rgba(15,23,42,0.38)] backdrop-blur-xl"
            >
              {(() => {
                const conversation = conversations.find(
                  item => item.id === conversationMenuId
                )
                if (!conversation || conversation.type === 'channel') return null

                return (
                  <>
                    <div className="px-3 pb-2 pt-1.5">
                      <p className="truncate text-[10px] font-semibold">
                        {getConversationDisplayTitle(conversation)}
                      </p>
                      <p className="mt-0.5 text-[8px] text-muted-foreground">
                        Conversation options
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRenameConversation(conversation)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition hover:bg-muted"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                      <span>
                        <span className="block">Rename conversation</span>
                        <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                          Change the conversation name
                        </span>
                      </span>
                    </button>

                    <div className="my-1 h-px bg-border/70" />

                    <button
                      type="button"
                      onClick={() => {
                        setConversationMenuId(null)
                        setConversationMenuPosition(null)
                        setConversationToDelete(conversation)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-destructive transition hover:bg-destructive/10"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                      <span>
                        <span className="block">Delete conversation</span>
                        <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                          Permanently delete for everyone
                        </span>
                      </span>
                    </button>
                  </>
                )
              })()}
            </motion.div>
          </>,
          document.body
        )}

      {/* Premium delete-message confirmation */}
      <Dialog
        open={Boolean(messageToDelete)}
        onOpenChange={open => {
          if (!open && !deletingMessage) setMessageToDelete(null)
        }}
      >
        <DialogContent className="overflow-hidden border-border/70 p-0 shadow-2xl sm:max-w-md">
          <div className="relative overflow-hidden border-b border-border/70 px-6 pb-5 pt-6">
            <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-destructive/10 blur-3xl" />
            <DialogHeader className="relative">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold">
                Delete message?
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                This message will be removed for everyone in this conversation.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
          </div>

          {messageToDelete?.content && (
            <div className="mx-6 mt-5 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                “{messageToDelete.content}”
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 p-6 pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMessageToDelete(null)}
              disabled={deletingMessage}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteMessage()}
              disabled={deletingMessage}
              className="gap-2 rounded-xl"
            >
              {deletingMessage && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete message
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Premium rename-conversation dialog */}
      <Dialog
        open={Boolean(conversationToRename)}
        onOpenChange={open => {
          if (!open && !renamingConversation) {
            setConversationToRename(null)
            setRenameTitle('')
          }
        }}
      >
        <DialogContent className="overflow-hidden border-border/70 p-0 shadow-2xl sm:max-w-md">
          <div className="relative overflow-hidden border-b border-border/70 px-6 pb-5 pt-6">
            <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
            <DialogHeader className="relative">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Pencil className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold">
                Rename conversation
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                Choose a clear name that is easy to recognize in Organization Chat.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6">
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Conversation name
            </label>
            <Input
              autoFocus
              value={renameTitle}
              onChange={event => setRenameTitle(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveConversationRename()
                }
              }}
              className="mt-2 h-11 rounded-xl bg-muted/25"
              placeholder="Conversation name"
            />

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConversationToRename(null)
                  setRenameTitle('')
                }}
                disabled={renamingConversation}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void saveConversationRename()}
                disabled={renamingConversation || !renameTitle.trim()}
                className="gap-2 rounded-xl"
              >
                {renamingConversation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save name
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Premium delete-conversation confirmation */}
      <Dialog
        open={Boolean(conversationToDelete)}
        onOpenChange={open => {
          if (!open && !deletingConversation) setConversationToDelete(null)
        }}
      >
        <DialogContent className="overflow-hidden border-border/70 p-0 shadow-2xl sm:max-w-md">
          <div className="relative overflow-hidden border-b border-border/70 px-6 pb-5 pt-6">
            <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-destructive/10 blur-3xl" />
            <DialogHeader className="relative">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold">
                Delete conversation?
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                This permanently removes the conversation and its messages for
                every participant. Company announcements are never deletable here.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="mx-6 mt-5 rounded-2xl border border-destructive/15 bg-destructive/[0.04] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-destructive">
              Permanent action
            </p>
            <p className="mt-1 text-xs font-semibold">
              {conversationToDelete?.title}
            </p>
          </div>

          <div className="flex justify-end gap-2 p-6 pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConversationToDelete(null)}
              disabled={deletingConversation}
              className="rounded-xl"
            >
              Keep conversation
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteConversation()}
              disabled={deletingConversation}
              className="gap-2 rounded-xl"
            >
              {deletingConversation && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete for everyone
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Chat participant profile */}
      <Dialog
        open={profileOpen}
        onOpenChange={open => {
          setProfileOpen(open)
          if (!open) {
            setProfileCard(null)
            setProfileFallbackName('')
            setProfileFallbackRole('')
          }
        }}
      >
        <DialogContent className="overflow-hidden border-border/70 p-0 shadow-2xl sm:max-w-md">
          <div className="relative overflow-hidden border-b border-border/70 px-6 pb-6 pt-7">
            <div className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <DialogHeader className="relative">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-sm font-bold text-primary shadow-sm">
                  {initials(profileCard?.fullName || profileFallbackName)}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base font-bold">
                    {profileCard?.fullName || profileFallbackName}
                  </DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-1.5 text-xs">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    {profileCard?.designation || profileFallbackRole}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="p-6">
            {profileLoading ? (
              <div className="flex min-h-40 flex-col items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="mt-3 text-xs font-medium">Loading employee details</p>
              </div>
            ) : profileCard ? (
              <div className="grid gap-3">
                <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <IdCard className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Employee ID</p>
                    <p className="mt-0.5 truncate text-xs font-semibold">{profileCard.employeeCode}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BriefcaseBusiness className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Role & department</p>
                    <p className="mt-0.5 truncate text-xs font-semibold">{profileCard.designation || 'Not specified'}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{profileCard.department || 'Department not specified'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Official email</p>
                    <p className="mt-0.5 break-all text-xs font-semibold">{profileCard.officialEmail || 'Not available'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-5 text-center">
                <UserRound className="mx-auto h-6 w-6 text-primary" />
                <p className="mt-3 text-sm font-semibold">{profileFallbackName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{profileFallbackRole}</p>
                <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
                  This account does not have a linked employee directory record. Only verified chat identity information is shown.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee directory */}
      <Dialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <div className="relative overflow-hidden border-b px-6 pb-5 pt-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />

            <DialogHeader className="relative">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <MessageCircleMore className="h-4 w-4" />
              </div>

              <DialogTitle className="text-base font-bold">
                New Organization Chat
              </DialogTitle>

              <DialogDescription className="text-xs leading-5">
                Find a colleague by employee ID, name,
                official email, department, or designation.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                autoFocus
                placeholder="Search HRK-001, name, email..."
                value={searchQuery}
                onChange={event =>
                  setSearchQuery(
                    event.target.value
                  )
                }
                className="h-10 rounded-xl bg-muted/30 pl-9 pr-9 text-xs"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() =>
                    setSearchQuery('')
                  }
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Clear directory search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-4 max-h-[390px] min-h-[220px] overflow-y-auto pr-1">
              {searchingDir ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="mt-3 text-xs font-medium">
                    Searching directory
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Looking for matching colleagues…
                  </p>
                </div>
              ) : directoryResults.length ===
                0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <p className="mt-3 text-xs font-semibold">
                    No matching employees
                  </p>

                  <p className="mt-1 max-w-xs text-[10px] leading-4 text-muted-foreground">
                    Search using an employee ID, name,
                    official email, department, or
                    designation.
                  </p>
                </div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: {
                      transition: {
                        staggerChildren:
                          reduceMotion
                            ? 0
                            : 0.035,
                      },
                    },
                  }}
                  className="space-y-2"
                >
                  {directoryResults.map(
                    employee => (
                      <motion.div
                        key={employee.id}
                        variants={{
                          hidden: {
                            opacity: 0,
                            y: 8,
                          },
                          show: {
                            opacity: 1,
                            y: 0,
                          },
                        }}
                        className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 transition hover:border-primary/20 hover:bg-primary/[0.025] hover:shadow-sm"
                      >
                        <DirectoryAvatar
                          name={employee.fullName}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-semibold">
                              {employee.fullName}
                            </p>

                            <Badge
                              variant="outline"
                              className="h-5 shrink-0 px-1.5 font-mono text-[8px]"
                            >
                              {employee.employeeCode}
                            </Badge>
                          </div>

                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {employee.designation ||
                              'Designation not set'}
                            {employee.department
                              ? ` · ${employee.department}`
                              : ''}
                          </p>

                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground/80">
                            {employee.officialEmail}
                          </p>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          className="h-8 shrink-0 gap-1.5 rounded-xl px-3 text-[10px]"
                          disabled={
                            startingChatId !== null
                          }
                          onClick={() =>
                            void openNewChatWith(
                              employee
                            )
                          }
                        >
                          {startingChatId ===
                          employee.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <MessageSquare className="h-3.5 w-3.5" />
                              Chat
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )
                  )}
                </motion.div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2 text-[9px] leading-4 text-emerald-700 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              Directory results are provided by your
              organization chat service.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
