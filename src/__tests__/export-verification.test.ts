import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { jsPDF } from 'jspdf'
import { CorporateEliteTemplate } from '@/components/admin/employee-id-cards/corporate-elite-template'
import { ModernExecutiveTemplate } from '@/components/admin/employee-id-cards/modern-executive-template'
import { IDCardData } from '@/components/admin/employee-id-cards/types'

describe('Mandatory Export Verification Suite (Side-by-Side Fidelity)', () => {
  const outputDir = path.resolve(process.cwd(), 'storage/verification')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Load real employee photograph as Base64
  const photoPath = path.resolve(process.cwd(), 'public/test-employee-photo.jpg')
  const photoBuffer = fs.readFileSync(photoPath)
  const photoBase64 = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`

  const realEmployeeData: IDCardData = {
    employeeName: 'Thiruvenkatam M',
    employeeCode: 'HRK-001',
    designation: 'Lead HR & Operations Manager',
    department: 'Human Resources',
    phone: '+91 98765 43210',
    email: 'thiru@haryak.com',
    location: 'Headquarters',
    photoUrl: photoBase64,
    companyWebsite: 'www.haryak.com',
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const hasChrome = fs.existsSync(chromePath)

  it('renders Design 01 canonical HTML and verifies required structure', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CorporateEliteTemplate, {
        data: realEmployeeData,
        id: 'preview-corporate-elite',
      })
    )

    // 1. Employee photograph embedded as actual base64 image (not initials)
    expect(markup).toContain('data:image/jpeg;base64,')
    expect(markup).toContain('alt="Thiruvenkatam M"')

    // 2. Employee details
    expect(markup).toContain('Thiruvenkatam M')
    expect(markup).toContain('Lead HR &amp; Operations Manager')
    expect(markup).toContain('HRK-001')

    // 3. Contact information with phone, email, and website with globe icon
    expect(markup).toContain('+91 98765 43210')
    expect(markup).toContain('thiru@haryak.com')
    expect(markup).toContain('www.haryak.com')

    // 4. Verify vertical text on right edge is NOT present
    expect(markup).not.toContain('transform="rotate(-90')

    // 5. Card dimensions
    expect(markup).toContain('width:380px')
    expect(markup).toContain('height:602px')
  })

  it('renders Design 02 canonical HTML and verifies reconstructed corporate contact layout', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ModernExecutiveTemplate, {
        data: realEmployeeData,
        id: 'preview-modern-executive',
      })
    )

    // 1. Actual employee photograph
    expect(markup).toContain('data:image/jpeg;base64,')
    expect(markup).toContain('alt="Thiruvenkatam M"')

    // 2. Identity details
    expect(markup).toContain('Thiruvenkatam M')
    expect(markup).toContain('Lead HR &amp; Operations Manager')
    expect(markup).toContain('HRK-001')
    expect(markup).toContain('Human Resources')

    // 3. Reconstructed contact information section with PHONE, EMAIL, LOCATION labels
    expect(markup).toContain('PHONE')
    expect(markup).toContain('+91 98765 43210')
    expect(markup).toContain('EMAIL')
    expect(markup).toContain('thiru@haryak.com')
    expect(markup).toContain('LOCATION')
    expect(markup).toContain('Headquarters')

    // 4. Subtle row dividers
    expect(markup).toContain('border-bottom:1px solid #EEF2F6')

    // 5. Balanced company footer with website and globe
    expect(markup).toContain('Haryak Technologies India Pvt. Ltd.')
    expect(markup).toContain('www.haryak.com')

    // 6. Card dimensions
    expect(markup).toContain('width:380px')
    expect(markup).toContain('height:602px')
  })

  it('generates 300 DPI CR80 PDF for both designs with exact physical dimensions (53.98 x 85.60 mm)', () => {
    const widthMm = 53.98
    const heightMm = 85.60

    // Design 01 PDF
    const doc1 = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm],
      compress: true,
    })
    expect(doc1.internal.pageSize.getWidth()).toBeCloseTo(53.98, 2)
    expect(doc1.internal.pageSize.getHeight()).toBeCloseTo(85.60, 2)

    // Design 02 PDF
    const doc2 = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm],
      compress: true,
    })
    expect(doc2.internal.pageSize.getWidth()).toBeCloseTo(53.98, 2)
    expect(doc2.internal.pageSize.getHeight()).toBeCloseTo(85.60, 2)

    // Embed the 300 DPI high-res rendered card images into the CR80 PDFs
    const d1PngPath = path.join(outputDir, 'design01_downloaded_300dpi.png')
    const d2PngPath = path.join(outputDir, 'design02_downloaded_300dpi.png')

    if (fs.existsSync(d1PngPath)) {
      const d1DataUrl = `data:image/png;base64,${fs.readFileSync(d1PngPath).toString('base64')}`
      doc1.addImage(d1DataUrl, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST')
      const pdf1Buffer = Buffer.from(doc1.output('arraybuffer'))
      fs.writeFileSync(path.join(outputDir, 'design01_downloaded.pdf'), pdf1Buffer)
      expect(pdf1Buffer.length).toBeGreaterThan(15000)
    }

    if (fs.existsSync(d2PngPath)) {
      const d2DataUrl = `data:image/png;base64,${fs.readFileSync(d2PngPath).toString('base64')}`
      doc2.addImage(d2DataUrl, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST')
      const pdf2Buffer = Buffer.from(doc2.output('arraybuffer'))
      fs.writeFileSync(path.join(outputDir, 'design02_downloaded.pdf'), pdf2Buffer)
      expect(pdf2Buffer.length).toBeGreaterThan(15000)
    }
  })

  it('generates high-fidelity visual export artifacts (Preview, 300 DPI PNG, Print) via headless browser', { timeout: 60000 }, () => {
    if (!hasChrome) {
      console.warn('Chrome binary not found; skipping headless visual screenshot step.')
      return
    }

    const d1Markup = renderToStaticMarkup(
      React.createElement(CorporateEliteTemplate, {
        data: realEmployeeData,
        id: 'preview-corporate-elite',
      })
    )

    const d2Markup = renderToStaticMarkup(
      React.createElement(ModernExecutiveTemplate, {
        data: realEmployeeData,
        id: 'preview-modern-executive',
      })
    )

    // Helper to generate full HTML document with typography
    const makeHtmlPage = (cardMarkup: string, mode: 'preview' | 'export' | 'print') => {
      let bodyContent = ''
      let headStyles = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #0F172A; }
      `

      if (mode === 'preview') {
        bodyContent = `
          <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #F1F5F9; padding: 40px;">
            <div style="box-shadow: 0 25px 60px -15px rgba(0,0,0,0.3); border-radius: 24px;">
              ${cardMarkup}
            </div>
          </div>
        `
      } else if (mode === 'export') {
        // High-res 300 DPI card (rendered at 638 x 1011 px)
        headStyles = `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: transparent; width: 638px; height: 1011px; overflow: hidden; }
          .card-container {
            width: 380px;
            height: 602px;
            transform: scale(${638 / 380});
            transform-origin: top left;
          }
        `
        bodyContent = `<div class="card-container">${cardMarkup}</div>`
      } else if (mode === 'print') {
        // CR80 Print Output (53.98mm x 85.60mm)
        headStyles = `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page { size: 53.98mm 85.60mm portrait; margin: 0; }
          body { width: 53.98mm; height: 85.60mm; background: #FFFFFF; overflow: hidden; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-card-wrapper {
            width: 380px;
            height: 602px;
            transform: scale(0.53689);
            transform-origin: top left;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        `
        bodyContent = `<div class="print-card-wrapper">${cardMarkup}</div>`
      }

      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ID Card Verification</title>
  <style>${headStyles}</style>
</head>
<body>
  ${bodyContent}
</body>
</html>`
    }

    // 1. Generate Design 01 HTML files
    const d1PreviewHtml = path.join(outputDir, 'design01_preview.html')
    const d1ExportHtml = path.join(outputDir, 'design01_export.html')
    const d1PrintHtml = path.join(outputDir, 'design01_print.html')

    fs.writeFileSync(d1PreviewHtml, makeHtmlPage(d1Markup, 'preview'))
    fs.writeFileSync(d1ExportHtml, makeHtmlPage(d1Markup, 'export'))
    fs.writeFileSync(d1PrintHtml, makeHtmlPage(d1Markup, 'print'))

    // 2. Generate Design 02 HTML files
    const d2PreviewHtml = path.join(outputDir, 'design02_preview.html')
    const d2ExportHtml = path.join(outputDir, 'design02_export.html')
    const d2PrintHtml = path.join(outputDir, 'design02_print.html')

    fs.writeFileSync(d2PreviewHtml, makeHtmlPage(d2Markup, 'preview'))
    fs.writeFileSync(d2ExportHtml, makeHtmlPage(d2Markup, 'export'))
    fs.writeFileSync(d2PrintHtml, makeHtmlPage(d2Markup, 'print'))

    // 3. Capture Screenshots using Headless Chrome
    const d1PreviewPng = path.join(outputDir, 'design01_live_preview.png')
    const d1ExportPng = path.join(outputDir, 'design01_downloaded_300dpi.png')
    const d1PrintPng = path.join(outputDir, 'design01_print_preview.png')

    const d2PreviewPng = path.join(outputDir, 'design02_live_preview.png')
    const d2ExportPng = path.join(outputDir, 'design02_downloaded_300dpi.png')
    const d2PrintPng = path.join(outputDir, 'design02_print_preview.png')

    // Design 01 captures
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=540,760 --screenshot="${d1PreviewPng}" "${d1PreviewHtml}"`)
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=638,1011 --screenshot="${d1ExportPng}" "${d1ExportHtml}"`)
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=300,480 --screenshot="${d1PrintPng}" "${d1PrintHtml}"`)

    // Design 02 captures
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=540,760 --screenshot="${d2PreviewPng}" "${d2PreviewHtml}"`)
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=638,1011 --screenshot="${d2ExportPng}" "${d2ExportHtml}"`)
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=300,480 --screenshot="${d2PrintPng}" "${d2PrintHtml}"`)

    // Specific defect verification captures:
    // 1. "Vattem Thirupathi Rao" rendered without truncation in Design 02
    const longNameData: IDCardData = {
      employeeName: 'Vattem Thirupathi Rao',
      employeeCode: 'HRK-088',
      designation: 'Lead Operations & HR Manager',
      department: 'Corporate Human Resources',
      phone: '+91 98765 43210',
      email: 'vattem@haryak.com',
      location: 'Headquarters',
      photoUrl: photoBase64,
      companyWebsite: 'www.haryak.com',
    }
    const d2LongNameMarkup = renderToStaticMarkup(
      React.createElement(ModernExecutiveTemplate, {
        data: longNameData,
        id: 'preview-modern-executive-longname',
      })
    )
    const d2LongNameExportHtml = path.join(outputDir, 'design02_longname_export.html')
    fs.writeFileSync(d2LongNameExportHtml, makeHtmlPage(d2LongNameMarkup, 'export'))
    const d2LongNamePng = path.join(outputDir, 'design02_vattem_thirupathi_rao_300dpi.png')
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=638,1011 --screenshot="${d2LongNamePng}" "${d2LongNameExportHtml}"`)
    expect(fs.existsSync(d2LongNamePng)).toBe(true)

    // 2. Design 01 with initials avatar on solid background (no photo)
    const d1InitialsMarkup = renderToStaticMarkup(
      React.createElement(CorporateEliteTemplate, {
        data: { ...realEmployeeData, photoUrl: null },
        id: 'preview-corporate-elite-initials',
      })
    )
    const d1InitialsExportHtml = path.join(outputDir, 'design01_initials_export.html')
    fs.writeFileSync(d1InitialsExportHtml, makeHtmlPage(d1InitialsMarkup, 'export'))
    const d1InitialsPng = path.join(outputDir, 'design01_initials_avatar_300dpi.png')
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=638,1011 --screenshot="${d1InitialsPng}" "${d1InitialsExportHtml}"`)
    expect(fs.existsSync(d1InitialsPng)).toBe(true)

    // Verify all screenshot PNGs exist and have substantial file sizes (>10KB)
    expect(fs.existsSync(d1PreviewPng)).toBe(true)
    expect(fs.statSync(d1PreviewPng).size).toBeGreaterThan(15000)

    expect(fs.existsSync(d1ExportPng)).toBe(true)
    expect(fs.statSync(d1ExportPng).size).toBeGreaterThan(25000)

    expect(fs.existsSync(d1PrintPng)).toBe(true)
    expect(fs.statSync(d1PrintPng).size).toBeGreaterThan(10000)

    expect(fs.existsSync(d2PreviewPng)).toBe(true)
    expect(fs.statSync(d2PreviewPng).size).toBeGreaterThan(15000)

    expect(fs.existsSync(d2ExportPng)).toBe(true)
    expect(fs.statSync(d2ExportPng).size).toBeGreaterThan(25000)

    expect(fs.existsSync(d2PrintPng)).toBe(true)
    expect(fs.statSync(d2PrintPng).size).toBeGreaterThan(10000)

    // Build side-by-side comparison image of both designs
    const sideBySideHtml = path.join(outputDir, 'side_by_side_comparison.html')
    const sideBySidePng = path.join(outputDir, 'side_by_side_comparison.png')

    const comparisonHtmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Side-by-Side Verification</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: #0B1120;
      color: #F8FAFC;
      padding: 30px;
    }
    .header {
      text-align: center;
      margin-bottom: 25px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .header p {
      font-size: 12px;
      color: #94A3B8;
      margin-top: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      max-width: 900px;
      margin: 0 auto;
    }
    .card-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .badge-royal {
      background: rgba(74, 85, 182, 0.25);
      border: 1px solid #4A55B6;
      color: #C7D2FE;
    }
    .badge-azure {
      background: rgba(37, 99, 235, 0.25);
      border: 1px solid #2563EB;
      color: #93C5FD;
    }
    .card-wrap {
      border-radius: 24px;
      box-shadow: 0 20px 45px rgba(0,0,0,0.6);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>HARYAK HRMS &mdash; Employee ID Card Studio</h1>
    <p>Canonical CR80 Portrait Badges (53.98 &times; 85.60 mm &bull; 300 DPI Export Target)</p>
  </div>
  <div class="grid">
    <div class="card-col">
      <span class="badge badge-royal">Design 01 &bull; Royal Corporate Identity</span>
      <div class="card-wrap">${d1Markup}</div>
    </div>
    <div class="card-col">
      <span class="badge badge-azure">Design 02 &bull; Modern Azure Corporate Identity</span>
      <div class="card-wrap">${d2Markup}</div>
    </div>
  </div>
</body>
</html>`

    fs.writeFileSync(sideBySideHtml, comparisonHtmlContent)
    execSync(`"${chromePath}" --headless --disable-gpu --window-size=980,820 --screenshot="${sideBySidePng}" "${sideBySideHtml}"`)

    expect(fs.existsSync(sideBySidePng)).toBe(true)
    expect(fs.statSync(sideBySidePng).size).toBeGreaterThan(40000)
  })

  it('ensures long employee name "Vattem Thirupathi Rao" is rendered completely with zero ellipsis truncation in Design 01 and Design 02', () => {
    const longNameData: IDCardData = {
      employeeName: 'Vattem Thirupathi Rao',
      employeeCode: 'HRK-088',
      designation: 'Senior Lead Operations & HR Specialist',
      department: 'Corporate Human Resources',
      phone: '+91 98765 43210',
      email: 'vattem.thirupathirao@haryak.com',
      location: 'Hyderabad Headquarters',
      photoUrl: null,
      companyWebsite: 'www.haryak.com',
    }

    const d1Markup = renderToStaticMarkup(
      React.createElement(CorporateEliteTemplate, {
        data: longNameData,
        id: 'test-d1-long-name',
      })
    )

    const d2Markup = renderToStaticMarkup(
      React.createElement(ModernExecutiveTemplate, {
        data: longNameData,
        id: 'test-d2-long-name',
      })
    )

    // Verify complete employee name is rendered in both designs
    expect(d1Markup).toContain('Vattem Thirupathi Rao')
    expect(d2Markup).toContain('Vattem Thirupathi Rao')

    // Verify neither design truncates the employee name with text-overflow: ellipsis
    const d1NameH2 = d1Markup.match(/<h2[^>]*>[\s\S]*?<\/h2>/)?.[0] || ''
    const d2NameH2 = d2Markup.match(/<h2[^>]*>[\s\S]*?<\/h2>/)?.[0] || ''
    expect(d1NameH2).not.toContain('ellipsis')
    expect(d2NameH2).not.toContain('ellipsis')

    // Verify full designation is rendered
    expect(d1Markup).toContain('Senior Lead Operations &amp; HR Specialist')
    expect(d2Markup).toContain('Senior Lead Operations &amp; HR Specialist')

    // Verify full email is rendered
    expect(d1Markup).toContain('vattem.thirupathirao@haryak.com')
    expect(d2Markup).toContain('vattem.thirupathirao@haryak.com')
  })

  it('verifies explicit solid background layers exist in both designs to prevent foreignObject/canvas transparency drops', () => {
    const d1Markup = renderToStaticMarkup(
      React.createElement(CorporateEliteTemplate, {
        data: realEmployeeData,
        id: 'test-d1-bg',
      })
    )

    const d2Markup = renderToStaticMarkup(
      React.createElement(ModernExecutiveTemplate, {
        data: realEmployeeData,
        id: 'test-d2-bg',
      })
    )

    // Design 01: Has solid royal-blue base layer #4A55B6 with SVG background data-uri
    expect(d1Markup).toContain('background-color:#4A55B6')
    expect(d1Markup).toContain('data:image/svg+xml')
    expect(d1Markup).toContain('%23DADDF0') // lavender organic shape

    // Design 02: Has solid white base layer #FFFFFF
    expect(d2Markup).toContain('background-color:#FFFFFF')
    expect(d2Markup).toContain('linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)')
  })

  it('verifies initials avatar rendering when employee photograph is missing', () => {
    const noPhotoData: IDCardData = {
      ...realEmployeeData,
      employeeName: 'Vattem Thirupathi Rao',
      photoUrl: null,
    }

    const d1Markup = renderToStaticMarkup(
      React.createElement(CorporateEliteTemplate, {
        data: noPhotoData,
        id: 'test-d1-initials',
      })
    )

    const d2Markup = renderToStaticMarkup(
      React.createElement(ModernExecutiveTemplate, {
        data: noPhotoData,
        id: 'test-d2-initials',
      })
    )

    // Initials for "Vattem Thirupathi Rao" should be "VT"
    expect(d1Markup).toContain('VT')
    expect(d2Markup).toContain('VT')

    // Photo img element should NOT be rendered
    expect(d1Markup).not.toContain('<img src="data:image/jpeg')
    expect(d2Markup).not.toContain('<img src="data:image/jpeg')
  })
})
