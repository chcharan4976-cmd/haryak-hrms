import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase() || ''
    const action = searchParams.get('action') || ''

    if (isSupabaseConfigured()) {
      const supabase = createAdminClient()
      if (supabase) {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })

        if (action && action !== 'all') {
          query = query.ilike('action', `%${action}%`)
        }

        const { data, error } = await query

        if (!error && data) {
          let list = data.map((l: any) => ({
            id: l.id,
            timestamp: new Date(l.created_at).toLocaleString('en-IN'),
            user: l.user_name || l.user_email || 'Administrator',
            action: (l.action || 'UPDATE').toUpperCase(),
            entity: l.entity_type || 'System',
            desc: l.description || l.reason || 'Administrative action performed',
            ip: l.ip_address || '127.0.0.1',
          }))

          if (search) {
            list = list.filter(
              (l: any) =>
                l.desc.toLowerCase().includes(search) ||
                l.user.toLowerCase().includes(search) ||
                l.entity.toLowerCase().includes(search)
            )
          }

          return NextResponse.json({ success: true, logs: list })
        }
      }
    }

    return NextResponse.json({ success: true, logs: [] })
  } catch (error: any) {
    console.error('Audit fetch error:', error)
    return NextResponse.json({ success: false, logs: [] })
  }
}
