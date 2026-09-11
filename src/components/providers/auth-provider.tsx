'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface UserProfile {
  id: string
  email: string
  first_name?: string
  last_name?: string
  full_name?: string
  employee_code?: string
  role?: string
  avatar_url?: string
}

interface AuthContextType {
  user: User | UserProfile | null
  session: Session | null
  loading: boolean
  signIn: (identifier: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  userRoles: string[]
  profile: UserProfile | null
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const loadSession = useCallback(async (): Promise<void> => {
    // 1. Check local session cookie first for fast UI render
    const sessionCookie = getCookie('haryak_session')
    let parsedHint: any = null
    if (sessionCookie) {
      try {
        parsedHint = JSON.parse(sessionCookie)
        setUser({ id: parsedHint.id, email: parsedHint.email })
        setUserRoles(parsedHint.roles || ['SUPER_ADMIN'])
        setProfile({
          id: parsedHint.id,
          email: parsedHint.email,
          full_name: parsedHint.fullName,
          first_name: parsedHint.fullName?.split(' ')[0] || 'User',
          last_name: parsedHint.fullName?.split(' ').slice(1).join(' ') || '',
          employee_code: parsedHint.employeeCode,
          role: parsedHint.roles?.[0] || 'SUPER_ADMIN',
        })
      } catch {
        // Continue to Supabase check
      }
    }

    // 2. Authoritative Supabase SSR check
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser()
      if (authUser && !error) {
        setUser(authUser)
        const roles = parsedHint?.roles || [authUser.user_metadata?.role || 'SUPER_ADMIN']
        setUserRoles(roles)
        setProfile({
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || parsedHint?.fullName || 'User',
          first_name: (authUser.user_metadata?.full_name || parsedHint?.fullName || 'User').split(' ')[0],
          last_name: (authUser.user_metadata?.full_name || parsedHint?.fullName || '').split(' ').slice(1).join(' '),
          employee_code: authUser.user_metadata?.employee_code || parsedHint?.employeeCode,
          role: roles[0] || 'SUPER_ADMIN',
        })
      } else if (!parsedHint) {
        setUser(null)
        setProfile(null)
        setUserRoles([])
      }
    } catch {
      // Network / placeholder mode
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const signIn = async (identifier: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })

    const result = await res.json()
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Invalid credentials.')
    }

    loadSession()
    router.push(result.redirectUrl || '/dashboard')
    router.refresh()
  }

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
    } catch {
      // Continue
    }

    // Clear local states
    setUser(null)
    setSession(null)
    setProfile(null)
    setUserRoles([])

    // Clear cookie manually on client as well
    if (typeof document !== 'undefined') {
      document.cookie = 'haryak_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
    }

    toast.success('Signed out successfully.')
    router.push('/login')
    router.refresh()
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      signIn, 
      signOut, 
      userRoles, 
      profile,
      refreshSession: loadSession 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
