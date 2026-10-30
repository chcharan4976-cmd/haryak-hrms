'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock, CheckCircle2, Loader2, ArrowRight, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { employeeFirstLoginSchema, type EmployeeFirstLoginInput } from '@/lib/validations/auth'
import { useAuth } from '@/components/providers/auth-provider'
import Image from 'next/image'

export default function EmployeeFirstLoginPage() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { user, loading, refreshSession } = useAuth()

  useEffect(() => {
    if (!loading && user) {
      const roles: string[] = (user as any)?.roles || (user as any)?.user_metadata?.roles || []
      const userRole = (user as any)?.role || (user as any)?.user_metadata?.role
      const hasAdminRole = 
        roles.some((r: string) => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(r)) ||
        ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(userRole)
      const hasEmployeeRole = roles.includes('EMPLOYEE') || userRole === 'EMPLOYEE'
      const hasEmployeeProfile = Boolean((user as any)?.employeeCode || (user as any)?.user_metadata?.employee_id)

      const mustChangeCredentials = Boolean(
        (user as any)?.user_metadata?.must_change_credentials ||
        (user as any)?.mustChangeCredentials
      )

      // If an initial bootstrap admin lands here, guide them to admin setup
      if (hasAdminRole && !hasEmployeeRole && !hasEmployeeProfile && mustChangeCredentials) {
        router.replace('/first-login/change-credentials')
      }
    }
  }, [user, loading, router])

  const { register, handleSubmit, formState: { errors } } = useForm<EmployeeFirstLoginInput>({
    resolver: zodResolver(employeeFirstLoginSchema),
  })

  const onSubmit = async (data: EmployeeFirstLoginInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/first-login/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        toast.error(result.error || 'Failed to update your password.')
        setIsLoading(false)
        return
      }

      toast.success('Your password has been updated successfully! Opening Employee Portal...')
      await refreshSession()
      router.push(result.redirectUrl || '/portal/home')
      router.refresh()
    } catch (error) {
      console.error('Error setting new password:', error)
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-muted/40">
      <Card className="w-full max-w-lg shadow-lg border">
        <CardHeader className="text-center space-y-3 p-4 sm:p-6 pb-6 border-b">
          <div className="mx-auto bg-white p-2 rounded-xl border shadow-sm w-fit">
            <Image
              src="/logo.jpg"
              alt="Haryak Technologies India Private Limited"
              width={48}
              height={48}
              className="w-12 h-12 object-contain"
              priority
            />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-400 block mb-1">
              Welcome to Haryak Technologies
            </span>
            <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
              Create Your New Password
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1 max-w-sm mx-auto">
              You are logging in with a temporary password provided during onboarding. Please create a private password to secure your employee account.
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 pt-6">
            {/* Temporary / Current Password */}
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Temporary / Current Password</Label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter the temporary password received from HR"
                  className="pl-10 pr-10"
                  {...register('currentPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Create your new password"
                  className="pl-10 pr-10"
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              )}
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="confirmNewPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  className="pl-10 pr-10"
                  {...register('confirmNewPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmNewPassword && (
                <p className="text-xs text-destructive">{errors.confirmNewPassword.message}</p>
              )}
            </div>

            {/* Password Policy Guidelines */}
            <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded-lg border">
              <span className="font-semibold block text-foreground">Password Guidelines:</span>
              <ul className="space-y-1 text-[11px]">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Minimum 8 characters
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Mix of uppercase, lowercase, numbers, and symbols
                </li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="pt-2 border-t">
            <Button
              type="submit"
              className="w-full bg-[#1e2a78] hover:bg-[#152060] text-white"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  Save Password & Open Employee Portal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
