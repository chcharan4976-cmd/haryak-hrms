'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Building,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileCheck,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UploadCloud,
  AlertTriangle,
  Clock,
  Filter,
  CheckSquare,
  Lock,
  Layers,
  Archive,
  Trash2,
} from 'lucide-react'


import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

import { OfficialLetterheadRenderer } from '@/components/documents/document-renderer'
import {
  DocumentEditor,
  type EditableDocumentContent,
  type EditableDocumentSection,
} from '@/components/documents/document-editor'
import { downloadOfficialDocumentPdf } from '@/lib/pdf/generate-document-pdf'

import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import { DocumentDetailsDialog } from '@/components/documents/document-details-dialog'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import { DocumentComplianceMatrix } from '@/components/documents/document-compliance-matrix'

import {
  EnterpriseDocumentItem,
  DOCUMENT_CATEGORIES,
  getCategoryLabel,
  formatFileSize,
} from '@/lib/types/document'

interface EmployeeOption {
  id: string
  employee_code: string
  full_name: string
  official_email?: string
  department?: {
    name: string
  }
  designation?: {
    name: string
  }
  joining_date?: string
}

interface SignatoryOption {
  id: string
  name: string
  title: string
  isDefault?: boolean
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function createStableId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`
}

function normalizeLegacySections(content: any): EditableDocumentSection[] {
  if (Array.isArray(content?.sections)) {
    return content.sections.map((section: any, sectionIndex: number) => ({
      id: String(section?.id || createStableId('section', sectionIndex)),
      title: String(section?.title || ''),
      clauses: Array.isArray(section?.clauses)
        ? section.clauses.map((clause: any, clauseIndex: number) => ({
            id: String(clause?.id || createStableId(`section-${sectionIndex + 1}-clause`, clauseIndex)),
            title: String(clause?.title || clause?.heading || ''),
            content: String(clause?.content || clause?.text || ''),
          }))
        : [],
    }))
  }

  if (Array.isArray(content?.clauses) && content.clauses.length > 0) {
    return [
      {
        id: 'terms-and-conditions',
        title: String(content?.termsTitle || content?.sectionTitle || 'Terms & Conditions'),
        clauses: content.clauses.map((clause: any, index: number) => ({
          id: String(clause?.id || createStableId('clause', index)),
          title: String(clause?.title || clause?.heading || ''),
          content: String(clause?.content || clause?.text || ''),
        })),
      },
    ]
  }

  return []
}

function normalizeDocumentForEditor(doc: EnterpriseDocumentItem): EditableDocumentContent {
  const content = doc.content || {}
  const legacyBody =
    typeof content?.body === 'string'
      ? content.body.split(/\n\s*\n/g).map((item: string) => item.trim()).filter(Boolean)
      : []

  const bodyParagraphs = Array.isArray(content?.bodyParagraphs)
    ? content.bodyParagraphs.map((paragraph: any) => String(paragraph || ''))
    : legacyBody

  const signatory = content?.signatory || {}

  return {
    documentNumber: String(content?.documentNumber || content?.referenceNumber || doc.documentNumber || ''),
    issueDate: String(content?.issueDate || doc.issueDate || '').slice(0, 10),
    effectiveDate: String(content?.effectiveDate || doc.effectiveDate || '').slice(0, 10) || null,
    subject: String(content?.subject || doc.title || ''),
    salutation: String(content?.salutation || 'Dear Colleague,'),
    bodyParagraphs,
    sections: normalizeLegacySections(content),
    closingText: String(content?.closingText || content?.closing || 'For Haryak Technologies India Private Limited,'),
    signatory: {
      name: String(signatory?.name || content?.signatoryName || 'Authorized Signatory'),
      title: String(signatory?.title || signatory?.designation || content?.signatoryTitle || 'Head of Human Resources'),
      department: String(signatory?.department || ''),
      organization: String(signatory?.organization || 'Haryak Technologies India Private Limited'),
    },
  }
}

function editorValueToPersistedContent(value: EditableDocumentContent, existingContent: any) {
  return {
    ...(existingContent || {}),
    documentNumber: value.documentNumber,
    referenceNumber: value.documentNumber,
    issueDate: value.issueDate,
    effectiveDate: value.effectiveDate || null,
    subject: value.subject,
    salutation: value.salutation,
    bodyParagraphs: value.bodyParagraphs,
    body: value.bodyParagraphs.join('\n\n'),
    sections: value.sections,
    clauses:
      value.sections.length === 1
        ? value.sections[0].clauses.map(clause => ({
            title: clause.title,
            content: clause.content,
          }))
        : existingContent?.clauses,
    closingText: value.closingText,
    closing: value.closingText,
    signatory: {
      name: value.signatory.name,
      title: value.signatory.title,
      department: value.signatory.department || '',
      organization: value.signatory.organization || 'Haryak Technologies India Private Limited',
    },
  }
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<EnterpriseDocumentItem[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [selectedExpiry, setSelectedExpiry] = useState<string>('ALL')
  const [includeArchived, setIncludeArchived] = useState<boolean>(false)

  // Upload Dialog
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadDefaultEmployeeId, setUploadDefaultEmployeeId] = useState<string>('')
  const [uploadDefaultCategory, setUploadDefaultCategory] = useState<string>('identity_proof')

  // Details Dialog
  const [selectedDetailDoc, setSelectedDetailDoc] = useState<EnterpriseDocumentItem | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  // Multi-format Preview Dialog
  const [previewDoc, setPreviewDoc] = useState<EnterpriseDocumentItem | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Generate Letter Modal
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genEmployeeId, setGenEmployeeId] = useState('')
  const [genDocType, setGenDocType] = useState('offer_letter')
  const [genIssueDate, setGenIssueDate] = useState(todayIso())
  const [genEffectiveDate, setGenEffectiveDate] = useState('')
  const [genSignatoryName, setGenSignatoryName] = useState('Authorized Signatory')
  const [genSignatoryTitle, setGenSignatoryTitle] = useState('Head of Human Resources')
  const [signatories, setSignatories] = useState<SignatoryOption[]>([])

  // Letter Editor Dialog
  const [editorDoc, setEditorDoc] = useState<EnterpriseDocumentItem | null>(null)
  const [editorValue, setEditorValue] = useState<EditableDocumentContent | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<EnterpriseDocumentItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  /* ============================================================
     DATA FETCH
     ============================================================ */

  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (includeArchived) params.set('archived', 'true')
      const response = await fetch(`/api/documents?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (data.success) {
        setDocuments(data.documents || [])
      } else {
        toast.error(data.error || 'Failed to load documents.')
      }
    } catch (error) {
      console.error('Error fetching documents', error)
      toast.error('Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees', { cache: 'no-store' })
      const data = await response.json()
      if (data.success && Array.isArray(data.employees)) {
        const mapped = data.employees.map((employee: any) => ({
          id: employee.id,
          employee_code: employee.employee_code || employee.code || '',
          full_name: employee.full_name || employee.fullName || employee.name || 'Employee',
          official_email: employee.official_email || employee.email || '',
          department:
            typeof employee.department === 'string'
              ? { name: employee.department }
              : employee.department || { name: 'Not assigned' },
          designation:
            typeof employee.designation === 'string'
              ? { name: employee.designation }
              : employee.designation || { name: 'Not assigned' },
          joining_date: employee.joining_date || employee.joinDate || '',
        }))
        setEmployees(mapped)
        if (mapped.length > 0 && !genEmployeeId) {
          setGenEmployeeId(mapped[0].id)
          setGenEffectiveDate(mapped[0].joining_date || todayIso())
        }
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    }
  }

  const fetchSignatories = async () => {
    try {
      const response = await fetch('/api/company/signatories', { cache: 'no-store' })
      const data = await response.json()
      if (data.success && Array.isArray(data.signatories)) {
        setSignatories(data.signatories)
        const defaultSignatory =
          data.signatories.find((signatory: any) => signatory.isDefault) || data.signatories[0]
        if (defaultSignatory) {
          setGenSignatoryName(defaultSignatory.name || '')
          setGenSignatoryTitle(defaultSignatory.title || '')
        }
      }
    } catch (error) {
      console.error('Error fetching signatories:', error)
    }
  }

  useEffect(() => {
    void fetchDocuments()
    void fetchEmployees()
    void fetchSignatories()
  }, [includeArchived])

  /* ============================================================
     GENERATE LETTER
     ============================================================ */

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!genEmployeeId) {
      toast.error('Please select an employee.')
      return
    }
    setGenerating(true)
    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: genEmployeeId,
          docType: genDocType,
          issueDate: genIssueDate,
          effectiveDate: genEffectiveDate || genIssueDate,
          signatoryName: genSignatoryName,
          signatoryTitle: genSignatoryTitle,
        }),
      })

      const data = await response.json()
      if (data.success && data.document) {
        toast.success(`Draft ${data.document.documentNumber} generated successfully.`)
        setIsGenerateOpen(false)
        await fetchDocuments()
        openDocEditor(data.document)
      } else {
        toast.error(data.error || 'Failed to generate letter.')
      }
    } catch (error) {
      console.error(error)
      toast.error('Error creating document draft.')
    } finally {
      setGenerating(false)
    }
  }

  /* ============================================================
     MODAL CONTROLS
     ============================================================ */

  const openDocDetails = (doc: EnterpriseDocumentItem) => {
    setSelectedDetailDoc(doc)
    setIsDetailsOpen(true)
  }

  const openDocPreview = (doc: EnterpriseDocumentItem) => {
    setPreviewDoc(doc)
    setIsPreviewOpen(true)
  }

  const openDocEditor = (doc: EnterpriseDocumentItem) => {
    setEditorDoc(doc)
    setEditorValue(normalizeDocumentForEditor(doc))
    setIsEditorOpen(true)
  }

  const openUploadForEmployee = (empId: string, categoryCode = 'identity_proof') => {
    setUploadDefaultEmployeeId(empId)
    setUploadDefaultCategory(categoryCode)
    setIsUploadOpen(true)
  }

  const handleSaveDraft = async (value: EditableDocumentContent) => {
    if (!editorDoc) return
    setActionLoading(true)
    try {
      const updatedContent = editorValueToPersistedContent(value, editorDoc.content)
      const response = await fetch(`/api/documents/${editorDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: updatedContent,
          documentNumber: value.documentNumber,
          issueDate: value.issueDate,
          effectiveDate: value.effectiveDate,
          title: value.subject,
          changeReason: 'Document content updated via Official Document Center',
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update document.')
      }
      toast.success('Document updated successfully.')
      setIsEditorOpen(false)
      await fetchDocuments()
    } catch (error: any) {
      toast.error(error?.message || 'Error saving document.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveAndIssue = async (value: EditableDocumentContent) => {
    if (!editorDoc) return
    setActionLoading(true)
    try {
      const updatedContent = editorValueToPersistedContent(value, editorDoc.content)
      const response = await fetch(`/api/documents/${editorDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: updatedContent,
          documentNumber: value.documentNumber,
          issueDate: value.issueDate,
          effectiveDate: value.effectiveDate,
          title: value.subject,
          changeReason: 'Document content updated and issued to employee portal',
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update document.')
      }

      const targetId = data.document?.id || editorDoc.id
      const issueRes = await fetch(`/api/documents/${targetId}/issue`, {
        method: 'POST',
      })
      const issueData = await issueRes.json()
      if (!issueRes.ok || !issueData.success) {
        throw new Error(issueData.error || 'Failed to issue document.')
      }

      toast.success('Document saved and issued to Employee Portal successfully!')
      setIsEditorOpen(false)
      await fetchDocuments()
    } catch (error: any) {
      toast.error(error?.message || 'Error saving and issuing document.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleIssueLetter = async (docId: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${docId}/issue`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to issue letter.')
      }
      toast.success(data.message || 'Official letter issued to Employee Portal successfully!')
      await fetchDocuments()
    } catch (err: any) {
      toast.error(err?.message || 'Error issuing letter.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteDocument = async (doc: EnterpriseDocumentItem) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete document')
      }
      toast.success(data.message || 'Document permanently deleted.')
      setDeleteTargetDoc(null)
      await fetchDocuments()
    } catch (err: any) {
      toast.error(err?.message || 'Error deleting document.')
    } finally {
      setActionLoading(false)
    }
  }


  const handleDownloadFile = (doc: EnterpriseDocumentItem) => {
    if (doc.content) {
      openDocPreview(doc)
    } else if (doc.fileUrl) {
      const link = window.document.createElement('a')
      link.href = doc.fileUrl.includes('?') ? `${doc.fileUrl}&download=true` : `${doc.fileUrl}?download=true`
      link.download = doc.fileName || 'document'
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      toast.success('Download started.')
    }
  }

  /* ============================================================
     FILTERING & METRICS
     ============================================================ */

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      const q = searchQuery.trim().toLowerCase()
      const matchesSearch =
        !q ||
        (doc.title && doc.title.toLowerCase().includes(q)) ||
        (doc.documentNumber && doc.documentNumber.toLowerCase().includes(q)) ||
        (doc.employeeName && doc.employeeName.toLowerCase().includes(q)) ||
        (doc.employeeCode && doc.employeeCode.toLowerCase().includes(q)) ||
        (doc.referenceNumber && doc.referenceNumber.toLowerCase().includes(q))

      const matchesStatus = selectedStatus === 'ALL' || doc.status === selectedStatus
      const matchesCategory = selectedCategory === 'ALL' || doc.category === selectedCategory
      const matchesExpiry = selectedExpiry === 'ALL' || doc.expiryStatus === selectedExpiry

      return matchesSearch && matchesStatus && matchesCategory && matchesExpiry
    })
  }, [documents, searchQuery, selectedStatus, selectedCategory, selectedExpiry])

  // Real KPIs
  const countTotal = documents.length
  const countPending = documents.filter(
    d => d.status === 'PENDING_VERIFICATION' || d.status === 'UPLOADED' || d.status === 'DRAFT'
  ).length
  const countVerified = documents.filter(
    d => d.status === 'VERIFIED' || d.status === 'ISSUED' || d.status === 'ACKNOWLEDGED'
  ).length
  const countExpiring = documents.filter(
    d => d.expiryStatus === 'EXPIRING_SOON' || d.expiryStatus === 'EXPIRED'
  ).length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return <Badge className="bg-emerald-600 text-[10px] text-white">VERIFIED</Badge>
      case 'PENDING_VERIFICATION':
      case 'UPLOADED':
        return <Badge className="bg-amber-500 text-[10px] text-white">PENDING REVIEW</Badge>
      case 'REJECTED':
        return <Badge className="bg-red-600 text-[10px] text-white">REJECTED</Badge>
      case 'REPLACEMENT_REQUESTED':
        return <Badge className="bg-orange-500 text-[10px] text-white">REPLACE REQ</Badge>
      case 'ISSUED':
        return <Badge className="bg-purple-600 text-[10px] text-white">ISSUED</Badge>
      case 'ACKNOWLEDGED':
        return <Badge className="bg-teal-600 text-[10px] text-white">ACKNOWLEDGED</Badge>
      case 'DRAFT':
        return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">DRAFT</Badge>
      case 'SUPERSEDED':
        return <Badge variant="outline" className="border-gray-300 bg-gray-100 text-[10px] text-gray-500">SUPERSEDED</Badge>
      case 'ARCHIVED':
        return <Badge variant="outline" className="text-gray-500 text-[10px]">ARCHIVED</Badge>
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enterprise Document Management System"
        description="Empowering Tomorrow’s Solutions, Today. Comprehensive employee document repository, statutory compliance, verification lifecycle, and official stationery."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              setUploadDefaultEmployeeId('')
              setUploadDefaultCategory('identity_proof')
              setIsUploadOpen(true)
            }}
          >
            <UploadCloud className="mr-1.5 h-3.5 w-3.5 text-[#1e2a78]" />
            Upload Document
          </Button>

          <Button
            className="bg-[#1e2a78] text-xs text-white shadow-sm hover:bg-[#152060]"
            size="sm"
            onClick={() => setIsGenerateOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Generate Official Letter
          </Button>
        </div>
      </PageHeader>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Total Documents</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{countTotal}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active repository items</p>
            </div>
            <div className="p-2.5 rounded-full bg-blue-50 text-[#1e2a78] dark:bg-blue-950">
              <FileText className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Pending Review</p>
              <h3 className="text-xl font-bold text-amber-600 mt-0.5">{countPending}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Awaiting verification/issuance</p>
            </div>
            <div className="p-2.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Verified & Active</p>
              <h3 className="text-xl font-bold text-emerald-600 mt-0.5">{countVerified}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Statutory & verified records</p>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Expiry Alerts</p>
              <h3 className="text-xl font-bold text-red-600 mt-0.5">{countExpiring}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Expiring soon or expired</p>
            </div>
            <div className="p-2.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="repository" className="space-y-4">
        <TabsList className="border bg-muted/40 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="repository" className="text-xs">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Document Repository
          </TabsTrigger>

          <TabsTrigger value="compliance" className="text-xs">
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
            Compliance Checklist
          </TabsTrigger>

          <TabsTrigger value="letters" className="text-xs">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Official Letters
          </TabsTrigger>

          <TabsTrigger value="stationery" className="text-xs">
            <Building className="mr-1.5 h-3.5 w-3.5" />
            Stationery & Letterhead
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Document Repository */}
        <TabsContent value="repository" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <CardTitle className="text-base font-bold">Employee & Company Documents</CardTitle>
                  <CardDescription className="text-xs">
                    Complete records of onboarding proofs, agreements, policies, and statutory credentials.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search title, ref, employee..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="h-9 pl-8 text-xs"
                    />
                  </div>

                  <Select
                    value={selectedCategory}
                    onValueChange={val => setSelectedCategory(val)}
                  >
                    <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Categories</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Identity & Onboarding</SelectLabel>
                        {DOCUMENT_CATEGORIES.filter(c => c.group === 'identity_onboarding').map(c => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Employment & HR</SelectLabel>
                        {DOCUMENT_CATEGORIES.filter(c => c.group === 'employment_hr').map(c => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Payroll & Statutory</SelectLabel>
                        {DOCUMENT_CATEGORIES.filter(c => c.group === 'payroll_statutory').map(c => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Company Policies</SelectLabel>
                        {DOCUMENT_CATEGORIES.filter(c => c.group === 'company_policy').map(c => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedStatus}
                    onValueChange={val => setSelectedStatus(val)}
                  >
                    <SelectTrigger className="h-9 w-auto min-w-[130px] text-xs">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="VERIFIED">Verified</SelectItem>
                      <SelectItem value="PENDING_VERIFICATION">Pending Review</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="REPLACEMENT_REQUESTED">Replacement Requested</SelectItem>
                      <SelectItem value="ISSUED">Issued to Portal</SelectItem>
                      <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedExpiry}
                    onValueChange={val => setSelectedExpiry(val)}
                  >
                    <SelectTrigger className="h-9 w-auto min-w-[130px] text-xs">
                      <SelectValue placeholder="All Expiry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Expiry</SelectItem>
                      <SelectItem value="EXPIRING_SOON">Expiring Soon (30d)</SelectItem>
                      <SelectItem value="EXPIRED">Expired</SelectItem>
                      <SelectItem value="ACTIVE">Active (No Expiry / Valid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#1e2a78]" />
                  <p className="text-xs text-muted-foreground">Loading documents repository...</p>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={FolderOpen}
                    title="No documents matching filters."
                    description="Upload an employee onboarding document, company policy, or generate an official letter."
                    action={
                      <Button
                        size="sm"
                        className="bg-[#1e2a78] text-xs text-white hover:bg-[#152060]"
                        onClick={() => setIsUploadOpen(true)}
                      >
                        <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                        Upload Document
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/30 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3.5 pl-6">Document Ref / Title</th>
                        <th className="p-3.5">Employee</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Expiry</th>
                        <th className="p-3.5">Version</th>
                        <th className="p-3.5 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredDocs.map(document => (
                        <tr
                          key={document.id}
                          className="transition-colors hover:bg-muted/20 cursor-pointer"
                          onClick={() => openDocDetails(document)}
                        >
                          <td className="p-3.5 pl-6">
                            <div className="font-semibold text-foreground">{document.title}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {document.documentNumber || document.referenceNumber || 'HRK/DOC'}
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="font-semibold text-foreground">
                              {document.employeeName || 'Company Wide'}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {document.employeeCode || (document.visibility === 'company' ? 'All Staff' : '')}
                            </div>
                          </td>

                          <td className="p-3.5">
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {document.categoryName || getCategoryLabel(document.category)}
                            </Badge>
                          </td>

                          <td className="p-3.5">{getStatusBadge(document.status)}</td>

                          <td className="p-3.5">
                            {document.expiryDate ? (
                              <div className="space-y-0.5">
                                <div className="text-[11px] text-foreground font-mono">
                                  {document.expiryDate.slice(0, 10)}
                                </div>
                                {document.expiryStatus === 'EXPIRING_SOON' && (
                                  <Badge className="bg-amber-500 text-white text-[9px] py-0">
                                    {document.daysUntilExpiry}d left
                                  </Badge>
                                )}
                                {document.expiryStatus === 'EXPIRED' && (
                                  <Badge variant="destructive" className="text-[9px] py-0">
                                    Expired
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">No Expiry</span>
                            )}
                          </td>

                          <td className="p-3.5 font-mono text-[11px]">v{document.version || 1}</td>

                          <td className="space-x-1 p-3.5 pr-6 text-right" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openDocDetails(document)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              Details
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleDownloadFile(document)}
                            >
                              <Download className="h-3 w-3" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete Document"
                              onClick={() => setDeleteTargetDoc(document)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Compliance Checklist */}
        <TabsContent value="compliance" className="space-y-4">
          <DocumentComplianceMatrix
            employees={employees}
            documents={documents}
            onUploadForEmployee={openUploadForEmployee}
          />
        </TabsContent>

        {/* Tab 3: Official Letters */}
        <TabsContent value="letters" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Official Letters & Correspondence</CardTitle>
                  <CardDescription className="text-xs">
                    Authoritative letters generated on corporate letterhead with approval and portal issuance.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-[#1e2a78] text-xs text-white hover:bg-[#152060]"
                  onClick={() => setIsGenerateOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Generate Letter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/30 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6">Reference No</th>
                      <th className="p-3.5">Employee</th>
                      <th className="p-3.5">Title</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Issue Date</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {documents
                      .filter(d => Boolean(d.content))
                      .map(document => (
                        <tr key={document.id} className="hover:bg-muted/20">
                          <td className="p-3.5 pl-6 font-mono font-medium">{document.documentNumber}</td>
                          <td className="p-3.5">
                            <div className="font-semibold">{document.employeeName}</div>
                            <div className="text-[11px] text-muted-foreground">{document.employeeCode}</div>
                          </td>
                          <td className="p-3.5">{document.title}</td>
                          <td className="p-3.5">{getStatusBadge(document.status)}</td>
                          <td className="p-3.5 text-muted-foreground font-mono">{document.issueDate?.slice(0, 10)}</td>
                          <td className="p-3.5 pr-6 text-right space-x-1">
                            {(document.status === 'DRAFT' || document.status === 'APPROVED' || document.status === 'VERIFIED') && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                                onClick={() => handleIssueLetter(document.id)}
                                disabled={actionLoading}
                              >
                                <Send className="mr-1 h-3 w-3" /> Issue to Portal
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => openDocEditor(document)}
                            >
                              <Edit3 className="mr-1 h-3 w-3" /> Edit / Preview
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete Letter"
                              onClick={() => setDeleteTargetDoc(document)}
                              disabled={actionLoading}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>

                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Stationery */}
        <TabsContent value="stationery" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Authoritative Corporate Stationery</CardTitle>
                  <CardDescription className="text-xs">
                    Official Haryak Technologies India Private Limited letterhead asset and geometric safety boundaries.
                  </CardDescription>
                </div>
                <Badge className="bg-emerald-600 text-xs text-white">
                  <ShieldCheck className="mr-1 h-3 w-3" /> ACTIVE STATIONERY (V1)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StationeryMetric
                  label="Stationery Standard"
                  value="Standard ISO A4"
                  description="595.2 × 841.8 pt (210 × 297 mm)"
                />
                <StationeryMetric
                  label="Header Safe Margin"
                  value="32.0 mm"
                  description="No content overlaps official header"
                />
                <StationeryMetric
                  label="Footer Safe Margin"
                  value="35.0 mm"
                  description="No content overlaps official footer"
                />
                <StationeryMetric
                  label="Content Height"
                  value="227 mm Free Zone"
                  description="Professional writing area"
                />
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Active Asset Elements
                </h4>

                <div className="space-y-4 rounded-xl border bg-muted/10 p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Official Header</span>
                      <span className="font-mono text-[11px] text-muted-foreground">Logo, Tagline & Top Bar</span>
                    </div>
                    <div className="overflow-hidden rounded border bg-white p-1">
                      <img
                        src="/letterhead/header.png"
                        alt="Haryak Letterhead Header"
                        className="mx-auto h-auto max-h-24 w-full object-contain"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Official Footer</span>
                      <span className="font-mono text-[11px] text-muted-foreground">Contact, Address & Waves</span>
                    </div>
                    <div className="overflow-hidden rounded border bg-white p-1">
                      <img
                        src="/letterhead/footer.jpg"
                        alt="Haryak Letterhead Footer"
                        className="mx-auto h-auto max-h-24 w-full object-contain"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border bg-blue-50/50 p-4 dark:bg-blue-950/20">
                  <div>
                    <p className="text-xs font-bold text-[#1e2a78] dark:text-blue-300">
                      Authoritative Vector Stationery PDF
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Official Haryak Technologies India Private Limited master letterhead.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white text-xs dark:bg-black"
                    onClick={() => window.open('/letterhead/haryak-official-letterhead.pdf', '_blank')}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download Master PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onSuccess={fetchDocuments}
        employees={employees}
        isAdmin={true}
        defaultEmployeeId={uploadDefaultEmployeeId}
        defaultCategory={uploadDefaultCategory}
      />

      {/* Details Dialog */}
      <DocumentDetailsDialog
        document={selectedDetailDoc}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        isAdmin={true}
        onPreview={doc => {
          setIsDetailsOpen(false)
          openDocPreview(doc)
        }}
        onDownload={handleDownloadFile}
        onRefresh={() => {
          fetchDocuments()
          setIsDetailsOpen(false)
        }}
      />

      {/* Multi-Format Preview Dialog */}
      <DocumentPreviewModal
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        document={previewDoc}
      />

      {/* Generate Letter Modal */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Generate Official Letter</DialogTitle>
            <DialogDescription className="text-xs">
              Select employee, letter type, and dates to automatically generate a sequential official letter.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerate} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1 sm:col-span-1">
                <Label htmlFor="employee">Employee *</Label>
                <Select
                  value={genEmployeeId}
                  onValueChange={val => {
                    setGenEmployeeId(val)
                    const found = employees.find(employee => employee.id === val)
                    if (found?.joining_date) {
                      setGenEffectiveDate(found.joining_date)
                    }
                  }}
                >
                  <SelectTrigger id="employee" className="w-full text-xs h-9 font-medium">
                    <SelectValue placeholder="Select Employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(employee => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.employee_code} — {employee.full_name} ({employee.department?.name || 'General'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1 sm:col-span-1">
                <Label htmlFor="docType">Document Type *</Label>
                <Select
                  value={genDocType}
                  onValueChange={val => setGenDocType(val)}
                >
                  <SelectTrigger id="docType" className="w-full text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offer_letter">Offer Letter</SelectItem>
                    <SelectItem value="appointment_letter">Appointment Letter</SelectItem>
                    <SelectItem value="joining_letter">Joining Letter</SelectItem>
                    <SelectItem value="salary_revision">Salary Revision Letter</SelectItem>
                    <SelectItem value="resignation_acceptance">Resignation Acceptance</SelectItem>
                    <SelectItem value="relieving_letter">Relieving Letter</SelectItem>
                    <SelectItem value="experience_letter">Experience Letter</SelectItem>
                    <SelectItem value="custom_letter">Custom HR Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="issueDate">Document Issue Date *</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={genIssueDate}
                  onChange={event => setGenIssueDate(event.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="effectiveDate">Effective / Joining Date</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={genEffectiveDate}
                  onChange={event => setGenEffectiveDate(event.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {signatories.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="signatorySelect">Select Company Signatory</Label>
                <Select
                  onValueChange={val => {
                    const selected = signatories.find(s => s.id === val)
                    if (selected) {
                      setGenSignatoryName(selected.name || '')
                      setGenSignatoryTitle(selected.title || '')
                    }
                  }}
                >
                  <SelectTrigger id="signatorySelect" className="w-full text-xs h-9">
                    <SelectValue placeholder="Select Company Signatory..." />
                  </SelectTrigger>
                  <SelectContent>
                    {signatories.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {s.title} {s.isDefault ? '(Default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sigName">Authorized Signatory Name</Label>
                <Input
                  id="sigName"
                  value={genSignatoryName ?? ''}
                  onChange={event => setGenSignatoryName(event.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sigTitle">Signatory Title</Label>
                <Input
                  id="sigTitle"
                  value={genSignatoryTitle ?? ''}
                  onChange={event => setGenSignatoryTitle(event.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsGenerateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-[#1e2a78] text-white hover:bg-[#152060]"
                disabled={generating}
              >
                {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                Generate Draft
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Full Letterhead Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="flex h-[94vh] w-[96vw] max-w-[1180px] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-muted/20 px-5 py-3">
            <div>
              <h3 className="text-sm font-bold">{editorDoc?.documentNumber || 'Edit Letter Draft'}</h3>
              <p className="text-xs text-muted-foreground">
                {editorDoc?.employeeName} ({editorDoc?.employeeCode})
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (editorDoc) openDocPreview(editorDoc)
              }}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview Letterhead
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-100 p-5 dark:bg-slate-950">
            {editorValue && (
              <div className="mx-auto max-w-4xl">
                <DocumentEditor
                  value={editorValue}
                  onChange={setEditorValue}
                  onSave={handleSaveDraft}
                  onSaveAndIssue={handleSaveAndIssue}
                  saving={actionLoading}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanent Deletion Confirmation Modal */}
      <Dialog open={Boolean(deleteTargetDoc)} onOpenChange={open => !open && setDeleteTargetDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 text-base">
              <AlertTriangle className="h-5 w-5" /> Permanently Delete Document
            </DialogTitle>
            <DialogDescription className="text-xs space-y-2 pt-2">
              <p>
                Are you sure you want to permanently delete <strong>{deleteTargetDoc?.title}</strong>?
              </p>
              {deleteTargetDoc?.employeeName && (
                <p className="text-muted-foreground">
                  Employee: <strong>{deleteTargetDoc.employeeName}</strong>{' '}
                  {deleteTargetDoc.employeeCode ? `(${deleteTargetDoc.employeeCode})` : ''}
                </p>
              )}
              <p className="text-red-600 font-medium">
                This will delete the document metadata record, version history, and associated file storage. This action cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTargetDoc(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteTargetDoc && handleDeleteDocument(deleteTargetDoc)}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


function StationeryMetric({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-xl border bg-muted/15 p-4">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-base font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
    </div>
  )
}
