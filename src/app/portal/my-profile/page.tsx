'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Mail, Phone, Building, Loader2, MapPin, Briefcase,
  AlertCircle, RefreshCw, ShieldCheck, UserCheck, CheckCircle2, UserX
} from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import type { EmployeeProfileDTO } from '@/lib/types/employee-dto'

export default function MyProfilePage() {
  const [profile, setProfile] = useState<EmployeeProfileDTO | null>(null)
  const [diagnostic, setDiagnostic] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [errorState, setErrorState] = useState<{ message: string; code?: string } | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [showDiagnostic, setShowDiagnostic] = useState(false)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setErrorState(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    try {
      const res = await fetch('/api/portal/me', { signal: controller.signal })
      clearTimeout(timeoutId)

      const data = await res.json()

      if (!res.ok || !data.success) {
        setErrorState({
          message: data.error || 'Failed to resolve employee profile.',
          code: data.code || 'RESOLUTION_FAILED',
        })
        setProfile(null)
      } else {
        setProfile(data.profile)
        setDiagnostic(data.diagnostic || null)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorState({
          message: 'Request timed out while resolving employee profile. Please check server connectivity.',
          code: 'TIMEOUT',
        })
      } else {
        setErrorState({
          message: 'Unable to connect to employee resolution service.',
          code: 'NETWORK_ERROR',
        })
      }
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Provenance Helper: strictly returns "Not provided" if null, never fake data
  const renderField = (value: string | null | undefined, nullText: string = 'Not provided') => {
    if (value === null || value === undefined || value.trim() === '') {
      return <span className="text-muted-foreground italic">{nullText}</span>
    }
    return <span className="font-medium text-foreground">{value}</span>
  }

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">My Official Profile</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Canonical company identity, official placement parameters, and statutory allocations.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {diagnostic && (
            <Button
              size="sm"
              variant="ghost"
              className="text-[11px] h-8 text-muted-foreground"
              onClick={() => setShowDiagnostic(!showDiagnostic)}
            >
              {showDiagnostic ? 'Hide Diagnostics' : 'Dev Diagnostics'}
            </Button>
          )}

          <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs h-8 w-full sm:w-auto">
                Request Profile Correction
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md w-full">
              <DialogHeader>
                <DialogTitle className="text-base font-bold">Request Profile Information Update</DialogTitle>
                <DialogDescription className="text-xs">
                  To maintain statutory integrity, official identity changes must be verified by HR Administration.
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 rounded-xl bg-muted/40 border text-xs space-y-2">
                <p className="text-muted-foreground">Please reach out to the Human Resources desk:</p>
                <p className="font-semibold text-foreground">Email: hr@haryak.com</p>
                <p className="text-[11px] text-muted-foreground">
                  Attach official proof documents for address, PAN, or bank detail corrections.
                </p>
              </div>
              <div className="py-2 flex justify-end">
                <Button size="sm" onClick={() => setRequestOpen(false)} className="w-full sm:w-auto bg-[#1e2a78] text-white">
                  Understood
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Internal Development Diagnostic Panel */}
      {showDiagnostic && diagnostic && (
        <div className="p-4 rounded-xl border border-blue-300 bg-blue-50 dark:bg-blue-950/40 text-xs space-y-1.5 font-mono overflow-x-auto">
          <div className="flex items-center justify-between pb-1 border-b border-blue-200">
            <span className="font-bold text-blue-900 dark:text-blue-300">Identity Resolution Diagnostics (Dev Verification)</span>
            <Badge variant="outline" className="text-[10px]">CANONICAL_MATCH</Badge>
          </div>
          <div>Auth User ID: <span className="text-blue-800 dark:text-blue-300 font-semibold">{diagnostic.authUserId}</span></div>
          <div>Portal Employee UUID: <span className="text-blue-800 dark:text-blue-300 font-semibold">{diagnostic.resolvedEmployeeId}</span></div>
          <div>Canonical Employee Code: <span className="text-blue-800 dark:text-blue-300 font-semibold">{diagnostic.employeeCode}</span></div>
          <div>Company ID: <span className="text-blue-800 dark:text-blue-300 font-semibold">{diagnostic.companyId}</span></div>
        </div>
      )}

      {/* State 1: Loading with timeout protection */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78]" />
          <p className="text-xs text-muted-foreground">Resolving verified employee master profile...</p>
        </div>
      )}

      {/* State 2: Resolution Error — distinct from real NULLs */}
      {!loading && errorState && (
        <Card className="border-destructive/40 bg-destructive/5 shadow-xs">
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-destructive/10 text-destructive rounded-lg shrink-0 mt-0.5">
                <UserX className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm font-bold text-destructive">Employee Profile Linkage Error</h3>
                <p className="text-xs text-muted-foreground break-words">{errorState.message}</p>
                <p className="text-[11px] text-muted-foreground">
                  Your authenticated user account does not have a confirmed link to an active employee record. Please contact HR Administration.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={fetchProfile} className="text-xs shrink-0 w-full sm:w-auto">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Linkage
            </Button>
          </CardContent>
        </Card>
      )}

      {/* State 3: Success — Render Canonical Profile */}
      {!loading && !errorState && profile && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column — Summary Card */}
          <Card className="md:col-span-1 border shadow-xs">
            <CardContent className="p-4 sm:p-6 flex flex-col items-center text-center space-y-3">
              <div className="w-20 h-20 rounded-2xl bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center text-2xl font-bold border">
                {profile.firstName?.[0]}{profile.lastName?.[0] || ''}
              </div>

              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground truncate">{profile.fullName}</h2>
                <p className="font-mono font-bold text-xs text-blue-700 dark:text-blue-400 mt-0.5">{profile.employeeCode}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{profile.designation || 'Staff Member'}</p>
              </div>

              <Badge className={`text-[10px] uppercase font-semibold ${
                profile.employmentStatus === 'active'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {profile.employmentStatus}
              </Badge>

              <div className="w-full pt-4 border-t space-y-2.5 text-xs text-left">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-foreground">{profile.officialEmail}</span>
                </div>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{renderField(profile.phone)}</span>
                </div>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Building className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{renderField(profile.department, 'Not assigned')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{renderField(profile.workLocation)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column — Detailed Breakdown */}
          <div className="md:col-span-2 space-y-4">
            {/* Employment Parameters */}
            <Card className="border shadow-xs">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold">Employment & Placement Parameters</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Assigned Employee ID</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{profile.employeeCode}</span>
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Primary Department</span>
                    {renderField(profile.department, 'Not assigned')}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Designation</span>
                    {renderField(profile.designation, 'Not assigned')}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Employment Type</span>
                    {renderField(profile.employmentType === 'full_time' ? 'Full Time Regular' : profile.employmentType)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Base Work Location</span>
                    {renderField(profile.workLocation)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Joining Date</span>
                    {renderField(profile.joiningDate ? formatDate(profile.joiningDate) : null)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Reporting Manager</span>
                    {renderField(profile.reportingManager, 'Not assigned')}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Date of Birth</span>
                    {renderField(profile.dateOfBirth ? formatDate(profile.dateOfBirth) : null)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bank Accounts */}
            <Card className="border shadow-xs">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold">Disbursement Bank Accounts</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3 text-xs">
                {profile.bankAccounts && profile.bankAccounts.length > 0 ? (
                  profile.bankAccounts.map((b, idx) => (
                    <div key={b.id || idx} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 border-b last:border-0 pb-2.5 last:pb-0">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Bank Name</span>
                        {renderField(b.bankName)}
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Account Number</span>
                        {renderField(b.accountNumberMasked)}
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">IFSC Code</span>
                        {renderField(b.ifscCode)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-2 italic">
                    No bank accounts registered. Contact HR to register disbursement details.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Statutory Details */}
            <Card className="border shadow-xs">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold">Statutory & Tax Allocations</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">PAN (Masked)</span>
                    {renderField(profile.statutoryDetails?.panMasked)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Universal Account Number (UAN)</span>
                    {renderField(profile.statutoryDetails?.uanNumber)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Provident Fund (PF) No.</span>
                    {renderField(profile.statutoryDetails?.pfNumber)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">ESI Number</span>
                    {renderField(profile.statutoryDetails?.esiNumber)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Professional Tax State</span>
                    {renderField(profile.statutoryDetails?.ptState)}
                  </div>
                  <div className="border-b pb-2">
                    <span className="text-muted-foreground block text-[11px]">Income Tax Regime</span>
                    <span className="font-semibold uppercase text-foreground">
                      {profile.statutoryDetails?.taxRegime || 'New'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
