'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { User, Loader2, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'
import Link from 'next/link'
import Image from 'next/image'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema)
  })

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true)
    setSubmittedMessage(null)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setIsSuccess(true)
        setSubmittedMessage(result.message)
        toast.success(result.message)
      } else {
        setIsSuccess(false)
        setSubmittedMessage(result.message || result.error || 'Failed to process password reset request.')
        toast.error(result.message || result.error || 'Failed to process password reset request.')
      }
    } catch (error) {
      console.error('Forgot password error:', error)
      setIsSuccess(false)
      setSubmittedMessage('Unable to connect to the authentication server. Please try again.')
      toast.error('An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-muted/40">
      <Card className="w-full max-w-md shadow-lg border">
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
              Account Recovery
            </span>
            <CardTitle className="text-2xl font-bold text-foreground">
              Reset Your Password
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              Enter your Employee ID or registered company email address to receive password reset instructions.
            </CardDescription>
          </div>
        </CardHeader>

        {submittedMessage ? (
          <CardContent className="space-y-6 pt-6">
            <div className={`p-4 rounded-lg border text-sm flex items-start gap-3 ${
              isSuccess 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50' 
                : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50'
            }`}>
              {isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{isSuccess ? 'Request Processed' : 'Delivery Notice'}</p>
                <p className="mt-1 leading-relaxed text-xs">{submittedMessage}</p>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Need immediate assistance?</p>
              <p>Contact the Haryak IT Helpdesk or HR Administrator to generate a temporary reset credential.</p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <Link href="/login" className="flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Sign in
              </Link>
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Employee ID or Company Email</Label>
                <div className="relative">
                  <div className="absolute left-3 top-3 text-muted-foreground">
                    <User className="h-4 w-4" />
                  </div>
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="e.g. HRK-511 or employee@haryak.com"
                    className="pl-10 h-11"
                    {...register('identifier')}
                    aria-invalid={!!errors.identifier}
                  />
                </div>
                {errors.identifier && (
                  <p className="text-xs text-destructive">{errors.identifier.message}</p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3 pt-2 border-t">
              <Button
                type="submit"
                className="w-full bg-[#1e2a78] hover:bg-[#152060] text-white h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking Credentials...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Reset Instructions
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                asChild
              >
                <Link href="/login" className="flex items-center justify-center gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign in
                </Link>
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
