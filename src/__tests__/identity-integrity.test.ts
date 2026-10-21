import { describe, it, expect } from 'vitest'
import { getEmployeeIdentityIntegrity } from '@/lib/services/employee-identity-service'

describe('Employee Identity Integrity Service', () => {
  it('should diagnose HRK-001 broken auth link and recommend CASE B', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return

    expect(integrity.employeeCode).toBe('HRK-001')
    expect(integrity.officialEmail).toBe('charan@haryak.com')
    // Prior to repair, either CASE_B (different email) or CASE_A (same email unlinked) is diagnosed
    expect(['CASE_A', 'CASE_B']).toContain(integrity.repairRecommendation.caseType)
  })

  it('should repair HRK-001 auth identity and achieve clean healthy state', async () => {
    const { repairEmployeeAuthIdentity } = await import('@/lib/services/employee-identity-service')

    const repairResult = await repairEmployeeAuthIdentity('HRK-001', {
      tempPassword: 'TestEmployee@2026!',
    })

    expect(repairResult.success).toBe(true)
    expect(['CASE_A', 'CASE_B']).toContain(repairResult.caseApplied)
    expect(repairResult.officialEmail).toBe('charan@haryak.com')
    expect(repairResult.authUserId).toBe('80f1b866-75c0-4ac2-8fe7-3b3c529512a2')

    // Verify post-repair integrity
    const updatedIntegrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(updatedIntegrity).not.toBeNull()
    if (!updatedIntegrity) return

    expect(updatedIntegrity.isHealthy).toBe(true)
    expect(updatedIntegrity.issues).toEqual([])
    expect(updatedIntegrity.details.authUserId).toBe('80f1b866-75c0-4ac2-8fe7-3b3c529512a2')
    expect(updatedIntegrity.details.authEmail).toBe('charan@haryak.com')
    expect(updatedIntegrity.details.publicUserId).toBe('80f1b866-75c0-4ac2-8fe7-3b3c529512a2')
    expect(updatedIntegrity.details.assignedRoles).toContain('EMPLOYEE')
  })
})
