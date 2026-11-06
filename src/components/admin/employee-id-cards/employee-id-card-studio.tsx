'use client'

import React, { useState, useEffect } from 'react'
import {
  CreditCard,
  Sparkles,
  Clock,
  Layers,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  Eye,
  Sliders,
  Printer,
  AlertTriangle,
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
import { TemporaryCardsTable, TemporaryCardItem } from './temporary-cards-table'
import {
  captureHighResCard,
  generateHighResPng,
  generateCR80PrintPdf,
  triggerBrowserDownload,
  urlToBase64,
} from '@/lib/services/id-card-export-client'
import { safeParseResponse } from '@/lib/api-client'

export function EmployeeIDCardStudio() {
  const [activeTab, setActiveTab] = useState<'STUDIO' | 'ACTIVE_CARDS'>('STUDIO')
  const [designType, setDesignType] = useState<'CORPORATE_ELITE' | 'MODERN_EXECUTIVE'>('CORPORATE_ELITE')

  // Form State initialized clean (No hardcoded mock employee data)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>()
  const [employeeCode, setEmployeeCode] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // Cards & Stats
  const [cards, setCards] = useState<TemporaryCardItem[]>([])
  const [stats, setStats] = useState({
    totalToday: 0,
    activeCount: 0,
    expiringSoonCount: 0,
  })
  const [loadingCards, setLoadingCards] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [schemaError, setSchemaError] = useState<{ isSchemaNotReady: boolean; message: string } | null>(null)

  // Both designs are strictly vertical portrait CR80 cards (53.98 mm × 85.60 mm)
  const cardElementId = designType === 'CORPORATE_ELITE' ? 'preview-corporate-elite' : 'preview-modern-executive'

  const fetchCards = async () => {
    setLoadingCards(true)
    try {
      const res = await fetch('/api/admin/employee-id-cards')
      const parseResult = await safeParseResponse<{
        success: boolean
        code?: string
        cards?: TemporaryCardItem[]
        stats?: { totalToday: number; activeCount: number; expiringSoonCount: number }
        error?: string
      }>(res)

      if (parseResult.ok && parseResult.data?.success) {
        setSchemaError(null)
        setCards(parseResult.data.cards || [])
        setStats(parseResult.data.stats || { totalToday: 0, activeCount: 0, expiringSoonCount: 0 })
      } else {
        const isNotReady = parseResult.status === 503 || parseResult.data?.code === 'ID_CARD_SCHEMA_NOT_READY'
        if (isNotReady) {
          setSchemaError({
            isSchemaNotReady: true,
            message:
              parseResult.data?.error ||
              'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
          })
        } else {
          setSchemaError(null)
        }
        setCards([])
        setStats({ totalToday: 0, activeCount: 0, expiringSoonCount: 0 })
      }
    } catch (err) {
      console.error('[EmployeeIDCardStudio] Fetch error:', err)
      setCards([])
      setStats({ totalToday: 0, activeCount: 0, expiringSoonCount: 0 })
    } finally {
      setLoadingCards(false)
    }
  }

  useEffect(() => {
    fetchCards()
  }, [])

  const handleSelectEmployee = async (emp: SelectedEmployeeDetails) => {
    setSelectedEmployeeId(emp.id)
    setEmployeeCode(emp.employeeCode)
    setEmployeeName(emp.fullName)
    setDesignation(emp.designation || 'Staff')
    setDepartment(emp.department || 'Operations')
    setPhone(emp.phone || '+91 8500 298 398')
    setEmail(emp.email || 'employee@haryak.com')
    setLocation(emp.location || 'Headquarters')

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

    toast.success(`Selected ${emp.fullName} (${emp.employeeCode})`)
  }

  // 1. Direct Export: 300 DPI CR80 PNG (638 × 1011 px)
  const handleDownloadPng = async () => {
    if (!employeeName) {
      toast.error('Please select an employee before downloading.')
      return
    }

    setExportingPng(true)
    try {
      toast.info('Rendering print-ready CR80 PNG (638 × 1011 px, 300 DPI)...')
      const exactCardDataUrl = await captureHighResCard(cardElementId, 638, 1011)
      const finalPngUrl = await generateHighResPng(exactCardDataUrl)
      triggerBrowserDownload(
        finalPngUrl,
        `${employeeCode || 'HRK-001'}_Employee_ID.png`
      )
      toast.success('300 DPI CR80 PNG downloaded successfully.')
    } catch (err: any) {
      console.error('[handleDownloadPng] Error:', err)
      toast.error(err.message || 'Failed to render PNG')
    } finally {
      setExportingPng(false)
    }
  }

  // 2. Direct Export: 300 DPI Print-Ready Portrait CR80 PDF (53.98 × 85.60 mm)
  const handleDownloadPrintPdf = async () => {
    if (!employeeName) {
      toast.error('Please select an employee before downloading.')
      return
    }

    setExportingPdf(true)
    try {
      toast.info('Generating 300 DPI print-ready CR80 portrait PDF (53.98 × 85.60 mm)...')
      const exactCardDataUrl = await captureHighResCard(cardElementId, 638, 1011)
      const pdfDataUri = await generateCR80PrintPdf(exactCardDataUrl)
      triggerBrowserDownload(
        pdfDataUri,
        `${employeeCode || 'HRK-001'}_CR80_ID_Card.pdf`
      )
      toast.success('300 DPI Print-Ready CR80 portrait PDF downloaded successfully.')
    } catch (err: any) {
      console.error('[handleDownloadPrintPdf] Error:', err)
      toast.error(err.message || 'Failed to render PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  // 3. Direct Print: Print ONLY the ID card without dashboard UI
  const handlePrint = () => {
    if (!employeeName) {
      toast.error('Please select an employee before printing.')
      return
    }
    window.print()
  }

  // 4. Generate & Save Temporary 24-Hour Card
  const handleGenerateAndSave = async () => {
    if (!employeeName) {
      toast.error('Please select an employee before generating the ID card.')
      return
    }

    setGenerating(true)
    try {
      toast.info('Rendering assets and registering temporary 24-hour employee ID card...')

      const exactCardDataUrl = await captureHighResCard(cardElementId, 638, 1011)
      const finalPngUrl = await generateHighResPng(exactCardDataUrl)
      const pdfDataUri = await generateCR80PrintPdf(exactCardDataUrl)

      const payload = {
        employeeId: selectedEmployeeId,
        designType,
        employeeName,
        designation,
        department,
        phone,
        email,
        location,
        photoUrl,
        customCode: employeeCode,
        cardPngBase64: finalPngUrl,
        cardPdfBase64: pdfDataUri,
      }

      const res = await fetch('/api/admin/employee-id-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const parseResult = await safeParseResponse<{
        success: boolean
        code?: string
        error?: string
        message?: string
      }>(res)

      if (parseResult.ok && parseResult.data?.success) {
        setSchemaError(null)
        toast.success(`Generated ID card for ${employeeName}! Valid for exactly 24 hours.`)
        fetchCards()
        setActiveTab('ACTIVE_CARDS')
      } else {
        const isNotReady = parseResult.status === 503 || parseResult.data?.code === 'ID_CARD_SCHEMA_NOT_READY'
        if (isNotReady) {
          setSchemaError({
            isSchemaNotReady: true,
            message:
              parseResult.data?.error ||
              'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
          })
          toast.error('Database setup incomplete: migrations required before temporary cards can be saved.')
        } else {
          const errorMsg = parseResult.data?.error || parseResult.error || 'Failed to register temporary card'
          toast.error(errorMsg)
        }
      }
    } catch (err: any) {
      console.error('[handleGenerateAndSave] Error:', err)
      toast.error(err.message || 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const cardData: IDCardData = {
    employeeName,
    employeeCode,
    designation,
    department,
    phone,
    email,
    location,
    photoUrl,
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Studio Header (Admin Only badge removed) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Employee ID Card Studio
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate professional CR80 corporate identity badges with automatic 24-hour lifecycle.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeTab === 'STUDIO' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('STUDIO')}
            className="text-xs h-9"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Studio Workspace
          </Button>

          <Button
            type="button"
            variant={activeTab === 'ACTIVE_CARDS' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveTab('ACTIVE_CARDS')
              fetchCards()
            }}
            className="text-xs h-9 relative"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
            Active 24h Cards
            {stats.activeCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-[10px] font-bold">
                {stats.activeCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Statistics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Generated Today
          </div>
          <div className="text-2xl font-black text-foreground mt-1">{stats.totalToday}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Vertical CR80 Badges
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active 24h Cards
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.activeCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-500" />
            Retention Window
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Expiring Soon (&lt;3h)
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.expiringSoonCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-amber-500" />
            Auto-purge scheduled
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Data Retention
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">24 Hours</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            Automatic Server Purge
          </div>
        </div>
      </div>

      {/* Administrative Schema Not Ready Notice */}
      {schemaError?.isSchemaNotReady && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm">ID Card Database Setup Incomplete (HTTP 503)</div>
            <p className="text-muted-foreground leading-relaxed">
              {schemaError.message}
            </p>
            <div className="text-[11px] font-mono bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded inline-block">
              Pending migrations: 20261102_temporary_employee_id_cards.sql &bull; 20261104_atomic_employee_code_allocation.sql
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ACTIVE_CARDS' ? (
        <TemporaryCardsTable
          cards={cards}
          loading={loadingCards}
          onRefresh={fetchCards}
          onDeleteSuccess={fetchCards}
          schemaError={schemaError?.message || null}
        />
      ) : (
        /* MAIN WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Controls, Selector & Details Form (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {/* 1. Employee Selector */}
            <EmployeeSelector
              onSelectEmployee={handleSelectEmployee}
              selectedEmployeeId={selectedEmployeeId}
            />

            {/* 2. Photo Cropper & Adjuster */}
            <EmployeePhotoCropper
              currentPhotoUrl={photoUrl}
              onPhotoProcessed={dataUrl => setPhotoUrl(dataUrl)}
              employeeName={employeeName || 'Employee'}
              cropShape={designType === 'CORPORATE_ELITE' ? 'circle' : 'rect'}
            />

            {/* 3. Card Details Inputs */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3.5 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 pb-2 border-b border-border">
                <Sliders className="w-4 h-4 text-blue-600" />
                Employee Identity Details
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Employee ID</Label>
                  <Input
                    value={employeeCode}
                    onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
                    className="font-mono text-xs h-8"
                    placeholder="e.g. HRK-001"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    value={employeeName}
                    onChange={e => setEmployeeName(e.target.value)}
                    className="text-xs h-8 font-medium"
                    placeholder="Select an employee..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Designation</Label>
                  <Input
                    value={designation}
                    onChange={e => setDesignation(e.target.value)}
                    className="text-xs h-8"
                    placeholder="Designation"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Input
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="text-xs h-8"
                    placeholder="Department"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Official Email</Label>
                  <Input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="font-mono text-xs h-8"
                    placeholder="official@haryak.com"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="font-mono text-xs h-8"
                    placeholder="+91..."
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Work Location</Label>
                <Input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="text-xs h-8"
                  placeholder="Location"
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Design Selector, Realistic Preview, & Export Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Design Template Selector: Two Vertical Portrait Choices */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Select Vertical ID Badge Design
                </label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  VERTICAL CR80 (53.98 × 85.60 MM)
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
                      <span className="text-xs font-bold text-foreground truncate">Design 01 — Royal Corporate Identity</span>
                      {designType === 'CORPORATE_ELITE' && (
                        <CheckCircle2 className="w-4 h-4 text-[#4A55B6] flex-shrink-0" />
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[8.5px] font-mono mb-1 bg-indigo-100 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200">
                      ROYAL &amp; LAVENDER
                    </Badge>
                    <p className="text-[10.5px] text-muted-foreground leading-snug">
                      Royal blue and lavender identity card with flowing geometric forms and a circular employee portrait.
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
                      <span className="text-xs font-bold text-foreground truncate">Design 02 — Modern Azure Corporate Identity</span>
                      {designType === 'MODERN_EXECUTIVE' && (
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[8.5px] font-mono mb-1 bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200">
                      AZURE &amp; WHITE
                    </Badge>
                    <p className="text-[10.5px] text-muted-foreground leading-snug">
                      Premium white and vibrant blue identity card with an elegant rectangular employee portrait and structured corporate information.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* REALISTIC CARD PREVIEW CONTAINER */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-foreground">Realistic Physical Card Preview</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    53.98 × 85.60 MM (CR80)
                  </Badge>
                </div>

                <div className="text-[11px] text-muted-foreground font-mono">
                  300 DPI Target • Portrait Only
                </div>
              </div>

              {/* Realistic Neutral Preview Canvas */}
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

              {/* Actions & Export Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="default"
                  onClick={handleGenerateAndSave}
                  disabled={generating || !employeeName}
                  className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold h-9"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Generating CR80 Assets...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Generate &amp; Save 24h ID Card
                    </>
                  )}
                </Button>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadPng}
                    disabled={exportingPng || !employeeName}
                    className="text-xs h-9 flex-1 sm:flex-none"
                    title="Export print-ready CR80 PNG (638 × 1011 px, 300 DPI)"
                  >
                    <ImageIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                    {exportingPng ? 'Rendering...' : 'Download PNG'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadPrintPdf}
                    disabled={exportingPdf || !employeeName}
                    className="text-xs h-9 flex-1 sm:flex-none"
                    title="Export 300 DPI print-ready CR80 portrait PDF (53.98 × 85.60 mm)"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                    {exportingPdf ? 'Exporting...' : 'Print PDF (300 DPI)'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePrint}
                    disabled={!employeeName}
                    className="text-xs h-9 flex-1 sm:flex-none"
                    title="Print card directly without dashboard navigation"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-700 dark:text-slate-200" />
                    Print
                  </Button>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground text-center pt-1 border-t border-border/40">
                Notice: Generated ID cards and export files are permanently deleted after exactly 24 hours.
              </div>
            </div>
          </div>
        </div>
      )}

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
