'use client'

import React from 'react'
import { HARYAK_WHITE_LOGO_BASE64 } from '@/lib/assets/brand-logo'
import { IDCardData } from './types'
import { IDCardPhoto } from './shared/id-card-photo'
import { IDCardIdentity } from './shared/id-card-identity'
import { ModernContactSection } from './shared/id-card-contact'
import { GlobeIcon } from './shared/id-card-icons'

export interface ModernExecutiveTemplateProps {
  data: IDCardData
  id?: string
  scale?: number
}

/**
 * DESIGN 02 — MODERN AZURE CORPORATE IDENTITY
 * Standard CR80 Physical Dimensions: 53.98 mm × 85.60 mm (Portrait, Aspect Ratio: 1 : 1.58577)
 * Canonical Screen Scale Reference: 380px × 602px
 *
 * Professional Corporate Blueprint:
 * - Royal & Azure Blue header with cyan accent line
 * - Rectangular portrait employee photo with clean white frame
 * - Centered employee name, designation, and ID code
 * - Reconstructed structured corporate contact section with subtle row dividers:
 *     PHONE -> +91 98765 43210
 *     EMAIL -> thiru@haryak.com
 *     LOCATION -> Headquarters
 * - Integrated seamlessly into the card's crisp white body
 * - Balanced bottom company footer
 */
export function ModernExecutiveTemplate({
  data,
  id = 'id-card-modern-executive',
  scale = 1,
}: ModernExecutiveTemplateProps) {
  const {
    employeeName = '',
    employeeCode = '',
    designation = '',
    department = '',
    phone = '',
    email = '',
    location = '',
    companyAddress = '',
    photoUrl = null,
    companyName = '',
    companyWebsite = 'www.haryak.com',
  } = data

  const displayName = employeeName || 'Chegondi Charan'
  const displayCode = employeeCode || 'HRK-001'
  const displayDesig = designation || 'Software Engineer'
  const displayDept = department || 'Software Development'
  const displayPhone = phone || '+91 6302 355 693'
  const displayEmail = email || 'charan@haryak.com'
  const displayLoc = location || companyAddress || 'Headquarters'
  const displayWebsite = companyWebsite || 'www.haryak.com'
  const displayCompany =
    companyName && companyName !== 'Haryak Technologies India Private Limited'
      ? companyName
      : 'Haryak Technologies India Pvt. Ltd.'

  return (
    <div
      id={id}
      style={{
        width: '380px',
        height: '602px',
        position: 'relative',
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        borderRadius: '24px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: '1px solid #E2E8F0',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        userSelect: 'none',
      }}
      className="relative overflow-hidden rounded-[24px] bg-[#FFFFFF] from-[#FFFFFF] text-[#0F172A] flex flex-col justify-between font-sans select-none border border-slate-200/90"
    >
      {/* Explicit Solid White Base Layer (guarantees 100% solid opacity across preview, PNG, PDF, and print) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#FFFFFF',
          zIndex: 0,
        }}
      />

      {/* ============================================================
          ROYAL & AZURE BLUE HEADER
          Height = 108px with cyan accent baseline (#0EA5E9)
      ============================================================ */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '108px',
          background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
          color: '#FFFFFF',
          paddingTop: '16px',
          paddingLeft: '20px',
          paddingRight: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* Subtle decorative header wave background */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            opacity: 0.15,
          }}
          viewBox="0 0 380 108"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="340" cy="20" r="80" fill="#FFFFFF" />
          <circle cx="20" cy="90" r="60" fill="#FFFFFF" />
        </svg>

        <div
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <img
              src={HARYAK_WHITE_LOGO_BASE64}
              alt="Haryak Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              crossOrigin="anonymous"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                fontSize: '12.5px',
                fontWeight: 900,
                letterSpacing: '1.5px',
                color: '#FFFFFF',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              HARYAK TECHNOLOGIES
            </span>
            <span
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                fontSize: '7.5px',
                fontWeight: 600,
                letterSpacing: '1.2px',
                color: '#E0EEFF',
                textTransform: 'uppercase',
                marginTop: '2px',
              }}
            >
              India Private Limited
            </span>
          </div>
        </div>

        {/* Understated CORPORATE IDENTITY badge */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            marginTop: '8px',
            padding: '2px 12px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 255, 255, 0.18)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }}
        >
          <span
            style={{
              fontSize: '8px',
              fontWeight: 700,
              letterSpacing: '1.5px',
              color: '#F4F8FF',
              textTransform: 'uppercase',
            }}
          >
            CORPORATE IDENTITY
          </span>
        </div>

        {/* Cyan Accent Bottom Hairline */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            backgroundColor: '#0EA5E9',
          }}
        />
      </div>

      {/* ============================================================
          RECTANGULAR PORTRAIT EMPLOYEE PHOTOGRAPH
          Dimensions: 126px × 152px, rounded-xl with clean white frame
          Overlaps the bottom edge of the blue header
      ============================================================ */}
      <div
        style={{
          position: 'absolute',
          left: '127px',
          top: '70px',
          zIndex: 20,
        }}
      >
        <IDCardPhoto
          photoUrl={photoUrl}
          employeeName={displayName}
          variant="rect"
        />
      </div>

      {/* ============================================================
          EMPLOYEE IDENTITY SECTION
          Full Name, Designation, Clean Employee ID Badge, Department
      ============================================================ */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          paddingTop: '122px',
          paddingLeft: '24px',
          paddingRight: '24px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <IDCardIdentity
          employeeName={displayName}
          designation={displayDesig}
          employeeCode={displayCode}
          department={displayDept}
          variant="azure"
        />
      </div>

      {/* ============================================================
          RECONSTRUCTED STRUCTURED CONTACT INFORMATION SECTION
          Visually integrated with the white card body, with subtle dividers
      ============================================================ */}
      <div style={{ position: 'relative', zIndex: 10, marginTop: '12px', marginBottom: '8px' }}>
        <ModernContactSection
          phone={displayPhone}
          email={displayEmail}
          location={displayLoc}
        />
      </div>

      {/* ============================================================
          BALANCED AZURE & NAVY FOOTER
          Company name and website
      ============================================================ */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          height: '48px',
          backgroundColor: '#1E3A8A',
          color: '#FFFFFF',
          paddingLeft: '22px',
          paddingRight: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomLeftRadius: '23px',
          borderBottomRightRadius: '23px',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: '9px',
            fontWeight: 500,
            color: '#DCE7F6',
            letterSpacing: '0.2px',
          }}
        >
          {displayCompany}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F4F8FF' }}>
          <GlobeIcon size={12} color="#0EA5E9" />
          <span
            style={{
              fontSize: '9.5px',
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 600,
              letterSpacing: '0.5px',
              color: '#F4F8FF',
            }}
          >
            {displayWebsite}
          </span>
        </div>
      </div>
    </div>
  )
}
