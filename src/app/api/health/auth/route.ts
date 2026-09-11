import { NextResponse } from 'next/server'
import { isSupabaseConfigured, isSupabaseReachable } from '@/lib/supabase/admin'

/**
 * Health check endpoint for authentication infrastructure.
 * Never returns secrets, keys, or passwords.
 */
export async function GET() {
  const configured = isSupabaseConfigured()
  const reachable = configured ? await isSupabaseReachable() : false

  return NextResponse.json({
    status: configured && reachable ? 'HEALTHY' : configured ? 'UNREACHABLE' : 'PLACEHOLDER_MODE',
    configured,
    reachable,
    authMode: configured && reachable ? 'supabase_cloud' : 'local_enterprise_bootstrap',
    timestamp: new Date().toISOString(),
  })
}
