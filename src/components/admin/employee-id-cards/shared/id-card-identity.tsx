import React from 'react'
import { ShieldCheckIcon } from './id-card-icons'

interface IDCardIdentityProps {
  employeeName: string
  designation: string
  employeeCode: string
  department?: string
  variant: 'royal' | 'azure'
  style?: React.CSSProperties
}

export function IDCardIdentity({
  employeeName,
  designation,
  employeeCode,
  department,
  variant,
  style,
}: IDCardIdentityProps) {
  const displayName = employeeName || 'Chegondi Charan'
  const displayDesig = designation || 'Software Engineer'
  const displayCode = employeeCode || 'HRK-001'
  const displayDept = department || 'Software Development'

  // Dynamic font sizing for long names ensuring the complete name remains visible without ellipsis
  const nameFontSize =
    displayName.length > 30
      ? '13.5px'
      : displayName.length > 24
      ? '15px'
      : displayName.length > 18
      ? '17px'
      : displayName.length > 13
      ? '19.5px'
      : '22px'

  // Dynamic font sizing for long designations
  const desigFontSize =
    displayDesig.length > 30
      ? '11.5px'
      : displayDesig.length > 22
      ? '12px'
      : variant === 'royal'
      ? '13.5px'
      : '12.5px'

  if (variant === 'royal') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {/* Full Name - Complete name rendered without ellipsis */}
        <h2
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: nameFontSize,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.18,
            textAlign: 'center',
            maxWidth: '320px',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            margin: 0,
            textShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          {displayName}
        </h2>

        {/* Designation */}
        <p
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: desigFontSize,
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.95)',
            lineHeight: 1.2,
            marginTop: '4px',
            marginBottom: 0,
            textAlign: 'center',
            maxWidth: '320px',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          {displayDesig}
        </p>

        {/* Employee Code */}
        <p
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.85)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginTop: '4px',
            marginBottom: 0,
            textAlign: 'center',
          }}
        >
          {displayCode}
        </p>
      </div>
    )
  }

  // Modern Azure Variant (Design 02)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Full Name - Complete name rendered without ellipsis */}
      <h2
        style={{
          fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: nameFontSize,
          fontWeight: 800,
          color: '#0F172A',
          lineHeight: 1.18,
          letterSpacing: '-0.3px',
          maxWidth: '320px',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {displayName}
      </h2>

      {/* Designation */}
      <p
        style={{
          fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: desigFontSize,
          fontWeight: 600,
          color: '#2563EB',
          lineHeight: 1.2,
          marginTop: '3px',
          marginBottom: 0,
          textAlign: 'center',
          maxWidth: '320px',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {displayDesig}
      </p>

      {/* Employee ID Monospace Badge */}
      <div
        style={{
          marginTop: '5px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 10px',
          borderRadius: '5px',
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
        }}
      >
        <ShieldCheckIcon size={12} color="#2563EB" />
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '10.5px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#1D4ED8',
            textTransform: 'uppercase',
          }}
        >
          {displayCode}
        </span>
      </div>

      {/* Department Label */}
      <div style={{ marginTop: '3px' }}>
        <span
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: '9.5px',
            fontWeight: 600,
            letterSpacing: '1px',
            color: '#64748B',
            textTransform: 'uppercase',
          }}
        >
          {displayDept}
        </span>
      </div>
    </div>
  )
}
