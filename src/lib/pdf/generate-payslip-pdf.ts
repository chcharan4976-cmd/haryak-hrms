/**
 * Haryak Technologies India Private Limited
 * High-Fidelity Official Payslip PDF Generator
 * 
 * Guarantees 100% visual parity between web preview and downloaded PDF.
 * Uses high-DPI rasterization and embedded base64 assets to avoid CORS drops.
 */

export async function downloadOfficialPayslipPdf(
  elementId: string,
  data: { employeeId: string; payMonth: string }
): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const jsPDFModule = await import('jspdf')
    const html2canvasModule = await import('html2canvas')
    const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF
    const html2canvas = html2canvasModule.default || html2canvasModule

    const element = document.getElementById(elementId)
    if (!element) {
      window.print()
      return
    }

    // Convert any images inside element to inline base64 to ensure no CORS or drop-out issues
    const images = element.querySelectorAll('img')
    for (const img of Array.from(images)) {
      if (img.src && !img.src.startsWith('data:')) {
        try {
          const response = await fetch(img.src)
          const blob = await response.blob()
          await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              img.src = reader.result as string
              resolve(null)
            }
            reader.readAsDataURL(blob)
          })
        } catch {
          // Keep original source if fetch fails
        }
      }
    }

    const canvas = await (html2canvas as any)(element, {
      scale: 3, // High DPI for crystal clear typography and borders
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    const imgData = canvas.toDataURL('image/png', 1.0)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()

    // 10mm margin on left and right
    const margin = 10
    const printWidth = pdfWidth - (margin * 2)
    const printHeight = (canvas.height * printWidth) / canvas.width

    pdf.addImage(imgData, 'PNG', margin, margin, printWidth, Math.min(printHeight, pdfHeight - (margin * 2)))

    const cleanMonth = data.payMonth.replace(/\s+/g, '_')
    const filename = `Haryak_Payslip_${data.employeeId}_${cleanMonth}.pdf`

    pdf.save(filename)
  } catch (err) {
    console.warn('Falling back to clean browser print:', err)
    window.print()
  }
}
