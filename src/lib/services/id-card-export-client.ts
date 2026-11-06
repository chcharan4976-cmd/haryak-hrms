/**
 * Haryak Technologies India Private Limited
 * Ultra-High-Resolution & Print-Ready CR80 ID Card Exporter
 *
 * Capabilities:
 * - Single source of truth: Export captures the exact live card element
 * - Standard physical CR80 dimensions: 53.98 mm × 85.60 mm (Strict Vertical Portrait Only)
 * - Exact 300 DPI PNG Resolution: 638 × 1011 pixels (aspect ratio ~0.6306)
 * - Exact CR80 Physical PDF Export (53.98 mm × 85.60 mm) at 300 DPI print quality
 * - Deterministic font/image pre-decoding and skipFonts to eliminate CSS-parsing drops
 * - Resilient dual-engine capture (html-to-image + html2canvas fallback)
 */

import { jsPDF } from 'jspdf'
import * as htmlToImage from 'html-to-image'

export interface CardExportConfig {
  elementId: string
  employeeCode: string
  employeeName: string
}

/**
 * Convert any image URL (remote, relative, or blob) to an inlined Base64 data URL
 * Eliminates CORS and network latency during canvas rasterization
 */
export async function urlToBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url

  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(url)
      reader.readAsDataURL(blob)
    })
  } catch {
    // Fallback: load into an off-screen image element and draw to canvas
    return new Promise<string>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || img.width
          canvas.height = img.naturalHeight || img.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0)
            resolve(canvas.toDataURL('image/png'))
            return
          }
        } catch {
          // Canvas tainted
        }
        resolve(url)
      }
      img.onerror = () => resolve(url)
      img.src = url
    })
  }
}

/**
 * Capture card DOM element with exact 300 DPI CR80 dimensions (638 × 1011 px)
 * Pre-decodes images, awaits document fonts, and uses explicit viewport bounds
 */
export async function captureHighResCard(
  elementId: string,
  targetWidth: number = 638,
  targetHeight: number = 1011
): Promise<string> {
  const node = document.getElementById(elementId)
  if (!node) {
    throw new Error(`ID card element #${elementId} not found in DOM`)
  }

  // 1. Wait for document fonts to finish loading
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await (document as any).fonts.ready
    } catch {
      // Continue if fonts API is unavailable
    }
  }

  // 2. Ensure all images inside node are fully decoded before capture
  const imgElements = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    imgElements.map(async img => {
      try {
        if (!img.complete) {
          await img.decode()
        }
      } catch {
        // Fallback gracefully
      }
    })
  )

  // Give browser a frame to commit any pending raster operations
  await new Promise(r => setTimeout(r, 80))

  // Determine canonical solid background color based on selected design
  const isCorporateElite = elementId.includes('corporate-elite')
  const cardSolidBg = isCorporateElite ? '#4A55B6' : '#FFFFFF'

  // 3. Primary capture: html-to-image with skipFonts and empty fontEmbedCSS to prevent stylesheet errors
  try {
    const dataUrl = await htmlToImage.toPng(node, {
      width: 380,
      height: 602,
      canvasWidth: targetWidth,
      canvasHeight: targetHeight,
      pixelRatio: targetWidth / 380,
      cacheBust: false,
      quality: 1.0,
      skipFonts: true,
      fontEmbedCSS: '',
      backgroundColor: 'transparent',
      filter: (domNode: HTMLElement) => {
        const tag = domNode?.tagName?.toUpperCase()
        if (tag === 'SCRIPT' || tag === 'LINK') return false
        return true
      },
      style: {
        transform: 'none',
        margin: '0',
      },
    })

    if (dataUrl && dataUrl.length > 1000) {
      return dataUrl
    }
  } catch (err) {
    console.warn('[captureHighResCard] Primary html-to-image engine warning, using html2canvas:', err)
  }

  // 4. Fallback capture: html2canvas with explicit solid card background color
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(node, {
    width: 380,
    height: 602,
    scale: targetWidth / 380,
    useCORS: true,
    allowTaint: true,
    backgroundColor: cardSolidBg,
    logging: false,
  })

  return canvas.toDataURL('image/png', 1.0)
}

/**
 * Generate 300 DPI Print-Ready CR80 Portrait PDF
 * Physical Standard CR80 Dimensions: 53.98 mm × 85.60 mm (Portrait Only)
 */
export async function generateCR80PrintPdf(
  cardDataUrl: string
): Promise<string> {
  const widthMm = 53.98
  const heightMm = 85.60

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  })

  // Embed card image spanning exact CR80 physical dimensions (0 margins)
  doc.addImage(cardDataUrl, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST')

  return doc.output('datauristring')
}

/**
 * Generate High-Resolution Card PNG preserving exact physical aspect ratio
 * Design 01 & 02: Vertical Portrait (638 × 1011 px)
 */
export async function generateHighResPng(
  cardDataUrl: string
): Promise<string> {
  return cardDataUrl
}

/**
 * Trigger browser file download from Data URL
 */
export function triggerBrowserDownload(dataUrl: string, fileName: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
