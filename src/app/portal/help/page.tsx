'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mail, Phone, MessageSquare, Plus, CheckCircle2, Clock, HelpCircle, ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'

interface HRRequest {
  id: string
  ticketNumber: string
  category: string
  subject: string
  description: string
  status: string
  createdAt: string
  lastUpdated: string
  hrComments?: string
}

export default function HelpPage() {
  const { user } = useAuth()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [category, setCategory] = useState('Payroll Question')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const [requests, setRequests] = useState<any[]>([])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/hr-requests')
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests || [])
      }
    } catch (error) {
      console.error('Error fetching HR requests:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchRequests()
    }
  }, [user])

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      toast.error('Please enter both subject and description.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/hr-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subject, description })
      })

      if (res.ok) {
        toast.success(`HR Ticket created successfully!`)
        setIsDialogOpen(false)
        setSubject('')
        setDescription('')
        fetchRequests()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to submit HR request')
      }
    } catch (error) {
      console.error('Submit error:', error)
      toast.error('An error occurred while submitting the request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">Open</Badge>
      case 'IN_PROGRESS':
        return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">In Progress</Badge>
      case 'RESOLVED':
        return <Badge variant="default" className="bg-emerald-700">Resolved</Badge>
      case 'CLOSED':
        return <Badge variant="secondary">Closed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">HR Help Desk & Requests</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Submit inquiries, request profile/bank changes, or ask questions to the HR team.
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs shadow-sm">
              <Plus className="w-4 h-4 mr-1.5" /> Raise HR Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Raise New HR Request</DialogTitle>
              <DialogDescription className="text-xs">
                Your request will be routed to the authorized HR & Payroll administrators.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmitRequest} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1">
                <Label htmlFor="reqCategory">Request Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="reqCategory" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Payroll Question">Payroll Question</SelectItem>
                    <SelectItem value="Payslip Issue">Payslip Issue</SelectItem>
                    <SelectItem value="Leave Question">Leave Question</SelectItem>
                    <SelectItem value="Profile Correction">Profile Correction</SelectItem>
                    <SelectItem value="Bank Detail Change Request">Bank Detail Change Request</SelectItem>
                    <SelectItem value="Document Request">Document Request</SelectItem>
                    <SelectItem value="Other HR Query">Other HR Query</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="reqSubject">Subject / Summary</Label>
                <Input
                  id="reqSubject"
                  placeholder="Brief summary of your request"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="reqDesc">Detailed Description</Label>
                <Textarea
                  id="reqDesc"
                  placeholder="Please provide details to help HR process your request quickly..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-xs resize-none"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-[#1e2a78] hover:bg-[#152060] text-white" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Request'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Requests Section */}
      <Card>
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-base font-bold">Your Submitted Requests</CardTitle>
          <CardDescription className="text-xs">Track status and administrative updates on your inquiries</CardDescription>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No help requests submitted.
            </div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="p-4 space-y-2 hover:bg-muted/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground font-semibold">{req.id.slice(0,8)}</span>
                    <span className="text-xs font-semibold text-foreground">{req.subject}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{req.category}</Badge>
                    {getStatusBadge(req.status)}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{req.description}</p>

                {req.resolution_notes && (
                  <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-900 dark:text-blue-300 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">HR Response:</span> {req.resolution_notes}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground flex justify-between pt-1">
                  <span>Submitted: {new Date(req.created_at).toLocaleDateString()}</span>
                  <span>Last Updated: {new Date(req.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* FAQs and Support Contacts */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-bold">Frequently Asked Questions</CardTitle>
              <CardDescription className="text-xs">Quick guidance on common employee workflows</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <Accordion type="single" collapsible className="w-full text-xs">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="text-xs font-semibold">How do I apply for leave?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                    Navigate to <strong>My Leaves</strong> from the sidebar. Click on "Apply for Leave", select the leave type (Casual, Sick, Earned), specify dates, and submit.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger className="text-xs font-semibold">When are monthly payslips released?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                    Monthly payslips are generated during the month-end preparation window (25th to month-end) and automatically published on the <strong>1st day of the following month</strong>.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger className="text-xs font-semibold">How do I update my bank details?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                    For statutory compliance and data protection, submit a "Bank Detail Change Request" using the button above. Attach or provide your new IFSC code and account details for HR verification.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger className="text-xs font-semibold">How is Loss of Pay (LOP) calculated?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                    Approved unpaid leaves or unregularized absences contribute to LOP days. Entitlements are prorated as: <code>(Paid Days / Working Days) × Monthly Entitlement</code>.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="bg-[#1e2a78]/5 border border-blue-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-foreground">HR Administration Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-700 shrink-0">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">HR Helpdesk</p>
                  <a href="mailto:hr@haryak.com" className="text-blue-600 hover:underline">hr@haryak.com</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-700 shrink-0">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Internal Extension</p>
                  <p className="text-muted-foreground">Ext: 201 (HR Operations)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
