import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase Admin Client.
 * Uses SUPABASE_SERVICE_ROLE_KEY for administrative operations (user provisioning, role management).
 * WARNING: NEVER import this file into client components ('use client').
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey || url.includes('demo.supabase.co') || serviceKey.includes('demo_')) {
    return null
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Check if real Supabase environment variables are configured.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anonKey) return false
  if (url.includes('haryak-one-demo.supabase.co') || url.includes('your_supabase_url')) return false
  if (anonKey.includes('demo_anon_key') || anonKey.includes('your_supabase_anon_key')) return false
  
  return true
}

/**
 * Probe whether the configured Supabase URL is reachable over the network.
 */
export async function isSupabaseReachable(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return false

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const res = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    return res.ok || res.status === 200 || res.status === 401 || res.status === 403
  } catch {
    return false
  }
}
