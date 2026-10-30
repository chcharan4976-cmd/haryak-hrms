import { createClient } from '@supabase/supabase-js'

async function bootstrapAdmin() {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'haryak@admin.com').toLowerCase()
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Haryak@123'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  console.log('====================================================')
  console.log('Haryak Technologies India Private Limited')
  console.log('Super Admin Real Supabase Initializer / Reset')
  console.log('====================================================')
  console.log(`Supabase URL: ${supabaseUrl}`)
  console.log(`Target Bootstrap Email: ${adminEmail}`)
  console.log(`Target Initial Password: ${adminPassword}`)

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: Missing Supabase credentials in environment.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // 1. Check or Create/Reset in auth.users
  console.log('\n[1/5] Configuring Supabase Auth User...')
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('Failed to query auth.users:', listError.message)
    process.exit(1)
  }

  let adminUserId = ''
  const existingUser = usersData.users.find(u => u.email?.toLowerCase() === adminEmail)

  if (existingUser) {
    console.log(`Found existing auth user: ${existingUser.id}. Resetting password to "${adminPassword}" and confirming email...`)
    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: 'Super Administrator',
          role: 'SUPER_ADMIN',
          must_change_credentials: true,
        }
      }
    )
    if (updateError) {
      console.error('Failed to update auth user password:', updateError.message)
      process.exit(1)
    }
    adminUserId = updated.user.id
    console.log('-> Auth user password updated and verified successfully!')
  } else {
    console.log(`Creating new auth user for ${adminEmail}...`)
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Super Administrator',
        role: 'SUPER_ADMIN',
        must_change_credentials: true,
      }
    })
    if (createError) {
      console.error('Failed to create auth user:', createError.message)
      process.exit(1)
    }
    adminUserId = created.user.id
    console.log(`-> Auth user created with ID: ${adminUserId}`)
  }

  // 2. Ensure Company Record Exists
  console.log('\n[2/5] Ensuring Company Record exists in public.companies...')
  let companyId = ''
  const { data: existingCompany } = await supabase.from('companies').select('id').limit(1).maybeSingle()

  if (existingCompany) {
    companyId = existingCompany.id
    console.log(`Using existing company ID: ${companyId}`)
  } else {
    const { data: newCompany, error: compErr } = await supabase.from('companies').insert({
      name: 'Haryak Technologies India Private Limited',
      legal_name: 'Haryak Technologies India Private Limited',
      website: 'https://haryak.com',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      employee_id_prefix: 'HRK',
    }).select('id').single()

    if (compErr) {
      console.error('Failed to insert company:', compErr.message)
    } else {
      companyId = newCompany.id
      console.log(`Created company record with ID: ${companyId}`)
    }
  }

  // 3. Ensure Roles Exist
  console.log('\n[3/5] Ensuring default roles exist in public.roles...')
  if (companyId) {
    const rolesToCreate = [
      { company_id: companyId, name: 'SUPER_ADMIN', display_name: 'Super Administrator', description: 'Full access', is_system: true },
      { company_id: companyId, name: 'HR_ADMIN', display_name: 'HR Administrator', description: 'HR and employee operations', is_system: true },
      { company_id: companyId, name: 'PAYROLL_ADMIN', display_name: 'Payroll Administrator', description: 'Payroll and compensation', is_system: true },
      { company_id: companyId, name: 'MANAGER', display_name: 'Manager', description: 'Team approvals and attendance', is_system: true },
      { company_id: companyId, name: 'EMPLOYEE', display_name: 'Employee', description: 'Employee self service', is_system: true },
    ]

    for (const r of rolesToCreate) {
      await supabase.from('roles').upsert(r, { onConflict: 'company_id,name' })
    }
    console.log('-> Roles configured.')
  }

  // 4. Ensure public.users Record Exists Linked to Auth User
  console.log('\n[4/5] Linking public.users record...')
  if (companyId && adminUserId) {
    const { error: userUpsertError } = await supabase.from('users').upsert({
      id: adminUserId,
      company_id: companyId,
      email: adminEmail,
      full_name: 'Super Administrator',
      is_active: true,
    })

    if (userUpsertError) {
      console.error('Failed to upsert public.users:', userUpsertError.message)
    } else {
      console.log('-> public.users linked with auth.users.id.')
    }

    // Link user_roles
    const { data: superAdminRole } = await supabase
      .from('roles')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', 'SUPER_ADMIN')
      .single()

    if (superAdminRole) {
      await supabase.from('user_roles').upsert({
        user_id: adminUserId,
        role_id: superAdminRole.id,
      }, { onConflict: 'user_id,role_id' })
      console.log('-> user_roles linked to SUPER_ADMIN.')
    }
  }

  // 5. Seed Sample Active Employees for Testing
  console.log('\n[5/5] Seeding demo employees for Employee ID testing (HRK-511)...')
  if (companyId) {
    // Check if HRK-511 exists in employees table
    const { data: existingEmp } = await supabase.from('employees').select('id').eq('employee_code', 'HRK-511').maybeSingle()
    if (!existingEmp) {
      // Create auth user for HRK-511
      const empEmail = 'chaganti.teja@haryak.com'
      const { data: empAuth } = await supabase.auth.admin.createUser({
        email: empEmail,
        password: 'Haryak@123',
        email_confirm: true,
        user_metadata: {
          full_name: 'Chaganti Jai Sai Ramcharan Teja',
          role: 'EMPLOYEE',
          must_change_password: false,
        }
      })

      if (empAuth?.user) {
        // Create user record
        await supabase.from('users').upsert({
          id: empAuth.user.id,
          company_id: companyId,
          email: empEmail,
          first_name: 'Chaganti',
          last_name: 'Jai Sai Ramcharan Teja',
          is_active: true,
          must_change_password: false,
        })

        // Create employee record
        await supabase.from('employees').insert({
          company_id: companyId,
          user_id: empAuth.user.id,
          employee_code: 'HRK-511',
          first_name: 'Chaganti',
          last_name: 'Jai Sai Ramcharan Teja',
          work_email: empEmail,
          joining_date: '2024-01-15',
          employment_type: 'full_time',
          status: 'active',
        })
        console.log('-> Created Employee HRK-511 (Chaganti Jai Sai Ramcharan Teja).')
      }
    } else {
      console.log('-> Employee HRK-511 already configured.')
    }
  }

  // Verify Sign In
  console.log('\n====================================================')
  console.log('VERIFYING AUTHENTICATION WITH SUPABASE CLIENT')
  console.log('====================================================')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false }
  })

  const { data: testAuth, error: testAuthError } = await anonClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  })

  if (testAuthError) {
    console.error('[FAIL] Supabase signInWithPassword failed:', testAuthError.message)
    process.exit(1)
  } else {
    console.log('[SUCCESS] REAL SUPABASE AUTHENTICATION SUCCEEDED!')
    console.log(`User ID: ${testAuth.user.id}`)
    console.log(`Email: ${testAuth.user.email}`)
    console.log(`Metadata:`, JSON.stringify(testAuth.user.user_metadata))
  }
}

bootstrapAdmin()
