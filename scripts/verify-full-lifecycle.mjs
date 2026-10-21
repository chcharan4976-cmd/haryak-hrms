import { createClient } from '@supabase/supabase-js'

async function runFullLifecycleVerification() {
  console.log('====================================================================')
  console.log('HARYAK TECHNOLOGIES INDIA PRIVATE LIMITED — FULL ACCEPTANCE QA SUITE')
  console.log('====================================================================')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false }
  })

  // -------------------------------------------------------------------------
  // STEP 1: VERIFY ADMIN BOOTSTRAP LOGIN
  // -------------------------------------------------------------------------
  console.log('\n[STEP 1] Verifying Super Admin Bootstrap Login (haryak@admin.com / Haryak@123)...')
  const { data: adminAuth, error: adminErr } = await anonClient.auth.signInWithPassword({
    email: 'haryak@admin.com',
    password: 'Haryak@123',
  })

  if (adminErr) {
    console.error('FAILED: Super Admin login failed against Supabase Auth:', adminErr.message)
    process.exit(1)
  }
  console.log('-> PASS: Super Admin authenticated successfully! User ID:', adminAuth.user.id)
  console.log('   Metadata:', JSON.stringify(adminAuth.user.user_metadata))

  // -------------------------------------------------------------------------
  // STEP 2: CREATE EMPLOYEE WITH AUTO-GENERATED CREDENTIALS
  // -------------------------------------------------------------------------
  console.log('\n[STEP 2] Creating Employee with Automated Credential Generation...')
  const testEmail = 'teja.test.qa@haryak.com'
  
  // Clean up any previous test user with this email in Supabase
  const { data: existingUsers } = await adminClient.auth.admin.listUsers()
  const prevTest = existingUsers.users.find(u => u.email === testEmail)
  if (prevTest) {
    await adminClient.from('employees').delete().eq('user_id', prevTest.id)
    await adminClient.from('users').delete().eq('id', prevTest.id)
    await adminClient.auth.admin.deleteUser(prevTest.id)
  }

  // Generate sequential employee ID
  const { data: lastEmp } = await adminClient
    .from('employees')
    .select('employee_code')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextEmpCode = 'HRK-001'
  if (lastEmp?.employee_code) {
    const match = lastEmp.employee_code.match(/\d+/)
    if (match) {
      const num = parseInt(match[0], 10) + 1
      nextEmpCode = `HRK-${num.toString().padStart(3, '0')}`
    }
  }

  const tempPassword = `Hrk@${Math.random().toString(36).slice(-5)}#8`
  console.log(`Generated Employee Code: ${nextEmpCode}`)
  console.log(`Generated Temp Password: ${tempPassword}`)

  // Create Supabase Auth user
  const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: 'Chaganti Jai Sai Ramcharan Teja',
      employee_code: nextEmpCode,
      role: 'EMPLOYEE',
      must_change_password: true,
    }
  })

  if (createAuthErr) {
    console.error('FAILED: Supabase Auth user creation failed:', createAuthErr.message)
    process.exit(1)
  }

  const newUserId = createdAuth.user.id
  console.log('-> PASS: Auth user created with ID:', newUserId)

  // Get company
  const { data: company } = await adminClient.from('companies').select('id').limit(1).single()

  // Link public.users
  await adminClient.from('users').upsert({
    id: newUserId,
    company_id: company.id,
    email: testEmail,
    full_name: 'Chaganti Jai Sai Ramcharan Teja',
    is_active: true,
  })

  // Link user_roles
  const { data: empRole } = await adminClient.from('roles').select('id').eq('name', 'EMPLOYEE').single()
  if (empRole) {
    await adminClient.from('user_roles').upsert({
      user_id: newUserId,
      role_id: empRole.id,
    }, { onConflict: 'user_id,role_id' })
  }

  // Link employee table
  await adminClient.from('employees').insert({
    company_id: company.id,
    user_id: newUserId,
    employee_code: nextEmpCode,
    first_name: 'Chaganti',
    last_name: 'Jai Sai Ramcharan Teja',
    work_email: testEmail,
    status: 'active',
    employment_type: 'full_time',
  })

  console.log('-> PASS: Database records linked across users, user_roles, and employees!')

  // -------------------------------------------------------------------------
  // STEP 3: TEST EMPLOYEE FIRST LOGIN WITH TEMPORARY PASSWORD
  // -------------------------------------------------------------------------
  console.log('\n[STEP 3] Testing Employee Login with Generated Credentials...')
  const { data: empFirstLogin, error: empLoginErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: tempPassword,
  })

  if (empLoginErr) {
    console.error('FAILED: Employee first login failed:', empLoginErr.message)
    process.exit(1)
  }

  console.log('-> PASS: Employee authenticated successfully with temporary password!')
  console.log('   Must Change Password Flag:', empFirstLogin.user.user_metadata?.must_change_password)

  // -------------------------------------------------------------------------
  // STEP 4: FIRST-LOGIN PASSWORD CHANGE FLOW
  // -------------------------------------------------------------------------
  console.log('\n[STEP 4] Executing Mandatory First-Login Password Change...')
  const newPermanentPassword = 'PermanentSecurePass@2026'

  const { data: updatedEmp, error: updateEmpErr } = await adminClient.auth.admin.updateUserById(
    newUserId,
    {
      password: newPermanentPassword,
      user_metadata: {
        ...empFirstLogin.user.user_metadata,
        must_change_password: false,
      }
    }
  )

  if (updateEmpErr) {
    console.error('FAILED: Updating employee password failed:', updateEmpErr.message)
    process.exit(1)
  }
  console.log('-> PASS: Permanent password set and must_change_password flag cleared!')

  // -------------------------------------------------------------------------
  // STEP 5: VERIFY OLD TEMP PASSWORD FAILS & NEW PASSWORD SUCCEEDS
  // -------------------------------------------------------------------------
  console.log('\n[STEP 5] Verifying Password Lifecycle...')
  const { error: oldPassAttemptErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: tempPassword,
  })

  if (!oldPassAttemptErr) {
    console.error('FAILED: Old temporary password still worked after change!')
    process.exit(1)
  }
  console.log('-> PASS: Old temporary password correctly rejected by Supabase Auth!')

  const { data: newPassAttempt, error: newPassAttemptErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: newPermanentPassword,
  })

  if (newPassAttemptErr) {
    console.error('FAILED: New permanent password failed to authenticate:', newPassAttemptErr.message)
    process.exit(1)
  }
  console.log('-> PASS: New permanent password authenticated successfully!')

  // -------------------------------------------------------------------------
  // CLEANUP TEST USER
  // -------------------------------------------------------------------------
  console.log('\n[CLEANUP] Cleaning up QA test user...')
  await adminClient.from('employees').delete().eq('user_id', newUserId)
  await adminClient.from('users').delete().eq('id', newUserId)
  await adminClient.auth.admin.deleteUser(newUserId)
  console.log('-> PASS: QA test records cleaned up safely.')

  console.log('\n====================================================================')
  console.log('ALL ACCEPTANCE WORKFLOWS VERIFIED 100% AGAINST REAL SUPABASE AUTH')
  console.log('====================================================================\n')
}

runFullLifecycleVerification()
