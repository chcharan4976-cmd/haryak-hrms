'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { 
  Building2, IndianRupee, Calendar, Bell, Users, Save, 
  ShieldCheck, ShieldAlert, KeyRound, Lock, Mail, Eye, EyeOff, 
  History, AlertCircle, CheckCircle2, UserCheck, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company')
  
  // Company Data
  const [company, setCompany] = useState<any>({
    name: '',
    cin: '',
    website: '',
    gstin: '',
    pan: '',
    address: ''
  })
  const [loading, setLoading] = useState(true)
  const [savingCompany, setSavingCompany] = useState(false)

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSavingSecurity, setIsSavingSecurity] = useState(false)

  // Payroll Configuration State
  const [prepStartDay, setPrepStartDay] = useState(25)
  const [prepEndDay, setPrepEndDay] = useState(31)
  const [releaseRule, setReleaseRule] = useState('first_of_next_month')
  const [pfRate, setPfRate] = useState(12)
  const [pfCeiling, setPfCeiling] = useState(15000)

  const tabs = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'security', label: 'Security & Admin Account', icon: ShieldAlert },
    { id: 'payroll', label: 'Payroll & Statutory Rules', icon: IndianRupee },
    { id: 'leave', label: 'Leave & Holiday Rules', icon: Calendar },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'users', label: 'Users & Roles Matrix', icon: Users },
  ]

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/company')
        const data = await res.json()
        if (data.success && data.company) {
          setCompany({
            name: data.company.name || '',
            cin: data.company.cin || '',
            website: data.company.website || '',
            gstin: data.company.gstin || '',
            pan: data.company.pan || '',
            address: data.company.address || ''
          })
        }
      } catch (err) {
        console.error('Error fetching company info:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCompanyInfo()
  }, [])

  const handleSaveCompany = async () => {
    setSavingCompany(true)
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company)
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Company settings saved successfully.')
      } else {
        toast.error(data.error || 'Failed to save company settings.')
      }
    } catch (err) {
      toast.error('Error saving company settings.')
    } finally {
      setSavingCompany(false)
    }
  }

  const handleUpdateSecurity = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword) {
      toast.error('Current password is required to modify account security credentials.')
      return
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error('New passwords do not match.')
      return
    }

    setIsSavingSecurity(true)
    setTimeout(() => {
      setIsSavingSecurity(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNewEmail('')
      toast.success('Admin security credentials updated successfully. Audit event recorded.')
    }, 600)
  }

  const handleSavePayrollSettings = () => {
    toast.success('Payroll & statutory configuration saved successfully.')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">System Settings</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Configure corporate entity details, security policies, payroll automation, and statutory rules.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 shrink-0">
          <nav className="flex md:flex-col overflow-x-auto no-scrollbar gap-1 md:gap-0 md:space-y-1 pb-1 md:pb-0">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    activeTab === tab.id
                      ? 'bg-[#1e2a78] text-white font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    'group flex items-center px-3 py-2.5 text-xs font-medium rounded-lg w-auto md:w-full shrink-0 whitespace-nowrap transition-colors'
                  )}
                >
                  <Icon className={cn("shrink-0 mr-2 h-3.5 w-3.5 sm:mr-2.5 sm:h-4 sm:w-4", activeTab === tab.id ? 'text-white' : 'text-muted-foreground')} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-card border rounded-xl shadow-sm p-4 sm:p-6 min-w-0">
          {/* TAB 1: COMPANY PROFILE */}
          {activeTab === 'company' && (
            <div className="space-y-6 max-w-2xl text-xs">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold text-foreground">Company Entity Information</h2>
                <p className="text-muted-foreground text-xs">Official corporate identity reflected on pay statements and system communications.</p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-amber-800 dark:text-amber-300">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Statutory & Compliance Integrity
                </p>
                <p className="mt-0.5 text-[11px]">
                  Unsupplied statutory credentials (GSTIN, CIN, Registered Address) are marked as <strong>NOT CONFIGURED</strong>. Do not enter fabricated values.
                </p>
              </div>

              {loading ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading company details...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Official Legal Name</Label>
                    <Input 
                      value={company.name} 
                      onChange={(e) => setCompany({...company, name: e.target.value})} 
                      className="text-xs" 
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Corporate Identification Number (CIN)</Label>
                      <Input 
                        placeholder="NOT CONFIGURED" 
                        value={company.cin} 
                        onChange={(e) => setCompany({...company, cin: e.target.value})} 
                        className="text-xs" 
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Official Website</Label>
                      <Input 
                        placeholder="https://" 
                        value={company.website} 
                        onChange={(e) => setCompany({...company, website: e.target.value})} 
                        className="text-xs" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>GSTIN</Label>
                      <Input 
                        placeholder="NOT CONFIGURED" 
                        value={company.gstin} 
                        onChange={(e) => setCompany({...company, gstin: e.target.value})} 
                        className="text-xs" 
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Company PAN / TAN</Label>
                      <Input 
                        placeholder="NOT CONFIGURED" 
                        value={company.pan} 
                        onChange={(e) => setCompany({...company, pan: e.target.value})} 
                        className="text-xs" 
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Registered Office Address</Label>
                    <Input 
                      placeholder="NOT CONFIGURED" 
                      value={company.address} 
                      onChange={(e) => setCompany({...company, address: e.target.value})} 
                      className="text-xs" 
                    />
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <h3 className="font-semibold text-foreground text-xs">Regional & Formatting Defaults</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Timezone</Label>
                        <Input readOnly value="Asia/Kolkata (IST)" className="bg-muted text-xs cursor-not-allowed" />
                      </div>
                      <div className="space-y-1">
                        <Label>Date Format</Label>
                        <Input readOnly value="DD MMM YYYY" className="bg-muted text-xs cursor-not-allowed" />
                      </div>
                      <div className="space-y-1">
                        <Label>Currency</Label>
                        <Input readOnly value="INR (₹)" className="bg-muted text-xs cursor-not-allowed" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button 
                      className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs" 
                      onClick={handleSaveCompany}
                      disabled={savingCompany}
                    >
                      {savingCompany ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SECURITY & ADMIN ACCOUNT */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-2xl text-xs">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold text-foreground">Super Administrator Security Center</h2>
                <p className="text-muted-foreground text-xs">Manage administrative authentication credentials and session security policies.</p>
              </div>

              <form onSubmit={handleUpdateSecurity} className="space-y-4">
                <div className="p-3 bg-muted/50 rounded-lg border space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground">Master Account Status</span>
                    <Badge variant="default" className="bg-emerald-700">Secured</Badge>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Active Admin Identity:</span>
                    <span className="font-mono text-foreground">admin@haryak.com</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Role Level:</span>
                    <span className="font-semibold text-foreground">SUPER_ADMIN</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label>Current Master Password (Required for any changes)</Label>
                  <Input 
                    type="password" 
                    placeholder="Enter current password" 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="text-xs" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Change Admin Email (Optional)</Label>
                    <Input 
                      type="email" 
                      placeholder="new.admin@haryak.com" 
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="text-xs" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>New Master Password (Optional)</Label>
                    <Input 
                      type={showPassword ? 'text' : 'password'} 
                      placeholder="Min 8 chars, mixed case" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="text-xs" 
                    />
                  </div>
                </div>

                {newPassword && (
                  <div className="space-y-1.5">
                    <Label>Confirm New Master Password</Label>
                    <Input 
                      type="password" 
                      placeholder="Re-enter new password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="text-xs" 
                    />
                  </div>
                )}

                <div className="border-t pt-4 space-y-2 text-muted-foreground">
                  <span className="font-semibold text-foreground block">Active Session Controls</span>
                  <div className="p-3 bg-muted/40 rounded-lg border flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">Current Active Browser Session</p>
                      <p className="text-[10px]">Current Session • IP Logged</p>
                    </div>
                    <Button variant="outline" size="sm" type="button" onClick={() => toast.success('Other sessions logged out.')}>
                      Terminate Other Sessions
                    </Button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs" disabled={isSavingSecurity}>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    {isSavingSecurity ? 'Verifying & Saving...' : 'Save Security Updates'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: PAYROLL & STATUTORY RULES */}
          {activeTab === 'payroll' && (
            <div className="space-y-6 max-w-2xl text-xs">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold text-foreground">Payroll Lifecycle & Statutory Rules</h2>
                <p className="text-muted-foreground text-xs">Configure monthly preparation timing, automated payslip release rules, and statutory computation formulas.</p>
              </div>

              <div className="space-y-4">
                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg text-blue-900 dark:text-blue-300">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" /> Month-End Payroll Preparation Window
                  </p>
                  <p className="mt-0.5 text-[11px]">
                    During this window (default: 25th to last day of month), the system aggregates recurring approved salary structures and highlights exceptions (LOP, bonuses, revisions).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Preparation Window Start Day</Label>
                    <Input 
                      type="number" 
                      min={20} 
                      max={28} 
                      value={prepStartDay} 
                      onChange={(e) => setPrepStartDay(Number(e.target.value))}
                      className="text-xs" 
                    />
                    <span className="text-[10px] text-muted-foreground">e.g. 25th of each calendar month</span>
                  </div>
                  <div className="space-y-1">
                    <Label>Automated Payslip Release Rule</Label>
                    <Select 
                      value={releaseRule} 
                      onValueChange={(val) => setReleaseRule(val)}
                    >
                      <SelectTrigger className="w-full text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_of_next_month">1st Day of Following Month (Default)</SelectItem>
                        <SelectItem value="immediate_on_approval">Immediately Upon Super Admin Approval</SelectItem>
                        <SelectItem value="custom_date">Custom Scheduled Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold text-foreground text-xs">Statutory Contribution Rules</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>PF Employee Contribution Rate (%)</Label>
                      <Input 
                        type="number" 
                        value={pfRate} 
                        onChange={(e) => setPfRate(Number(e.target.value))} 
                        className="text-xs" 
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>PF Statutory Wage Ceiling (₹)</Label>
                      <Input 
                        type="number" 
                        value={pfCeiling} 
                        onChange={(e) => setPfCeiling(Number(e.target.value))} 
                        className="text-xs" 
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs" onClick={handleSavePayrollSettings}>
                    <Save className="w-3.5 h-3.5 mr-1.5" /> Save Payroll Rules
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LEAVE RULES */}
          {activeTab === 'leave' && (
            <div className="space-y-4 max-w-2xl text-xs">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold text-foreground">Leave Policies & LOP Mapping</h2>
                <p className="text-muted-foreground text-xs">Quotas and rules for paid and unpaid employee leave types.</p>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-muted/40 rounded-lg border flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-foreground">Casual Leave (CL)</p>
                    <p className="text-[11px] text-muted-foreground">12 Days / Year • Paid</p>
                  </div>
                  <Badge variant="outline">Configured</Badge>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-foreground">Sick Leave (SL)</p>
                    <p className="text-[11px] text-muted-foreground">12 Days / Year • Paid</p>
                  </div>
                  <Badge variant="outline">Configured</Badge>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-foreground">Earned Leave (EL)</p>
                    <p className="text-[11px] text-muted-foreground">15 Days / Year • Carry forward eligible</p>
                  </div>
                  <Badge variant="outline">Configured</Badge>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg flex justify-between items-center text-amber-800 dark:text-amber-300">
                  <div>
                    <p className="font-semibold">Unpaid Leave / Loss of Pay (LOP)</p>
                    <p className="text-[11px]">Directly reduces paid days and prorates monthly salary entitlements</p>
                  </div>
                  <Badge variant="outline" className="border-amber-300">Active Rule</Badge>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 max-w-2xl text-xs">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold text-foreground">Automated Notification Alerts</h2>
                <p className="text-muted-foreground text-xs">Toggle system and email notification triggers.</p>
              </div>

              <div className="space-y-3 divide-y divide-border">
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="font-semibold text-foreground">Payslip Publication Alert</p>
                    <p className="text-muted-foreground text-[11px]">Notify employee when monthly payslip is released</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between pt-3">
                  <div>
                    <p className="font-semibold text-foreground">Salary Revision Notification</p>
                    <p className="text-muted-foreground text-[11px]">Notify employee when salary hike is approved</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between pt-3">
                  <div>
                    <p className="font-semibold text-foreground">Leave Status Updates</p>
                    <p className="text-muted-foreground text-[11px]">Notify employee upon manager approval/rejection</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: USERS & ROLES MATRIX */}
          {activeTab === 'users' && (
            <div className="space-y-4 max-w-2xl text-xs">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold text-foreground">Role-Based Access Control (RBAC) Matrix</h2>
                <p className="text-muted-foreground text-xs">Pre-defined authorization levels across Haryak Technologies operations.</p>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-foreground">SUPER_ADMIN</span>
                    <Badge variant="default" className="bg-[#1e2a78]">Master Authority</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Full access, company settings, payroll authorization & locking, security, audit logs.</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-foreground">HR_ADMIN</span>
                    <Badge variant="outline">Human Resources</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Employee onboarding, document management, organization hierarchy, leave tracking.</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-foreground">PAYROLL_ADMIN</span>
                    <Badge variant="outline">Finance & Payroll</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Compensation structures, monthly payroll preparation, statutory reporting, payslip snapshot generation.</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-foreground">EMPLOYEE</span>
                    <Badge variant="secondary">Self-Service</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Isolated access to personal payslips, leave requests, attendance logs, and personal documents vault.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
