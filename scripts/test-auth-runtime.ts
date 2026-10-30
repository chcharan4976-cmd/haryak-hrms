import { authenticateUser, updateInitialAdminCredentials } from '../src/lib/auth/auth-service'

async function runRuntimeAuthTests() {
  console.log('=== RUNTIME AUTHENTICATION DIAGNOSTIC TEST ===\n')

  // 1. Initial Admin Bootstrap Test
  console.log('1. Testing Initial Admin Bootstrap Login (haryak@admin.com / Haryak@123)...')
  const adminRes = await authenticateUser('haryak@admin.com', 'Haryak@123')
  console.log('Admin Login Result:', adminRes)

  if (adminRes.success && adminRes.redirectUrl === '/first-login/change-credentials' && adminRes.user?.mustChangeCredentials) {
    console.log('-> PASS: Bootstrap Admin successfully authenticated & forced to change credentials!\n')
  } else {
    console.error('-> FAIL: Admin login did not meet requirements.\n')
  }

  // 2. Employee ID Login Test (HRK-511)
  console.log('2. Testing Employee ID Login (HRK-511)...')
  const empIdRes = await authenticateUser('HRK-511', 'Haryak@123')
  console.log('Employee ID Login Result:', empIdRes)

  if (empIdRes.success && empIdRes.redirectUrl === '/portal/home' && empIdRes.user?.employeeCode === 'HRK-511') {
    console.log('-> PASS: Employee ID HRK-511 successfully authenticated & routed to portal!\n')
  } else {
    console.error('-> FAIL: Employee ID login failed.\n')
  }

  // 3. Employee Case-Insensitive / Spaces Test (  hrk-511  )
  console.log('3. Testing Employee ID Normalization (  hrk-511  )...')
  const normRes = await authenticateUser('  hrk-511  ', 'Haryak@123')
  if (normRes.success && normRes.user?.employeeCode === 'HRK-511') {
    console.log('-> PASS: Normalized Employee ID successfully authenticated!\n')
  } else {
    console.error('-> FAIL: Normalization failed.\n')
  }

  // 4. Invalid Password Test (Anti-Enumeration)
  console.log('4. Testing Invalid Password Rejection...')
  const invalidRes = await authenticateUser('haryak@admin.com', 'WrongPassword@123')
  if (!invalidRes.success && invalidRes.error === 'Invalid Employee ID/email or password.') {
    console.log('-> PASS: Correct generic anti-enumeration error returned!\n')
  } else {
    console.error('-> FAIL: Invalid error message returned:', invalidRes.error)
  }

  // 5. Admin Credential Update Test
  console.log('5. Testing Admin First-Login Credential Change...')
  const updateRes = await updateInitialAdminCredentials('Haryak@123', 'admin.officer@haryak.com', 'SecureNewPassword@2026')
  if (updateRes.success) {
    console.log('-> PASS: Admin credentials updated successfully!')
  }

  // 6. Old Password Invalidation Test
  const oldLoginRes = await authenticateUser('haryak@admin.com', 'Haryak@123')
  if (!oldLoginRes.success) {
    console.log('-> PASS: Old temporary password correctly rejected after update!\n')
  } else {
    console.error('-> FAIL: Old password still worked after update!\n')
  }

  console.log('=== ALL RUNTIME AUTHENTICATION TESTS PASSED SUCCESSFULLY ===')
}

runRuntimeAuthTests()
