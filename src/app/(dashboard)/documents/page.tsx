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
} from 'lucide-react'

import {
  PageHeader,
} from '@/components/shared/page-header'

import {
  EmptyState,
} from '@/components/shared/empty-state'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Input,
} from '@/components/ui/input'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  Label,
} from '@/components/ui/label'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

import {
  toast,
} from 'sonner'

import {
  OfficialLetterheadRenderer,
} from '@/components/documents/document-renderer'

import {
  DocumentEditor,
  type EditableDocumentContent,
  type EditableDocumentSection,
} from '@/components/documents/document-editor'

import {
  downloadOfficialDocumentPdf,
} from '@/lib/pdf/generate-document-pdf'

interface DocumentItem {
  id: string
  companyId: string
  employeeId?: string
  employeeCode?: string
  employeeName?: string

  documentType: string
  documentNumber: string
  title: string

  fileName: string
  fileUrl?: string

  version: number

  status:
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'ISSUED'
    | 'ACKNOWLEDGED'
    | 'SUPERSEDED'

  issueDate: string
  effectiveDate: string

  generatedAt: string
  issuedAt?: string | null

  content?: any

  letterheadVersion: number
}

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
  return new Date()
    .toISOString()
    .split('T')[0]
}

function createStableId(
  prefix: string,
  index: number
) {
  return `${prefix}-${index + 1}`
}

function normalizeLegacySections(
  content: any
): EditableDocumentSection[] {
  if (
    Array.isArray(
      content?.sections
    )
  ) {
    return content.sections.map(
      (
        section: any,
        sectionIndex: number
      ) => ({
        id:
          String(
            section?.id ||
            createStableId(
              'section',
              sectionIndex
            )
          ),

        title:
          String(
            section?.title ||
            ''
          ),

        clauses:
          Array.isArray(
            section?.clauses
          )
            ? section.clauses.map(
                (
                  clause: any,
                  clauseIndex: number
                ) => ({
                  id:
                    String(
                      clause?.id ||
                      createStableId(
                        `section-${sectionIndex + 1}-clause`,
                        clauseIndex
                      )
                    ),

                  title:
                    String(
                      clause?.title ||
                      clause?.heading ||
                      ''
                    ),

                  content:
                    String(
                      clause?.content ||
                      clause?.text ||
                      ''
                    ),
                })
              )
            : [],
      })
    )
  }

  if (
    Array.isArray(
      content?.clauses
    ) &&
    content.clauses.length >
      0
  ) {
    return [
      {
        id:
          'terms-and-conditions',

        title:
          String(
            content?.termsTitle ||
            content?.sectionTitle ||
            'Terms & Conditions'
          ),

        clauses:
          content.clauses.map(
            (
              clause: any,
              index: number
            ) => ({
              id:
                String(
                  clause?.id ||
                  createStableId(
                    'clause',
                    index
                  )
                ),

              title:
                String(
                  clause?.title ||
                  clause?.heading ||
                  ''
                ),

              content:
                String(
                  clause?.content ||
                  clause?.text ||
                  ''
                ),
            })
          ),
      },
    ]
  }

  return []
}

function normalizeDocumentForEditor(
  doc: DocumentItem
): EditableDocumentContent {
  const content =
    doc.content ||
    {}

  const legacyBody =
    typeof content?.body ===
    'string'
      ? content.body
          .split(/\n\s*\n/g)
          .map(
            (
              item: string
            ) =>
              item.trim()
          )
          .filter(
            Boolean
          )
      : []

  const bodyParagraphs =
    Array.isArray(
      content?.bodyParagraphs
    )
      ? content.bodyParagraphs.map(
          (
            paragraph: any
          ) =>
            String(
              paragraph ||
              ''
            )
        )
      : legacyBody

  const signatory =
    content?.signatory ||
    {}

  return {
    documentNumber:
      String(
        content?.documentNumber ||
        content?.referenceNumber ||
        doc.documentNumber ||
        ''
      ),

    issueDate:
      String(
        content?.issueDate ||
        doc.issueDate ||
        ''
      )
        .slice(
          0,
          10
        ),

    effectiveDate:
      String(
        content?.effectiveDate ||
        doc.effectiveDate ||
        ''
      )
        .slice(
          0,
          10
        ) ||
      null,

    subject:
      String(
        content?.subject ||
        doc.title ||
        ''
      ),

    salutation:
      String(
        content?.salutation ||
        'Dear Colleague,'
      ),

    bodyParagraphs,

    sections:
      normalizeLegacySections(
        content
      ),

    closingText:
      String(
        content?.closingText ||
        content?.closing ||
        'For Haryak Technologies India Private Limited,'
      ),

    signatory: {
      name:
        String(
          signatory?.name ||
          content?.signatoryName ||
          'Authorized Signatory'
        ),

      title:
        String(
          signatory?.title ||
          signatory?.designation ||
          content?.signatoryTitle ||
          'Head of Human Resources'
        ),

      department:
        String(
          signatory?.department ||
          ''
        ),

      organization:
        String(
          signatory?.organization ||
          'Haryak Technologies India Private Limited'
        ),
    },
  }
}

function editorValueToPersistedContent(
  value: EditableDocumentContent,
  existingContent: any
) {
  /**
   * Preserve unknown legacy fields so document-specific
   * metadata is not destroyed when HR edits text.
   */
  return {
    ...(existingContent || {}),

    documentNumber:
      value.documentNumber,

    referenceNumber:
      value.documentNumber,

    issueDate:
      value.issueDate,

    effectiveDate:
      value.effectiveDate ||
      null,

    subject:
      value.subject,

    salutation:
      value.salutation,

    bodyParagraphs:
      value.bodyParagraphs,

    /**
     * Keep a legacy body string too, because older services/templates
     * may still read this field.
     */
    body:
      value.bodyParagraphs.join(
        '\n\n'
      ),

    sections:
      value.sections,

    /**
     * Keep flat clauses for backward compatibility with old renderer/API
     * consumers when there is a single Terms section.
     */
    clauses:
      value.sections.length ===
      1
        ? value.sections[0].clauses.map(
            clause => ({
              title:
                clause.title,

              content:
                clause.content,
            })
          )
        : existingContent?.clauses,

    closingText:
      value.closingText,

    closing:
      value.closingText,

    signatory: {
      name:
        value.signatory.name,

      title:
        value.signatory.title,

      department:
        value.signatory.department ||
        '',

      organization:
        value.signatory.organization ||
        'Haryak Technologies India Private Limited',
    },
  }
}

export default function DocumentsPage() {
  const [
    documents,
    setDocuments,
  ] =
    useState<DocumentItem[]>(
      []
    )

  const [
    employees,
    setEmployees,
  ] =
    useState<EmployeeOption[]>(
      []
    )

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState('')

  const [
    selectedStatus,
    setSelectedStatus,
  ] =
    useState<string>(
      'ALL'
    )

  const [
    selectedType,
    setSelectedType,
  ] =
    useState<string>(
      'ALL'
    )

  /* ============================================================
     GENERATE MODAL
     ============================================================ */

  const [
    isGenerateOpen,
    setIsGenerateOpen,
  ] =
    useState(false)

  const [
    generating,
    setGenerating,
  ] =
    useState(false)

  const [
    genEmployeeId,
    setGenEmployeeId,
  ] =
    useState('')

  const [
    genDocType,
    setGenDocType,
  ] =
    useState(
      'offer_letter'
    )

  const [
    genIssueDate,
    setGenIssueDate,
  ] =
    useState(
      todayIso()
    )

  const [
    genEffectiveDate,
    setGenEffectiveDate,
  ] =
    useState('')

  const [
    genSignatoryName,
    setGenSignatoryName,
  ] =
    useState(
      'Authorized Signatory'
    )

  const [
    genSignatoryTitle,
    setGenSignatoryTitle,
  ] =
    useState(
      'Head of Human Resources'
    )

  const [
    signatories,
    setSignatories,
  ] =
    useState<SignatoryOption[]>(
      []
    )

  /* ============================================================
     DOCUMENT MODAL
     ============================================================ */

  const [
    previewDoc,
    setPreviewDoc,
  ] =
    useState<DocumentItem | null>(
      null
    )

  const [
    editorValue,
    setEditorValue,
  ] =
    useState<EditableDocumentContent | null>(
      null
    )

  const [
    isEditorOpen,
    setIsEditorOpen,
  ] =
    useState(false)

  const [
    isEditingMode,
    setIsEditingMode,
  ] =
    useState(false)

  const [
    actionLoading,
    setActionLoading,
  ] =
    useState(false)

  /* ============================================================
     DATA FETCH
     ============================================================ */

  const fetchDocuments =
    async () => {
      setLoading(
        true
      )

      try {
        const response =
          await fetch(
            '/api/documents',
            {
              cache:
                'no-store',
            }
          )

        const data =
          await response.json()

        if (
          data.success
        ) {
          setDocuments(
            data.documents ||
            []
          )
        } else {
          toast.error(
            data.error ||
            'Failed to load documents.'
          )
        }
      } catch (
        error
      ) {
        console.error(
          'Error fetching documents',
          error
        )

        toast.error(
          'Failed to load documents.'
        )
      } finally {
        setLoading(
          false
        )
      }
    }

  const fetchEmployees =
    async () => {
      try {
        const response =
          await fetch(
            '/api/employees',
            {
              cache:
                'no-store',
            }
          )

        const data =
          await response.json()

        if (
          data.success &&
          Array.isArray(
            data.employees
          )
        ) {
          const mapped =
            data.employees.map(
              (
                employee: any
              ) => ({
                id:
                  employee.id,

                employee_code:
                  employee.employee_code ||
                  employee.code ||
                  '',

                full_name:
                  employee.full_name ||
                  employee.fullName ||
                  employee.name ||
                  'Employee',

                official_email:
                  employee.official_email ||
                  employee.email ||
                  '',

                department:
                  typeof employee.department ===
                  'string'
                    ? {
                        name:
                          employee.department,
                      }
                    : employee.department ||
                      {
                        name:
                          'Not assigned',
                      },

                designation:
                  typeof employee.designation ===
                  'string'
                    ? {
                        name:
                          employee.designation,
                      }
                    : employee.designation ||
                      {
                        name:
                          'Not assigned',
                      },

                joining_date:
                  employee.joining_date ||
                  employee.joinDate ||
                  '',
              })
            )

          setEmployees(
            mapped
          )

          if (
            mapped.length >
              0 &&
            !genEmployeeId
          ) {
            setGenEmployeeId(
              mapped[0].id
            )

            setGenEffectiveDate(
              mapped[0]
                .joining_date ||
              todayIso()
            )
          }
        }
      } catch (
        error
      ) {
        console.error(
          'Error fetching employees:',
          error
        )
      }
    }

  const fetchSignatories =
    async () => {
      try {
        const response =
          await fetch(
            '/api/company/signatories',
            {
              cache:
                'no-store',
            }
          )

        const data =
          await response.json()

        if (
          data.success &&
          Array.isArray(
            data.signatories
          )
        ) {
          setSignatories(
            data.signatories
          )

          const defaultSignatory =
            data.signatories.find(
              (
                signatory: any
              ) =>
                signatory.isDefault
            ) ||
            data.signatories[0]

          if (
            defaultSignatory
          ) {
            setGenSignatoryName(
              defaultSignatory.name
            )

            setGenSignatoryTitle(
              defaultSignatory.title
            )
          }
        }
      } catch (
        error
      ) {
        console.error(
          'Error fetching signatories:',
          error
        )
      }
    }

  useEffect(
    () => {
      void fetchDocuments()
      void fetchEmployees()
      void fetchSignatories()
    },
    []
  )

  /* ============================================================
     GENERATE
     ============================================================ */

  const handleGenerate =
    async (
      event:
        React.FormEvent
    ) => {
      event.preventDefault()

      if (
        !genEmployeeId
      ) {
        toast.error(
          'Please select an employee.'
        )

        return
      }

      setGenerating(
        true
      )

      try {
        const response =
          await fetch(
            '/api/documents/generate',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  employeeId:
                    genEmployeeId,

                  docType:
                    genDocType,

                  issueDate:
                    genIssueDate,

                  effectiveDate:
                    genEffectiveDate ||
                    genIssueDate,

                  signatoryName:
                    genSignatoryName,

                  signatoryTitle:
                    genSignatoryTitle,
                }),
            }
          )

        const data =
          await response.json()

        if (
          data.success &&
          data.document
        ) {
          toast.success(
            `Draft ${data.document.documentNumber} generated successfully.`
          )

          setIsGenerateOpen(
            false
          )

          await fetchDocuments()

          openDocDetails(
            data.document
          )
        } else {
          toast.error(
            data.error ||
            'Failed to generate letter.'
          )
        }
      } catch (
        error
      ) {
        console.error(
          error
        )

        toast.error(
          'Error creating document draft.'
        )
      } finally {
        setGenerating(
          false
        )
      }
    }

  /* ============================================================
     OPEN / EDIT
     ============================================================ */

  const openDocDetails =
    (
      doc:
        DocumentItem
    ) => {
      setPreviewDoc(
        doc
      )

      setEditorValue(
        normalizeDocumentForEditor(
          doc
        )
      )

      setIsEditingMode(
        false
      )

      setIsEditorOpen(
        true
      )
    }

  const handleSaveDraft =
    async (
      value:
        EditableDocumentContent
    ) => {
      if (
        !previewDoc
      ) {
        return
      }

      setActionLoading(
        true
      )

      try {
        const updatedContent =
          editorValueToPersistedContent(
            value,
            previewDoc.content
          )

        const response =
          await fetch(
            `/api/documents/${previewDoc.id}`,
            {
              method:
                'PUT',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  content:
                    updatedContent,

                  documentNumber:
                    value.documentNumber,

                  issueDate:
                    value.issueDate,

                  effectiveDate:
                    value.effectiveDate,

                  title:
                    value.subject,

                  changeReason:
                    'Document content updated via Official Document Center',
                }),
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
            'Failed to update document.'
          )
        }

        /**
         * Prefer the authoritative row returned by the API.
         * Fall back to the locally merged representation only if
         * the old API does not yet return document.
         */
        const returnedDoc =
          data.document ||
          data.data

        const nextDoc:
          DocumentItem =
          returnedDoc
            ? {
                ...previewDoc,
                ...returnedDoc,

                content:
                  returnedDoc.content ||
                  returnedDoc.documentContent ||
                  updatedContent,

                documentNumber:
                  returnedDoc.documentNumber ||
                  value.documentNumber,

                title:
                  returnedDoc.title ||
                  value.subject,

                issueDate:
                  returnedDoc.issueDate ||
                  value.issueDate,

                effectiveDate:
                  returnedDoc.effectiveDate ||
                  value.effectiveDate ||
                  previewDoc.effectiveDate,
              }
            : {
                ...previewDoc,

                documentNumber:
                  value.documentNumber,

                title:
                  value.subject,

                issueDate:
                  value.issueDate,

                effectiveDate:
                  value.effectiveDate ||
                  previewDoc.effectiveDate,

                content:
                  updatedContent,
              }

        setPreviewDoc(
          nextDoc
        )

        setEditorValue(
          normalizeDocumentForEditor(
            nextDoc
          )
        )

        setIsEditingMode(
          false
        )

        toast.success(
          'Document updated successfully.'
        )

        await fetchDocuments()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
          'Error saving document.'
        )
      } finally {
        setActionLoading(
          false
        )
      }
    }

  /* ============================================================
     APPROVE
     ============================================================ */

  const handleApprove =
    async () => {
      if (
        !previewDoc
      ) {
        return
      }

      setActionLoading(
        true
      )

      try {
        const response =
          await fetch(
            `/api/documents/${previewDoc.id}/approve`,
            {
              method:
                'POST',
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
            'Failed to approve document.'
          )
        }

        const returnedDoc =
          data.document ||
          data.data

        setPreviewDoc(
          previous =>
            previous
              ? {
                  ...previous,
                  ...(returnedDoc ||
                    {}),
                  status:
                    returnedDoc?.status ||
                    'APPROVED',
                }
              : previous
        )

        toast.success(
          `Document ${previewDoc.documentNumber} is APPROVED.`
        )

        await fetchDocuments()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
          'Error approving document.'
        )
      } finally {
        setActionLoading(
          false
        )
      }
    }

  /* ============================================================
     ISSUE TO EMPLOYEE PORTAL
     ============================================================ */

  const handleIssue =
    async () => {
      if (
        !previewDoc
      ) {
        return
      }

      if (
        previewDoc.status !==
        'APPROVED'
      ) {
        toast.error(
          'Only an approved document can be issued to the employee portal.'
        )

        return
      }

      setActionLoading(
        true
      )

      try {
        const response =
          await fetch(
            `/api/documents/${previewDoc.id}/issue`,
            {
              method:
                'POST',
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
            'Failed to issue document.'
          )
        }

        const returnedDoc =
          data.document ||
          data.data

        /**
         * Do NOT fake the status if the API returns a row.
         * Use database/API truth.
         */
        const authoritativeStatus =
          returnedDoc?.status ||
          data.status

        if (
          authoritativeStatus &&
          authoritativeStatus !==
            'ISSUED'
        ) {
          throw new Error(
            `Issue API completed but document status is ${authoritativeStatus}, not ISSUED.`
          )
        }

        setPreviewDoc(
          previous =>
            previous
              ? {
                  ...previous,
                  ...(returnedDoc ||
                    {}),
                  status:
                    'ISSUED',

                  issuedAt:
                    returnedDoc?.issuedAt ||
                    returnedDoc?.issued_at ||
                    previous.issuedAt ||
                    new Date()
                      .toISOString(),
                }
              : previous
        )

        toast.success(
          `Document ${previewDoc.documentNumber} has been ISSUED to the employee portal.`
        )

        await fetchDocuments()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
          'Error issuing document.'
        )
      } finally {
        setActionLoading(
          false
        )
      }
    }

  /* ============================================================
     PDF
     ============================================================ */

  const handleDownloadPdf =
    async () => {
      if (
        !previewDoc
      ) {
        return
      }

      try {
        toast.info(
          'Generating official PDF on letterhead...'
        )

        await downloadOfficialDocumentPdf(
          'official-document-canvas',
          {
            employeeCode:
              previewDoc.employeeCode ||
              'EMP',

            documentType:
              previewDoc.documentType,

            documentNumber:
              previewDoc.documentNumber,
          }
        )

        toast.success(
          'Official document PDF downloaded.'
        )
      } catch (
        error
      ) {
        console.error(
          error
        )

        toast.error(
          'Could not download PDF.'
        )
      }
    }

  /* ============================================================
     DISPLAY HELPERS
     ============================================================ */

  const getStatusBadge =
    (
      status:
        string
    ) => {
      switch (
        status
      ) {
        case 'DRAFT':
          return (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
            >
              DRAFT
            </Badge>
          )

        case 'PENDING_APPROVAL':
          return (
            <Badge
              variant="outline"
              className="border-orange-300 bg-orange-50 text-[10px] text-orange-700"
            >
              PENDING APPROVAL
            </Badge>
          )

        case 'APPROVED':
          return (
            <Badge
              variant="outline"
              className="border-blue-300 bg-blue-50 text-[10px] text-blue-700"
            >
              APPROVED
            </Badge>
          )

        case 'ISSUED':
          return (
            <Badge
              variant="outline"
              className="border-purple-300 bg-purple-50 text-[10px] text-purple-700"
            >
              ISSUED
            </Badge>
          )

        case 'ACKNOWLEDGED':
          return (
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
            >
              ACKNOWLEDGED
            </Badge>
          )

        case 'SUPERSEDED':
          return (
            <Badge
              variant="outline"
              className="border-gray-300 bg-gray-100 text-[10px] text-gray-500"
            >
              SUPERSEDED
            </Badge>
          )

        default:
          return (
            <Badge
              variant="outline"
              className="text-[10px]"
            >
              {status}
            </Badge>
          )
      }
    }

  const formatDocType =
    (
      type:
        string
    ) =>
      type
        .replace(
          /_/g,
          ' '
        )
        .replace(
          /\b\w/g,
          letter =>
            letter.toUpperCase()
        )

  const filteredDocs =
    documents.filter(
      document => {
        const normalizedSearch =
          searchQuery
            .trim()
            .toLowerCase()

        const matchesSearch =
          !normalizedSearch ||
          (
            document.title ||
            ''
          )
            .toLowerCase()
            .includes(
              normalizedSearch
            ) ||
          (
            document.documentNumber ||
            ''
          )
            .toLowerCase()
            .includes(
              normalizedSearch
            ) ||
          (
            document.employeeName ||
            ''
          )
            .toLowerCase()
            .includes(
              normalizedSearch
            ) ||
          (
            document.employeeCode ||
            ''
          )
            .toLowerCase()
            .includes(
              normalizedSearch
            )

        const matchesStatus =
          selectedStatus ===
            'ALL' ||
          document.status ===
            selectedStatus

        const matchesType =
          selectedType ===
            'ALL' ||
          document.documentType ===
            selectedType

        return (
          matchesSearch &&
          matchesStatus &&
          matchesType
        )
      }
    )

  const countDrafts =
    documents.filter(
      document =>
        document.status ===
          'DRAFT' ||
        document.status ===
          'PENDING_APPROVAL'
    ).length

  const countIssued =
    documents.filter(
      document =>
        document.status ===
          'ISSUED' ||
        document.status ===
          'ACKNOWLEDGED'
    ).length

  const countAcked =
    documents.filter(
      document =>
        document.status ===
        'ACKNOWLEDGED'
    ).length

  const renderedEditorValue =
    useMemo(
      () =>
        editorValue ||
        (
          previewDoc
            ? normalizeDocumentForEditor(
                previewDoc
              )
            : null
        ),
      [
        editorValue,
        previewDoc,
      ]
    )

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Official Document Center"
        description="Authoritative document generation, official letterhead stationery, approval workflows, and employee issuance."
      >
        <Button
          className="bg-[#1e2a78] text-xs text-white shadow-sm hover:bg-[#152060]"
          onClick={() =>
            setIsGenerateOpen(
              true
            )
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />

          Generate Official Letter
        </Button>
      </PageHeader>

      {/* =====================================================
          KPI
          ===================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Letters"
          value={
            documents.length
          }
          icon={
            <FileText className="h-5 w-5" />
          }
          iconClassName="bg-blue-50 text-[#1e2a78] dark:bg-blue-950"
        />

        <KpiCard
          label="Drafts In Review"
          value={
            countDrafts
          }
          icon={
            <Edit3 className="h-5 w-5" />
          }
          iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950"
          valueClassName="text-amber-600"
        />

        <KpiCard
          label="Issued to Portal"
          value={
            countIssued
          }
          icon={
            <Send className="h-5 w-5" />
          }
          iconClassName="bg-purple-50 text-purple-600 dark:bg-purple-950"
          valueClassName="text-purple-600"
        />

        <KpiCard
          label="Acknowledged"
          value={
            countAcked
          }
          icon={
            <CheckCircle2 className="h-5 w-5" />
          }
          iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950"
          valueClassName="text-emerald-600"
        />
      </div>

      {/* =====================================================
          MAIN TABS
          ===================================================== */}

      <Tabs
        defaultValue="documents"
        className="space-y-4"
      >
        <TabsList className="border bg-muted/40 p-1">
          <TabsTrigger
            value="documents"
            className="text-xs"
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />

            Official Documents & Letters
          </TabsTrigger>

          <TabsTrigger
            value="stationery"
            className="text-xs"
          >
            <Building className="mr-1.5 h-3.5 w-3.5" />

            Company Stationery & Letterhead
          </TabsTrigger>
        </TabsList>

        {/* ===================================================
            DOCUMENTS
            =================================================== */}

        <TabsContent
          value="documents"
          className="space-y-4"
        >
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <CardTitle className="text-base font-bold">
                    Issued & Draft Documents
                  </CardTitle>

                  <CardDescription className="text-xs">
                    Official employee correspondence generated on authentic corporate stationery.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />

                    <Input
                      placeholder="Search ref no, employee, title..."
                      value={
                        searchQuery ?? ''
                      }
                      onChange={
                        event =>
                          setSearchQuery(
                            event.target.value
                          )
                      }
                      className="h-9 pl-8 text-xs"
                    />
                  </div>

                  <select
                    value={
                      selectedStatus ?? ''
                    }
                    onChange={
                      event =>
                        setSelectedStatus(
                          event.target.value
                        )
                    }
                    className="h-9 rounded-md border bg-background p-2 text-xs"
                  >
                    <option value="ALL">
                      All Statuses
                    </option>

                    <option value="DRAFT">
                      Draft
                    </option>

                    <option value="PENDING_APPROVAL">
                      Pending Approval
                    </option>

                    <option value="APPROVED">
                      Approved
                    </option>

                    <option value="ISSUED">
                      Issued
                    </option>

                    <option value="ACKNOWLEDGED">
                      Acknowledged
                    </option>

                    <option value="SUPERSEDED">
                      Superseded
                    </option>
                  </select>

                  <select
                    value={
                      selectedType ?? ''
                    }
                    onChange={
                      event =>
                        setSelectedType(
                          event.target.value
                        )
                    }
                    className="h-9 rounded-md border bg-background p-2 text-xs"
                  >
                    <option value="ALL">
                      All Letter Types
                    </option>

                    <option value="offer_letter">
                      Offer Letter
                    </option>

                    <option value="appointment_letter">
                      Appointment Letter
                    </option>

                    <option value="joining_letter">
                      Joining Letter
                    </option>

                    <option value="salary_revision">
                      Salary Revision
                    </option>

                    <option value="resignation_acceptance">
                      Resignation Acceptance
                    </option>

                    <option value="relieving_letter">
                      Relieving Letter
                    </option>

                    <option value="experience_letter">
                      Experience Letter
                    </option>

                    <option value="custom_letter">
                      Custom Letter
                    </option>
                  </select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#1e2a78]" />

                  <p className="text-xs text-muted-foreground">
                    Loading documents repository...
                  </p>
                </div>
              ) : filteredDocs.length ===
                0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={
                      FolderOpen
                    }
                    title="No official documents found."
                    description="Generate an official Offer Letter, Appointment Letter, or Relieving Certificate with letterhead branding."
                    action={
                      <Button
                        size="sm"
                        className="bg-[#1e2a78] text-xs text-white hover:bg-[#152060]"
                        onClick={() =>
                          setIsGenerateOpen(
                            true
                          )
                        }
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />

                        Generate First Letter
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3.5 pl-6">
                          Reference No
                        </th>

                        <th className="p-3.5">
                          Employee
                        </th>

                        <th className="p-3.5">
                          Type & Title
                        </th>

                        <th className="p-3.5">
                          Status
                        </th>

                        <th className="p-3.5">
                          Issue Date
                        </th>

                        <th className="p-3.5 pr-6 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {filteredDocs.map(
                        document => (
                          <tr
                            key={
                              document.id
                            }
                            className="transition-colors hover:bg-muted/20"
                          >
                            <td className="p-3.5 pl-6 font-mono font-medium text-foreground">
                              {
                                document.documentNumber
                              }
                            </td>

                            <td className="p-3.5">
                              <div className="font-semibold text-foreground">
                                {document.employeeName ||
                                  'Company Wide'}
                              </div>

                              <div className="font-mono text-[11px] text-muted-foreground">
                                {document.employeeCode ||
                                  ''}
                              </div>
                            </td>

                            <td className="p-3.5">
                              <div className="max-w-xs truncate font-medium text-foreground">
                                {
                                  document.title
                                }
                              </div>

                              <div className="text-[11px] text-muted-foreground">
                                {formatDocType(
                                  document.documentType
                                )}
                              </div>
                            </td>

                            <td className="p-3.5">
                              {getStatusBadge(
                                document.status
                              )}
                            </td>

                            <td className="p-3.5 text-muted-foreground">
                              {new Date(
                                `${document.issueDate.slice(
                                  0,
                                  10
                                )}T00:00:00`
                              ).toLocaleDateString(
                                'en-IN',
                                {
                                  day:
                                    '2-digit',

                                  month:
                                    'short',

                                  year:
                                    'numeric',
                                }
                              )}
                            </td>

                            <td className="space-x-1 p-3.5 pr-6 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  openDocDetails(
                                    document
                                  )
                                }
                              >
                                <Eye className="mr-1 h-3 w-3" />

                                View & Edit
                              </Button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================================================
            STATIONERY
            =================================================== */}

        <TabsContent
          value="stationery"
          className="space-y-4"
        >
          <Card>
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">
                    Authoritative Corporate Stationery
                  </CardTitle>

                  <CardDescription className="text-xs">
                    Official Haryak Technologies India Private Limited letterhead asset and geometric safety boundaries.
                  </CardDescription>
                </div>

                <Badge className="bg-emerald-600 text-xs text-white">
                  <ShieldCheck className="mr-1 h-3 w-3" />

                  ACTIVE STATIONERY (V1)
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
                      <span className="text-xs font-semibold text-foreground">
                        Official Header
                      </span>

                      <span className="font-mono text-[11px] text-muted-foreground">
                        Logo, Tagline & Top Bar
                      </span>
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
                      <span className="text-xs font-semibold text-foreground">
                        Official Footer
                      </span>

                      <span className="font-mono text-[11px] text-muted-foreground">
                        Contact, Address & Waves
                      </span>
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
                    onClick={() =>
                      window.open(
                        '/letterhead/haryak-official-letterhead.pdf',
                        '_blank'
                      )
                    }
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />

                    Download Master PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =====================================================
          GENERATE MODAL
          ===================================================== */}

      <Dialog
        open={
          isGenerateOpen
        }
        onOpenChange={
          setIsGenerateOpen
        }
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Generate Official Letter
            </DialogTitle>

            <DialogDescription className="text-xs">
              Select the employee, letter type, and dates to automatically generate a sequential official letter.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={
              handleGenerate
            }
            className="space-y-4 py-2 text-xs"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1 sm:col-span-1">
                <Label htmlFor="employee">
                  Employee *
                </Label>

                <select
                  id="employee"
                  value={
                    genEmployeeId ?? ''
                  }
                  onChange={
                    event => {
                      setGenEmployeeId(
                        event.target.value
                      )

                      const found =
                        employees.find(
                          employee =>
                            employee.id ===
                            event.target.value
                        )

                      if (
                        found?.joining_date
                      ) {
                        setGenEffectiveDate(
                          found.joining_date
                        )
                      }
                    }
                  }
                  className="w-full rounded-md border bg-background p-2 text-xs font-medium"
                  required
                >
                  {employees.length ===
                  0 ? (
                    <option value="">
                      No employees found
                    </option>
                  ) : (
                    employees.map(
                      employee => (
                        <option
                          key={
                            employee.id
                          }
                          value={
                            employee.id
                          }
                        >
                          {employee.employee_code ||
                            'EMP'}{' '}
                          —{' '}
                          {
                            employee.full_name
                          }{' '}
                          (
                          {employee.department
                            ?.name ||
                            'General'}
                          )
                        </option>
                      )
                    )
                  )}
                </select>
              </div>

              <div className="col-span-2 space-y-1 sm:col-span-1">
                <Label htmlFor="docType">
                  Document Type *
                </Label>

                <select
                  id="docType"
                  value={
                    genDocType ?? ''
                  }
                  onChange={
                    event =>
                      setGenDocType(
                        event.target.value
                      )
                  }
                  className="w-full rounded-md border bg-background p-2 text-xs"
                >
                  <option value="offer_letter">
                    Offer Letter
                  </option>

                  <option value="appointment_letter">
                    Appointment Letter
                  </option>

                  <option value="joining_letter">
                    Joining Letter
                  </option>

                  <option value="salary_revision">
                    Salary Revision Letter
                  </option>

                  <option value="resignation_acceptance">
                    Resignation Acceptance
                  </option>

                  <option value="relieving_letter">
                    Relieving Letter
                  </option>

                  <option value="experience_letter">
                    Experience Letter
                  </option>

                  <option value="custom_letter">
                    Custom HR Letter
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="issueDate">
                  Document Issue Date *
                </Label>

                <Input
                  id="issueDate"
                  type="date"
                  value={
                    genIssueDate ?? ''
                  }
                  onChange={
                    event =>
                      setGenIssueDate(
                        event.target.value
                      )
                  }
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="effectiveDate">
                  Effective / Joining Date
                </Label>

                <Input
                  id="effectiveDate"
                  type="date"
                  value={
                    genEffectiveDate ?? ''
                  }
                  onChange={
                    event =>
                      setGenEffectiveDate(
                        event.target.value
                      )
                  }
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {signatories.length >
              0 && (
              <div className="space-y-1">
                <Label htmlFor="signatorySelect">
                  Select Company Signatory
                </Label>

                <select
                  id="signatorySelect"
                  className="w-full rounded-md border bg-background p-2 text-xs"
                  onChange={
                    event => {
                      const selected =
                        signatories.find(
                          signatory =>
                            signatory.id ===
                            event.target.value
                        )

                      if (
                        selected
                      ) {
                        setGenSignatoryName(
                          selected.name
                        )

                        setGenSignatoryTitle(
                          selected.title
                        )
                      }
                    }
                  }
                >
                  {signatories.map(
                    signatory => (
                      <option
                        key={
                          signatory.id
                        }
                        value={
                          signatory.id
                        }
                      >
                        {signatory.name}{' '}
                        —{' '}
                        {signatory.title}{' '}
                        {signatory.isDefault
                          ? '(Default)'
                          : ''}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sigName">
                  Authorized Signatory Name
                </Label>

                <Input
                  id="sigName"
                  value={
                    genSignatoryName ?? ''
                  }
                  onChange={
                    event =>
                      setGenSignatoryName(
                        event.target.value
                      )
                  }
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sigTitle">
                  Signatory Title
                </Label>

                <Input
                  id="sigTitle"
                  value={
                    genSignatoryTitle ?? ''
                  }
                  onChange={
                    event =>
                      setGenSignatoryTitle(
                        event.target.value
                      )
                  }
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setIsGenerateOpen(
                    false
                  )
                }
              >
                Cancel
              </Button>

              <Button
                type="submit"
                size="sm"
                className="bg-[#1e2a78] text-white hover:bg-[#152060]"
                disabled={
                  generating
                }
              >
                {generating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}

                Generate Draft
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* =====================================================
          DOCUMENT PREVIEW / FULL EDITOR
          ===================================================== */}

      <Dialog
        open={
          isEditorOpen
        }
        onOpenChange={
          setIsEditorOpen
        }
      >
        <DialogContent
          className="flex h-[94vh] w-[96vw] max-w-[1180px] flex-col overflow-hidden p-0"
        >
          <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">
                  {previewDoc
                    ?.documentNumber ||
                    'Document Preview'}
                </h3>

                {previewDoc &&
                  getStatusBadge(
                    previewDoc.status
                  )}
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {previewDoc
                  ?.employeeName}{' '}
                (
                {previewDoc
                  ?.employeeCode}
                ){' '}
                •{' '}
                {previewDoc &&
                  formatDocType(
                    previewDoc.documentType
                  )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setIsEditingMode(
                    previous =>
                      !previous
                  )
                }
              >
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />

                {isEditingMode
                  ? 'Preview Letterhead'
                  : 'Edit Full Document'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={
                  handleDownloadPdf
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />

                Download PDF
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-100 p-5 dark:bg-slate-950">
            {isEditingMode &&
            renderedEditorValue ? (
              <div className="mx-auto max-w-4xl">
                <DocumentEditor
                  value={
                    renderedEditorValue
                  }
                  onChange={
                    setEditorValue
                  }
                  onSave={
                    handleSaveDraft
                  }
                  saving={
                    actionLoading
                  }
                />
              </div>
            ) : previewDoc &&
              renderedEditorValue ? (
              <div className="flex min-h-full justify-center overflow-x-auto py-2">
                <div
                  style={{
                    transformOrigin:
                      'top center',
                  }}
                >
                  <OfficialLetterheadRenderer
                    documentNumber={
                      renderedEditorValue.documentNumber
                    }
                    issueDate={
                      renderedEditorValue.issueDate
                    }
                    effectiveDate={
                      renderedEditorValue.effectiveDate
                    }
                    subject={
                      renderedEditorValue.subject
                    }
                    salutation={
                      renderedEditorValue.salutation
                    }
                    bodyParagraphs={
                      renderedEditorValue.bodyParagraphs
                    }
                    sections={
                      renderedEditorValue.sections
                    }
                    closingText={
                      renderedEditorValue.closingText
                    }
                    signatory={
                      renderedEditorValue.signatory
                    }
                    headerImageUrl="/letterhead/header.png"
                    footerImageUrl="/letterhead/footer.jpg"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t bg-card px-4 py-3">
            <div className="text-[11px] text-muted-foreground">
              Letterhead Version:{' '}
              {previewDoc
                ?.letterheadVersion ||
                1}{' '}
              • Stationery: Haryak Official 2026
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {previewDoc
                ?.status ===
                'DRAFT' && (
                <Button
                  size="sm"
                  className="h-8 bg-blue-700 text-xs text-white hover:bg-blue-800"
                  onClick={
                    handleApprove
                  }
                  disabled={
                    actionLoading
                  }
                >
                  {actionLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileCheck className="mr-1.5 h-3.5 w-3.5" />
                  )}

                  Approve Letter
                </Button>
              )}

              {previewDoc
                ?.status ===
                'APPROVED' && (
                <Button
                  size="sm"
                  className="h-8 bg-purple-700 text-xs text-white hover:bg-purple-800"
                  onClick={
                    handleIssue
                  }
                  disabled={
                    actionLoading
                  }
                >
                  {actionLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}

                  Issue to Employee Portal
                </Button>
              )}

              {previewDoc
                ?.status ===
                'ISSUED' && (
                <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                  <Send className="mr-1 h-3 w-3" />

                  Issued to Employee Portal
                </Badge>
              )}

              {previewDoc
                ?.status ===
                'ACKNOWLEDGED' && (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  <CheckCircle2 className="mr-1 h-3 w-3" />

                  Employee Acknowledged
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setIsEditorOpen(
                    false
                  )
                }
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================
   SMALL PRESENTATIONAL COMPONENTS
   ============================================================ */

function KpiCard({
  label,
  value,
  icon,
  iconClassName,
  valueClassName = 'text-foreground',
}: {
  label: string
  value: number
  icon: React.ReactNode
  iconClassName: string
  valueClassName?: string
}) {
  return (
    <Card className="border shadow-xs">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>

          <p
            className={`mt-1 text-xl font-bold ${valueClassName}`}
          >
            {value}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}
        >
          {icon}
        </div>
      </CardContent>
    </Card>
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
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="text-sm font-bold text-foreground">
        {value}
      </p>

      <p className="text-[11px] text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
