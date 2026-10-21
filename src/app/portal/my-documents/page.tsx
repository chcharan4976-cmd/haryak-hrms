'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  ShieldCheck,
  UploadCloud,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  FileCheck,
  BookOpen,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'

import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import { DocumentDetailsDialog } from '@/components/documents/document-details-dialog'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'

import {
  EnterpriseDocumentItem,
  getCategoryLabel,
  formatFileSize,
} from '@/lib/types/document'

export default function MyDocumentsPage() {
  const { user } = useAuth()

  const [documents, setDocuments] = useState<EnterpriseDocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Dialog state
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [replaceDocId, setReplaceDocId] = useState<string | undefined>(undefined)
  const [uploadCategory, setUploadCategory] = useState('identity_proof')

  const [selectedDoc, setSelectedDoc] = useState<EnterpriseDocumentItem | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null)

  /* ============================================================
     FETCH EMPLOYEE DOCUMENTS
     ============================================================ */

  const fetchDocuments = async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await fetch('/api/documents', {
        cache: 'no-store',
        credentials: 'include',
      })

      const data = await response.json()
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to load your documents.')
      }

      setDocuments(data.documents || [])
    } catch (error: any) {
      console.error('[MyDocumentsPage] Load failed:', error)
      const message = error?.message || 'Failed to load your documents.'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      void fetchDocuments()
    }
  }, [user])

  /* ============================================================
     ACKNOWLEDGE DOCUMENT
     ============================================================ */

  const handleAcknowledge = async (docId: string) => {
    setAcknowledgingId(docId)
    try {
      const response = await fetch(`/api/documents/${docId}/acknowledge`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to acknowledge document.')
      }

      toast.success('Official document acknowledged successfully.')
      await fetchDocuments()
    } catch (error: any) {
      toast.error(error?.message || 'Error acknowledging document.')
    } finally {
      setAcknowledgingId(null)
    }
  }

  const handleDownload = (doc: EnterpriseDocumentItem) => {
    if (doc.content) {
      setSelectedDoc(doc)
      setIsPreviewOpen(true)
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

  // Filter into categories
  const issuedLetters = useMemo(() => {
    return documents.filter(
      d =>
        d.status === 'ISSUED' ||
        d.status === 'ACKNOWLEDGED' ||
        Boolean(d.content)
    )
  }, [documents])

  const myUploadedDocs = useMemo(() => {
    return documents.filter(
      d =>
        !d.content &&
        d.visibility !== 'company' &&
        d.visibility !== 'company_wide'
    )
  }, [documents])

  const companyPolicies = useMemo(() => {
    return documents.filter(
      d => d.visibility === 'company' || d.visibility === 'company_wide' || d.category === 'company_policy'
    )
  }, [documents])

  const pendingReplacements = useMemo(() => {
    return documents.filter(
      d => d.status === 'REJECTED' || d.status === 'REPLACEMENT_REQUESTED'
    )
  }, [documents])

  const expiringSoonDocs = useMemo(() => {
    return documents.filter(d => d.expiryStatus === 'EXPIRING_SOON')
  }, [documents])

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
        return <Badge className="bg-orange-500 text-[10px] text-white">ACTION REQUIRED</Badge>
      case 'ISSUED':
        return <Badge className="bg-purple-600 text-[10px] text-white">ISSUED</Badge>
      case 'ACKNOWLEDGED':
        return <Badge className="bg-teal-600 text-[10px] text-white">ACKNOWLEDGED</Badge>
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Documents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Empowering Tomorrow’s Solutions, Today. Access your issued letters, uploaded statutory records, and company policies.
          </p>
        </div>

        <Button
          size="sm"
          className="bg-[#1e2a78] text-white hover:bg-[#152060] text-xs shadow-sm"
          onClick={() => {
            setReplaceDocId(undefined)
            setUploadCategory('identity_proof')
            setIsUploadOpen(true)
          }}
        >
          <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
          Upload Document
        </Button>
      </div>

      {/* Expiry Reminders Banner */}
      {expiringSoonDocs.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <Clock className="h-4 w-4 text-amber-600" />
            <span>Document Expiry Reminders ({expiringSoonDocs.length})</span>
          </div>
          <div className="space-y-1">
            {expiringSoonDocs.map(doc => (
              <div key={doc.id} className="flex items-center justify-between pl-6 text-[11px]">
                <span>
                  <strong>{doc.title}</strong> expires on {doc.expiryDate?.slice(0, 10)} ({doc.daysUntilExpiry} days remaining).
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => {
                    setReplaceDocId(doc.id)
                    setUploadCategory(doc.category)
                    setIsUploadOpen(true)
                  }}
                >
                  Renew / Upload
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Required: Rejections or Replacement Requests */}
      {pendingReplacements.length > 0 && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 dark:bg-orange-950/30 text-orange-900 dark:text-orange-200 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span>Action Required: Rejected or Replacement Documents ({pendingReplacements.length})</span>
          </div>
          <div className="space-y-2 pl-6">
            {pendingReplacements.map(doc => (
              <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border">
                <div>
                  <span className="font-semibold text-foreground">{doc.title}</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <strong>HR Reason:</strong> {doc.rejectionReason || doc.replacementReason || 'Please review and re-upload.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-orange-600 text-white hover:bg-orange-700 text-xs h-7 shrink-0"
                  onClick={() => {
                    setReplaceDocId(doc.id)
                    setUploadCategory(doc.category)
                    setIsUploadOpen(true)
                  }}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Upload Replacement
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="letters" className="space-y-4">
        <TabsList className="border bg-muted/40 p-1">
          <TabsTrigger value="letters" className="text-xs">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Issued Letters ({issuedLetters.length})
          </TabsTrigger>

          <TabsTrigger value="uploads" className="text-xs">
            <FileCheck className="mr-1.5 h-3.5 w-3.5" />
            My Uploaded Records ({myUploadedDocs.length})
          </TabsTrigger>

          <TabsTrigger value="policies" className="text-xs">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            Company Policies ({companyPolicies.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Issued Letters */}
        <TabsContent value="letters" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-base font-bold">Official Company Letters</CardTitle>
              <CardDescription className="text-xs">
                Offer letters, appointment letters, salary revisions, and official service certificates issued to you.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#1e2a78]" />
                  <p className="text-xs text-muted-foreground">Loading your official letters...</p>
                </div>
              ) : issuedLetters.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={FolderOpen}
                    title="No letters issued yet."
                    description="Official letters issued by Human Resources will appear here once published."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3.5 pl-6">Reference No</th>
                        <th className="p-3.5">Document Title</th>
                        <th className="p-3.5">Issue Date</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {issuedLetters.map(doc => (
                        <tr key={doc.id} className="hover:bg-muted/15 transition-colors">
                          <td className="p-3.5 pl-6 font-mono font-medium">{doc.documentNumber}</td>
                          <td className="p-3.5">
                            <div className="font-semibold text-foreground">{doc.title}</div>
                            <div className="text-[11px] text-muted-foreground">{getCategoryLabel(doc.category)}</div>
                          </td>
                          <td className="p-3.5 font-mono text-muted-foreground">{doc.issueDate?.slice(0, 10)}</td>
                          <td className="p-3.5">{getStatusBadge(doc.status)}</td>
                          <td className="p-3.5 pr-6 text-right space-x-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setSelectedDoc(doc)
                                setIsPreviewOpen(true)
                              }}
                            >
                              <Eye className="mr-1 h-3 w-3" /> Preview
                            </Button>

                            {doc.status === 'ISSUED' && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => handleAcknowledge(doc.id)}
                                disabled={acknowledgingId === doc.id}
                              >
                                {acknowledgingId === doc.id ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                )}
                                Acknowledge
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleDownload(doc)}
                            >
                              <Download className="h-3 w-3" />
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

        {/* Tab 2: Uploaded Records */}
        <TabsContent value="uploads" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">My Uploaded Documents</CardTitle>
                  <CardDescription className="text-xs">
                    Statutory proofs, educational degrees, and address verification files submitted for HR review.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-[#1e2a78] text-white hover:bg-[#152060] text-xs"
                  onClick={() => {
                    setReplaceDocId(undefined)
                    setUploadCategory('identity_proof')
                    setIsUploadOpen(true)
                  }}
                >
                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                  Upload New
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {myUploadedDocs.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={UploadCloud}
                    title="No documents uploaded yet."
                    description="Upload your identity proof, address proof, or academic certificates to complete HR onboarding."
                    action={
                      <Button
                        size="sm"
                        className="bg-[#1e2a78] text-white hover:bg-[#152060] text-xs"
                        onClick={() => setIsUploadOpen(true)}
                      >
                        <UploadCloud className="mr-1.5 h-3.5 w-3.5" /> Upload Document
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3.5 pl-6">Document Title</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Uploaded Date</th>
                        <th className="p-3.5">Version</th>
                        <th className="p-3.5 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {myUploadedDocs.map(doc => (
                        <tr key={doc.id} className="hover:bg-muted/15 transition-colors">
                          <td className="p-3.5 pl-6">
                            <div className="font-semibold text-foreground">{doc.title}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {doc.fileName} ({formatFileSize(doc.fileSize)})
                            </div>
                          </td>
                          <td className="p-3.5">
                            <Badge variant="outline" className="text-[10px]">
                              {doc.categoryName || getCategoryLabel(doc.category)}
                            </Badge>
                          </td>
                          <td className="p-3.5">{getStatusBadge(doc.status)}</td>
                          <td className="p-3.5 text-muted-foreground font-mono">{doc.createdAt?.slice(0, 10)}</td>
                          <td className="p-3.5 font-mono text-[11px]">v{doc.version || 1}</td>
                          <td className="p-3.5 pr-6 text-right space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setSelectedDoc(doc)
                                setIsDetailsOpen(true)
                              }}
                            >
                              <Eye className="mr-1 h-3 w-3" /> Details
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleDownload(doc)}
                            >
                              <Download className="h-3 w-3" />
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

        {/* Tab 3: Company Policies */}
        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-base font-bold">Company Handbooks & Policies</CardTitle>
              <CardDescription className="text-xs">
                Haryak Technologies India Private Limited code of conduct, information security, and employee policies.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {companyPolicies.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={BookOpen}
                    title="No company policies published."
                    description="Official company-wide policies published by HR will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3.5 pl-6">Policy Document</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5">Effective Date</th>
                        <th className="p-3.5 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {companyPolicies.map(doc => (
                        <tr key={doc.id} className="hover:bg-muted/15 transition-colors">
                          <td className="p-3.5 pl-6">
                            <div className="font-semibold text-foreground">{doc.title}</div>
                            <div className="text-[11px] text-muted-foreground">{doc.description || 'Company Policy'}</div>
                          </td>
                          <td className="p-3.5">
                            <Badge variant="outline" className="text-[10px]">
                              {doc.categoryName || getCategoryLabel(doc.category)}
                            </Badge>
                          </td>
                          <td className="p-3.5 font-mono text-muted-foreground">
                            {doc.effectiveDate?.slice(0, 10) || doc.issueDate?.slice(0, 10) || 'Active'}
                          </td>
                          <td className="p-3.5 pr-6 text-right space-x-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setSelectedDoc(doc)
                                setIsPreviewOpen(true)
                              }}
                            >
                              <Eye className="mr-1 h-3 w-3" /> View Policy
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleDownload(doc)}
                            >
                              <Download className="h-3 w-3" />
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
      </Tabs>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onSuccess={fetchDocuments}
        isAdmin={false}
        replacesDocumentId={replaceDocId}
        defaultCategory={uploadCategory}
      />

      {/* Details Dialog */}
      <DocumentDetailsDialog
        document={selectedDoc}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        isAdmin={false}
        onPreview={doc => {
          setIsDetailsOpen(false)
          setSelectedDoc(doc)
          setIsPreviewOpen(true)
        }}
        onDownload={handleDownload}
        onRefresh={fetchDocuments}
        onRequestReplacement={doc => {
          setReplaceDocId(doc.id)
          setUploadCategory(doc.category)
          setIsUploadOpen(true)
        }}
      />

      {/* Preview Modal */}
      <DocumentPreviewModal
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        document={selectedDoc}
      />
    </div>
  )
}
