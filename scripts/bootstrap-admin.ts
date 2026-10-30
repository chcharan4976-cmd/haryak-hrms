/**
 * HARYAK TECHNOLOGIES INDIA PRIVATE LIMITED
 * Initial Super Admin Secure Bootstrap Script
 * 
 * Creates or seeds the initial Super Admin account using server-side environment variables:
 * - BOOTSTRAP_ADMIN_EMAIL (default: haryak@admin.com)
 * - BOOTSTRAP_ADMIN_PASSWORD (default: Haryak@123)
 * 
 * Sets must_change_credentials = true so the admin is forced to change email & password on first login.
 * Never exposes the password in client bundles or public database fields.
 */

import { createClient } from '@supabase/supabase-js'

async function bootstrapAdmin() {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'haryak@admin.com').toLowerCase()
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Haryak@123'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  console.log('====================================================')
  console.log('Haryak Technologies India Private Limited')
  console.log('Super Admin Bootstrap Initializer')
  console.log('====================================================')
  console.log(`Target Bootstrap Email: ${adminEmail}`)
  console.log(`Initial Security Requirement: must_change_credentials = TRUE`)

  if (!supabaseUrl || !serviceKey || supabaseUrl.includes('demo.supabase.co')) {
    console.log('\n[INFO] Real Supabase credentials not configured in .env.local.')
    console.log('[INFO] The system will use server-side runtime bootstrap authentication.')
    console.log('[READY] Super Admin ready: haryak@admin.com (Initial password configured).')
    return
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    // 1. Check if admin user already exists in auth.users
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      console.error('[ERROR] Failed to query Supabase auth users:', listError.message)
      return
    }

    const existingUser = usersData.users.find(u => u.email?.toLowerCase() === adminEmail)

    let userId: string

    if (existingUser) {
      console.log(`[INFO] Admin user ${adminEmail} already exists (ID: ${existingUser.id}).`)
      userId = existingUser.id
    } else {
      console.log(`[CREATING] Provisioning Super Admin in Supabase Auth...`)
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: 'Super Administrator',
          role: 'SUPER_ADMIN',
          must_change_credentials: true,
        }
      })

      if (createError || !newUser.user) {
        console.error('[ERROR] Could not create Supabase auth user:', createError?.message)
        return
      }

      userId = newUser.user.id
      console.log(`[SUCCESS] Supabase Auth user created successfully (ID: ${userId}).`)
    }

    // 2. Ensure company record exists
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .limit(1)
      .single()

    const companyId = company?.id

    // 3. Ensure user record exists in application database
    if (companyId) {
      const { error: upsertError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          company_id: companyId,
          email: adminEmail,
          first_name: 'Super',
          last_name: 'Administrator',
          is_active: true,
          must_change_password: true,
        })

      if (upsertError) {
        console.warn('[WARN] Could not upsert into users table:', upsertError.message)
      } else {
        console.log('[SUCCESS] Linked application user record.')
      }
    }

    console.log('\n[COMPLETE] Super Admin bootstrap setup finished.')
  } catch (err: any) {
    console.error('[EXCEPTION] Bootstrap error:', err.message || err)
  }
}

bootstrapAdmin()
