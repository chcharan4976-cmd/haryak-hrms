'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Lock, AlertTriangle, UserCheck } from 'lucide-react'
import { toast } from 'sonner'

interface EditEmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: any
  onSaved?: () => void
}

export function EditEmployeeDialog({
  open,
  onOpenChange,
  employee,
  onSaved,
}: EditEmployeeDialogProps) {
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    officialEmail: '',
    personalEmail: '',
    phone: '',
    gender: 'male',
    dateOfBirth: '',
    departmentId: '',
    designationId: '',
    reportingManagerId: '',
    employmentType: 'full_time',
    employmentStatus: 'active',
    joiningDate: '',
    confirmationDate: '',
    noticePeriodDays: '30',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    currentAddress: '',
    currentCity: '',
    currentState: '',
    currentPincode: '',
    permanentAddress: '',
    permanentCity: '',
    permanentState: '',
    permanentPincode: '',
  })

  useEffect(() => {
    if (open && employee) {
      setFormData({
        firstName: employee.firstName || employee.first_name || '',
        lastName: employee.lastName || employee.last_name || '',
        officialEmail: employee.officialEmail || employee.email || employee.official_email || '',
        personalEmail: employee.personalEmail || employee.personal_email || '',
        phone: employee.phone || '',
        gender: employee.gender || 'male',
        dateOfBirth: employee.dateOfBirth || employee.dob || employee.date_of_birth || '',
        departmentId: employee.departmentId || employee.department_id || '',
        designationId: employee.designationId || employee.designation_id || '',
        reportingManagerId: employee.reportingManagerId || employee.reporting_manager_id || '',
        employmentType: employee.employmentType || employee.employment_type || 'full_time',
        employmentStatus: employee.employmentStatus || employee.status || 'active',
        joiningDate: employee.joiningDate || employee.joinDate || employee.joining_date || '',
        confirmationDate: employee.confirmationDate || employee.confirmation_date || '',
        noticePeriodDays: String(employee.noticePeriodDays || employee.notice_period_days || 30),
        emergencyContactName: employee.emergencyContactName || employee.emergency_contact_name || '',
        emergencyContactPhone: employee.emergencyContactPhone || employee.emergency_contact_phone || '',
        emergencyContactRelationship: employee.emergencyContactRelationship || employee.emergency_contact_relationship || '',
        currentAddress: employee.currentAddress || employee.current_address || '',
        currentCity: employee.currentCity || employee.current_city || '',
        currentState: employee.currentState || employee.current_state || '',
        currentPincode: employee.currentPincode || employee.current_pincode || '',
        permanentAddress: employee.permanentAddress || employee.permanent_address || '',
        permanentCity: employee.permanentCity || employee.permanent_city || '',
        permanentState: employee.permanentState || employee.permanent_state || '',
        permanentPincode: employee.permanentPincode || employee.permanent_pincode || '',
      })

      fetchOrgMetadata()
    }
  }, [open, employee])

  const fetchOrgMetadata = async () => {
    try {
      const [deptRes, desigRes, mgrRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/designations'),
        fetch('/api/employees/directory?limit=100'),
      ])
      if (deptRes.ok) {
        const d = await deptRes.json()
        setDepartments(d.data || d.departments || [])
      }
      if (desigRes.ok) {
        const d = await desigRes.json()
        setDesignations(d.data || d.designations || [])
      }
      if (mgrRes.ok) {
        const d = await mgrRes.json()
        setManagers((d.employees || d.data || []).filter((e: any) => e.id !== employee.id))
      }
    } catch {
      // Non-blocking
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        fullName: `${formData.firstName} ${formData.lastName}`.trim(),
        officialEmail: formData.officialEmail,
        personalEmail: formData.personalEmail || null,
        phone: formData.phone || null,
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth || null,
        departmentId: formData.departmentId || null,
        designationId: formData.designationId || null,
        reportingManagerId: formData.reportingManagerId || null,
        employmentType: formData.employmentType,
        employmentStatus: formData.employmentStatus,
        joiningDate: formData.joiningDate || null,
        confirmationDate: formData.confirmationDate || null,
        noticePeriodDays: formData.noticePeriodDays ? parseInt(formData.noticePeriodDays) : null,
        emergencyContactName: formData.emergencyContactName || null,
        emergencyContactPhone: formData.emergencyContactPhone || null,
        emergencyContactRelationship: formData.emergencyContactRelationship || null,
        currentAddress: formData.currentAddress || null,
        currentCity: formData.currentCity || null,
        currentState: formData.currentState || null,
        currentPincode: formData.currentPincode || null,
        permanentAddress: formData.permanentAddress || null,
        permanentCity: formData.permanentCity || null,
        permanentState: formData.permanentState || null,
        permanentPincode: formData.permanentPincode || null,
      }

      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Employee updated successfully!')
        onSaved?.()
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Failed to update employee')
      }
    } catch {
      toast.error('Network error updating employee')
    } finally {
      setSaving(false)
    }
  }

  const emailWillChange =
    formData.officialEmail.toLowerCase().trim() !==
    (employee?.officialEmail || employee?.email || employee?.official_email || '').toLowerCase().trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-600" />
            Edit Employee Profile
          </DialogTitle>
          <DialogDescription>
            Update profile and organizational details for {employee?.fullName || employee?.name} ({employee?.code || employee?.employee_code})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="organization">Organization</TabsTrigger>
              <TabsTrigger value="emergency">Emergency</TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
            </TabsList>

            {/* TAB 1: PERSONAL */}
            <TabsContent value="personal" className="space-y-4 pt-3">
              <div className="p-3 bg-muted/40 rounded-lg flex items-center justify-between border">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Employee Code (Immutable)
                  </div>
                  <div className="font-mono text-base font-bold text-foreground">
                    {employee?.code || employee?.employee_code}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground max-w-[260px] text-right">
                  Assigned sequentially by company counter and cannot be modified.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    required
                    value={formData.firstName}
                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="officialEmail">Official Email *</Label>
                  <Input
                    id="officialEmail"
                    type="email"
                    required
                    value={formData.officialEmail}
                    onChange={e => setFormData({ ...formData, officialEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="personalEmail">Personal Email</Label>
                  <Input
                    id="personalEmail"
                    type="email"
                    value={formData.personalEmail}
                    onChange={e => setFormData({ ...formData, personalEmail: e.target.value })}
                  />
                </div>
              </div>

              {emailWillChange && (
                <Alert className="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs">
                    Changing the official work email will synchronize the Supabase Auth login identity and record an audit log entry.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={v => setFormData({ ...formData, gender: v })}
                  >
                    <SelectTrigger id="gender">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: ORGANIZATION */}
            <TabsContent value="organization" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={formData.departmentId}
                    onValueChange={v => setFormData({ ...formData, departmentId: v })}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="designation">Designation</Label>
                  <Select
                    value={formData.designationId}
                    onValueChange={v => setFormData({ ...formData, designationId: v })}
                  >
                    <SelectTrigger id="designation">
                      <SelectValue placeholder="Select designation" />
                    </SelectTrigger>
                    <SelectContent>
                      {designations.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="manager">Reporting Manager</Label>
                  <Select
                    value={formData.reportingManagerId}
                    onValueChange={v => setFormData({ ...formData, reportingManagerId: v })}
                  >
                    <SelectTrigger id="manager">
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {managers.map((m: any) => (
                        <SelectItem key={m.id || m.employeeId} value={m.id || m.employeeId}>
                          {m.fullName || m.name} ({m.employeeCode || m.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">Employment Status</Label>
                  <Select
                    value={formData.employmentStatus}
                    onValueChange={v => setFormData({ ...formData, employmentStatus: v })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="probation">Probation</SelectItem>
                      <SelectItem value="notice_period">Notice Period</SelectItem>
                      <SelectItem value="terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="joiningDate">Joining Date</Label>
                  <Input
                    id="joiningDate"
                    type="date"
                    value={formData.joiningDate}
                    onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmationDate">Confirmation Date</Label>
                  <Input
                    id="confirmationDate"
                    type="date"
                    value={formData.confirmationDate}
                    onChange={e => setFormData({ ...formData, confirmationDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noticePeriodDays">Notice Period (Days)</Label>
                  <Input
                    id="noticePeriodDays"
                    type="number"
                    value={formData.noticePeriodDays}
                    onChange={e => setFormData({ ...formData, noticePeriodDays: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: EMERGENCY */}
            <TabsContent value="emergency" className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactName">Contact Name</Label>
                <Input
                  id="emergencyContactName"
                  value={formData.emergencyContactName}
                  onChange={e => setFormData({ ...formData, emergencyContactName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="emergencyContactPhone">Contact Phone</Label>
                  <Input
                    id="emergencyContactPhone"
                    value={formData.emergencyContactPhone}
                    onChange={e => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emergencyContactRelationship">Relationship</Label>
                  <Input
                    id="emergencyContactRelationship"
                    placeholder="e.g. Spouse, Parent, Sibling"
                    value={formData.emergencyContactRelationship}
                    onChange={e => setFormData({ ...formData, emergencyContactRelationship: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: ADDRESS */}
            <TabsContent value="address" className="space-y-4 pt-3">
              <div className="space-y-2">
                <div className="font-semibold text-sm">Current Residential Address</div>
                <Input
                  placeholder="Street Address / Flat No."
                  value={formData.currentAddress}
                  onChange={e => setFormData({ ...formData, currentAddress: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="City"
                    value={formData.currentCity}
                    onChange={e => setFormData({ ...formData, currentCity: e.target.value })}
                  />
                  <Input
                    placeholder="State"
                    value={formData.currentState}
                    onChange={e => setFormData({ ...formData, currentState: e.target.value })}
                  />
                  <Input
                    placeholder="Pincode"
                    value={formData.currentPincode}
                    onChange={e => setFormData({ ...formData, currentPincode: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="font-semibold text-sm">Permanent Address</div>
                <Input
                  placeholder="Street Address / Flat No."
                  value={formData.permanentAddress}
                  onChange={e => setFormData({ ...formData, permanentAddress: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="City"
                    value={formData.permanentCity}
                    onChange={e => setFormData({ ...formData, permanentCity: e.target.value })}
                  />
                  <Input
                    placeholder="State"
                    value={formData.permanentState}
                    onChange={e => setFormData({ ...formData, permanentState: e.target.value })}
                  />
                  <Input
                    placeholder="Pincode"
                    value={formData.permanentPincode}
                    onChange={e => setFormData({ ...formData, permanentPincode: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-3 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
