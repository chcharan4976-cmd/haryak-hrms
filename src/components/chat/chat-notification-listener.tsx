'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BellRing, MessageCircleMore, Volume2, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

import { useAuth } from '@/components/providers/auth-provider'

interface ConversationSummary {
  id: string
  title: string
  unreadCount?: number
  lastMessage?: {
    content: string
    senderName: string
    createdAt: string
  } | null
}

interface BannerMessage {
  conversationId: string
  title: string
  senderName: string
  content: string
  createdAt: string
}

function initials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'HT'
  )
}

function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Short Haryak Chat signature chime.
 *
 * Generated with Web Audio, so no external audio asset is required.
 * Browsers require one user interaction before programmatic audio is allowed.
 * Clicking "Enable notifications" provides that interaction.
 */
async function playHaryakMessageChime() {
  if (typeof window === 'undefined') return

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext
      }
    ).webkitAudioContext

  if (!AudioContextClass) return

  try {
    const context = new AudioContextClass()

    if (context.state === 'suspended') {
      await context.resume()
    }

    const master = context.createGain()

    master.gain.setValueAtTime(0.0001, context.currentTime)

    master.gain.exponentialRampToValueAtTime(
      0.16,
      context.currentTime + 0.018
    )

    master.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + 0.72
    )

    master.connect(context.destination)

    const notes = [
      {
        frequency: 659.25,
        start: 0,
        duration: 0.22,
      },
      {
        frequency: 783.99,
        start: 0.13,
        duration: 0.24,
      },
      {
        frequency: 987.77,
        start: 0.28,
        duration: 0.34,
      },
    ]

    notes.forEach(note => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = 'sine'

      oscillator.frequency.setValueAtTime(
        note.frequency,
        context.currentTime + note.start
      )

      gain.gain.setValueAtTime(
        0.0001,
        context.currentTime + note.start
      )

      gain.gain.exponentialRampToValueAtTime(
        0.7,
        context.currentTime + note.start + 0.018
      )

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + note.start + note.duration
      )

      oscillator.connect(gain)
      gain.connect(master)

      oscillator.start(context.currentTime + note.start)

      oscillator.stop(
        context.currentTime + note.start + note.duration + 0.03
      )
    })

    window.setTimeout(() => {
      void context.close()
    }, 1100)
  } catch (error) {
    console.debug(
      'Desktop notification sound unavailable:',
      error
    )
  }
}

export function ChatNotificationListener() {
  const { user, profile } = useAuth()

  const router = useRouter()
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  const [banner, setBanner] =
    useState<BannerMessage | null>(null)

  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported')

  const [showPermissionCard, setShowPermissionCard] =
    useState(false)

  const [requestingPermission, setRequestingPermission] =
    useState(false)

  const seenRef =
    useRef<Map<string, string>>(new Map())

  const initializedRef = useRef(false)

  const inFlightRef = useRef(false)

  /**
   * The active background polling request.
   *
   * This lets us safely cancel an obsolete request when:
   * - the component unmounts
   * - the authenticated user changes
   * - navigation recreates the polling lifecycle
   */
  const abortControllerRef =
    useRef<AbortController | null>(null)

  const hideTimerRef =
    useRef<number | null>(null)

  const permissionTimerRef =
    useRef<number | null>(null)

  const nativeNotificationRef =
    useRef<Notification | null>(null)

  const lastNativeKeyRef =
    useRef<string | null>(null)

  const audioUnlockedRef =
    useRef(false)

  const isChatPage =
    pathname === '/messages' ||
    pathname === '/portal/messages'

  const myNames = useMemo(
    () =>
      [
        profile?.full_name,

        profile?.first_name &&
          `${profile.first_name} ${
            profile.last_name || ''
          }`.trim(),

        user?.email,
      ]
        .filter(Boolean)
        .map(value =>
          String(value).trim().toLowerCase()
        ),
    [
      profile?.full_name,
      profile?.first_name,
      profile?.last_name,
      user?.email,
    ]
  )

  useEffect(() => {
    const current =
      notificationPermission()

    setPermission(current)

    if (!user || current !== 'default') {
      return
    }

    permissionTimerRef.current =
      window.setTimeout(() => {
        setShowPermissionCard(true)
      }, 1800)

    return () => {
      if (permissionTimerRef.current) {
        window.clearTimeout(
          permissionTimerRef.current
        )

        permissionTimerRef.current = null
      }
    }
  }, [user])

  const enableDesktopAlerts =
    async () => {
      if (
        !isNotificationSupported() ||
        requestingPermission
      ) {
        return
      }

      setRequestingPermission(true)

      try {
        /*
         * The click is also used to unlock
         * Web Audio for the signature chime.
         */
        await playHaryakMessageChime()

        audioUnlockedRef.current = true

        const result =
          await Notification.requestPermission()

        setPermission(result)

        setShowPermissionCard(false)

        if (result === 'granted') {
          const test =
            new Notification(
              'Haryak Chat alerts enabled',
              {
                body:
                  'New organization messages can now appear on this device.',

                icon: '/icon.png',
                badge: '/icon.png',

                tag: 'haryak-chat-enabled',

                silent: true,
              }
            )

          window.setTimeout(() => {
            test.close()
          }, 3500)
        }
      } catch (error) {
        console.error(
          'Unable to enable desktop notifications:',
          error
        )
      } finally {
        setRequestingPermission(false)
      }
    }

  const openConversation =
    useCallback(
      (conversationId: string) => {
        const base =
          pathname.startsWith('/portal')
            ? '/portal/messages'
            : '/messages'

        router.push(
          `${base}?conversation=${encodeURIComponent(
            conversationId
          )}`
        )
      },
      [pathname, router]
    )

  const showNativeNotification =
    useCallback(
      async (
        message: BannerMessage
      ) => {
        if (
          !isNotificationSupported() ||
          Notification.permission !==
            'granted'
        ) {
          return
        }

        const notificationKey =
          `${message.conversationId}:${message.createdAt}`

        if (
          lastNativeKeyRef.current ===
          notificationKey
        ) {
          return
        }

        lastNativeKeyRef.current =
          notificationKey

        nativeNotificationRef.current?.close()

        const preview =
          message.content.trim() ||
          'New organization message'

        const notification =
          new Notification(
            `Haryak Chat • ${message.senderName}`,
            {
              body:
                `${message.title}\n${preview}`,

              icon: '/icon.png',
              badge: '/icon.png',

              tag:
                `haryak-chat-${message.conversationId}`,

              silent: true,

              requireInteraction: false,
            }
          )

        nativeNotificationRef.current =
          notification

        notification.onclick = () => {
          window.focus()

          openConversation(
            message.conversationId
          )

          notification.close()
        }

        notification.onclose = () => {
          if (
            nativeNotificationRef.current ===
            notification
          ) {
            nativeNotificationRef.current =
              null
          }
        }

        if (audioUnlockedRef.current) {
          await playHaryakMessageChime()
        }
      },
      [openConversation]
    )

  const poll =
    useCallback(async () => {
      /*
       * This listener is only responsible
       * for global/background notifications.
       *
       * While the user is actively viewing
       * the chat page, the chat window owns
       * the refresh cycle.
       *
       * If the tab/window becomes hidden,
       * this listener takes over so native
       * desktop notifications can still fire.
       */
      const pageVisible =
        document.visibilityState ===
        'visible'

      if (
        !user ||
        (isChatPage && pageVisible) ||
        inFlightRef.current
      ) {
        return
      }

      inFlightRef.current = true

      const controller =
        new AbortController()

      abortControllerRef.current =
        controller

      try {
        const response =
          await fetch(
            '/api/chat/conversations',
            {
              credentials: 'include',

              cache: 'no-store',

              signal: controller.signal,
            }
          )

        /*
         * Notification polling is background,
         * best-effort work.
         *
         * A temporary 401/403/500/etc. must
         * not break the rest of the HRMS.
         */
        if (!response.ok) {
          return
        }

        const contentType =
          response.headers.get(
            'content-type'
          ) || ''

        /*
         * Avoid calling response.json()
         * against an HTML/error response.
         */
        if (
          !contentType.includes(
            'application/json'
          )
        ) {
          return
        }

        const data =
          await response.json()

        if (
          !data?.success ||
          !Array.isArray(
            data.conversations
          )
        ) {
          return
        }

        const conversations =
          data.conversations as ConversationSummary[]

        /*
         * First successful poll establishes
         * the baseline.
         *
         * Existing messages must not suddenly
         * appear as new notifications when
         * the listener starts.
         */
        if (!initializedRef.current) {
          conversations.forEach(
            conversation => {
              if (
                conversation.lastMessage
                  ?.createdAt
              ) {
                seenRef.current.set(
                  conversation.id,

                  conversation
                    .lastMessage
                    .createdAt
                )
              }
            }
          )

          initializedRef.current = true

          return
        }

        const candidates:
          BannerMessage[] = []

        conversations.forEach(
          conversation => {
            const last =
              conversation.lastMessage

            if (!last?.createdAt) {
              return
            }

            const previous =
              seenRef.current.get(
                conversation.id
              )

            /*
             * Record the newest known message
             * immediately so it cannot create
             * duplicate alerts on the next
             * polling cycle.
             */
            seenRef.current.set(
              conversation.id,
              last.createdAt
            )

            if (
              !previous ||
              previous === last.createdAt
            ) {
              return
            }

            if (
              (conversation.unreadCount ??
                0) <= 0
            ) {
              return
            }

            const sender =
              last.senderName
                .trim()
                .toLowerCase()

            /*
             * Do not notify the current user
             * about their own message.
             */
            if (
              myNames.includes(sender)
            ) {
              return
            }

            candidates.push({
              conversationId:
                conversation.id,

              title:
                conversation.title,

              senderName:
                last.senderName,

              content:
                last.content,

              createdAt:
                last.createdAt,
            })
          }
        )

        if (
          candidates.length === 0
        ) {
          return
        }

        candidates.sort(
          (a, b) =>
            new Date(
              b.createdAt
            ).getTime() -
            new Date(
              a.createdAt
            ).getTime()
        )

        const newest =
          candidates[0]

        /*
         * Native desktop notification.
         *
         * This is particularly useful when
         * the HRMS tab is backgrounded or
         * minimized.
         */
        await showNativeNotification(
          newest
        )

        /*
         * The premium in-app banner should
         * only appear when the HRMS window
         * itself is visible.
         */
        if (
          document.visibilityState ===
          'visible'
        ) {
          setBanner(newest)

          if (
            hideTimerRef.current
          ) {
            window.clearTimeout(
              hideTimerRef.current
            )
          }

          hideTimerRef.current =
            window.setTimeout(() => {
              setBanner(null)
            }, 6500)
        }
      } catch (error) {
        /*
         * AbortError is expected when the
         * component unmounts or its polling
         * lifecycle is replaced.
         */
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return
        }

        /*
         * IMPORTANT:
         *
         * Do not use console.error here.
         *
         * This is background notification
         * polling. A temporary fetch failure
         * must not create the Next.js dev
         * error overlay or interrupt the
         * application.
         */
        if (
          process.env.NODE_ENV ===
          'development'
        ) {
          console.debug(
            '[ChatNotificationListener] Chat poll temporarily unavailable.'
          )
        }
      } finally {
        if (
          abortControllerRef.current ===
          controller
        ) {
          abortControllerRef.current =
            null
        }

        inFlightRef.current = false
      }
    }, [
      isChatPage,
      myNames,
      showNativeNotification,
      user,
    ])

  useEffect(() => {
    if (!user) {
      /*
       * Ensure a previous authenticated
       * polling request cannot survive after
       * logout.
       */
      abortControllerRef.current?.abort()

      abortControllerRef.current =
        null

      inFlightRef.current = false

      initializedRef.current = false

      seenRef.current.clear()

      return
    }

    initializedRef.current = false

    seenRef.current.clear()

    /*
     * Initial background check.
     */
    void poll()

    /*
     * Keep the existing 10-second interval.
     *
     * inFlightRef prevents a second request
     * from being started while the previous
     * request is still running.
     */
    const timer =
      window.setInterval(() => {
        void poll()
      }, 10000)

    /*
     * When the tab visibility changes, check
     * whether notification ownership should
     * move between the chat window and this
     * global listener.
     */
    const onVisibilityChange =
      () => {
        void poll()
      }

    const onFocus = () => {
      void poll()
    }

    window.addEventListener(
      'focus',
      onFocus
    )

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange
    )

    return () => {
      window.clearInterval(timer)

      window.removeEventListener(
        'focus',
        onFocus
      )

      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      )

      /*
       * Cancel an unfinished fetch during
       * navigation/unmount.
       */
      abortControllerRef.current?.abort()

      abortControllerRef.current =
        null

      inFlightRef.current = false

      if (
        hideTimerRef.current
      ) {
        window.clearTimeout(
          hideTimerRef.current
        )

        hideTimerRef.current =
          null
      }

      nativeNotificationRef.current?.close()

      nativeNotificationRef.current =
        null
    }
  }, [user, poll])

  const openBannerConversation =
    () => {
      if (!banner) return

      openConversation(
        banner.conversationId
      )

      setBanner(null)
    }

  return (
    <>
      <AnimatePresence>
        {showPermissionCard &&
          permission === 'default' &&
          !isChatPage && (
            <motion.div
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      y: 18,
                      scale: 0.96,
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
                      y: 12,
                      scale: 0.98,
                    }
              }
              className="fixed bottom-5 right-5 z-[110] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-border/80 bg-background/96 shadow-2xl backdrop-blur-xl"
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <BellRing className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      Enable Haryak Chat alerts
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Receive desktop message
                      notifications with the
                      Haryak signature sound
                      while this browser is
                      open.
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label="Not now"
                    onClick={() =>
                      setShowPermissionCard(
                        false
                      )
                    }
                    className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void enableDesktopAlerts()
                    }
                    disabled={
                      requestingPermission
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Volume2 className="h-4 w-4" />

                    {requestingPermission
                      ? 'Enabling...'
                      : 'Enable notifications'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setShowPermissionCard(
                        false
                      )
                    }
                    className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold transition hover:bg-muted"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {banner && (
          <motion.div
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: -24,
                    scale: 0.96,
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
                    y: -18,
                    scale: 0.98,
                  }
            }
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 32,
            }}
            className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-3 sm:top-4"
          >
            <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur-xl">
              <button
                type="button"
                onClick={
                  openBannerConversation
                }
                className="flex w-full items-center gap-3 p-3.5 pr-11 text-left"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xs font-bold text-primary">
                  {initials(
                    banner.senderName
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MessageCircleMore className="h-3.5 w-3.5 shrink-0 text-primary" />

                    <p className="min-w-0 flex-1 truncate text-xs font-bold">
                      {banner.senderName}
                    </p>

                    <span className="text-[9px] font-medium text-muted-foreground">
                      now
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
                    {banner.title}
                  </p>

                  <p className="mt-1 truncate text-xs text-foreground/90">
                    {banner.content ||
                      'New message'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                aria-label="Dismiss message notification"
                onClick={() =>
                  setBanner(null)
                }
                className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              <motion.div
                initial={{
                  scaleX: 1,
                }}
                animate={{
                  scaleX: 0,
                }}
                transition={{
                  duration: 6.5,
                  ease: 'linear',
                }}
                className="h-0.5 origin-left bg-primary"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}