'use client'

import React from 'react'
import { HARYAK_WHITE_LOGO_BASE64 } from '@/lib/assets/brand-logo'
import { IDCardData } from './types'
import { IDCardPhoto } from './shared/id-card-photo'
import { IDCardIdentity } from './shared/id-card-identity'
import { RoyalContactPanel } from './shared/id-card-contact'

export type { IDCardData } from './types'

export interface CorporateEliteTemplateProps {
  data: IDCardData
  id?: string
  scale?: number
}

/**
 * DESIGN 01 — ROYAL CORPORATE IDENTITY
 * Standard CR80 Physical Dimensions: 53.98 mm × 85.60 mm (Portrait, Aspect Ratio: 1 : 1.58577)
 * Canonical Screen Scale Reference: 380px × 602px
 *
 * Professional Royal Blue and Lavender Identity:
 * - Geometric lavender pattern with top-left ripple arcs
 * - Top-right company logo and centered company name
 * - Circular employee photograph
 * - Centered employee name, designation, and ID code
 * - Bottom lavender contact panel with Phone, Email, and Website with Globe icon
 * - Globe/website removed from vertical right side
 */
export function CorporateEliteTemplate({
  data,
  id = 'id-card-corporate-elite',
  scale = 1,
}: CorporateEliteTemplateProps) {
  const {
    employeeName = '',
    employeeCode = '',
    designation = '',
    phone = '',
    email = '',
    photoUrl = null,
    companyName = 'Haryak Technologies India Private Limited',
    companyWebsite = 'www.haryak.com',
  } = data

  const displayName = employeeName || 'Chegondi Charan'
  const displayCode = employeeCode || 'HRK-001'
  const displayDesig = designation || 'Software Engineer'
  const displayPhone = phone || '+91 6302 355 693'
  const displayEmail = email || 'charan@haryak.com'
  const displayWebsite = companyWebsite || 'www.haryak.com'
  const displayCompany = companyName || 'Haryak Technologies India Private Limited'

  return (
    <div
      id={id}
      style={{
        width: '380px',
        height: '602px',
        position: 'relative',
        backgroundColor: '#4A55B6',
        color: '#FFFFFF',
        borderRadius: '24px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        userSelect: 'none',
      }}
      className="relative overflow-hidden rounded-[24px] bg-[#4A55B6] text-white flex flex-col justify-between font-sans select-none"
    >
      {/* ============================================================
          EXPLICIT SOLID ROYAL BLUE BASE LAYER & DECORATIVE GEOMETRIC SHAPES
          Guarantees 100% solid opacity across preview, PNG export, PDF, and print
      ============================================================ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#4A55B6',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 380 602' fill='none'%3E%3Cpath d='M 0,0 L 179,0 L 179,150 Q 179,175 145,185 C 95,198 58,230 58,283 C 58,306 42,318 0,318 Z' fill='%23DADDF0'/%3E%3Ccircle cx='-10' cy='-10' r='140' stroke='%234950A1' stroke-width='26' fill='none'/%3E%3Ccircle cx='-10' cy='-10' r='105' stroke='%23DADDF0' stroke-width='20' fill='none'/%3E%3Ccircle cx='-10' cy='-10' r='85' fill='%234A55B6'/%3E%3C/svg%3E")`,
          backgroundSize: '380px 602px',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top left',
          zIndex: 0,
        }}
      />

      {/* ============================================================
          GEOMETRIC LAVENDER SHAPE & TOP-LEFT ARCS (VECTOR OVERLAY)
      ============================================================ */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '380px',
          height: '602px',
          pointerEvents: 'none',
          zIndex: 1,
        }}
        viewBox="0 0 380 602"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main top-left organic lavender body */}
        <path
          d="M 0,0 L 179,0 L 179,150 Q 179,175 145,185 C 95,198 58,230 58,283 C 58,306 42,318 0,318 Z"
          fill="#DADDF0"
        />

        {/* Top-left concentric rings matching royal identity */}
        {/* Outer dark royal-indigo ring arc */}
        <circle cx="-10" cy="-10" r="140" stroke="#4950A1" strokeWidth="26" fill="none" />
        {/* Lavender ring arc */}
        <circle cx="-10" cy="-10" r="105" stroke="#DADDF0" strokeWidth="20" fill="none" />
        {/* Royal blue inner corner */}
        <circle cx="-10" cy="-10" r="85" fill="#4A55B6" />
      </svg>

      {/* ============================================================
          TOP RIGHT HEADER: COMPANY LOGO EMBLEM & TITLE
      ============================================================ */}
      <div
        style={{
          position: 'absolute',
          right: '20px',
          top: '24px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '145px',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
        <div
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: '8px',
            fontWeight: 700,
            color: '#FFFFFF',
            textAlign: 'center',
            lineHeight: 1.25,
            letterSpacing: '0.25px',
            textTransform: 'uppercase',
            marginTop: '6px',
            maxWidth: '140px',
            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        >
          {displayCompany}
        </div>
      </div>

      {/* ============================================================
          UPPER-MIDDLE SECTION: CIRCULAR EMPLOYEE PHOTOGRAPH
          Centered at X = 190px (width 380px, left 112px, diameter 156px)
      ============================================================ */}
      <div
        style={{
          position: 'absolute',
          left: '112px',
          top: '200px',
          zIndex: 20,
        }}
      >
        <IDCardPhoto
          photoUrl={photoUrl}
          employeeName={displayName}
          variant="circle"
        />
      </div>

      {/* ============================================================
          MIDDLE SECTION: EMPLOYEE NAME, DESIGNATION & CODE
      ============================================================ */}
      <div
        style={{
          position: 'absolute',
          left: '24px',
          right: '24px',
          top: '368px',
          zIndex: 20,
        }}
      >
        <IDCardIdentity
          employeeName={displayName}
          designation={displayDesig}
          employeeCode={displayCode}
          variant="royal"
        />
      </div>

      {/* ============================================================
          BOTTOM SECTION: LIGHT-LAVENDER CURVED CONTACT PANEL
          Integrated Phone, Email, and Website with Globe Icon
      ============================================================ */}
      <RoyalContactPanel
        phone={displayPhone}
        email={displayEmail}
        website={displayWebsite}
      />
    </div>
  )
}
