'use client'

import React, { useState, useEffect } from 'react'
import { Search, UserCheck, AlertCircle, RefreshCw, Briefcase, Building, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { safeParseResponse } from '@/lib/api-client'

export interface SelectedEmployeeDetails {
  id: string
  employeeCode: string
  fullName: string
  designation?: string
  department?: string
  phone?: string
  email?: string
  location?: string
  profileImageUrl?: string | null
}

interface EmployeeSelectorProps {
  onSelectEmployee: (emp: SelectedEmployeeDetails) => void
  selectedEmployeeId?: string
}

export function EmployeeSelector({ onSelectEmployee, selectedEmployeeId }: EmployeeSelectorProps) {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(selectedEmployeeId || null)

  const handleSelect = (emp: any) => {
    setSelectedId(emp.id)
    const code = emp.code || emp.employee_code || emp.employeeCode || 'HRK-001'
    const name = emp.fullName || emp.name || emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Employee'
    const desig = emp.designation || emp.designations?.name || 'Staff'
    const dept = emp.department || emp.departments?.name || 'Operations'
    const phone = emp.phone && emp.phone !== '-' ? emp.phone : '+91 8500 298 398'
    const email = emp.email || emp.official_email || 'employee@haryak.com'
    const location = emp.location || emp.workLocation || emp.locations?.name || 'Headquarters'
    const photo = emp.profileImageUrl || emp.profile_image_url || null

    onSelectEmployee({
      id: emp.id,
      employeeCode: code,
      fullName: name,
      designation: desig,
      department: dept,
      phone,
      email,
      location,
      profileImageUrl: photo,
    })
  }

  const fetchEmployees = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/employees?status=all')
      const parseResult = await safeParseResponse<{
        success: boolean
        employees?: any[]
        data?: any[]
        error?: string
      }>(res)

      if (!parseResult.ok || !parseResult.data || parseResult.data.success === false) {
        throw new Error(
          parseResult.data?.error ||
          parseResult.error ||
          `HTTP ${res.status}: Failed to load employees from database.`
        )
      }

      const json = parseResult.data
      const list: any[] = Array.isArray(json.employees)
        ? json.employees
        : Array.isArray(json.data)
        ? json.data
        : []

      setEmployees(list)

      if (list.length > 0 && selectedEmployeeId) {
        const match = list.find((e: any) => e.id === selectedEmployeeId)
        if (match) handleSelect(match)
      }
    } catch (err: any) {
      console.error('[EmployeeSelector] Fetch error:', err)
      setError(err.message || 'Error connecting to employee database.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const filtered = employees.filter(emp => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return true
    const name = (emp.fullName || emp.name || emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`).toLowerCase()
    const code = (emp.code || emp.employee_code || '').toLowerCase()
    const designation = (emp.designation || emp.designations?.name || '').toLowerCase()
    const department = (emp.department || emp.departments?.name || '').toLowerCase()

    return (
      name.includes(term) ||
      code.includes(term) ||
      designation.includes(term) ||
      department.includes(term)
    )
  })

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-blue-600" />
          Select Employee from Database
          {employees.length > 0 && (
            <span className="text-[11px] font-normal text-muted-foreground">
              ({employees.length} employees)
            </span>
          )}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={fetchEmployees}
          disabled={loading}
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by employee name, ID (e.g. HRK-001), or designation..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9 h-9 text-xs"
        />
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Retrieving employee records...</span>
        </div>
      ) : error ? (
        <div className="py-3 px-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Database Connection Notice</div>
            <div className="text-[11px] mt-0.5">{error}</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-3 px-3 bg-muted/40 rounded-lg text-xs text-muted-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>No employees found matching &ldquo;{searchTerm}&rdquo;. Switch to manual entry if needed.</span>
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto divide-y divide-border rounded-lg border border-border">
          {filtered.map(emp => {
            const isSelected = selectedId === emp.id
            const name = emp.fullName || emp.name || emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim()
            const code = emp.code || emp.employee_code || 'HRK-001'
            const desig = emp.designation || emp.designations?.name || 'Staff'
            const dept = emp.department || emp.departments?.name || 'Operations'
            const photo = emp.profileImageUrl || emp.profile_image_url

            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => handleSelect(emp)}
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs transition-colors hover:bg-muted/50 ${
                  isSelected ? 'bg-blue-50/90 dark:bg-blue-950/50 text-blue-950 dark:text-blue-100 font-semibold ring-1 ring-inset ring-blue-500/30' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-900 border border-border flex items-center justify-center text-xs flex-shrink-0 text-white font-bold">
                    {photo ? (
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-blue-400">{name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="truncate">
                    <div className="truncate text-foreground font-semibold flex items-center gap-2">
                      <span>{name}</span>
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-blue-500" />
                        {desig}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400" />
                        {dept}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end ml-2 flex-shrink-0">
                  <Badge variant={isSelected ? 'default' : 'outline'} className="font-mono text-[10px]">
                    {code}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
