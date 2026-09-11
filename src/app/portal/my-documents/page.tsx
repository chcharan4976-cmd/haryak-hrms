'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  ShieldCheck,
} from 'lucide-react'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
} from '@/components/ui/card'

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'

import {
  toast,
} from 'sonner'

import {
  useAuth,
} from '@/components/providers/auth-provider'

import {
  OfficialLetterheadRenderer,
  type DocumentSection,
} from '@/components/documents/document-renderer'

import {
  downloadOfficialDocumentPdf,
} from '@/lib/pdf/generate-document-pdf'

interface MyDocument {
  id: string

  documentNumber: string
  documentType: string

  title: string

  fileName: string
  fileUrl?: string

  status:
    | 'ISSUED'
    | 'ACKNOWLEDGED'

  issueDate: string
  effectiveDate: string

  generatedAt: string

  issuedAt?: string | null
  acknowledgedAt?: string | null

  letterheadVersion: number

  employeeCode: string
  employeeName: string

  content?: any
}

function formatDate(
  value?: string | null
): string {
  if (
    !value
  ) {
    return 'Not available'
  }

  const raw =
    String(
      value
    )

  const date =
    new Date(
      raw.length >=
        10
        ? `${raw.slice(
            0,
            10
          )}T00:00:00`
        : raw
    )

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day:
        '2-digit',

      month:
        'short',

      year:
        'numeric',
    }
  )
}

function formatDocType(
  type:
    string
): string {
  return String(
    type ||
    ''
  )
    .replace(
      /_/g,
      ' '
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    )
}

function normalizeSections(
  content:
    any
): DocumentSection[] {
  if (
    Array.isArray(
      content?.sections
    )
  ) {
    return content.sections.map(
      (
        section:
          any,
        sectionIndex:
          number
      ) => ({
        id:
          String(
            section?.id ||
            `section-${
              sectionIndex +
              1
            }`
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
                  clause:
                    any,
                  clauseIndex:
                    number
                ) => ({
                  id:
                    String(
                      clause?.id ||
                      `section-${
                        sectionIndex +
                        1
                      }-clause-${
                        clauseIndex +
                        1
                      }`
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
    content.clauses
      .length >
      0
  ) {
    return [
      {
        id:
          'terms-and-conditions',

        title:
          String(
            content?.termsTitle ||
            'Terms & Conditions'
          ),

        clauses:
          content.clauses.map(
            (
              clause:
                any,
              index:
                number
            ) => ({
              id:
                String(
                  clause?.id ||
                  `clause-${
                    index +
                    1
                  }`
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

function normalizeBodyParagraphs(
  content:
    any
): string[] {
  if (
    Array.isArray(
      content?.bodyParagraphs
    )
  ) {
    return content.bodyParagraphs
      .map(
        (
          paragraph:
            any
        ) =>
          String(
            paragraph ||
            ''
          ).trim()
      )
      .filter(
        Boolean
      )
  }

  if (
    typeof content?.body ===
    'string'
  ) {
    return content.body
      .split(
        /\n\s*\n/g
      )
      .map(
        (
          paragraph:
            string
        ) =>
          paragraph.trim()
      )
      .filter(
        Boolean
      )
  }

  return []
}

function getRendererData(
  doc:
    MyDocument
) {
  const content =
    doc.content ||
    {}

  const signatory =
    content?.signatory ||
    {}

  return {
    documentNumber:
      content?.documentNumber ||
      content?.referenceNumber ||
      doc.documentNumber,

    issueDate:
      content?.issueDate ||
      doc.issueDate,

    effectiveDate:
      content?.effectiveDate ||
      doc.effectiveDate ||
      null,

    subject:
      content?.subject ||
      doc.title,

    salutation:
      content?.salutation ||
      'Dear Colleague,',

    bodyParagraphs:
      normalizeBodyParagraphs(
        content
      ),

    sections:
      normalizeSections(
        content
      ),

    closingText:
      content?.closingText ||
      content?.closing ||
      'For Haryak Technologies India Private Limited,',

    signatory: {
      name:
        signatory?.name ||
        content?.signatoryName ||
        'Authorized Signatory',

      title:
        signatory?.title ||
        signatory?.designation ||
        content?.signatoryTitle ||
        'Head of Human Resources',

      department:
        signatory?.department ||
        '',

      organization:
        signatory?.organization ||
        'Haryak Technologies India Private Limited',
    },
  }
}

export default function MyDocumentsPage() {
  const {
    user,
  } =
    useAuth()

  const [
    documents,
    setDocuments,
  ] =
    useState<MyDocument[]>(
      []
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    )

  const [
    loadError,
    setLoadError,
  ] =
    useState<
      string | null
    >(
      null
    )

  const [
    selectedDoc,
    setSelectedDoc,
  ] =
    useState<
      MyDocument | null
    >(
      null
    )

  const [
    isPreviewOpen,
    setIsPreviewOpen,
  ] =
    useState(
      false
    )

  const [
    acknowledging,
    setAcknowledging,
  ] =
    useState(
      false
    )

  const [
    downloading,
    setDownloading,
  ] =
    useState(
      false
    )

  /* ============================================================
     LOAD EMPLOYEE DOCUMENTS
     ============================================================ */

  const fetchDocuments =
    async () => {
      setLoading(
        true
      )

      setLoadError(
        null
      )

      try {
        const response =
          await fetch(
            '/api/documents',
            {
              cache:
                'no-store',

              credentials:
                'include',
            }
          )

        const contentType =
          response.headers.get(
            'content-type'
          ) ||
          ''

        if (
          !contentType.includes(
            'application/json'
          )
        ) {
          throw new Error(
            `Document API returned HTTP ${response.status} instead of JSON.`
          )
        }

        const data =
          await response.json()

        if (
          !response.ok ||
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
            'Failed to load documents.'
          )
        }

        const returned =
          Array.isArray(
            data.documents
          )
            ? data.documents
            : Array.isArray(
                data.data
              )
            ? data.data
            : []

        /**
         * Defense-in-depth:
         * The server MUST already enforce employee identity isolation.
         * The client additionally renders only portal-valid lifecycle
         * states.
         */
        const portalDocuments =
          returned.filter(
            (
              doc:
                MyDocument
            ) =>
              doc.status ===
                'ISSUED' ||
              doc.status ===
                'ACKNOWLEDGED'
          )

        setDocuments(
          portalDocuments
        )

        if (
          selectedDoc
        ) {
          const refreshed =
            portalDocuments.find(
              (
                doc:
                  MyDocument
              ) =>
                doc.id ===
                selectedDoc.id
            )

          if (
            refreshed
          ) {
            setSelectedDoc(
              refreshed
            )
          }
        }
      } catch (
        error:
          any
      ) {
        console.error(
          '[MyDocumentsPage] Load failed:',
          error
        )

        const message =
          error?.message ||
          'Failed to load documents.'

        setLoadError(
          message
        )

        toast.error(
          message
        )
      } finally {
        setLoading(
          false
        )
      }
    }

  useEffect(
    () => {
      if (
        user
      ) {
        void fetchDocuments()
      }
    },
    [user]
  )

  /* ============================================================
     PREVIEW
     ============================================================ */

  const openPreview =
    (
      doc:
        MyDocument
    ) => {
      setSelectedDoc(
        doc
      )

      setIsPreviewOpen(
        true
      )
    }

  /* ============================================================
     ACKNOWLEDGE
     ============================================================ */

  const handleAcknowledge =
    async (
      docId:
        string
    ) => {
      setAcknowledging(
        true
      )

      try {
        const response =
          await fetch(
            `/api/documents/${docId}/acknowledge`,
            {
              method:
                'POST',

              credentials:
                'include',
            }
          )

        const contentType =
          response.headers.get(
            'content-type'
          ) ||
          ''

        if (
          !contentType.includes(
            'application/json'
          )
        ) {
          throw new Error(
            `Acknowledgement API returned HTTP ${response.status} instead of JSON.`
          )
        }

        const data =
          await response.json()

        if (
          !response.ok ||
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
            'Failed to acknowledge document.'
          )
        }

        const authoritativeDoc =
          data.document ||
          data.data

        setSelectedDoc(
          previous => {
            if (
              !previous ||
              previous.id !==
                docId
            ) {
              return previous
            }

            return {
              ...previous,

              ...(authoritativeDoc ||
                {}),

              status:
                'ACKNOWLEDGED',

              acknowledgedAt:
                authoritativeDoc
                  ?.acknowledgedAt ||
                authoritativeDoc
                  ?.acknowledged_at ||
                data.acknowledgedAt ||
                new Date()
                  .toISOString(),
            }
          }
        )

        toast.success(
          'Document acknowledged successfully.'
        )

        await fetchDocuments()
      } catch (
        error:
          any
      ) {
        toast.error(
          error?.message ||
          'Error acknowledging document.'
        )
      } finally {
        setAcknowledging(
          false
        )
      }
    }

  /* ============================================================
     DOWNLOAD PDF
     ============================================================ */

  const handleDownloadPdf =
    async (
      doc:
        MyDocument
    ) => {
      /**
       * The canvas only exists inside the preview modal.
       * If user clicks download from another future entry point,
       * ensure that document is selected first.
       */
      if (
        selectedDoc?.id !==
        doc.id ||
        !isPreviewOpen
      ) {
        setSelectedDoc(
          doc
        )

        setIsPreviewOpen(
          true
        )

        toast.info(
          'Preview opened. Click Download PDF again after the letter is rendered.'
        )

        return
      }

      setDownloading(
        true
      )

      try {
        toast.info(
          'Generating official document PDF...'
        )

        await downloadOfficialDocumentPdf(
          'official-document-canvas',
          {
            employeeCode:
              doc.employeeCode ||
              'EMP',

            documentType:
              doc.documentType,

            documentNumber:
              doc.documentNumber,

            issueDate:
              doc.issueDate,
          }
        )

        toast.success(
          'Official document PDF downloaded.'
        )
      } catch (
        error:
          any
      ) {
        console.error(
          '[MyDocumentsPage] PDF failed:',
          error
        )

        toast.error(
          error?.message ||
          'Could not download PDF.'
        )
      } finally {
        setDownloading(
          false
        )
      }
    }

  /* ============================================================
     COUNTERS
     ============================================================ */

  const pendingCount =
    useMemo(
      () =>
        documents.filter(
          document =>
            document.status ===
            'ISSUED'
        ).length,
      [
        documents,
      ]
    )

  const acknowledgedCount =
    useMemo(
      () =>
        documents.filter(
          document =>
            document.status ===
            'ACKNOWLEDGED'
        ).length,
      [
        documents,
      ]
    )

  const selectedRenderer =
    useMemo(
      () =>
        selectedDoc
          ? getRendererData(
              selectedDoc
            )
          : null,
      [
        selectedDoc,
      ]
    )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            My Document Vault
          </h1>

          <p className="mt-1 text-xs text-muted-foreground">
            Access, preview, download, and acknowledge your official employment letters issued by Haryak Technologies India Private Limited.
          </p>
        </div>

        <Badge
          variant="outline"
          className="border-blue-200 bg-blue-50 px-3 py-1 text-xs text-[#1e2a78] dark:bg-blue-950 dark:text-blue-300"
        >
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />

          Verified Employee Stationery
        </Badge>
      </div>

      {/* =====================================================
          SUMMARY
          ===================================================== */}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Available Documents"
          value={
            documents.length
          }
          icon={
            <FileText className="h-4 w-4" />
          }
        />

        <SummaryCard
          label="Awaiting Acknowledgement"
          value={
            pendingCount
          }
          icon={
            <Clock className="h-4 w-4" />
          }
        />

        <SummaryCard
          label="Acknowledged"
          value={
            acknowledgedCount
          }
          icon={
            <CheckCircle2 className="h-4 w-4" />
          }
        />
      </div>

      {/* =====================================================
          DOCUMENTS
          ===================================================== */}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">
            Official Corporate Letters & Certificates
          </h2>

          <span className="text-xs text-muted-foreground">
            {documents.length}{' '}
            Available
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#1e2a78]" />

            <p className="text-xs text-muted-foreground">
              Loading your official documents...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-8 text-center dark:bg-red-950/20">
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />

            <h3 className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">
              Documents could not be loaded
            </h3>

            <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
              {loadError}
            </p>

            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() =>
                void fetchDocuments()
              }
            >
              Retry
            </Button>
          </div>
        ) : documents.length ===
          0 ? (
          <div className="space-y-2 rounded-xl border border-dashed bg-card p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FileText className="h-6 w-6" />
            </div>

            <h3 className="text-sm font-semibold text-foreground">
              No Official Letters Issued Yet
            </h3>

            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              Only documents formally issued by HR appear here. Draft and approved-but-not-issued documents remain private to Administration.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map(
              document => {
                const isAcknowledged =
                  document.status ===
                  'ACKNOWLEDGED'

                return (
                  <Card
                    key={
                      document.id
                    }
                    className="flex flex-col justify-between shadow-xs transition-colors hover:border-blue-400"
                  >
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1e2a78] dark:bg-blue-950 dark:text-blue-300">
                          <FileText className="h-5 w-5" />
                        </div>

                        {isAcknowledged ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />

                            Acknowledged
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                          >
                            <Clock className="mr-1 h-3 w-3" />

                            Action Required
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="font-mono text-[10px] font-semibold text-muted-foreground">
                          {
                            document.documentNumber
                          }
                        </p>

                        <h3
                          className="line-clamp-2 text-sm font-semibold text-foreground"
                          title={
                            document.title
                          }
                        >
                          {
                            document.title
                          }
                        </h3>

                        <p className="text-[11px] text-muted-foreground">
                          {formatDocType(
                            document.documentType
                          )}
                        </p>
                      </div>

                      <div className="space-y-1 border-t pt-3 text-[11px] text-muted-foreground">
                        <div className="flex justify-between gap-3">
                          <span>
                            Issue Date
                          </span>

                          <span className="font-medium text-foreground">
                            {formatDate(
                              document.issueDate
                            )}
                          </span>
                        </div>

                        {document.issuedAt && (
                          <div className="flex justify-between gap-3">
                            <span>
                              Issued
                            </span>

                            <span className="font-medium text-foreground">
                              {formatDate(
                                document.issuedAt
                              )}
                            </span>
                          </div>
                        )}

                        {document.acknowledgedAt && (
                          <div className="flex justify-between gap-3">
                            <span>
                              Acknowledged
                            </span>

                            <span className="font-medium text-emerald-700">
                              {formatDate(
                                document.acknowledgedAt
                              )}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between gap-3">
                          <span>
                            Stationery
                          </span>

                          <span>
                            v
                            {
                              document.letterheadVersion
                            }
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-full text-xs"
                          onClick={() =>
                            openPreview(
                              document
                            )
                          }
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />

                          View Official Letter
                        </Button>

                        {!isAcknowledged && (
                          <Button
                            size="sm"
                            className="h-8 w-full bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                            onClick={() =>
                              void handleAcknowledge(
                                document.id
                              )
                            }
                            disabled={
                              acknowledging
                            }
                          >
                            {acknowledging ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            )}

                            Acknowledge Receipt
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              }
            )}
          </div>
        )}
      </div>

      {/* =====================================================
          PREVIEW MODAL
          ===================================================== */}

      <Dialog
        open={
          isPreviewOpen
        }
        onOpenChange={
          setIsPreviewOpen
        }
      >
        <DialogContent className="flex h-[94vh] w-[96vw] max-w-[1180px] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">
                  {selectedDoc
                    ?.documentNumber}
                </h3>

                {selectedDoc
                  ?.status ===
                'ACKNOWLEDGED' ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />

                    Acknowledged
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                  >
                    <Clock className="mr-1 h-3 w-3" />

                    Acknowledgement Required
                  </Badge>
                )}
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedDoc &&
                  formatDocType(
                    selectedDoc.documentType
                  )}{' '}
                •{' '}
                {selectedDoc
                  ?.title}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={() =>
                selectedDoc &&
                void handleDownloadPdf(
                  selectedDoc
                )
              }
              disabled={
                downloading
              }
            >
              {downloading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}

              Download PDF
            </Button>
          </div>

          <div className="flex flex-1 justify-center overflow-auto bg-slate-100 p-5 dark:bg-slate-950">
            {selectedDoc &&
              selectedRenderer && (
                <OfficialLetterheadRenderer
                  documentNumber={
                    selectedRenderer.documentNumber
                  }
                  issueDate={
                    selectedRenderer.issueDate
                  }
                  effectiveDate={
                    selectedRenderer.effectiveDate
                  }
                  subject={
                    selectedRenderer.subject
                  }
                  salutation={
                    selectedRenderer.salutation
                  }
                  bodyParagraphs={
                    selectedRenderer.bodyParagraphs.length >
                    0
                      ? selectedRenderer.bodyParagraphs
                      : [
                          'This official document contains no rendered body content. Please contact Human Resources.',
                        ]
                  }
                  sections={
                    selectedRenderer.sections
                  }
                  closingText={
                    selectedRenderer.closingText
                  }
                  signatory={
                    selectedRenderer.signatory
                  }
                  headerImageUrl="/letterhead/header.png"
                  footerImageUrl="/letterhead/footer.jpg"
                />
              )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t bg-card px-4 py-3">
            <div className="text-[11px] text-muted-foreground">
              Official stationery of Haryak Technologies India Private Limited
              {selectedDoc?.issuedAt
                ? ` • Issued ${formatDate(
                    selectedDoc.issuedAt
                  )}`
                : ''}
            </div>

            <div className="flex items-center gap-2">
              {selectedDoc &&
                selectedDoc.status !==
                  'ACKNOWLEDGED' && (
                  <Button
                    size="sm"
                    className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    onClick={() =>
                      void handleAcknowledge(
                        selectedDoc.id
                      )
                    }
                    disabled={
                      acknowledging
                    }
                  >
                    {acknowledging ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    )}

                    Acknowledge Receipt
                  </Button>
                )}

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setIsPreviewOpen(
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

function SummaryCard({
  label,
  value,
  icon,
}: {
  label:
    string
  value:
    number
  icon:
    React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </p>

          <p className="mt-1 text-xl font-bold">
            {value}
          </p>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1e2a78] dark:bg-blue-950 dark:text-blue-300">
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}
