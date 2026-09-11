/**
 * Haryak Technologies India Private Limited — Payslip Template Component
 * 
 * Data-driven payslip layout matching the official Haryak Technologies reference.
 * Renders as HTML for preview and can be converted to PDF.
 * 
 * Layout reference:
 * - Company header with logo and tagline
 * - PAY STATEMENT title with month/year
 * - Employee Details | Payroll Details (side by side)
 * - Monthly Pay Breakdown (Earnings | Deductions table)
 * - Net Salary Payable with amount in words
 * - Payroll & Tax Information (Annual CTC, YTD values)
 * - Statutory & Bank Details (masked)
 * - Disclaimer footnote
 */

'use client'

import React from 'react'
import { formatCurrency, formatINR, maskPAN, maskBankAccount } from '@/lib/utils/format'
import { amountToWords } from '@/lib/utils/amount-to-words'

export interface PayslipData {
  // Company
  companyName: string
  companyTagline: string
  companyLogoUrl?: string
  companyWebsite: string
  
  // Employee
  employeeName: string
  employeeId: string
  designation: string
  department: string
  
  // Payroll Period
  payPeriod: string // "01 Aug 2026 - 31 Aug 2026"
  payMonth: string // "August 2026"
  paidDays: number
  lopDays: number
  dateOfJoining: string
  paymentMode: string
  
  // Earnings
  earnings: {
    name: string
    amount: number
  }[]
  
  // Deductions
  deductions: {
    name: string
    amount: number
    hasNote?: boolean
    noteSymbol?: string
  }[]
  
  // Totals
  grossEarnings: number
  totalDeductions: number
  netSalary: number
  
  // Payroll & Tax
  annualCTC: number
  ytdGrossEarnings: number
  ytdPFContribution: number
  ytdProfessionalTax: number
  ytdIncomeTax: number
  ytdNetPay: number
  
  // Statutory & Bank
  pan: string // will be masked
  uanOrPFNo: string
  bankName: string
  bankAccountNo: string // will be masked
  
  // Notes
  tdsNote?: string
  disclaimer?: string
}

// Standard earning component names for display
const EARNING_LABELS = [
  'Basic Salary',
  'House Rent Allowance (HRA)',
  'Personal / Special Allowance',
  'Other Allowance',
  'City / Location Allowance',
  'Conveyance Allowance',
  'Performance Pay / Incentive',
]

const DEDUCTION_LABELS = [
  'Provident Fund (PF)',
  'Professional Tax (PT)',
  'Income Tax (TDS)',
  'Other Deductions',
]

export function PayslipTemplate({ data }: { data: PayslipData }) {
  const maskedPAN = maskPAN(data.pan)
  const maskedBank = maskBankAccount(data.bankAccountNo)
  const amountInWords = amountToWords(data.netSalary)
  
  // Render strictly the actual earnings and deductions from the employee snapshot
  const earningRows = Array.isArray(data.earnings) ? data.earnings : []
  const deductionRows = Array.isArray(data.deductions) ? data.deductions : []
  const maxRows = Math.max(earningRows.length, deductionRows.length, 1)

  return (
    <div
      id="payslip-container"
      className="bg-white text-gray-900 max-w-[800px] mx-auto"
      style={{ fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", fontSize: '13px', lineHeight: '1.5' }}
    >
      {/* Company Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 border-b-2"
        style={{ borderColor: '#1e2a78' }}
      >
        {data.companyLogoUrl && (
          <img
            src={data.companyLogoUrl}
            alt={data.companyName}
            className="w-16 h-16 object-contain"
          />
        )}
        <div>
          <h1
            className="text-xl font-bold tracking-wide"
            style={{ color: '#1e2a78' }}
          >
            {data.companyName}
          </h1>
          <p className="text-xs italic text-gray-500">{data.companyTagline}</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-5">
        {/* PAY STATEMENT */}
        <div>
          <h2 className="text-lg font-bold text-gray-900">PAY STATEMENT</h2>
          <p className="text-xs text-gray-600">
            {data.payMonth} | Monthly Payroll
          </p>
        </div>

        {/* Employee Details | Payroll Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <SectionHeader>EMPLOYEE DETAILS</SectionHeader>
            <DetailTable>
              <DetailRow label="Employee Name" value={data.employeeName} />
              <DetailRow label="Employee ID" value={data.employeeId} />
              <DetailRow label="Designation" value={data.designation} />
              <DetailRow label="Department" value={data.department} />
            </DetailTable>
          </div>
          <div>
            <SectionHeader>PAYROLL DETAILS</SectionHeader>
            <DetailTable>
              <DetailRow label="Pay Period" value={data.payPeriod} />
              <DetailRow
                label="Paid Days / LOP"
                value={`${data.paidDays} / ${data.lopDays}`}
              />
              <DetailRow label="Date of Joining" value={data.dateOfJoining} />
              <DetailRow label="Payment Mode" value={data.paymentMode} />
            </DetailTable>
          </div>
        </div>

        {/* Monthly Pay Breakdown */}
        <div>
          <SectionHeader>MONTHLY PAY BREAKDOWN</SectionHeader>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ backgroundColor: '#1e2a78', color: 'white' }}>
                <th className="text-left px-3 py-2 font-semibold">EARNINGS</th>
                <th className="text-right px-3 py-2 font-semibold">AMOUNT (INR)</th>
                <th className="text-left px-3 py-2 font-semibold border-l border-blue-400">DEDUCTIONS</th>
                <th className="text-right px-3 py-2 font-semibold">AMOUNT (INR)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, i) => {
                const earning = earningRows[i]
                const deduction = deductionRows[i]
                return (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="px-3 py-1.5 text-gray-700">
                      {earning?.name || ''}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-900 font-medium">
                      {earning != null ? (earning.amount > 0 ? earning.amount.toLocaleString('en-IN') : '0') : ''}
                    </td>
                    <td className="px-3 py-1.5 text-gray-700 border-l border-gray-200">
                      {deduction?.name || ''}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-900 font-medium">
                      {deduction != null ? (
                        <>
                          {deduction.amount > 0 ? deduction.amount.toLocaleString('en-IN') : '0'}
                          {deduction.noteSymbol && (
                            <sup className="text-xs text-red-500">{deduction.noteSymbol}</sup>
                          )}
                        </>
                      ) : ''}
                    </td>
                  </tr>
                )
              })}
              {/* Totals Row */}
              <tr
                className="font-bold"
                style={{ backgroundColor: '#EEF0FF', borderTop: '2px solid #1e2a78' }}
              >
                <td className="px-3 py-2 text-gray-900">TOTAL GROSS EARNINGS</td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {data.grossEarnings.toLocaleString('en-IN')}
                </td>
                <td className="px-3 py-2 text-gray-900 border-l border-gray-300">
                  TOTAL DEDUCTIONS
                </td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {data.totalDeductions.toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Net Salary Payable */}
        <div
          className="border-2 rounded-md px-4 py-3 flex justify-between items-center"
          style={{ borderColor: '#1e2a78', backgroundColor: '#F0F1FF' }}
        >
          <div>
            <p className="font-bold text-sm text-gray-900">NET SALARY PAYABLE</p>
            <p className="text-xs text-gray-700">
              <span className="font-semibold">Rupees</span>{' '}
              <span className="italic">{amountInWords.replace('Rupees ', '').replace(' Only', '')}</span>{' '}
              <span className="font-semibold">Only</span>
            </p>
          </div>
          <div
            className="text-xl font-bold"
            style={{ color: '#1e2a78' }}
          >
            {formatINR(data.netSalary)}
          </div>
        </div>

        {/* Payroll & Tax Information */}
        <div>
          <SectionHeader>PAYROLL & TAX INFORMATION</SectionHeader>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">Annual CTC</span>
              <span className="font-medium">{formatINR(data.annualCTC)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">YTD Gross Earnings</span>
              <span className="font-medium">{formatINR(data.ytdGrossEarnings)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">YTD PF Contribution</span>
              <span className="font-medium">{formatINR(data.ytdPFContribution)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">YTD Professional Tax</span>
              <span className="font-medium">{formatINR(data.ytdProfessionalTax)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">YTD Income Tax (TDS)</span>
              <span className="font-medium">{formatINR(data.ytdIncomeTax)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">YTD Net Pay</span>
              <span className="font-medium">{formatINR(data.ytdNetPay)}</span>
            </div>
          </div>
        </div>

        {/* Statutory & Bank Details */}
        <div>
          <SectionHeader>STATUTORY & BANK DETAILS</SectionHeader>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">PAN</span>
              <span className="font-medium font-mono">{maskedPAN}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">Bank Name</span>
              <span className="font-medium">{data.bankName}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">UAN / PF No.</span>
              <span className="font-medium font-mono">{data.uanOrPFNo || '-'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-600">Bank Account No.</span>
              <span className="font-medium font-mono">{maskedBank}</span>
            </div>
          </div>
        </div>

        {/* TDS Note */}
        {data.tdsNote && (
          <p className="text-[10px] text-gray-500 italic">
            * {data.tdsNote}
          </p>
        )}

        {/* Disclaimer & Audit Trail */}
        <div className="text-center pt-2 border-t border-gray-200 space-y-1">
          <p className="text-[11px] text-gray-500 italic">
            {data.disclaimer || (
              <>
                This is a system-generated <span className="font-bold text-gray-700">payslip</span> and does not require a physical signature or company stamp.
              </>
            )}
          </p>
          <p className="text-[9px] text-gray-400 font-mono">
            Issued By: Haryak Technologies India Private Limited • Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #ffffff !important;
          }
          #payslip-container {
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs font-bold px-3 py-1.5 mb-2 rounded-sm"
      style={{ backgroundColor: '#1e2a78', color: 'white' }}
    >
      {children}
    </div>
  )
}

function DetailTable({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-xs">
      <tbody>{children}</tbody>
    </table>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-1.5 text-gray-500 w-[45%]">{label}</td>
      <td className="py-1.5 text-gray-900 font-medium">{value}</td>
    </tr>
  )
}

export default PayslipTemplate
