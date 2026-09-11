import { createAdminClient } from '@/lib/supabase/admin'

export interface LetterheadVersion {
  id: string
  companyId: string
  version: number
  isActive: boolean
  fileUrl: string
  originalFileName: string
  mimeType: string
  headerImagePath: string
  footerImagePath: string
  uploadedAt: string
  uploadedBy?: string
  archivedAt?: string | null
}

const DEFAULT_HARYAK_LETTERHEAD: LetterheadVersion = {
  id: 'haryak-official-letterhead-v1',
  companyId: 'b3ed38db-f75e-4b74-9173-9e6603320a77',
  version: 1,
  isActive: true,
  fileUrl: '/letterhead/haryak-official-letterhead.pdf',
  originalFileName: 'Haryak_Official_Letterhead.pdf',
  mimeType: 'application/pdf',
  headerImagePath: '/letterhead/header.png',
  footerImagePath: '/letterhead/footer.jpg',
  uploadedAt: '2026-09-04T18:00:00Z',
  uploadedBy: 'Super Administrator',
}

/**
 * Get active letterhead for company
 */
export async function getActiveLetterhead(companyId: string): Promise<LetterheadVersion> {
  const supabase = createAdminClient()
  if (!supabase) return DEFAULT_HARYAK_LETTERHEAD

  try {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', companyId)
      .eq('document_type', 'letterhead')
      .order('version', { ascending: false })

    if (data && data.length > 0) {
      // Find active or latest
      const activeDoc = data.find((d: any) => {
        try {
          const meta = JSON.parse(d.description || '{}')
          return meta.isActive !== false
        } catch {
          return true
        }
      }) || data[0]

      const meta = JSON.parse(activeDoc.description || '{}')
      return {
        id: activeDoc.id,
        companyId: activeDoc.company_id,
        version: activeDoc.version || 1,
        isActive: meta.isActive !== false,
        fileUrl: activeDoc.file_url || DEFAULT_HARYAK_LETTERHEAD.fileUrl,
        originalFileName: activeDoc.file_name || DEFAULT_HARYAK_LETTERHEAD.originalFileName,
        mimeType: activeDoc.mime_type || 'application/pdf',
        headerImagePath: meta.headerImagePath || DEFAULT_HARYAK_LETTERHEAD.headerImagePath,
        footerImagePath: meta.footerImagePath || DEFAULT_HARYAK_LETTERHEAD.footerImagePath,
        uploadedAt: activeDoc.created_at,
        uploadedBy: meta.uploadedBy || 'Administrator',
      }
    }
  } catch (err) {
    console.error('Error fetching active letterhead:', err)
  }

  return DEFAULT_HARYAK_LETTERHEAD
}

/**
 * Get all letterhead versions for company
 */
export async function getLetterheadHistory(companyId: string): Promise<LetterheadVersion[]> {
  const supabase = createAdminClient()
  if (!supabase) return [DEFAULT_HARYAK_LETTERHEAD]

  try {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', companyId)
      .eq('document_type', 'letterhead')
      .order('version', { ascending: false })

    if (data && data.length > 0) {
      return data.map((d: any) => {
        let meta: any = {}
        try { meta = JSON.parse(d.description || '{}') } catch {}
        return {
          id: d.id,
          companyId: d.company_id,
          version: d.version || 1,
          isActive: meta.isActive !== false,
          fileUrl: d.file_url,
          originalFileName: d.file_name,
          mimeType: d.mime_type || 'application/pdf',
          headerImagePath: meta.headerImagePath || DEFAULT_HARYAK_LETTERHEAD.headerImagePath,
          footerImagePath: meta.footerImagePath || DEFAULT_HARYAK_LETTERHEAD.footerImagePath,
          uploadedAt: d.created_at,
          uploadedBy: meta.uploadedBy || 'Administrator',
          archivedAt: meta.archivedAt || null,
        }
      })
    }
  } catch (err) {
    console.error('Error fetching letterhead history:', err)
  }

  return [DEFAULT_HARYAK_LETTERHEAD]
}
