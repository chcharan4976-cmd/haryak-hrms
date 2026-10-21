import { createClient } from '@supabase/supabase-js'

async function checkSupabaseUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log('=== SUPABASE REAL CONNECTIVITY & USER CHECK ===')
  console.log('URL configured:', url ? 'YES' : 'NO')
  console.log('Anon key configured:', anonKey ? 'YES' : 'NO')
  console.log('Service key configured:', serviceKey ? 'YES' : 'NO')

  if (!url || !serviceKey) {
    console.error('Missing configuration in .env.local')
    return
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // 1. List users from auth.users
  console.log('\n1. Checking auth.users...')
  try {
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers()
    if (listError) {
      console.error('Error listing auth.users:', listError.message)
    } else {
      console.log(`Found ${listData.users.length} users in auth.users:`)
      for (const u of listData.users) {
        console.log(`- ID: ${u.id}, Email: ${u.email}, Created: ${u.created_at}, Confirmed: ${u.email_confirmed_at ? 'YES' : 'NO'}`)
        console.log(`  User Metadata:`, JSON.stringify(u.user_metadata))
      }
    }
  } catch (err: any) {
    console.error('Failed to query auth.users:', err.message || err)
  }

  // 2. Check public tables
  console.log('\n2. Checking public schema tables...')
  try {
    const { data: companies, error: compErr } = await adminClient.from('companies').select('*')
    console.log('Companies:', compErr ? `Error: ${compErr.message}` : `Found ${companies?.length || 0} companies`)

    const { data: users, error: userErr } = await adminClient.from('users').select('*')
    console.log('Users (public.users):', userErr ? `Error: ${userErr.message}` : `Found ${users?.length || 0} users`)

    const { data: roles, error: roleErr } = await adminClient.from('roles').select('*')
    console.log('Roles:', roleErr ? `Error: ${roleErr.message}` : `Found ${roles?.length || 0} roles`)
  } catch (err: any) {
    console.error('Failed to query public tables:', err.message || err)
  }

  // 3. Test signInWithPassword using Anon client
  console.log('\n3. Testing Anon client signInWithPassword for haryak@admin.com / Haryak@123...')
  try {
    const anonClient = createClient(url, anonKey!, {
      auth: { persistSession: false }
    })
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: 'haryak@admin.com',
      password: 'Haryak@123',
    })

    if (authError) {
      console.log('Sign in Result: FAILED ->', authError.message)
    } else {
      console.log('Sign in Result: SUCCESS! User ID:', authData.user.id)
    }
  } catch (err: any) {
    console.error('Sign in exception:', err.message || err)
  }
}

checkSupabaseUser()
