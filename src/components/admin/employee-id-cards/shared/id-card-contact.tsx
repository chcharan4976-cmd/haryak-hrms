import React from 'react'
import { PhoneIcon, MailIcon, MapPinIcon, GlobeIcon } from './id-card-icons'

interface RoyalContactPanelProps {
  phone?: string
  email?: string
  website?: string
  style?: React.CSSProperties
}

/**
 * Design 01 — Royal Lavender Curved Contact Panel
 * Integrated bottom section with Phone, Email, and Website with Globe icon.
 */
export function RoyalContactPanel({
  phone = '+91 6302 355 693',
  email = 'charan@haryak.com',
  website = 'www.haryak.com',
  style,
}: RoyalContactPanelProps) {
  const displayPhone = phone || '+91 6302 355 693'
  const displayEmail = email || 'charan@haryak.com'
  const displayWebsite = website || 'www.haryak.com'

  const emailFontSize =
    displayEmail.length > 28
      ? '10px'
      : displayEmail.length > 22
      ? '11px'
      : '12px'

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '118px',
        backgroundColor: '#DADDF0',
        borderTopLeftRadius: '34px',
        borderTopRightRadius: '34px',
        padding: '16px 28px 14px 28px',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '280px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Row 1: Phone */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <PhoneIcon size={14} color="#4A55B6" />
          </div>
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
              color: '#3B428A',
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayPhone}
          </span>
        </div>

        {/* Row 2: Email */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MailIcon size={14} color="#4A55B6" />
          </div>
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: emailFontSize,
              fontWeight: 600,
              color: '#3B428A',
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayEmail}
          </span>
        </div>

        {/* Row 3: Website with Globe Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <GlobeIcon size={14} color="#4A55B6" />
          </div>
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
              color: '#3B428A',
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayWebsite}
          </span>
        </div>
      </div>
    </div>
  )
}

interface ModernContactSectionProps {
  phone?: string
  email?: string
  location?: string
  style?: React.CSSProperties
}

/**
 * Design 02 — Modern Azure Corporate Information Layout
 * Structured, balanced rows integrated with card body, with PHONE, EMAIL, LOCATION labels.
 */
export function ModernContactSection({
  phone = '+91 98765 43210',
  email = 'thiru@haryak.com',
  location = 'Headquarters',
  style,
}: ModernContactSectionProps) {
  const displayPhone = phone || '+91 98765 43210'
  const displayEmail = email || 'thiru@haryak.com'
  const displayLocation = location || 'Headquarters'

  const emailFontSize =
    displayEmail.length > 28
      ? '9.5px'
      : displayEmail.length > 22
      ? '10.5px'
      : '11.5px'

  return (
    <div
      style={{
        margin: '0 28px',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Row 1: PHONE */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 0',
          borderBottom: '1px solid #EEF2F6',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PhoneIcon size={13} color="#2563EB" />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
            flex: 1,
            paddingLeft: '10px',
          }}
        >
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '8.5px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              color: '#64748B',
              textTransform: 'uppercase',
              lineHeight: 1.15,
            }}
          >
            PHONE
          </span>
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '11.5px',
              fontWeight: 600,
              color: '#0F172A',
              letterSpacing: '-0.1px',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayPhone}
          </span>
        </div>
      </div>

      {/* Row 2: EMAIL */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 0',
          borderBottom: '1px solid #EEF2F6',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MailIcon size={13} color="#2563EB" />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
            flex: 1,
            paddingLeft: '10px',
          }}
        >
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '8.5px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              color: '#64748B',
              textTransform: 'uppercase',
              lineHeight: 1.15,
            }}
          >
            EMAIL
          </span>
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: emailFontSize,
              fontWeight: 600,
              color: '#0F172A',
              letterSpacing: '-0.1px',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayEmail}
          </span>
        </div>
      </div>

      {/* Row 3: LOCATION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 0',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MapPinIcon size={13} color="#2563EB" />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
            flex: 1,
            paddingLeft: '10px',
          }}
        >
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '8.5px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              color: '#64748B',
              textTransform: 'uppercase',
              lineHeight: 1.15,
            }}
          >
            LOCATION
          </span>
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '11.5px',
              fontWeight: 600,
              color: '#0F172A',
              letterSpacing: '-0.1px',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayLocation}
          </span>
        </div>
      </div>
    </div>
  )
}
