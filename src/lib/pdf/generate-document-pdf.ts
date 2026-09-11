type PdfDocumentData = {
  employeeCode: string
  documentType: string
  documentNumber?: string
  issueDate?: string
}

function nextPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))

  await Promise.all(
    images.map(async image => {
      if (image.complete && image.naturalWidth > 0) return

      try {
        await image.decode()
      } catch {
        await new Promise<void>(resolve => {
          const done = () => resolve()

          image.addEventListener('load', done, { once: true })
          image.addEventListener('error', done, { once: true })

          setTimeout(done, 3000)
        })
      }
    })
  )
}

function safeFilePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getYear(issueDate?: string): string {
  if (issueDate) {
    const match = String(issueDate).match(/\b(19|20)\d{2}\b/)
    if (match) return match[0]
  }

  return String(new Date().getFullYear())
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(
        new Error(
          'Unable to prepare rendered document image for PDF.'
        )
      )

    image.src = src
  })
}

/**
 * Detect whether a rendered page slice contains meaningful visible content.
 *
 * This prevents tiny white overflow at the bottom of a DOM A4 canvas
 * (for example 1-5 extra pixels caused by browser scaling) from becoming
 * a completely blank second PDF page.
 */
function canvasHasVisibleContent(
  canvas: HTMLCanvasElement
): boolean {
  const context = canvas.getContext('2d')

  if (!context) return true

  const {
    width,
    height,
  } = canvas

  if (!width || !height) return false

  const imageData = context.getImageData(
    0,
    0,
    width,
    height
  ).data

  /**
   * Sampling every few pixels is much faster than checking every pixel.
   * White / near-white is treated as blank.
   */
  const sampleStep = Math.max(
    4,
    Math.floor(Math.min(width, height) / 250)
  )

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const index = (y * width + x) * 4

      const red = imageData[index]
      const green = imageData[index + 1]
      const blue = imageData[index + 2]
      const alpha = imageData[index + 3]

      if (alpha < 8) {
        continue
      }

      /**
       * Any reasonably non-white pixel means this slice contains
       * text, border, logo, footer, etc.
       */
      if (
        red < 247 ||
        green < 247 ||
        blue < 247
      ) {
        return true
      }
    }
  }

  return false
}

export async function downloadOfficialDocumentPdf(
  elementId: string,
  data: PdfDocumentData
): Promise<void> {
  if (typeof window === 'undefined') return

  const element = document.getElementById(
    elementId
  ) as HTMLElement | null

  if (!element) {
    throw new Error(
      'Official document canvas was not found. Open the document preview and try again.'
    )
  }

  try {
    await waitForImages(element)
    await nextPaint()

    /**
     * Do not use html2canvas here.
     *
     * html2canvas currently fails on CSS Color 4 functions such as
     * lab(), lch(), oklab(), oklch() and color-mix().
     *
     * html-to-image delegates rendering to the browser and therefore
     * works with the modern CSS used by the application.
     */
    const [
      htmlToImageModule,
      jsPDFModule,
    ] = await Promise.all([
      import('html-to-image'),
      import('jspdf'),
    ])

    const {
      toPng,
    } = htmlToImageModule

    const jsPDF =
      jsPDFModule.default ||
      (jsPDFModule as any).jsPDF

    const rect = element.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(
        'Official document canvas has no visible dimensions.'
      )
    }

    const pixelRatio = Math.max(
      2,
      Math.min(
        3,
        window.devicePixelRatio || 1
      )
    )

    const dataUrl = await toPng(element, {
      cacheBust: true,

      backgroundColor: '#ffffff',

      pixelRatio,

      width: Math.ceil(rect.width),

      height: Math.ceil(rect.height),

      style: {
        backgroundColor: '#ffffff',
      },

      filter(node) {
        if (!(node instanceof HTMLElement)) {
          return true
        }

        /**
         * Allows any future UI-only element inside the official
         * canvas to opt out of the generated PDF.
         */
        if (node.dataset?.pdfExclude === 'true') {
          return false
        }

        return true
      },
    })

    const renderedImage = await loadImage(dataUrl)

    const sourceWidth =
      renderedImage.naturalWidth ||
      renderedImage.width

    const sourceHeight =
      renderedImage.naturalHeight ||
      renderedImage.height

    if (!sourceWidth || !sourceHeight) {
      throw new Error(
        'The rendered official document image is empty.'
      )
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    const pageWidthMm =
      pdf.internal.pageSize.getWidth()

    const pageHeightMm =
      pdf.internal.pageSize.getHeight()

    /**
     * Scale the captured DOM to exact A4 width.
     */
    const sourcePixelsPerMm =
      sourceWidth / pageWidthMm

    const pageHeightPx =
      Math.floor(
        pageHeightMm *
        sourcePixelsPerMm
      )

    /**
     * Browsers can render an A4-like DOM 1-10 pixels taller because
     * of rounding, zoom, devicePixelRatio, borders or fractional CSS
     * values. That must NOT create an extra blank PDF page.
     *
     * Allow up to 1.5% of one PDF page as harmless trailing overflow.
     */
    const trailingOverflowTolerancePx =
      Math.max(
        12,
        Math.floor(pageHeightPx * 0.015)
      )

    let sourceY = 0
    let pagesAdded = 0

    while (sourceY < sourceHeight) {
      const remainingHeight =
        sourceHeight - sourceY

      /**
       * First defence:
       * Ignore tiny trailing overflow after at least one real page.
       */
      if (
        pagesAdded > 0 &&
        remainingHeight <= trailingOverflowTolerancePx
      ) {
        break
      }

      const sliceHeight = Math.min(
        pageHeightPx,
        remainingHeight
      )

      const pageCanvas =
        document.createElement('canvas')

      pageCanvas.width =
        sourceWidth

      pageCanvas.height =
        sliceHeight

      const context =
        pageCanvas.getContext('2d')

      if (!context) {
        throw new Error(
          'Unable to create the PDF page canvas.'
        )
      }

      context.fillStyle = '#ffffff'

      context.fillRect(
        0,
        0,
        pageCanvas.width,
        pageCanvas.height
      )

      context.drawImage(
        renderedImage,
        0,
        sourceY,
        sourceWidth,
        sliceHeight,
        0,
        0,
        sourceWidth,
        sliceHeight
      )

      /**
       * Second defence:
       * Even when overflow is larger than the tolerance, do not create
       * a page if that slice is visually blank.
       */
      const hasVisibleContent =
        canvasHasVisibleContent(
          pageCanvas
        )

      if (
        !hasVisibleContent &&
        pagesAdded > 0
      ) {
        sourceY += sliceHeight
        continue
      }

      const pageImage =
        pageCanvas.toDataURL(
          'image/png'
        )

      if (pagesAdded > 0) {
        pdf.addPage(
          'a4',
          'portrait'
        )
      }

      const renderedHeightMm =
        sliceHeight /
        sourcePixelsPerMm

      pdf.addImage(
        pageImage,
        'PNG',
        0,
        0,
        pageWidthMm,
        renderedHeightMm,
        undefined,
        'FAST'
      )

      pagesAdded += 1
      sourceY += sliceHeight
    }

    if (pagesAdded === 0) {
      throw new Error(
        'No visible document content was available for PDF generation.'
      )
    }

    const documentType =
      safeFilePart(
        String(
          data.documentType ||
          'Document'
        )
          .split('_')
          .map(
            word =>
              word.charAt(0).toUpperCase() +
              word.slice(1)
          )
          .join('_')
      ) ||
      'Document'

    const employeeCode =
      safeFilePart(
        data.employeeCode
      ) ||
      'Employee'

    const year =
      getYear(
        data.issueDate
      )

    const filename =
      `Haryak_${documentType}_${employeeCode}_${year}.pdf`

    pdf.save(filename)
  } catch (error: any) {
    console.error(
      '[OfficialDocumentPDF] Generation failed:',
      error
    )

    /**
     * Never fall back to window.print().
     * Browser print would expose localhost/app chrome and does not
     * satisfy official HR document requirements.
     */
    throw new Error(
      error?.message ||
      'Official PDF generation failed.'
    )
  }
}
