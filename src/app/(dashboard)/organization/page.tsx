'use client'

import { useState, useEffect } from 'react'
import { Plus, Building2, Briefcase, MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState<'departments' | 'designations' | 'locations'>('departments')
  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newState, setNewState] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [deptRes, desigRes, locRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/designations'),
        fetch('/api/locations')
      ])

      const deptData = await deptRes.json()
      if (deptData.success) setDepartments(deptData.departments || [])

      const desigData = await desigRes.json()
      if (desigData.success) setDesignations(desigData.designations || [])
      
      const locData = await locRes.json()
      if (locData.success) setLocations(locData.locations || [])
    } catch (err) {
      console.error('Error loading organization data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      toast.error('Name is required.')
      return
    }

    setSaving(true)

    try {
      if (activeTab === 'departments') {
        const res = await fetch('/api/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim(), code: newCode.trim() || null }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(`Department "${newName}" created!`)
          await fetchData()
        } else {
          toast.error(data.error || 'Failed to create department.')
        }
      } else if (activeTab === 'designations') {
        const res = await fetch('/api/designations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(`Designation "${newName}" created!`)
          await fetchData()
        } else {
          toast.error(data.error || 'Failed to create designation.')
        }
      } else if (activeTab === 'locations') {
        const res = await fetch('/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim(), city: newCity.trim(), state: newState.trim(), country: newCountry.trim() }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(`Location "${newName}" created!`)
          await fetchData()
        } else {
          toast.error(data.error || 'Failed to create location.')
        }
      }
    } catch (err) {
      toast.error('An error occurred while saving.')
      console.error(err)
    } finally {
      setSaving(false)
      setIsDialogOpen(false)
      setNewName('')
      setNewCode('')
      setNewCity('')
      setNewState('')
      setNewCountry('')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizational Architecture"
        description="Configure corporate departments, designations, seniority bands, and business locations."
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add {activeTab === 'departments' ? 'Department' : activeTab === 'designations' ? 'Designation' : 'Location'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                Add New {activeTab === 'departments' ? 'Department' : activeTab === 'designations' ? 'Designation' : 'Location'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure official organizational parameters for workforce categorization.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder={activeTab === 'locations' ? 'e.g. Head Office' : 'e.g. Cloud Infrastructure'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              {activeTab === 'departments' && (
                <div className="space-y-1">
                  <Label htmlFor="code">Department Code</Label>
                  <Input
                    id="code"
                    placeholder="e.g. CLD"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                  />
                </div>
              )}
              
              {activeTab === 'locations' && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" placeholder="e.g. Hyderabad" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" placeholder="e.g. Telangana" value={newState} onChange={(e) => setNewState(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" placeholder="e.g. India" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} />
                  </div>
                </>
              )}

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-[#1e2a78] hover:bg-[#152060] text-white" disabled={saving}>
                  {saving ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <div className="border-b px-3 sm:px-4 bg-muted/20">
          <nav className="flex space-x-3 sm:space-x-6 text-xs overflow-x-auto no-scrollbar" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('departments')}
              className={cn(
                activeTab === 'departments'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap'
              )}
            >
              <Building2 className="w-3.5 h-3.5" /> Departments ({departments.length})
            </button>
            <button
              onClick={() => setActiveTab('designations')}
              className={cn(
                activeTab === 'designations'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap'
              )}
            >
              <Briefcase className="w-3.5 h-3.5" /> Designations ({designations.length})
            </button>
            <button
              onClick={() => setActiveTab('locations')}
              className={cn(
                activeTab === 'locations'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap'
              )}
            >
              <MapPin className="w-3.5 h-3.5" /> Locations ({locations.length})
            </button>
          </nav>
        </div>

        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading organization data...
            </div>
          ) : (
            <>
              {activeTab === 'departments' && (
                <div className="overflow-x-auto">
                  {departments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      <Building2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="font-semibold">No departments configured yet</p>
                      <p>Click &quot;Add Department&quot; to create your first department.</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Department Name</th>
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Assigned Staff</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {departments.map((dept: any) => (
                          <tr key={dept.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3.5 font-semibold text-foreground">{dept.name}</td>
                            <td className="px-4 py-3.5 font-mono text-muted-foreground">{dept.code || '—'}</td>
                            <td className="px-4 py-3.5 font-mono font-bold text-blue-700 dark:text-blue-400">
                              {dept.employeeCount || 0} {(dept.employeeCount || 0) === 1 ? 'Employee' : 'Employees'}
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{dept.status || 'Active'}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'designations' && (
                <div className="overflow-x-auto">
                  {designations.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="font-semibold">No designations configured yet</p>
                      <p>Click &quot;Add Designation&quot; to create your first designation.</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Designation</th>
                          <th className="px-4 py-3">Level Band</th>
                          <th className="px-4 py-3">Primary Department</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {designations.map((desig: any) => (
                          <tr key={desig.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3.5 font-semibold text-foreground">{desig.name}</td>
                            <td className="px-4 py-3.5 font-mono">Level {desig.level || 1}</td>
                            <td className="px-4 py-3.5 text-muted-foreground">{desig.department || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'locations' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {locations.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground text-xs">
                      <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="font-semibold">No locations configured yet</p>
                      <p>Click &quot;Add Location&quot; to create your first location.</p>
                    </div>
                  ) : locations.map((loc) => (
                    <div key={loc.id} className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-foreground">{loc.name}</h4>
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{loc.status || 'Active'}</Badge>
                      </div>
                      <p className="text-muted-foreground">{[loc.city, loc.state, loc.country].filter(Boolean).join(', ')}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
