'use client'

import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Download, Printer, Share2, CheckCircle, ShieldCheck } from 'lucide-react'
import { PayslipTemplate, type PayslipData } from '@/components/payslip/payslip-template'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export default function PayslipViewPage() {
  const params = useParams()
  const payslipId = params?.id as string || 'HRK-511-AUG-2026'

  // Fictional Reference-Compliant Data Model (matching official structure)
  const payslipData: PayslipData = {
    companyName: 'Haryak Technologies India Private Limited',
    companyTagline: "Empowering Tomorrow's Solutions, Today",
    companyLogoUrl: '/logo.jpg',
    companyWebsite: 'https://haryak.com',
    
    employeeName: 'Chaganti Jai Sai Ramcharan Teja',
    employeeId: 'HRK-511',
    designation: 'Junior Software Developer',
    department: 'Software Development',
    
    payPeriod: '01 Aug 2026 - 31 Aug 2026',
    payMonth: 'August 2026',
    paidDays: 30,
    lopDays: 0,
    dateOfJoining: '15-Jan-2024',
    paymentMode: 'Bank Transfer',
    
    earnings: [
      { name: 'Basic Salary', amount: 49615 },
      { name: 'House Rent Allowance (HRA)', amount: 2500 },
      { name: 'Personal / Special Allowance', amount: 1252 },
      { name: 'Other Allowance', amount: 1569 },
      { name: 'City / Location Allowance', amount: 0 },
      { name: 'Conveyance Allowance', amount: 0 },
      { name: 'Performance Pay / Incentive', amount: 0 },
    ],
    
    deductions: [
      { name: 'Provident Fund (PF)', amount: 1822 },
      { name: 'Professional Tax (PT)', amount: 200 },
      { name: 'Income Tax (TDS)', amount: 0, hasNote: true, noteSymbol: '*' },
      { name: 'Other Deductions', amount: 0 },
    ],
    
    grossEarnings: 56958,
    totalDeductions: 2022,
    netSalary: 54936,
    
    annualCTC: 683496,
    ytdGrossEarnings: 56958,
    ytdPFContribution: 1822,
    ytdProfessionalTax: 200,
    ytdIncomeTax: 0,
    ytdNetPay: 54936,
    
    pan: 'ABCDE1234F',
    uanOrPFNo: '100987654321',
    bankName: 'AXIS BANK',
    bankAccountNo: '91234567898931',
    
    tdsNote: 'TDS is shown as Rs. 0 for this draft payroll statement. Actual withholding, if applicable, must follow the employee\'s tax computation and payroll records.',
    disclaimer: 'This is a system-generated payslip and does not require a signature or company stamp.',
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = () => {
    toast.info('Preparing official Haryak PDF print view...')
    window.print()
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Payslip link copied to clipboard.')
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar (hidden on print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <Link 
            href="/payslips" 
            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Payslips
          </Link>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs">
            <ShieldCheck className="w-3 h-3 mr-1" /> Immutable Snapshot
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShare} className="text-xs">
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Share Link
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs">
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>
          <Button 
            size="sm" 
            onClick={handleDownloadPDF} 
            className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Render Official Payslip Template */}
      <div className="bg-white p-4 sm:p-8 rounded-xl border shadow-md max-w-4xl mx-auto print:p-0 print:border-0 print:shadow-none">
        <PayslipTemplate data={payslipData} />
      </div>
    </div>
  )
}
