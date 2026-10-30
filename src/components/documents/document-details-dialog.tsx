'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  FileText,
  User,
  Building,
  Calendar,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Eye,
  History,
  Archive,
  RefreshCw,
  FileCheck,
  Hash,
  HardDrive,
  Lock,
  Loader2,
  RotateCcw,
  Trash2,
  Send,
  Edit2,
  X,
} from 'lucide-react'
import {
  EnterpriseDocumentItem,
  formatFileSize,
  getCategoryLabel,
} from '@/lib/types/document'

interface DocumentDetailsDialogProps {
  document: EnterpriseDocumentItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  onPreview: (doc: EnterpriseDocumentItem) => void
  onDownload: (doc: EnterpriseDocumentItem) => void
  onRefresh: () => void
  onRequestReplacement?: (doc: EnterpriseDocumentItem) => void
}

function formatDateDisplay(value?: string | null): string {
  if (!value) return 'Not provided'
  const raw = String(value).slice(0, 10)
  const d = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTimeDisplay(value?: string | null): string {
  if (!value) return 'Not provided'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DocumentDetailsDialog({
  document: doc,
  open,
  onOpenChange,
  isAdmin,
  onPreview,
  onDownload,
  onRefresh,
  onRequestReplacement,
}: DocumentDetailsDialogProps) {
  const [actionLoading, setActionLoading] = useState(false)
  const [promptAction, setPromptAction] = useState<'REJECT' | 'REQUEST_REPLACEMENT' | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionNotes, setActionNotes] = useState('')

  // Expiry management state
  const [isEditingExpiry, setIsEditingExpiry] = useState(false)
  const [newExpiryDate, setNewExpiryDate] = useState(doc?.expiryDate ? String(doc.expiryDate).slice(0, 10) : '')
  const [updatingExpiry, setUpdatingExpiry] = useState(false)

  // Deletion confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!doc) return null

  const isOfficialLetter = Boolean(doc.content) || [
    'offer_letter',
    'appointment_letter',
    'joining_letter',
    'salary_revision',
    'relieving_letter',
    'experience_letter',
    'resignation_acceptance',
    'custom_letter',
  ].includes(doc.documentType) || doc.category === 'employment_hr'

  const canEmployeeDelete = !isAdmin && !isOfficialLetter && doc.status !== 'VERIFIED' && doc.status !== 'ARCHIVED'

  const handleUpdateExpiry = async (dateVal: string | null) => {
    setUpdatingExpiry(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryDate: dateVal }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update expiry date')
      }
      toast.success(dateVal ? 'Expiry date updated successfully.' : 'Expiry date removed.')
      setIsEditingExpiry(false)
      onRefresh()
    } catch (err: any) {
      toast.error(err?.message || 'Error updating expiry date.')
    } finally {
      setUpdatingExpiry(false)
    }
  }

  const handleIssueLetter = async () => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}/issue`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to issue letter.')
      }
      toast.success(data.message || 'Letter issued to Employee Portal successfully!')
      onRefresh()
    } catch (err: any) {
      toast.error(err?.message || 'Error issuing letter.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteDocument = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete document')
      }
      toast.success(data.message || 'Document permanently deleted.')
      setShowDeleteConfirm(false)
      onOpenChange(false)
      onRefresh()
    } catch (err: any) {
      toast.error(err?.message || 'Error deleting document.')
    } finally {
      setDeleting(false)
    }
  }

  const handleVerifyAction = async (
    action: 'VERIFY' | 'REJECT' | 'REQUEST_REPLACEMENT' | 'ARCHIVE' | 'RESTORE',
    reason = '',
    notes = ''
  ) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason, notes }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${action.toLowerCase()} document`)
      }

      toast.success(data.message || `Document ${action.toLowerCase()}ed successfully.`)
      setPromptAction(null)
      setActionReason('')
      setActionNotes('')
      onRefresh()
    } catch (err: any) {
      toast.error(err?.message || 'Action could not be completed.')
    } finally {
      setActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> VERIFIED
          </Badge>
        )
      case 'PENDING_VERIFICATION':
      case 'UPLOADED':
        return (
          <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-xs gap-1">
            <Clock className="h-3 w-3" /> PENDING VERIFICATION
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge className="bg-red-600 text-white hover:bg-red-700 text-xs gap-1">
            <XCircle className="h-3 w-3" /> REJECTED
          </Badge>
        )
      case 'REPLACEMENT_REQUESTED':
        return (
          <Badge className="bg-orange-500 text-white hover:bg-orange-600 text-xs gap-1">
            <AlertTriangle className="h-3 w-3" /> REPLACEMENT REQUESTED
          </Badge>
        )
      case 'ISSUED':
        return (
          <Badge className="bg-purple-600 text-white hover:bg-purple-700 text-xs gap-1">
            <ShieldCheck className="h-3 w-3" /> ISSUED TO PORTAL
          </Badge>
        )
      case 'ACKNOWLEDGED':
        return (
          <Badge className="bg-teal-600 text-white hover:bg-teal-700 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> ACKNOWLEDGED
          </Badge>
        )
      case 'DRAFT':
        return (
          <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-xs">
            DRAFT
          </Badge>
        )
      case 'SUPERSEDED':
        return (
          <Badge variant="outline" className="text-gray-500 bg-gray-100 text-xs">
            SUPERSEDED
          </Badge>
        )
      case 'ARCHIVED':
        return (
          <Badge variant="outline" className="text-gray-600 bg-gray-200 text-xs gap-1">
            <Archive className="h-3 w-3" /> ARCHIVED
          </Badge>
        )
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>
    }
  }

  const getExpiryBadge = (status: string, days: number | null) => {
    switch (status) {
      case 'EXPIRED':
        return (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" /> Expired ({Math.abs(days || 0)}d ago)
          </Badge>
        )
      case 'EXPIRING_SOON':
        return (
          <Badge className="bg-amber-600 text-white text-[10px] gap-1">
            <Clock className="h-3 w-3" /> Expiring in {days} days
          </Badge>
        )
      case 'ACTIVE':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
            Active
          </Badge>
        )
      default:
        return (
          <span className="text-muted-foreground text-[11px]">Not applicable</span>
        )
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-bold text-foreground break-words">
                  {doc.title || 'Official Document'}
                </DialogTitle>
                {getStatusBadge(doc.status)}
                {doc.isArchived && (
                  <Badge variant="outline" className="border-destructive text-destructive text-[10px]">
                    Archived
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs font-mono text-muted-foreground break-words">
                Ref: {doc.documentNumber || doc.referenceNumber || 'Not assigned'} • {getCategoryLabel(doc.category)}
              </DialogDescription>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => onPreview(doc)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Preview
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-[#1e2a78] text-white hover:bg-[#152060]"
                onClick={() => onDownload(doc)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Rejection / Replacement Prompt Modal In-Place */}
        {promptAction && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-semibold text-xs">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {promptAction === 'REJECT'
                  ? 'Record Rejection Reason (Mandatory)'
                  : 'Specify Replacement Document Instructions'}
              </span>
            </div>
            <textarea
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder={
                promptAction === 'REJECT'
                  ? 'e.g. Blurry scan, illegible Aadhaar/PAN, missing signature, expired proof...'
                  : 'e.g. Please upload clear attested degree certificate with all semester marksheets.'
              }
              rows={3}
              className="w-full text-xs rounded-md border p-2 bg-background"
              required
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPromptAction(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={promptAction === 'REJECT' ? 'destructive' : 'default'}
                className={promptAction === 'REQUEST_REPLACEMENT' ? 'bg-orange-600 text-white hover:bg-orange-700' : ''}
                onClick={() => handleVerifyAction(promptAction, actionReason, actionNotes)}
                disabled={actionLoading || !actionReason.trim()}
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Confirm {promptAction === 'REJECT' ? 'Rejection' : 'Request'}
              </Button>
            </div>
          </div>
        )}

        {/* 1. Alerts for Rejected / Replacement Requested */}
        {doc.status === 'REJECTED' && doc.rejectionReason && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3.5 dark:bg-red-950/20 text-red-900 dark:text-red-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <XCircle className="h-4 w-4 text-red-600" />
              <span>Document Rejected by HR</span>
            </div>
            <p className="text-[11px] pl-5">{doc.rejectionReason}</p>
          </div>
        )}

        {doc.status === 'REPLACEMENT_REQUESTED' && doc.replacementReason && (
          <div className="rounded-lg border border-orange-300 bg-orange-50 p-3.5 dark:bg-orange-950/20 text-orange-900 dark:text-orange-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <span>Replacement Document Requested by HR</span>
            </div>
            <p className="text-[11px] pl-5">{doc.replacementReason}</p>
          </div>
        )}

        <div className="space-y-6 text-xs">
          {/* 2. Core Document Identification */}
          <section className="space-y-2.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#1e2a78]" />
              Core Identification & Metadata
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 rounded-lg border bg-muted/15 p-3.5">
              <div>
                <span className="text-[11px] text-muted-foreground block">Document Title</span>
                <span className="font-semibold text-foreground">{doc.title}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Category</span>
                <span className="font-semibold text-foreground">{doc.categoryName || getCategoryLabel(doc.category)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Subcategory / Type</span>
                <span className="font-medium text-foreground">{doc.subcategory || doc.documentType || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Reference Number</span>
                <span className="font-mono font-medium text-foreground">{doc.referenceNumber || doc.documentNumber || 'Not provided'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Issuing Authority</span>
                <span className="font-medium text-foreground">{doc.issuingAuthority || 'Haryak Technologies India Private Limited'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Access Restrictions</span>
                <span className="capitalize font-medium text-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  {doc.visibility === 'company' || doc.visibility === 'company_wide' ? 'Company-wide (All Employees)' : 'Confidential (Employee & HR)'}
                </span>
              </div>
            </div>
          </section>

          {/* 3. Associated Employee */}
          <section className="space-y-2.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-[#1e2a78]" />
              Associated Employee Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border bg-muted/15 p-3.5">
              <div>
                <span className="text-[11px] text-muted-foreground block">Employee Code</span>
                <span className="font-mono font-bold text-foreground">{doc.employeeCode || 'Not applicable'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Full Name</span>
                <span className="font-semibold text-foreground">{doc.employeeName || 'Company Wide Document'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Department</span>
                <span className="font-medium text-foreground">{doc.departmentName || 'Not assigned'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Designation</span>
                <span className="font-medium text-foreground">{doc.designationName || 'Not assigned'}</span>
              </div>
            </div>
          </section>

          {/* 4. Dates & Lifecycle */}
          <section className="space-y-2.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#1e2a78]" />
              Dates & Lifecycle Timeline
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border bg-muted/15 p-3.5">
              <div>
                <span className="text-[11px] text-muted-foreground block">Issue Date</span>
                <span className="font-medium text-foreground">{formatDateDisplay(doc.issueDate)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Effective Date</span>
                <span className="font-medium text-foreground">{formatDateDisplay(doc.effectiveDate)}</span>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground block">Expiration Date</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewExpiryDate(doc.expiryDate ? String(doc.expiryDate).slice(0, 10) : '')
                        setIsEditingExpiry(!isEditingExpiry)
                      }}
                      className="text-[10px] text-[#1e2a78] hover:underline flex items-center gap-0.5"
                    >
                      <Edit2 className="h-2.5 w-2.5" /> {isEditingExpiry ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>
                {isEditingExpiry ? (
                  <div className="mt-1 space-y-1">
                    <Input
                      type="date"
                      value={newExpiryDate}
                      onChange={e => setNewExpiryDate(e.target.value)}
                      className="h-7 text-xs px-2"
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px] bg-[#1e2a78] text-white"
                        onClick={() => handleUpdateExpiry(newExpiryDate || null)}
                        disabled={updatingExpiry}
                      >
                        {updatingExpiry ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Save'}
                      </Button>
                      {doc.expiryDate && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-red-600 border-red-200"
                          onClick={() => handleUpdateExpiry(null)}
                          disabled={updatingExpiry}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="font-medium text-foreground">{formatDateDisplay(doc.expiryDate)}</span>
                )}
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Expiry Status</span>
                <div className="mt-0.5">{getExpiryBadge(doc.expiryStatus, doc.daysUntilExpiry ?? null)}</div>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block">Uploaded At</span>
                <span className="text-muted-foreground">{formatDateTimeDisplay(doc.createdAt)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Last Modified</span>
                <span className="text-muted-foreground">{formatDateTimeDisplay(doc.updatedAt)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Statutory Retention</span>
                <span className="font-medium text-foreground">{doc.retentionPeriodMonths ? `${Math.floor(doc.retentionPeriodMonths / 12)} Years (${doc.retentionPeriodMonths}m)` : '7 Years'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Acknowledgement</span>
                <span className="font-medium text-foreground">
                  {doc.acknowledgedAt ? `Acknowledged ${formatDateDisplay(doc.acknowledgedAt)}` : 'Pending'}
                </span>
              </div>
            </div>
          </section>

          {/* 5. Verification Information */}
          <section className="space-y-2.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#1e2a78]" />
              Verification & Audit Record
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border bg-muted/15 p-3.5">
              <div>
                <span className="text-[11px] text-muted-foreground block">Verification Status</span>
                <span className="capitalize font-semibold text-foreground">{doc.verificationStatus || 'Unverified'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Verified By</span>
                <span className="font-medium text-foreground">{doc.verifiedByName || (doc.verifiedBy ? 'HR Administrator' : 'Not verified')}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Verified At</span>
                <span className="text-muted-foreground">{formatDateTimeDisplay(doc.verifiedAt)}</span>
              </div>
              {doc.verificationNotes && (
                <div className="col-span-full">
                  <span className="text-[11px] text-muted-foreground block">Verification Notes</span>
                  <p className="text-foreground text-xs mt-0.5">{doc.verificationNotes}</p>
                </div>
              )}
            </div>
          </section>

          {/* 6. File & Technical Integrity */}
          <section className="space-y-2.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-[#1e2a78]" />
              File & Storage Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border bg-muted/15 p-3.5">
              <div>
                <span className="text-[11px] text-muted-foreground block">Stored Filename</span>
                <span className="font-mono text-xs text-foreground truncate block">{doc.fileName || 'document.pdf'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">File Size</span>
                <span className="font-medium text-foreground">{formatFileSize(doc.fileSize)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">MIME Type</span>
                <span className="font-mono text-[11px] text-foreground truncate block">{doc.mimeType || 'application/pdf'}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Current Version</span>
                <Badge variant="outline" className="text-xs font-mono">v{doc.version || 1}</Badge>
              </div>
              {doc.checksumSha256 && (
                <div className="col-span-full">
                  <span className="text-[11px] text-muted-foreground block">SHA-256 Checksum (Anti-Tamper)</span>
                  <span className="font-mono text-[10px] text-muted-foreground break-all select-all">{doc.checksumSha256}</span>
                </div>
              )}
            </div>
          </section>

          {/* 7. Version History */}
          <section className="space-y-2.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <History className="h-4 w-4 text-[#1e2a78]" />
              Version History ({doc.versions?.length || 1})
            </h4>
            {doc.versions && doc.versions.length > 0 ? (
              <div className="rounded-lg border overflow-x-auto max-w-full">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-muted/30 border-b font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-2.5 pl-4">Version</th>
                      <th className="p-2.5">Filename</th>
                      <th className="p-2.5">Size</th>
                      <th className="p-2.5">Uploaded By</th>
                      <th className="p-2.5">Timestamp</th>
                      <th className="p-2.5">Change Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {doc.versions.map(v => (
                      <tr key={v.id} className="hover:bg-muted/20">
                        <td className="p-2.5 pl-4 font-mono font-bold text-[#1e2a78]">
                          v{v.versionNumber} {v.versionNumber === doc.version ? '(Current)' : ''}
                        </td>
                        <td className="p-2.5 font-medium">{v.fileName || 'document.pdf'}</td>
                        <td className="p-2.5 text-muted-foreground">{formatFileSize(v.fileSize)}</td>
                        <td className="p-2.5">{v.uploadedByName || 'HR Admin'}</td>
                        <td className="p-2.5 text-muted-foreground">{formatDateTimeDisplay(v.createdAt)}</td>
                        <td className="p-2.5 text-muted-foreground text-[11px]">{v.changeSummary || 'Version record'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 text-center border rounded-lg text-muted-foreground text-xs">
                Version 1 (Initial Document)
              </div>
            )}
          </section>
        </div>

        {/* Admin / Employee Actions Toolbar */}
        <DialogFooter className="border-t pt-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            {(isAdmin || canEmployeeDelete) && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={actionLoading || deleting}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            )}

            {isAdmin && !doc.isArchived && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => handleVerifyAction('ARCHIVE')}
                disabled={actionLoading}
              >
                <Archive className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            )}
            {isAdmin && doc.isArchived && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-emerald-700"
                onClick={() => handleVerifyAction('RESTORE')}
                disabled={actionLoading}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore from Archive
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* If official letter in draft/approved/verified, render Issue to Employee Portal */}
            {isAdmin && isOfficialLetter && (doc.status === 'DRAFT' || doc.status === 'APPROVED' || doc.status === 'VERIFIED') && (
              <Button
                size="sm"
                className="bg-purple-600 text-white hover:bg-purple-700 text-xs shadow-sm"
                onClick={handleIssueLetter}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                Issue to Employee Portal
              </Button>
            )}

            {/* If user is Admin and uploaded doc is unverified, render verify / reject controls */}
            {isAdmin && !isOfficialLetter && doc.status !== 'VERIFIED' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50 text-xs"
                  onClick={() => setPromptAction('REJECT')}
                  disabled={actionLoading}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50 text-xs"
                  onClick={() => setPromptAction('REQUEST_REPLACEMENT')}
                  disabled={actionLoading}
                >
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Request Replacement
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                  onClick={() => handleVerifyAction('VERIFY')}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Verify & Approve
                </Button>
              </>
            )}

            {/* If Employee and doc is rejected or replacement requested */}
            {!isAdmin && (doc.status === 'REJECTED' || doc.status === 'REPLACEMENT_REQUESTED') && (
              <Button
                size="sm"
                className="bg-[#1e2a78] text-white hover:bg-[#152060] text-xs"
                onClick={() => {
                  onOpenChange(false)
                  if (onRequestReplacement) onRequestReplacement(doc)
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Upload Replacement
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Permanent Deletion Confirmation Dialog */}
    <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 text-base">
            <AlertTriangle className="h-5 w-5" /> Delete Document Permanently
          </DialogTitle>
          <DialogDescription className="text-xs space-y-2 pt-2">
            <p>
              Are you sure you want to permanently delete <strong>{doc.title}</strong>?
            </p>
            {doc.employeeName && (
              <p className="text-muted-foreground">
                Employee: <strong>{doc.employeeName}</strong> {doc.employeeCode ? `(${doc.employeeCode})` : ''}
              </p>
            )}
            <p className="text-red-600 font-medium">
              This will permanently delete the document record, version history, and associated file storage. This action cannot be undone.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteDocument}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            Permanently Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
