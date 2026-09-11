import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/admin'

export async function POST() {
  const response = NextResponse.json({ success: true })

  // Clear local session cookie
  response.cookies.delete('haryak_session')

  // If Supabase is configured, sign out from Supabase as well
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient()
      await supabase.auth.signOut()
    } catch {
      // Ignore signOut errors
    }
  }

  return response
}
