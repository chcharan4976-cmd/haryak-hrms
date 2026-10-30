import { authenticateUser, updateInitialAdminCredentials } from '../src/lib/auth/auth-service.ts'
import { createClient } from '@supabase/supabase-js'

async function runLiveAuthTests() {
  console.log('====================================================')
  console.log('LIVE SUPABASE AUTHENTICATION TEST SUITE')
  console.log('====================================================')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  console.log('Supabase URL:', url)

  // Step 1: Initial Login with haryak@admin.com / Haryak@123
  console.log('\n[TEST 1] Testing Real Supabase Login for haryak@admin.com / Haryak@123...')
  const initialRes = await authenticateUser('haryak@admin.com', 'Haryak@123')
  console.log('Result:', initialRes)

  if (!initialRes.success) {
    console.error('FAILED: Initial admin login failed against Supabase Auth.')
    process.exit(1)
  }
  if (initialRes.redirectUrl !== '/first-login/change-credentials') {
    console.error('FAILED: Redirect URL is not /first-login/change-credentials. Received:', initialRes.redirectUrl)
    process.exit(1)
  }
  console.log('-> PASS: Initial login succeeded & directed to First-Login Credential Change screen!')

  // Step 2: Invalid Password Rejection
  console.log('\n[TEST 2] Testing Invalid Password Rejection (Anti-Enumeration)...')
  const invalidRes = await authenticateUser('haryak@admin.com', 'WrongPassword@999')
  console.log('Result:', invalidRes)

  if (invalidRes.success || invalidRes.error !== 'Invalid Employee ID/email or password.') {
    console.error('FAILED: Expected generic error message.')
    process.exit(1)
  }
  console.log('-> PASS: Invalid password correctly rejected with anti-enumeration message.')

  // Step 3: First Admin Credential Change Flow (Update to New Password & Email in Supabase Auth)
  console.log('\n[TEST 3] Updating Admin Credentials in Real Supabase Auth...')
  const newEmail = 'admin.security@haryak.com'
  const newPassword = 'SecureAdminPassword@2026'

  const updateRes = await updateInitialAdminCredentials('Haryak@123', newEmail, newPassword)
  console.log('Update Result:', updateRes)

  if (!updateRes.success) {
    console.error('FAILED: updateInitialAdminCredentials failed:', updateRes.error)
    process.exit(1)
  }
  console.log('-> PASS: Supabase Auth credentials updated successfully!')

  // Step 4: Verify Old Password FAILS
  console.log('\n[TEST 4] Verifying Old Password FAILS against Supabase Auth...')
  const oldLoginRes = await authenticateUser('haryak@admin.com', 'Haryak@123')
  console.log('Old Login Attempt Result:', oldLoginRes)

  if (oldLoginRes.success) {
    console.error('FAILED: Old password still succeeded after credential change!')
    process.exit(1)
  }
  console.log('-> PASS: Old password successfully rejected by Supabase Auth!')

  // Step 5: Verify NEW Credentials SUCCEED
  console.log('\n[TEST 5] Verifying NEW Credentials SUCCEED against Supabase Auth...')
  const newLoginRes = await authenticateUser(newEmail, newPassword)
  console.log('New Login Attempt Result:', newLoginRes)

  if (!newLoginRes.success) {
    console.error('FAILED: New credentials failed against Supabase Auth:', newLoginRes.error)
    process.exit(1)
  }
  if (newLoginRes.redirectUrl !== '/dashboard') {
    console.error('FAILED: Expected direct redirect to /dashboard. Received:', newLoginRes.redirectUrl)
    process.exit(1)
  }
  console.log('-> PASS: New credentials authenticated and routed directly to Executive Dashboard!')

  // Step 6: Reset Back to Bootstrap Admin for Clean Deployment State
  console.log('\n[RESET] Restoring clean initial bootstrap account for testing...')
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { data: listData } = await adminClient.auth.admin.listUsers()
  const currentAdmin = listData.users.find(u => u.email?.toLowerCase() === newEmail || u.email?.toLowerCase() === 'haryak@admin.com')
  if (currentAdmin) {
    await adminClient.auth.admin.updateUserById(currentAdmin.id, {
      email: 'haryak@admin.com',
      password: 'Haryak@123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Super Administrator',
        role: 'SUPER_ADMIN',
        must_change_credentials: true,
      }
    })
    console.log('-> Reset complete: haryak@admin.com / Haryak@123 restored with must_change_credentials = TRUE.')
  }

  console.log('\n====================================================')
  console.log('ALL 5 LIVE SUPABASE AUTHENTICATION TESTS PASSED!')
  console.log('====================================================')
}

runLiveAuthTests()
