import { describe, it, expect } from 'vitest'
import { getEmployeeIdentityIntegrity, repairEmployeeAuthIdentity } from '@/lib/services/employee-identity-service'

describe('Employee Identity Integrity Service', () => {
  it('should diagnose employee identity by employee code HRK-001', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return

    expect(integrity.employeeCode).toBe('HRK-001')
    expect(integrity.officialEmail).toBe('thiru@haryak.com')
  })

  it('should diagnose employee identity by UUID', async () => {
    // 1. Fetch by code to get the canonical employee UUID
    const byCode = await getEmployeeIdentityIntegrity('HRK-001')
    expect(byCode).not.toBeNull()
    if (!byCode) return

    // 2. Fetch using canonical employee UUID
    const byUUID = await getEmployeeIdentityIntegrity(byCode.employeeId)
    expect(byUUID).not.toBeNull()
    if (!byUUID) return

    expect(byUUID.employeeId).toBe(byCode.employeeId)
    expect(byUUID.employeeCode).toBe('HRK-001')
    expect(byUUID.officialEmail).toBe(byCode.officialEmail)
  })

  it('should repair auth identity by employee UUID safely', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return

    const repairResult = await repairEmployeeAuthIdentity(integrity.employeeId, {
      tempPassword: 'TestEmployee@2026!',
    })

    expect(repairResult.success).toBe(true)
    expect(repairResult.employeeCode).toBe('HRK-001')
    expect(repairResult.officialEmail).toBe('thiru@haryak.com')

    // Verify post-repair integrity using UUID
    const postRepair = await getEmployeeIdentityIntegrity(integrity.employeeId)
    expect(postRepair).not.toBeNull()
    if (!postRepair) return

    expect(postRepair.isHealthy).toBe(true)
    expect(postRepair.issues).toEqual([])
  }, 30000)
})

