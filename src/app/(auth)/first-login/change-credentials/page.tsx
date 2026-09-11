'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock, Mail, ShieldAlert, CheckCircle2, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { adminFirstLoginSchema, type AdminFirstLoginInput } from '@/lib/validations/auth'
import Image from 'next/image'

export default function AdminFirstLoginPage() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const { register, handleSubmit, formState: { errors } } = useForm<AdminFirstLoginInput>({
    resolver: zodResolver(adminFirstLoginSchema),
  })

  const onSubmit = async (data: AdminFirstLoginInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/first-login/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        toast.error(result.error || 'Failed to update administrator credentials.')
        setIsLoading(false)
        return
      }

      toast.success('Admin account secured successfully! Redirecting to Administration Dashboard...')
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Error updating admin credentials:', error)
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-muted/40">
      <Card className="w-full max-w-xl shadow-lg border">
        <CardHeader className="text-center space-y-3 pb-6 border-b">
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
              Initial System Security Setup
            </span>
            <CardTitle className="text-2xl font-bold text-foreground">
              Secure Your Admin Account
            </CardTitle>
            <CardDescription className="text-sm mt-1 max-w-md mx-auto">
              You are logging in with temporary bootstrap credentials. For company security compliance, you must update both your administrator email and master password before proceeding.
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5 pt-6">
            {/* Security Notice */}
            <div>
  <p className="font-medium text-amber-800 dark:text-amber-300">
    Security Notice
  </p>

  <p className="mt-0.5 text-amber-700 dark:text-amber-400">
    Your temporary bootstrap password will be permanently deactivated upon successful submission.
  </p>
</div> 

            {/* Current Password */}
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current Temporary Password</Label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter your temporary password"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* New Admin Email */}
              <div className="space-y-1.5">
                <Label htmlFor="newEmail">New Admin Email</Label>
                <div className="relative">
                  <div className="absolute left-3 top-3 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="newEmail"
                    type="email"
                    placeholder="admin@haryak.com"
                    className="pl-10"
                    {...register('newEmail')}
                  />
                </div>
                {errors.newEmail && (
                  <p className="text-xs text-destructive">{errors.newEmail.message}</p>
                )}
              </div>

              {/* Confirm New Admin Email */}
              <div className="space-y-1.5">
                <Label htmlFor="confirmNewEmail">Confirm New Email</Label>
                <div className="relative">
                  <div className="absolute left-3 top-3 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="confirmNewEmail"
                    type="email"
                    placeholder="admin@haryak.com"
                    className="pl-10"
                    {...register('confirmNewEmail')}
                  />
                </div>
                {errors.confirmNewEmail && (
                  <p className="text-xs text-destructive">{errors.confirmNewEmail.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    placeholder="Min 8 chars, mixed case & symbol"
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
                    placeholder="Confirm your password"
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
            </div>

            {/* Password Policy Guidelines */}
            <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded-lg border">
              <span className="font-semibold block text-foreground">Password Policy Checklist:</span>
              <ul className="grid grid-cols-2 gap-1 text-[11px]">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> At least 8 characters
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Upper & lower case letters
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> At least one numeric digit
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> At least one special symbol
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
                  Securing Credentials...
                </>
              ) : (
                <>
                  Update Credentials & Open Administration Dashboard
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
