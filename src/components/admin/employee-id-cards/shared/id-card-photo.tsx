import React from 'react'

interface IDCardPhotoProps {
  photoUrl?: string | null
  employeeName: string
  variant: 'circle' | 'rect'
  style?: React.CSSProperties
}

export function IDCardPhoto({
  photoUrl,
  employeeName,
  variant,
  style,
}: IDCardPhotoProps) {
  const initials =
    employeeName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || 'E'

  if (variant === 'circle') {
    return (
      <div
        style={{
          width: '156px',
          height: '156px',
          borderRadius: '9999px',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          border: '4px solid #FFFFFF',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={employeeName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top',
              display: 'block',
            }}
            crossOrigin="anonymous"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#DADDF0',
              color: '#4A55B6',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: '44px',
              fontWeight: 800,
              letterSpacing: '1px',
              userSelect: 'none',
            }}
          >
            {initials}
          </div>
        )}
      </div>
    )
  }

  // Rectangular Portrait (Design 02)
  return (
    <div
      style={{
        width: '126px',
        height: '152px',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        border: '3px solid #FFFFFF',
        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={employeeName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            display: 'block',
          }}
          crossOrigin="anonymous"
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#EFF6FF',
            color: '#1E40AF',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: '40px',
            fontWeight: 800,
            letterSpacing: '1px',
            userSelect: 'none',
          }}
        >
          {initials}
        </div>
      )}
    </div>
  )
}
