'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmployeeIDCardStudio } from '@/components/admin/employee-id-cards/employee-id-card-studio'

export default function EmployeeIDCardStudioPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const roles: string[] = (user as any)?.roles || (user as any)?.user_metadata?.roles || []
  const userRole = (user as any)?.role || (user as any)?.user_metadata?.role
  const hasAdminRole =
    roles.some((r: string) => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(r)) ||
    ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(userRole)

  useEffect(() => {
    if (!loading && user && !hasAdminRole) {
      router.replace('/portal/home')
    }
  }, [loading, user, hasAdminRole, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-xs text-muted-foreground animate-pulse">
          Verifying administrator credentials...
        </div>
      </div>
    )
  }

  if (!hasAdminRole) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-4 p-8 bg-card border border-border rounded-xl shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Admin Authorization Required</h2>
        <p className="text-xs text-muted-foreground">
          The Employee ID Card Studio is an admin-only feature. Your account does not have sufficient administrative privileges to access this module.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push('/portal/home')}
          className="text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Return to Portal
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <EmployeeIDCardStudio />
    </div>
  )
}
