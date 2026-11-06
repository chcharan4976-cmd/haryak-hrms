'use client'

import React, { useState } from 'react'
import {
  CreditCard,
  Download,
  FileText,
  Printer,
  RotateCcw,
  Sliders,
  Layers,
  Eye,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  Briefcase,
  Hash,
  Database,
  Edit3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { CorporateEliteTemplate, IDCardData } from './corporate-elite-template'
import { ModernExecutiveTemplate } from './modern-executive-template'
import { EmployeeSelector, SelectedEmployeeDetails } from './employee-selector'
import { EmployeePhotoCropper } from './employee-photo-cropper'
import {
  captureHighResCard,
  generateHighResPng,
  generateCR80PrintPdf,
  triggerBrowserDownload,
  urlToBase64,
  CR80_600DPI_WIDTH,
  CR80_600DPI_HEIGHT,
} from '@/lib/services/id-card-export-client'

export function EmployeeIDCardStudio() {
  // Input Mode: Database selection vs Manual entry
  const [entryMode, setEntryMode] = useState<'DATABASE' | 'MANUAL'>('DATABASE')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>()

  // ID Card Design Selection
  const [designType, setDesignType] = useState<'CORPORATE_ELITE' | 'MODERN_EXECUTIVE'>('CORPORATE_ELITE')

  // Core ID Card Fields (Strictly 5 required fields + branding company name)
  const [employeeName, setEmployeeName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // Background contact info from selected employee or company default for badge footer layout
  const [employeePhone, setEmployeePhone] = useState('+91 6302 355 693')
  const [employeeEmail, setEmployeeEmail] = useState('contact@haryak.com')
  const [employeeLocation, setEmployeeLocation] = useState('Headquarters')

  // Fixed Company Branding
  const companyName = 'Haryak Technologies India Private Limited'

  // Interaction and Export States
  const [exportingPng, setExportingPng] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Target DOM element ID
  const cardElementId = designType === 'CORPORATE_ELITE' ? 'preview-corporate-elite' : 'preview-modern-executive'

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  // Handle employee selection from database
  const handleSelectEmployee = async (emp: SelectedEmployeeDetails) => {
    setSelectedEmployeeId(emp.id)
    setEmployeeCode(emp.employeeCode)
    setEmployeeName(emp.fullName)
    setDesignation(emp.designation || 'Staff')
    setDepartment(emp.department || 'Operations')

    if (emp.phone && emp.phone !== '-') setEmployeePhone(emp.phone)
    if (emp.email) setEmployeeEmail(emp.email)
    if (emp.location) setEmployeeLocation(emp.location)

    if (emp.profileImageUrl) {
      try {
        const b64 = await urlToBase64(emp.profileImageUrl)
        setPhotoUrl(b64)
      } catch {
        setPhotoUrl(emp.profileImageUrl)
      }
    } else {
      setPhotoUrl(null)
    }

    setTouched({})
    toast.success(`Loaded ${emp.fullName} (${emp.employeeCode}) from database`)
  }

  // Client-side Validation (Full Name, Employee ID, Designation, Department, Photo)
  const validateForm = (): { isValid: boolean; missingFields: string[] } => {
    const missing: string[] = []
    if (!employeeName.trim()) missing.push('Full Name')
    if (!employeeCode.trim()) missing.push('Employee ID')
    if (!designation.trim()) missing.push('Designation')
    if (!department.trim()) missing.push('Department')
    if (!photoUrl) missing.push('Employee Photograph')

    return {
      isValid: missing.length === 0,
      missingFields: missing,
    }
  }

  const markAllTouched = () => {
    setTouched({
      employeeName: true,
      employeeCode: true,
      designation: true,
      department: true,
      photoUrl: true,
    })
  }

  const getSanitizedFileName = (extension: 'png' | 'pdf'): string => {
    const rawCode = employeeCode.trim() || 'HRK-001'
    const cleanCode = rawCode.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${cleanCode}_Employee_ID_Card.${extension}`
  }

  // 1. PRIMARY ACTION: DOWNLOAD ID CARD (PNG at 600 DPI: 1275 × 2022 px)
  const handleDownloadPng = async () => {
    const { isValid, missingFields } = validateForm()
    if (!isValid) {
      markAllTouched()
      toast.error(`Please complete required fields: ${missingFields.join(', ')}`)
      return
    }

    setExportingPng(true)
    try {
      toast.info('Rendering ultra-sharp 600 DPI CR80 PNG (1275 × 2022 px)...')
      const exactCardDataUrl = await captureHighResCard(cardElementId, CR80_600DPI_WIDTH, CR80_600DPI_HEIGHT)
      const finalPngUrl = await generateHighResPng(exactCardDataUrl)
      const filename = getSanitizedFileName('png')
      triggerBrowserDownload(finalPngUrl, filename)
      toast.success(`ID Card for ${employeeName} downloaded successfully as ${filename} (600 DPI)!`)
    } catch (err: any) {
      console.error('[handleDownloadPng] Error:', err)
      toast.error(err.message || 'Failed to render 600 DPI PNG ID card')
    } finally {
      setExportingPng(false)
    }
  }

  // 2. SECONDARY ACTION: DOWNLOAD CR80 PRINT-READY PDF (53.98 × 85.60 mm)
  const handleDownloadPrintPdf = async () => {
    const { isValid, missingFields } = validateForm()
    if (!isValid) {
      markAllTouched()
      toast.error(`Please complete required fields: ${missingFields.join(', ')}`)
      return
    }

    setExportingPdf(true)
    try {
      toast.info('Generating 600 DPI print-ready CR80 portrait PDF (53.98 × 85.60 mm)...')
      const exactCardDataUrl = await captureHighResCard(cardElementId, CR80_600DPI_WIDTH, CR80_600DPI_HEIGHT)
      const pdfDataUri = await generateCR80PrintPdf(exactCardDataUrl)
      const filename = getSanitizedFileName('pdf')
      triggerBrowserDownload(pdfDataUri, filename)
      toast.success(`Print-ready CR80 PDF for ${employeeName} downloaded successfully as ${filename}!`)
    } catch (err: any) {
      console.error('[handleDownloadPrintPdf] Error:', err)
      toast.error(err.message || 'Failed to generate PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  // 3. SECONDARY ACTION: DIRECT BROWSER PRINT
  const handlePrint = () => {
    const { isValid, missingFields } = validateForm()
    if (!isValid) {
      markAllTouched()
      toast.error(`Please complete required fields before printing: ${missingFields.join(', ')}`)
      return
    }
    window.print()
  }

  // 4. RESET FORM
  const handleResetForm = () => {
    setSelectedEmployeeId(undefined)
    setEmployeeName('')
    setEmployeeCode('')
    setDesignation('')
    setDepartment('')
    setPhotoUrl(null)
    setEmployeePhone('+91 6302 355 693')
    setEmployeeEmail('contact@haryak.com')
    setEmployeeLocation('Headquarters')
    setTouched({})
    toast.info('Form cleared. Ready for next employee badge.')
  }

  // Card Data for Templates (Live Preview)
  const cardData: IDCardData = {
    employeeName,
    employeeCode,
    designation,
    department,
    phone: employeePhone,
    email: employeeEmail,
    location: employeeLocation,
    photoUrl,
    companyName,
    companyWebsite: 'www.haryak.com',
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Employee ID Card Generator
              </h1>
              <Badge variant="secondary" className="text-[10px] font-mono tracking-wider bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300">
                600 DPI • ULTRA HD • STATELESS
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select an employee from the database or enter details manually, configure photograph, preview live, and export print-ready badges.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetForm}
            className="text-xs h-9"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Clear Form
          </Button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ============================================================
            LEFT COLUMN: Employee Selection, Details & Photo (5 cols)
        ============================================================ */}
        <div className="lg:col-span-5 space-y-5">
          {/* Workflow Toggle: Select Existing Employee vs Enter Manually */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/70 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setEntryMode('DATABASE')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                entryMode === 'DATABASE'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-blue-600" />
              Select Existing Employee
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryMode('MANUAL')
                setSelectedEmployeeId(undefined)
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                entryMode === 'MANUAL'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
              Enter Manually
            </button>
          </div>

          {/* Database Selector (Visible only in DATABASE mode) */}
          {entryMode === 'DATABASE' && (
            <EmployeeSelector
              onSelectEmployee={handleSelectEmployee}
              selectedEmployeeId={selectedEmployeeId}
            />
          )}

          {/* Minimal 5 Required Fields Form */}
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                Employee Information
              </h3>
              <span className="text-[11px] text-muted-foreground">
                <span className="text-rose-500 font-bold">*</span> All 4 text fields + photo required
              </span>
            </div>

            {/* Field 1: Full Name */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 font-medium">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                Employee Full Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={employeeName}
                onChange={e => setEmployeeName(e.target.value)}
                onBlur={() => markTouched('employeeName')}
                className={`text-xs h-9 font-medium ${
                  touched.employeeName && !employeeName.trim() ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                }`}
                placeholder="e.g. Chegondi Charan"
              />
              {touched.employeeName && !employeeName.trim() && (
                <p className="text-[10.5px] text-rose-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Full Name is required
                </p>
              )}
            </div>

            {/* Field 2: Employee ID */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 font-medium">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                Employee ID <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
                onBlur={() => markTouched('employeeCode')}
                className={`font-mono text-xs h-9 font-semibold ${
                  touched.employeeCode && !employeeCode.trim() ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                }`}
                placeholder="e.g. HRK-001"
              />
              {touched.employeeCode && !employeeCode.trim() && (
                <p className="text-[10.5px] text-rose-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Employee ID is required
                </p>
              )}
            </div>

            {/* Field 3 & Field 4: Designation & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1 font-medium">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                  Designation <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                  onBlur={() => markTouched('designation')}
                  className={`text-xs h-9 ${
                    touched.designation && !designation.trim() ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                  placeholder="e.g. Software Engineer"
                />
                {touched.designation && !designation.trim() && (
                  <p className="text-[10.5px] text-rose-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Required
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  Department <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  onBlur={() => markTouched('department')}
                  className={`text-xs h-9 ${
                    touched.department && !department.trim() ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                  placeholder="e.g. Software Development"
                />
                {touched.department && !department.trim() && (
                  <p className="text-[10.5px] text-rose-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Required
                  </p>
                )}
              </div>
            </div>

            {/* Company Branding Display (Auto-populated) */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Company Branding:</span>
              <span className="font-semibold text-foreground truncate max-w-[260px] text-right">
                {companyName}
              </span>
            </div>
          </div>

          {/* Section: Employee Photograph (Required) */}
          <EmployeePhotoCropper
            currentPhotoUrl={photoUrl}
            onPhotoProcessed={dataUrl => {
              setPhotoUrl(dataUrl || null)
              if (dataUrl) {
                setTouched(prev => ({ ...prev, photoUrl: false }))
              }
            }}
            employeeName={employeeName || 'Employee'}
            cropShape={designType === 'CORPORATE_ELITE' ? 'circle' : 'rect'}
          />
          {touched.photoUrl && !photoUrl && (
            <p className="text-[10.5px] text-rose-500 flex items-center gap-1 px-1">
              <AlertCircle className="w-3 h-3" /> Please upload or confirm an employee photograph for the ID card
            </p>
          )}
        </div>

        {/* ============================================================
            RIGHT COLUMN: Design Selector, Live Preview & Export (7 cols)
        ============================================================ */}
        <div className="lg:col-span-7 space-y-5">
          {/* Design Template Selector */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Select Vertical ID Badge Design
              </label>
              <Badge variant="outline" className="text-[10px] font-mono">
                CR80 PORTRAIT (53.98 × 85.60 MM)
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Design 01: Royal Corporate Identity */}
              <button
                type="button"
                onClick={() => setDesignType('CORPORATE_ELITE')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  designType === 'CORPORATE_ELITE'
                    ? 'border-[#4A55B6] bg-indigo-50/80 dark:bg-indigo-950/40 shadow-sm ring-2 ring-[#4A55B6]'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                {/* Visual Mini Thumbnail */}
                <div className="w-[38px] h-[60px] rounded-md bg-[#4A55B6] relative overflow-hidden flex-shrink-0 shadow-sm border border-white/20">
                  <div className="absolute top-0 left-0 w-5 h-7 bg-[#DADDF0] rounded-br-lg" />
                  <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-white/80" />
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-xs" />
                  <div className="absolute bottom-0 inset-x-0 h-3.5 bg-[#DADDF0] rounded-t-sm" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground truncate">
                      Design 01 — Royal Identity
                    </span>
                    {designType === 'CORPORATE_ELITE' && (
                      <CheckCircle2 className="w-4 h-4 text-[#4A55B6] flex-shrink-0" />
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[8.5px] font-mono mb-1 bg-indigo-100 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200">
                    ROYAL &amp; LAVENDER
                  </Badge>
                  <p className="text-[10.5px] text-muted-foreground leading-snug">
                    Royal blue identity card with flowing curves and circular employee portrait.
                  </p>
                </div>
              </button>

              {/* Design 02: Modern Azure Corporate Identity */}
              <button
                type="button"
                onClick={() => setDesignType('MODERN_EXECUTIVE')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  designType === 'MODERN_EXECUTIVE'
                    ? 'border-[#2563EB] bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-[#2563EB]'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                {/* Visual Mini Thumbnail */}
                <div className="w-[38px] h-[60px] rounded-md bg-white relative overflow-hidden flex-shrink-0 shadow-sm border border-slate-300">
                  <div className="absolute top-0 inset-x-0 h-3 bg-[#1E3A8A]" />
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3.5 h-4 rounded-xs bg-slate-200 border border-white" />
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-slate-400" />
                  <div className="absolute bottom-0 inset-x-0 h-2 bg-[#1E3A8A]" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground truncate">
                      Design 02 — Modern Azure
                    </span>
                    {designType === 'MODERN_EXECUTIVE' && (
                      <CheckCircle2 className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[8.5px] font-mono mb-1 bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200">
                    AZURE &amp; WHITE
                  </Badge>
                  <p className="text-[10.5px] text-muted-foreground leading-snug">
                    Clean corporate card with structured information and rectangular portrait.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Realistic Physical Card Preview Canvas */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-foreground">Live Physical Card Preview</span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  53.98 × 85.60 MM (CR80)
                </Badge>
              </div>

              <div className="text-[11px] text-muted-foreground font-mono">
                600 DPI Export Target • Portrait
              </div>
            </div>

            {/* Preview Viewport */}
            <div className="bg-slate-100 dark:bg-slate-900/70 p-6 sm:p-10 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-800 min-h-[640px] shadow-inner transition-all duration-300">
              <div id="printable-id-card-wrapper">
                {designType === 'CORPORATE_ELITE' ? (
                  <div className="shadow-[0_20px_50px_rgba(74,85,182,0.3)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.7)] rounded-[24px] transition-all">
                    <CorporateEliteTemplate
                      id="preview-corporate-elite"
                      data={cardData}
                      scale={1}
                    />
                  </div>
                ) : (
                  <div className="shadow-[0_20px_50px_rgba(36,71,184,0.2)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-[24px] transition-all">
                    <ModernExecutiveTemplate
                      id="preview-modern-executive"
                      data={cardData}
                      scale={1}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Actions & Export Toolbar: 600 DPI PNG & Print-Ready PDF */}
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ACTION 1: DOWNLOAD PNG (600 DPI) */}
                <Button
                  type="button"
                  variant="default"
                  onClick={handleDownloadPng}
                  disabled={exportingPng}
                  className="w-full text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 shadow-md hover:shadow-lg transition-all"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {exportingPng ? 'Rendering 600 DPI PNG...' : 'DOWNLOAD PNG (600 DPI)'}
                </Button>

                {/* ACTION 2: DOWNLOAD PRINT-READY PDF */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadPrintPdf}
                  disabled={exportingPdf}
                  className="w-full text-xs sm:text-sm font-semibold h-11 border-border shadow-sm hover:bg-muted"
                >
                  <FileText className="w-4 h-4 mr-2 text-rose-600" />
                  {exportingPdf ? 'Exporting PDF...' : 'DOWNLOAD PRINT PDF'}
                </Button>
              </div>

              {/* ACTION 3: BROWSER PRINT */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePrint}
                  className="text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Direct Browser Print
                </Button>
              </div>

              <div className="text-[11px] text-muted-foreground text-center pt-2 border-t border-border/40">
                Stateless: All rendering is executed directly in your browser at 600 DPI (1275 × 2022 px). Selecting an employee reads information only; no employee records or badges are modified or stored in the database.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Media Print Styles for pure card printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 53.98mm 85.60mm portrait;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-id-card-wrapper,
          #printable-id-card-wrapper * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-id-card-wrapper {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 53.98mm !important;
            height: 85.60mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 999999 !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #printable-id-card-wrapper > div {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #preview-corporate-elite,
          #preview-modern-executive {
            width: 380px !important;
            height: 602px !important;
            transform: scale(0.53689) !important;
            transform-origin: top left !important;
            box-shadow: none !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      ` }} />
    </div>
  )
}
