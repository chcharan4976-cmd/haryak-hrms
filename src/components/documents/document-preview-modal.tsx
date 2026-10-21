'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  FileText,
  FileCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { EnterpriseDocumentItem, isFilePreviewable, formatFileSize } from '@/lib/types/document'
import { OfficialLetterheadRenderer } from './document-renderer'
import { downloadOfficialDocumentPdf } from '@/lib/pdf/generate-document-pdf'

interface DocumentPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: EnterpriseDocumentItem | null
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  document: doc,
}: DocumentPreviewModalProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [downloading, setDownloading] = useState(false)

  if (!doc) return null

  const isGeneratedLetter = Boolean(
    doc.content &&
    [
      'offer_letter',
      'appointment_letter',
      'joining_letter',
      'salary_revision',
      'relieving_letter',
      'experience_letter',
      'resignation_acceptance',
      'custom_letter',
    ].includes(doc.documentType)
  )

  const previewType = isFilePreviewable(doc.mimeType, doc.fileName)

  const handleDownload = async () => {
    if (isGeneratedLetter) {
      setDownloading(true)
      try {
        toast.info('Generating official letterhead PDF...')
        await downloadOfficialDocumentPdf('official-document-canvas', {
          employeeCode: doc.employeeCode || 'EMP',
          documentType: doc.documentType,
          documentNumber: doc.documentNumber,
          issueDate: doc.issueDate,
        })
        toast.success('Letterhead PDF downloaded successfully.')
      } catch (err: any) {
        toast.error(err?.message || 'Failed to download PDF.')
      } finally {
        setDownloading(false)
      }
    } else if (doc.fileUrl) {
      // Trigger download for uploaded file
      const link = window.document.createElement('a')
      link.href = doc.fileUrl.includes('?') ? `${doc.fileUrl}&download=true` : `${doc.fileUrl}?download=true`
      link.download = doc.fileName || 'document'
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      toast.success('Document download started.')
    }
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 2.5))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)
  const handleReset = () => {
    setZoom(1)
    setRotation(0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col h-[94vh] w-[96vw] max-w-[1180px] p-0 overflow-hidden">
        {/* Header Toolbar */}
        <DialogHeader className="flex flex-row items-center justify-between border-b bg-muted/20 px-5 py-3 shrink-0">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-bold truncate">
                {doc.title || doc.documentNumber}
              </DialogTitle>
              <Badge variant="outline" className="text-[10px]">
                v{doc.version || 1}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {doc.employeeName || 'Company Wide'} • {doc.categoryName || doc.category}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {previewType === 'image' && (
              <div className="flex items-center border rounded-md bg-background mr-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomOut} title="Zoom Out">
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[10px] px-1.5 font-mono">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomIn} title="Zoom In">
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRotate} title="Rotate 90°">
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleReset} title="Reset View">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <Button
              size="sm"
              className="h-8 text-xs bg-[#1e2a78] text-white hover:bg-[#152060]"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download {isGeneratedLetter ? 'Official PDF' : 'Original File'}
            </Button>
          </div>
        </DialogHeader>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950 flex justify-center items-center">
          {/* Mode 1: Generated Letter on Official Stationery */}
          {isGeneratedLetter && (
            <div className="flex justify-center overflow-x-auto py-2">
              <OfficialLetterheadRenderer
                documentNumber={doc.documentNumber}
                issueDate={doc.issueDate || ''}
                effectiveDate={doc.effectiveDate}
                subject={doc.content?.subject || doc.title}
                salutation={doc.content?.salutation || 'Dear Colleague,'}
                bodyParagraphs={doc.content?.bodyParagraphs || (doc.content?.body ? doc.content.body.split('\n\n') : [])}
                clauses={doc.content?.clauses}
                sections={doc.content?.sections}
                closingText={doc.content?.closingText}
                signatory={doc.content?.signatory || {
                  name: 'Authorized Signatory',
                  title: 'Head of Human Resources',
                  organization: 'Haryak Technologies India Private Limited',
                }}
              />
            </div>
          )}

          {/* Mode 2: Uploaded PDF */}
          {!isGeneratedLetter && previewType === 'pdf' && doc.fileUrl && (
            <div className="w-full h-full rounded-lg overflow-hidden border bg-white shadow-sm">
              <iframe
                src={`${doc.fileUrl}#toolbar=1`}
                className="w-full h-full border-0"
                title={doc.title}
              />
            </div>
          )}

          {/* Mode 3: Uploaded Image */}
          {!isGeneratedLetter && previewType === 'image' && doc.fileUrl && (
            <div className="overflow-auto max-h-full max-w-full flex items-center justify-center p-4">
              <img
                src={doc.fileUrl}
                alt={doc.title}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease',
                  maxHeight: '75vh',
                  maxWidth: '100%',
                  objectFit: 'contain',
                }}
                className="rounded-lg shadow-md border bg-white"
              />
            </div>
          )}

          {/* Mode 4: Unsupported Format (DOCX, XLSX, etc.) */}
          {!isGeneratedLetter && previewType === 'unsupported' && (
            <div className="max-w-md p-8 text-center bg-white dark:bg-slate-900 rounded-xl border shadow-sm space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-[#1e2a78]">
                <FileCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">{doc.fileName || 'Attached Document'}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(doc.fileSize)} • {doc.mimeType || 'Binary Document'}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  This document format cannot be rendered inline in the browser. You can download and open it using your desktop software.
                </p>
              </div>
              <Button
                className="bg-[#1e2a78] text-white hover:bg-[#152060] text-xs"
                onClick={handleDownload}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download Original File
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
