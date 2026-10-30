'use client'

import { useEffect, useState } from 'react'
import {
  Controller,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  loginSchema,
  type LoginInput,
} from '@/lib/validations/auth'

import { useAuth } from '@/components/providers/auth-provider'

type LoginMode = 'ADMIN' | 'EMPLOYEE'

export default function LoginPage() {
  const router = useRouter()
  const { refreshSession } = useAuth()

  const [mounted, setMounted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentYear, setCurrentYear] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      mode: 'ADMIN',
      identifier: '',
      password: '',
      rememberMe: false,
    },
  })

  const loginMode = watch('mode') as LoginMode

  /**
   * Hydration protection.
   *
   * Server render:
   * mounted = false
   *
   * First client render:
   * mounted = false
   *
   * After hydration:
   * mounted = true
   *
   * This guarantees the server HTML and initial client HTML match.
   */
  useEffect(() => {
    setMounted(true)
    setCurrentYear(new Date().getFullYear())
  }, [])

  const handleModeChange = (newMode: LoginMode) => {
    if (isLoading) return

    setShowPassword(false)

    reset({
      mode: newMode,
      identifier: '',
      password: '',
      rememberMe: false,
    })
  }

  const onSubmit = async (data: LoginInput) => {
    if (isLoading) return

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          mode: loginMode,
        }),
      })

      let result: {
        success?: boolean
        error?: string
        redirectUrl?: string
        user?: {
          fullName?: string
          roles?: string[]
        }
      }

      try {
        result = await response.json()
      } catch {
        toast.error(
          'Authentication server returned an invalid response.'
        )
        return
      }

      if (!response.ok || !result.success) {
        toast.error(
          result.error ||
            'Invalid Employee ID/email or password.'
        )
        return
      }

      toast.success(
        `Welcome back, ${result.user?.fullName || 'User'}!`
      )

      /**
       * Refresh provider/session information before navigating.
       */
      await refreshSession()

      const destination =
        result.redirectUrl ||
        (loginMode === 'EMPLOYEE'
          ? '/portal/home'
          : '/dashboard')

      router.replace(destination)
      router.refresh()
    } catch (error) {
      console.error('[LOGIN] Request failed:', error)

      toast.error(
        'Unable to connect to authentication server. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * IMPORTANT:
   * Render the same markup on the server and on the first client pass.
   *
   * This prevents hydration differences caused by:
   * - dates
   * - browser state
   * - extensions
   * - client-only providers
   * - dynamic authentication state
   */
  if (!mounted) {
    return (
      <div className="min-h-screen w-full bg-background">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#1e2a78]" />

            <p className="text-xs text-muted-foreground">
              Loading secure portal...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* ============================================================
          LEFT SIDE — COMPANY BRANDING
      ============================================================ */}

      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#1e2a78] bg-gradient-to-br from-[#121c52] via-[#1e2a78] to-[#0d163d] p-12 text-white lg:flex">
        {/* Background grid */}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px]" />

        {/* Background glow */}

        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

        {/* Company header */}

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-xl bg-white p-2 shadow-lg">
              <Image
                src="/logo.jpg"
                alt="Haryak Technologies India Private Limited"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
                priority
              />
            </div>

            <div>
              <span className="block text-xl font-bold tracking-tight text-white">
                Haryak Technologies India Private Limited
              </span>

              <span className="text-xs font-medium uppercase tracking-wide text-blue-200/80">
                Enterprise Operations Platform
              </span>
            </div>
          </div>
        </div>

        {/* Main brand content */}

        <div className="relative z-10 my-auto max-w-lg py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />

            Employee & Administration Portal
          </div>

          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            Empowering Tomorrow&apos;s Solutions, Today.
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-blue-100/90">
            Unified corporate infrastructure for human resources,
            payroll automation, attendance, statutory governance,
            secure communication, and employee self-service.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <span className="mb-1 block text-xs font-bold text-blue-200">
                Administration Portal
              </span>

              <p className="text-[11px] text-blue-100/70">
                Employee management, payroll control, documents,
                organizational workflows, and analytics.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <span className="mb-1 block text-xs font-bold text-blue-200">
                Employee Self-Service
              </span>

              <p className="text-[11px] text-blue-100/70">
                Personal profile, payslips, attendance, leave,
                documents, communication, and HR services.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-blue-200/70">
          <span>
            © {currentYear ?? ''} Haryak Technologies India Private
            Limited
          </span>

          <a
            href="https://haryak.com"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            haryak.com
          </a>
        </div>
      </div>

      {/* ============================================================
          RIGHT SIDE — LOGIN
      ============================================================ */}

      <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-12 sm:px-6 lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-md space-y-6">
          {/* Mobile branding */}

          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <div className="shrink-0 rounded-lg border bg-white p-1.5 shadow-sm">
              <Image
                src="/logo.jpg"
                alt="Haryak Technologies India Private Limited"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            </div>

            <div>
              <span className="block text-sm font-bold text-foreground">
                Haryak Technologies India Private Limited
              </span>

              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Enterprise Portal
              </span>
            </div>
          </div>

          {/* Header */}

          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Sign In to Your Account
            </h1>

            <p className="text-xs text-muted-foreground">
              Select your portal mode below to continue.
            </p>
          </div>

          {/* ======================================================
              LOGIN MODE
          ====================================================== */}

          <div className="grid grid-cols-2 gap-1.5 rounded-xl border bg-muted p-1">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleModeChange('ADMIN')}
              aria-pressed={loginMode === 'ADMIN'}
              className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                loginMode === 'ADMIN'
                  ? 'bg-[#1e2a78] text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />

              ADMIN LOGIN
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleModeChange('EMPLOYEE')}
              aria-pressed={loginMode === 'EMPLOYEE'}
              className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                loginMode === 'EMPLOYEE'
                  ? 'bg-[#1e2a78] text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              }`}
            >
              <Users className="h-3.5 w-3.5" />

              EMPLOYEE LOGIN
            </button>
          </div>

          {/* Mode information */}

          <div
            className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
              loginMode === 'ADMIN'
                ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}
          >
            <span className="text-[11px] font-semibold">
              {loginMode === 'ADMIN'
                ? '🛡️ Administrator Mode:'
                : '👤 Employee Self-Service Mode:'}
            </span>

            <span className="text-[11px]">
              {loginMode === 'ADMIN'
                ? 'Authorized administrator email required.'
                : 'Enter your Employee ID or official company email.'}
            </span>
          </div>

          {/* ======================================================
              FORM
          ====================================================== */}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {/* Identifier */}

            <div className="space-y-1.5">
              <Label
                htmlFor="identifier"
                className="text-xs"
              >
                {loginMode === 'ADMIN'
                  ? 'Administrator Email'
                  : 'Employee ID or Company Email'}
              </Label>

              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <User className="h-4 w-4" />
                </div>

                <Input
                  id="identifier"
                  autoComplete={
                    loginMode === 'ADMIN'
                      ? 'username'
                      : 'username'
                  }
                  type={
                    loginMode === 'ADMIN'
                      ? 'email'
                      : 'text'
                  }
                  placeholder={
                    loginMode === 'ADMIN'
                      ? 'haryak@admin.com'
                      : 'e.g. HRK-001 or employee@haryak.com'
                  }
                  className="h-10 pl-10 text-xs"
                  disabled={isLoading}
                  {...register('identifier')}
                  aria-invalid={
                    errors.identifier
                      ? 'true'
                      : 'false'
                  }
                />
              </div>

              {errors.identifier && (
                <p className="text-[11px] text-destructive">
                  {errors.identifier.message}
                </p>
              )}
            </div>

            {/* Password */}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-xs"
                >
                  Password
                </Label>

                <Link
                  href="/forgot-password"
                  className="text-[11px] font-medium text-blue-700 hover:text-blue-800 hover:underline dark:text-blue-400"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>

                <Input
                  id="password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="h-10 pl-10 pr-10 text-xs"
                  disabled={isLoading}
                  {...register('password')}
                  aria-invalid={
                    errors.password
                      ? 'true'
                      : 'false'
                  }
                />

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {errors.password && (
                <p className="text-[11px] text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me */}

            <Controller
              name="rememberMe"
              control={control}
              render={({ field }) => (
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="rememberMe"
                    checked={Boolean(field.value)}
                    disabled={isLoading}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked === true
                      )
                    }
                  />

                  <label
                    htmlFor="rememberMe"
                    className="cursor-pointer select-none text-xs leading-none text-muted-foreground"
                  >
                    Keep me signed in on this device
                  </label>
                </div>
              )}
            />

            {/* Hidden mode field */}

            <input
              type="hidden"
              {...register('mode')}
            />

            {/* Submit */}

            <Button
              type="submit"
              disabled={isLoading}
              className="mt-2 h-10 w-full bg-[#1e2a78] text-xs font-semibold text-white shadow-sm hover:bg-[#152060]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  {loginMode === 'ADMIN'
                    ? 'LOGIN AS ADMIN'
                    : 'LOGIN AS EMPLOYEE'}

                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Footer */}

          <div className="border-t pt-4 text-center">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              By accessing this system, you agree to the
              corporate security and compliance policies of
              Haryak Technologies India Private Limited.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}