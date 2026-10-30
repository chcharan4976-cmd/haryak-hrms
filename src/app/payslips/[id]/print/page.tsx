'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { PayslipTemplate, PayslipData } from '@/components/payslip/payslip-template'
import { downloadOfficialPayslipPdf } from '@/lib/pdf/generate-payslip-pdf'
import { Printer, Download, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function PayslipPrintPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params?.id as string
  const auto = searchParams.get('auto') === 'true'

  const [payslipData, setPayslipData] = useState<PayslipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  useEffect(() => {
    const fetchPayslip = async () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        let res = await fetch(`/api/payslips/${id}`)
        let data = await res.json()

        // If not found by ID directly, try looking up employee's latest payslip
        if (!res.ok || !data.payslip) {
          const listRes = await fetch(`/api/payslips?search=${encodeURIComponent(id)}`)
          const listData = await listRes.json()
          const matched = listData.payslips?.find((p: any) => 
            p.id === id || p.employee?.code?.toUpperCase() === id.toUpperCase() || p.employee_id === id
          )
          if (matched) {
            res = await fetch(`/api/payslips/${matched.id}`)
            data = await res.json()
          }
        }

        if (!data.payslip || !data.payslip.snapshot_data) {
          setErrorMessage('No finalized payslip record found for this request. Payslips are only generated and viewable after payroll finalization.')
          setPayslipData(null)
          return
        }

        const snapshot = data.payslip.snapshot_data
        const empCode = snapshot.employeeId || data.payslip.employees?.employee_code || id
        const empName = snapshot.employeeName || data.payslip.employees?.full_name || 'Employee'

        // Construct clean PayslipData from immutable snapshot
        const reconstructed: PayslipData = {
          companyName: 'Haryak Technologies India Private Limited',
          companyTagline: "Empowering Tomorrow's Solutions, Today",
          companyLogoUrl: '/logo.jpg',
          companyWebsite: 'https://haryak.com',
          employeeName: empName,
          employeeId: empCode,
          designation: snapshot.designation || 'Not assigned',
          department: snapshot.department || 'Not assigned',
          payPeriod: snapshot.payPeriod || `${String(data.payslip.period_month).padStart(2, '0')}/${data.payslip.period_year}`,
          payMonth: snapshot.payMonth || `${new Date(data.payslip.period_year, data.payslip.period_month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`,
          paidDays: Number(snapshot.paidDays ?? 0),
          lopDays: Number(snapshot.lopDays ?? 0),
          dateOfJoining: snapshot.dateOfJoining || snapshot.joiningDate || 'Not provided',
          paymentMode: snapshot.paymentMode || 'Direct Bank Transfer',
          earnings: Array.isArray(snapshot.earnings) ? snapshot.earnings.map((e: any) => ({
            name: e.componentName || e.name,
            amount: Number(e.finalAmount ?? e.amount ?? 0),
          })) : [],
          deductions: Array.isArray(snapshot.deductions) ? snapshot.deductions.map((d: any) => ({
            name: d.componentName || d.name,
            amount: Number(d.amount ?? 0),
          })) : [],
          grossEarnings: Number(snapshot.grossEarnings ?? data.payslip.gross_earnings ?? 0),
          totalDeductions: Number(snapshot.totalDeductions ?? data.payslip.total_deductions ?? 0),
          netSalary: Number(snapshot.netSalary ?? data.payslip.net_salary ?? 0),
          annualCTC: Number(snapshot.annualCTC ?? 0),
          ytdGrossEarnings: Number(snapshot.ytdGrossEarnings ?? snapshot.grossEarnings ?? 0),
          ytdPFContribution: Number(snapshot.ytdPFContribution ?? 0),
          ytdProfessionalTax: Number(snapshot.ytdProfessionalTax ?? 0),
          ytdIncomeTax: Number(snapshot.ytdIncomeTax ?? 0),
          ytdNetPay: Number(snapshot.ytdNetPay ?? snapshot.netSalary ?? 0),
          pan: snapshot.pan || 'Not provided',
          uanOrPFNo: snapshot.uanOrPFNo || 'Not provided',
          bankName: snapshot.bankName || 'Not provided',
          bankAccountNo: snapshot.bankAccountNo || 'Not provided',
          disclaimer: 'This is an official system-generated payslip deriving from the approved payroll snapshot.',
        }

        setPayslipData(reconstructed)
      } catch (err: any) {
        console.error('Error loading payslip print data:', err)
        setErrorMessage('Failed to load payslip: ' + (err.message || 'Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    fetchPayslip()
  }, [id])

  useEffect(() => {
    if (!loading && payslipData && auto) {
      setTimeout(() => {
        window.print()
      }, 500)
    }
  }, [loading, payslipData, auto])

  const handleDownloadPdf = async () => {
    if (!payslipData) return
    setIsGeneratingPdf(true)
    try {
      await downloadOfficialPayslipPdf('payslip-container', {
        employeeId: payslipData.employeeId,
        payMonth: payslipData.payMonth,
      })
      toast.success('Official PDF generated and downloaded!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground space-y-2">
        <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78]" />
        <p className="text-xs text-muted-foreground">Preparing official employee payslip...</p>
      </div>
    )
  }

  if (!payslipData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-background">
        <div className="max-w-md p-6 bg-card border rounded-xl shadow-sm space-y-4">
          <p className="text-sm font-semibold text-foreground">Payslip Not Available</p>
          <p className="text-xs text-muted-foreground">
            {errorMessage || 'No finalized payslip record exists for this employee. Payslips are only available after payroll finalization and approval.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => router.back()} className="text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Return
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-4 sm:py-6 print:py-0 print:bg-white">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="max-w-[800px] mx-auto mb-4 px-3 sm:px-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button
          variant="outline"
          size="sm"
          className="text-xs bg-white text-gray-800 h-8 sm:h-9"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-white text-gray-800 h-8 sm:h-9"
            onClick={() => window.print()}
          >
            <Printer className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Print Document</span>
            <span className="sm:hidden">Print</span>
          </Button>

          <Button
            size="sm"
            className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm h-8 sm:h-9"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">{isGeneratingPdf ? 'Generating PDF...' : 'Download Official PDF'}</span>
            <span className="sm:hidden">{isGeneratingPdf ? 'PDF...' : 'PDF'}</span>
          </Button>
        </div>
      </div>

      {/* Payslip Document Canvas */}
      <div className="max-w-[800px] mx-auto bg-white shadow-md border rounded-lg print:shadow-none print:border-none print:rounded-none overflow-x-auto print:overflow-visible">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 8mm 10mm;
            }
            body {
              background: #ffffff !important;
              color: #000000 !important;
              font-size: 12px;
            }
            #payslip-container {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              height: auto !important;
            }
          }
        `}} />
        <PayslipTemplate data={payslipData} />
      </div>
    </div>
  )
}
