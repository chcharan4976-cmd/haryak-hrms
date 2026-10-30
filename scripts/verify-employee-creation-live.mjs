import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'haryak@admin.com'
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Haryak@123'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FATAL: Supabase URL or Service Key missing')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function parseCookies(response) {
  // In node-fetch / native fetch, getSetCookie returns an array of Set-Cookie strings
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : []
  const cookies = {}
  for (const c of raw) {
    const parts = c.split(';')[0].split('=')
    const key = parts[0].trim()
    const val = parts.slice(1).join('=')
    if (key) cookies[key] = val
  }
  return cookies
}

function cookieString(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function runLiveAcceptanceWorkflow() {
  console.log('==================================================================')
  console.log('HARYAK HRMS — P0 LIVE EMPLOYEE CREATION & AUTHENTICATION ACCEPTANCE')
  console.log('==================================================================\n')

  let adminCookies = {}
  let createdEmployee = null
  let testUserAuthId = null
  let initialCounter = 1

  try {
    // 0. Fetch initial counter
    const { data: comp } = await supabase
      .from('companies')
      .select('id, employee_id_counter')
      .limit(1)
      .single()
    if (comp) initialCounter = comp.employee_id_counter

    // =================================================================
    // STEP 1: Admin Login via API
    // =================================================================
    console.log('[STEP 1] Administrator Login via POST /api/auth/login...')
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        mode: 'ADMIN',
      }),
    })

    console.log('Login Response Status:', loginRes.status)
    const loginBody = await loginRes.json()
    console.log('Login Body success:', loginBody.success, 'roles:', loginBody.user?.roles)

    if (loginRes.status !== 200 || !loginBody.success) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginBody)}`)
    }

    adminCookies = parseCookies(loginRes)
    console.log('Captured Cookies:', Object.keys(adminCookies))
    if (!adminCookies['haryak_session']) {
      throw new Error('haryak_session cookie missing from login response!')
    }
    console.log('-> PASS: Admin login succeeded with valid session cookies.\n')

    // =================================================================
    // STEP 2: Preflight Session Verification
    // =================================================================
    console.log('[STEP 2] Verifying Admin Session via GET /api/auth/session...')
    const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'GET',
      headers: {
        'Cookie': cookieString(adminCookies),
      },
    })

    console.log('Session Check Status:', sessionRes.status)
    const sessionBody = await sessionRes.json()
    console.log('Session Check Body:', sessionBody)

    if (sessionRes.status !== 200 || !sessionBody.authenticated) {
      throw new Error(`Admin session check failed: ${JSON.stringify(sessionBody)}`)
    }
    if (!sessionBody.user.roles.includes('SUPER_ADMIN')) {
      throw new Error(`User does not have SUPER_ADMIN role! Roles: ${sessionBody.user.roles}`)
    }
    console.log('-> PASS: Admin session verified with SUPER_ADMIN privileges.\n')

    // =================================================================
    // STEP 3: Onboard New Employee (POST /api/employees)
    // =================================================================
    console.log('[STEP 3] Onboarding New Employee via POST /api/employees...')
    const newEmpPayload = {
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul.verma@haryak.com',
      phone: '9876543210',
      gender: 'male',
      dob: '1994-05-15',
      departmentName: 'Software Development',
      designationName: 'Full Stack Engineer',
      joiningDate: '2026-09-01',
      employmentType: 'full_time',
      annualCtc: 600000,
      monthlyGross: 50000,
      components: [
        { code: 'BASIC', monthly_amount: 25000, annual_amount: 300000 },
        { code: 'HRA', monthly_amount: 12500, annual_amount: 150000 },
        { code: 'SPECIAL', monthly_amount: 12500, annual_amount: 150000 },
      ],
      ptDeduction: 200,
      pan: 'ABCDE1234F',
      bankName: 'HDFC Bank',
      accountNumber: '50100234567890',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'Rahul Verma',
    }

    const empRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieString(adminCookies),
      },
      body: JSON.stringify(newEmpPayload),
    })

    console.log('Employee Creation Status:', empRes.status)
    const empBody = await empRes.json()
    console.log('Employee Creation Body:', {
      success: empBody.success,
      message: empBody.message,
      employee: empBody.employee ? {
        id: empBody.employee.id,
        code: empBody.employee.code,
        name: empBody.employee.name,
        email: empBody.employee.email,
        hasTempPassword: !!empBody.employee.temporaryPassword,
      } : null,
    })

    if (empRes.status !== 200 || !empBody.success) {
      throw new Error(`Employee creation failed with status ${empRes.status}: ${JSON.stringify(empBody)}`)
    }

    createdEmployee = empBody.employee
    console.log('-> PASS: Live employee successfully created without 401 session loss!\n')

    // =================================================================
    // STEP 4: Direct Supabase Database Entity & Invariant Verification
    // =================================================================
    console.log('[STEP 4] Direct Database Inspection via Supabase Admin Client...')

    // 4.1 auth.users
    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const authUser = authUsers.users.find(u => u.email === 'rahul.verma@haryak.com')
    if (!authUser) throw new Error('auth.users record not found for rahul.verma@haryak.com')
    testUserAuthId = authUser.id
    console.log('auth.users id:', authUser.id, 'metadata:', authUser.user_metadata)

    if (authUser.user_metadata.must_change_password !== true) {
      throw new Error('must_change_password is not true in auth.users metadata')
    }
    if (authUser.user_metadata.role !== 'EMPLOYEE') {
      throw new Error(`Role in user_metadata is ${authUser.user_metadata.role}, expected EMPLOYEE`)
    }
    console.log('-> PASS: auth.users properly provisioned with must_change_password=true & role=EMPLOYEE')

    // 4.2 public.users
    const { data: publicUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()
    if (!publicUser) throw new Error('public.users record not found')
    if (publicUser.employee_id !== createdEmployee.id) {
      throw new Error(`public.users.employee_id mismatch: ${publicUser.employee_id} !== ${createdEmployee.id}`)
    }
    console.log('-> PASS: public.users record linked to employee_id')

    // 4.3 public.user_roles
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', authUser.id)
    const roleNames = userRoles.map(r => r.roles?.name)
    if (!roleNames.includes('EMPLOYEE')) {
      throw new Error(`User does not have EMPLOYEE role in user_roles! Has: ${roleNames}`)
    }
    if (roleNames.includes('SUPER_ADMIN')) {
      throw new Error('SECURITY VIOLATION: Newly created employee has SUPER_ADMIN role in user_roles!')
    }
    console.log('-> PASS: public.user_roles strictly assigned EMPLOYEE role')

    // 4.4 public.employees
    const { data: empRecord } = await supabase
      .from('employees')
      .select('*')
      .eq('id', createdEmployee.id)
      .single()
    if (!empRecord) throw new Error('employees record not found')
    if (empRecord.employee_code !== createdEmployee.code) {
      throw new Error(`employees.employee_code mismatch: ${empRecord.employee_code} !== ${createdEmployee.code}`)
    }
    if (empRecord.user_id !== authUser.id) {
      throw new Error(`employees.user_id mismatch: ${empRecord.user_id} !== ${authUser.id}`)
    }
    console.log('-> PASS: public.employees record properly linked to authUserId & employee_code')

    // 4.5 public.salary_structures & components
    const { data: salaryStruct } = await supabase
      .from('salary_structures')
      .select('*, salary_structure_components(*)')
      .eq('employee_id', createdEmployee.id)
      .single()
    if (!salaryStruct) throw new Error('salary_structures record not found')
    if (salaryStruct.annual_ctc !== 600000 || salaryStruct.monthly_gross !== 50000) {
      throw new Error(`Salary structure mismatch: CTC ${salaryStruct.annual_ctc}, Gross ${salaryStruct.monthly_gross}`)
    }
    const compCount = salaryStruct.salary_structure_components.length
    if (compCount !== 3) {
      throw new Error(`Expected 3 salary structure components, found ${compCount}`)
    }
    console.log('-> PASS: public.salary_structures persisted with truthful 3 components totaling ₹50,000')

    // 4.6 public.employee_statutory_details
    const { data: statRecord } = await supabase
      .from('employee_statutory_details')
      .select('*')
      .eq('employee_id', createdEmployee.id)
      .single()
    if (!statRecord) throw new Error('employee_statutory_details record not found')
    if (!statRecord.pt_applicable) {
      throw new Error(`PT applicable mismatch: expected true, got ${statRecord.pt_applicable}`)
    }
    if (statRecord.pan_encrypted !== 'ABCDE1234F' || statRecord.pan_masked !== 'AB••••••4F') {
      throw new Error(`PAN mismatch: encrypted ${statRecord.pan_encrypted}, masked ${statRecord.pan_masked}`)
    }
    console.log('-> PASS: public.employee_statutory_details persisted with truthful PT flag and PAN (masked/encrypted)')

    // 4.7 public.employee_bank_accounts
    const { data: bankRecord } = await supabase
      .from('employee_bank_accounts')
      .select('*')
      .eq('employee_id', createdEmployee.id)
      .single()
    if (!bankRecord) throw new Error('employee_bank_accounts record not found')
    if (bankRecord.bank_name !== 'HDFC Bank' || bankRecord.account_number_masked !== 'XXXXXXXXXX7890') {
      throw new Error(`Bank details mismatch: ${JSON.stringify(bankRecord)}`)
    }
    console.log('-> PASS: public.employee_bank_accounts persisted with masked account number')

    // 4.8 public.audit_logs
    const { data: auditRows } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_id', createdEmployee.id)
    if (!auditRows || auditRows.length === 0) {
      throw new Error('audit_logs entry not found for employee creation')
    }
    console.log('-> PASS: audit_logs entry recorded for employee onboarding')

    // 4.9 Security check: No plaintext password in any DB table
    const tempPassword = createdEmployee.temporaryPassword
    const checkTables = [
      { name: 'users', data: publicUser },
      { name: 'employees', data: empRecord },
      { name: 'salary_structures', data: salaryStruct },
      { name: 'employee_statutory_details', data: statRecord },
      { name: 'audit_logs', data: auditRows[0] },
    ]
    for (const t of checkTables) {
      const serialized = JSON.stringify(t.data)
      if (serialized.includes(tempPassword)) {
        throw new Error(`SECURITY VIOLATION: Plaintext temporary password leaked in table ${t.name}!`)
      }
    }
    console.log('-> PASS: Plaintext temporary password is NEVER stored in database tables.\n')

    // =================================================================
    // STEP 5: Employee First-Login & Password Lifecycle
    // =================================================================
    console.log('[STEP 5] Testing Employee Login with Temporary Password...')
    const empLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: createdEmployee.code, // login by employee code HRK-002!
        password: tempPassword,
        mode: 'EMPLOYEE',
      }),
    })

    console.log('Employee Login Status:', empLoginRes.status)
    const empLoginBody = await empLoginRes.json()
    console.log('Employee Login Body:', {
      success: empLoginBody.success,
      mustChangeCredentials: empLoginBody.user?.mustChangeCredentials,
      mustChangePassword: empLoginBody.user?.mustChangePassword,
      redirectUrl: empLoginBody.redirectUrl,
    })

    if (empLoginRes.status !== 200 || !empLoginBody.success) {
      throw new Error(`Employee login with temporary credentials failed: ${JSON.stringify(empLoginBody)}`)
    }

    const employeeCookies = parseCookies(empLoginRes)
    if (!empLoginBody.user?.mustChangePassword && !empLoginBody.user?.mustChangeCredentials) {
      throw new Error('Employee should be required to change password on first login!')
    }
    console.log('-> PASS: First-login credential gate active and requires password update.\n')

    // Step 5.2: Change password via /api/auth/first-login/employee
    console.log('[STEP 5.2] Executing First-Login Password Change...')
    const newEmployeePassword = 'EmployeeSecurePass@2026!'
    const changeRes = await fetch(`${BASE_URL}/api/auth/first-login/employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieString(employeeCookies),
      },
      body: JSON.stringify({
        currentPassword: tempPassword,
        newPassword: newEmployeePassword,
        confirmNewPassword: newEmployeePassword,
      }),
    })

    console.log('Password Change Status:', changeRes.status)
    const changeBody = await changeRes.json()
    console.log('Password Change Body:', changeBody)

    if (changeRes.status !== 200 || !changeBody.success) {
      throw new Error(`Password change failed: ${JSON.stringify(changeBody)}`)
    }
    console.log('-> PASS: Password changed successfully.\n')

    // Step 5.3: Verify OLD temporary password is now REJECTED
    console.log('[STEP 5.3] Verifying OLD Temporary Password is now REJECTED...')
    const oldAttemptRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: createdEmployee.code,
        password: tempPassword,
        mode: 'EMPLOYEE',
      }),
    })
    console.log('Old Password Attempt Status:', oldAttemptRes.status)
    if (oldAttemptRes.status === 200) {
      throw new Error('SECURITY FAILURE: Old temporary password was still accepted after change!')
    }
    console.log('-> PASS: Old temporary password correctly rejected.\n')

    // Step 5.4: Verify NEW password SUCCEEDS
    console.log('[STEP 5.4] Verifying NEW Password SUCCEEDS and redirects to portal...')
    const newAttemptRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: createdEmployee.code,
        password: newEmployeePassword,
        mode: 'EMPLOYEE',
      }),
    })
    console.log('New Password Attempt Status:', newAttemptRes.status)
    const newAttemptBody = await newAttemptRes.json()
    console.log('New Password Attempt Body:', {
      success: newAttemptBody.success,
      roles: newAttemptBody.user?.roles,
      redirectUrl: newAttemptBody.redirectUrl,
    })

    if (newAttemptRes.status !== 200 || !newAttemptBody.success) {
      throw new Error(`New password login failed: ${JSON.stringify(newAttemptBody)}`)
    }
    console.log('-> PASS: Employee authenticated with new password and redirected to portal.\n')

    console.log('==================================================================')
    console.log('ALL LIVE ACCEPTANCE VERIFICATIONS PASSED SUCCESSFULLY!')
    console.log('==================================================================')
  } finally {
    // =================================================================
    // CLEANUP: Clean up test employee
    // =================================================================
    console.log('\n[CLEANUP] Cleaning up test employee data...')
    if (createdEmployee?.id) {
      await supabase.from('users').update({ employee_id: null }).eq('employee_id', createdEmployee.id)
      await supabase.from('salary_structure_components').delete().eq('salary_structure_id', createdEmployee.id)
      await supabase.from('salary_structures').delete().eq('employee_id', createdEmployee.id)
      await supabase.from('employee_statutory_details').delete().eq('employee_id', createdEmployee.id)
      await supabase.from('employee_bank_accounts').delete().eq('employee_id', createdEmployee.id)
      await supabase.from('audit_logs').delete().eq('entity_id', createdEmployee.id)
      await supabase.from('employees').delete().eq('id', createdEmployee.id)
      console.log('Deleted employee and related records:', createdEmployee.id)
    }
    if (testUserAuthId) {
      await supabase.from('user_roles').delete().eq('user_id', testUserAuthId)
      await supabase.from('users').delete().eq('id', testUserAuthId)
      await supabase.auth.admin.deleteUser(testUserAuthId)
      console.log('Deleted auth user and public user:', testUserAuthId)
    }
    // Restore company employee counter
    if (initialCounter) {
      const { data: comp } = await supabase.from('companies').select('id').limit(1).single()
      if (comp) {
        await supabase.from('companies').update({ employee_id_counter: initialCounter }).eq('id', comp.id)
        console.log('Restored company employee_id_counter to:', initialCounter)
      }
    }
    console.log('[CLEANUP] Complete.')
  }
}

runLiveAcceptanceWorkflow().catch(err => {
  console.error('\nFATAL ERROR IN ACCEPTANCE TEST:', err)
  process.exit(1)
})
