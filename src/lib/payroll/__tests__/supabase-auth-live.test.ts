import { describe, test, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { authenticateUser, updateInitialAdminCredentials } from '../../auth/auth-service'

describe('Live Supabase Auth Integration', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogzigmehiwjoyhiiimpm.supabase.co'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nemlnbWVoaXdqb3loaWlpbXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjE0NzgsImV4cCI6MjEwMzU5NzQ3OH0.LIwHJUc-RYWFAONf266brpW0ZCJdsmkQ7eElGtNZer8'

  test('1. authenticates haryak@admin.com with Haryak@123 against Supabase Auth', async () => {
    const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: 'haryak@admin.com',
      password: 'Haryak@123',
    })

    expect(error).toBeNull()
    expect(data.user).toBeDefined()
    expect(data.user?.email).toBe('haryak@admin.com')
    expect(data.user?.user_metadata?.role).toBe('SUPER_ADMIN')
    expect(data.user?.user_metadata?.must_change_credentials).toBe(true)
  })

  test('2. rejects invalid password with anti-enumeration', async () => {
    const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: 'haryak@admin.com',
      password: 'WrongPassword@999',
    })

    expect(error).toBeDefined()
    expect(data.user).toBeNull()
  })

  test('3. authenticateUser resolves haryak@admin.com and returns redirect to change credentials', async () => {
    const res = await authenticateUser('haryak@admin.com', 'Haryak@123')
    expect(res.success).toBe(true)
    expect(res.user?.email).toBe('haryak@admin.com')
    expect(res.user?.mustChangeCredentials).toBe(true)
    expect(res.redirectUrl).toBe('/first-login/change-credentials')
  })

  test('4. authenticateUser fails closed for removed mock employee ID HRK-511', async () => {
    const res = await authenticateUser('HRK-511', 'Haryak@123')
    expect(res.success).toBe(false)
  })
})
