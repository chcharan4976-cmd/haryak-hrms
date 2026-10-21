'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
  UploadCloud,
  FileCheck,
  FileText,
  AlertCircle,
  Loader2,
  X,
  CheckCircle2,
  Shield,
  Building,
} from 'lucide-react'
import {
  DOCUMENT_CATEGORIES,
  formatFileSize,
  type DocumentCategoryDefinition,
} from '@/lib/types/document'

interface EmployeeOption {
  id: string
  employee_code: string
  full_name: string
  department?: { name: string }
  designation?: { name: string }
}

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  employees?: EmployeeOption[]
  isAdmin?: boolean
  replacesDocumentId?: string
  defaultEmployeeId?: string
  defaultCategory?: string
  dialogTitle?: string
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  employees = [],
  isAdmin = false,
  replacesDocumentId,
  defaultEmployeeId,
  defaultCategory,
  dialogTitle,
}: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Form fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(defaultCategory || 'identity_proof')
  const [subcategory, setSubcategory] = useState('')
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || '')
  const [isCompanyWide, setIsCompanyWide] = useState(false)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [effectiveDate, setEffectiveDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [issuingAuthority, setIssuingAuthority] = useState('Haryak Technologies India Private Limited')
  const [description, setDescription] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedCategoryDef: DocumentCategoryDefinition | undefined = DOCUMENT_CATEGORIES.find(
    c => c.code === category
  )

  const handleFileSelect = (selectedFile: File) => {
    // Validate size (15MB)
    if (selectedFile.size > 15 * 1024 * 1024) {
      toast.error('File size exceeds 15 MB limit.')
      return
    }

    setFile(selectedFile)
    if (!title) {
      // Auto-populate title cleanly from filename
      const cleanName = selectedFile.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
      setTitle(cleanName)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      toast.error('Please select a file to upload.')
      return
    }

    if (!title.trim()) {
      toast.error('Please provide a document title.')
      return
    }

    if (isAdmin && !isCompanyWide && !employeeId && !replacesDocumentId) {
      toast.error('Please select an employee or mark as company-wide.')
      return
    }

    if (expiryDate && issueDate && expiryDate < issueDate) {
      toast.error('Expiration date cannot be earlier than the issue date.')
      return
    }

    setUploading(true)
    setUploadProgress(15)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title.trim())
      formData.append('category', category)
      if (subcategory) formData.append('subcategory', subcategory.trim())
      formData.append('documentType', category)
      if (referenceNumber) formData.append('referenceNumber', referenceNumber.trim())
      if (issuingAuthority) formData.append('issuingAuthority', issuingAuthority.trim())
      if (issueDate) formData.append('issueDate', issueDate)
      if (effectiveDate) formData.append('effectiveDate', effectiveDate)
      if (expiryDate) formData.append('expiryDate', expiryDate)
      if (description) formData.append('description', description.trim())

      if (replacesDocumentId) {
        formData.append('replacesDocumentId', replacesDocumentId)
      } else if (isAdmin) {
        if (isCompanyWide) {
          formData.append('isCompanyWide', 'true')
        } else if (employeeId) {
          formData.append('employeeId', employeeId)
        }
      }

      setUploadProgress(50)

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      setUploadProgress(85)
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed')
      }

      setUploadProgress(100)
      toast.success(data.message || 'Document uploaded successfully!')
      onSuccess()
      onOpenChange(false)
      resetForm()
    } catch (err: any) {
      console.error('[DocumentUpload] Error:', err)
      toast.error(err?.message || 'Failed to upload document.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const resetForm = () => {
    setFile(null)
    setTitle('')
    setCategory(defaultCategory || 'identity_proof')
    setSubcategory('')
    setEmployeeId(defaultEmployeeId || '')
    setIsCompanyWide(false)
    setReferenceNumber('')
    setDescription('')
    setExpiryDate('')
    setEffectiveDate('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-[#1e2a78]" />
            {dialogTitle || (replacesDocumentId ? 'Upload Replacement Document' : 'Upload Employee or Company Document')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Supports PDF, JPG, PNG, WEBP, DOCX, and XLSX formats up to 15 MB with SHA-256 integrity verification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-[#1e2a78] bg-blue-50/50 dark:bg-blue-950/20'
                : file
                ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10'
                : 'border-muted-foreground/25 hover:border-muted-foreground/40 bg-muted/10'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0])
                }
              }}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.doc,.xls"
            />

            {file ? (
              <div className="flex items-center justify-between px-3">
                <div className="flex items-center gap-3 text-left">
                  <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700">
                    <FileCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-xs">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatFileSize(file.size)} • {file.type || 'Document'}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={e => {
                    e.stopPropagation()
                    setFile(null)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-1.5 py-3">
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="text-xs font-semibold text-foreground">
                  Click to select file or drag & drop here
                </p>
                <p className="text-[11px] text-muted-foreground">
                  PDF, JPG, PNG, WEBP, DOCX, XLSX (Max 15MB)
                </p>
              </div>
            )}
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Uploading and hashing document...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
          )}

          {/* Employee & Target Scope (Admin only) */}
          {isAdmin && !replacesDocumentId && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="companyWideSwitch" className="font-semibold cursor-pointer">
                  Company-Wide Policy / Handbook
                </Label>
                <input
                  id="companyWideSwitch"
                  type="checkbox"
                  checked={isCompanyWide}
                  onChange={e => {
                    setIsCompanyWide(e.target.checked)
                    if (e.target.checked) setEmployeeId('')
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-[#1e2a78] focus:ring-[#1e2a78]"
                />
              </div>

              {!isCompanyWide && (
                <div className="space-y-1">
                  <Label htmlFor="employeeSelect">Associate with Employee *</Label>
                  <select
                    id="employeeSelect"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    className="w-full rounded-md border bg-background p-2 text-xs font-medium"
                    required={!isCompanyWide}
                  >
                    <option value="">Select Employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employee_code} — {emp.full_name} ({emp.department?.name || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Document Core Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="docTitle">Document Title *</Label>
              <Input
                id="docTitle"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Master Degree Certificate, PAN Card Copy"
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="docCategory">Document Category *</Label>
              <select
                id="docCategory"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full rounded-md border bg-background p-2 text-xs"
                required
              >
                <optgroup label="Employee Identity & Onboarding">
                  {DOCUMENT_CATEGORIES.filter(c => c.group === 'identity_onboarding').map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name} {c.isMandatoryForEmployee ? '(*Mandatory)' : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Employment & HR">
                  {DOCUMENT_CATEGORIES.filter(c => c.group === 'employment_hr').map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Payroll & Statutory">
                  {DOCUMENT_CATEGORIES.filter(c => c.group === 'payroll_statutory').map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Company Documents & Policies">
                  {DOCUMENT_CATEGORIES.filter(c => c.group === 'company_policy').map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {selectedCategoryDef && (
            <p className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded border">
              <span className="font-semibold text-foreground">Standard Purpose: </span>
              {selectedCategoryDef.description}
            </p>
          )}

          {/* Reference & Issuing Authority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="refNo">Document Reference / ID Number</Label>
              <Input
                id="refNo"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="e.g. Certificate Reg No, Policy ID, PAN/Doc Ref"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="issuingAuth">Issuing Authority / Institute</Label>
              <Input
                id="issuingAuth"
                value={issuingAuthority}
                onChange={e => setIssuingAuthority(e.target.value)}
                placeholder="e.g. University, Govt of India, Haryak HR"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Dates: Issue, Effective, Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="issueDateInput">Issue Date</Label>
              <Input
                id="issueDateInput"
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="effectiveDateInput">Effective Date</Label>
              <Input
                id="effectiveDateInput"
                type="date"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="expiryDateInput">Expiry Date</Label>
                {selectedCategoryDef?.hasExpiry && (
                  <Badge variant="outline" className="text-[9px] py-0 border-amber-300 text-amber-700">
                    Recommended
                  </Badge>
                )}
              </div>
              <Input
                id="expiryDateInput"
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="docDesc">Description / Verification Notes</Label>
            <Input
              id="docDesc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes or remarks regarding this document..."
              className="h-9 text-xs"
            />
          </div>

          <DialogFooter className="border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-[#1e2a78] text-white hover:bg-[#152060]"
              disabled={uploading || !file}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                  {replacesDocumentId ? 'Submit Replacement' : 'Upload Document'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
