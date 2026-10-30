import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, hasRole } from '@/lib/services/company-resolver'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Trigger cleanup of expired chat messages based on 14-day retention policy.
 * Can be called by scheduled Edge Functions/cron jobs (with secret) or admins.
 *
 * RESTRICTED TARGET: ONLY operates on `chat_messages` table.
 * All other business tables (payslips, documents, employees, payroll, audit_logs)
 * are strictly excluded and never touched.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 503 }
      )
    }

    const configuredSecret = process.env.CHAT_CLEANUP_SECRET?.trim()

    if (configuredSecret) {
      const incomingSecret = request.headers.get('x-cleanup-secret')?.trim()
      if (!incomingSecret || incomingSecret !== configuredSecret) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Invalid cleanup secret' },
          { status: 403 }
        )
      }
    } else {
      const resolved = await resolveRequestContext()
      if (!resolved.ok) {
        return NextResponse.json(
          { success: false, error: resolved.error.message },
          { status: resolved.error.status }
        )
      }

      const { context } = resolved
      if (!hasRole(context, 'SUPER_ADMIN', 'HR_ADMIN')) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Admin access required' },
          { status: 403 }
        )
      }
    }

    // Try PostgreSQL stored procedure first
    let cleanupResult: any = null
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'cleanup_expired_chat_messages',
      { p_batch_size: 500, p_max_total: 5000 }
    )

    if (!rpcError && rpcData) {
      cleanupResult = rpcData
    } else {
      // Graceful direct batch cleanup fallback if RPC is not yet installed in Supabase
      console.warn(
        '[ChatCleanup] RPC cleanup_expired_chat_messages not available, using direct batch cleanup:',
        rpcError?.message
      )

      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const nowIso = new Date().toISOString()

      // Fetch expired message IDs strictly from chat_messages table (limit 500 per batch)
      let { data: expiredRows, error: fetchError } = await supabase
        .from('chat_messages')
        .select('id')
        .lte('expires_at', nowIso)
        .limit(500)

      if (fetchError && fetchError.message?.includes('expires_at')) {
        const fallbackFetch = await supabase
          .from('chat_messages')
          .select('id')
          .lte('created_at', cutoff)
          .limit(500)

        expiredRows = fallbackFetch.data
        fetchError = fallbackFetch.error
      }

      if (fetchError) {
        return NextResponse.json(
          { success: false, error: `Failed to query expired messages: ${fetchError.message}` },
          { status: 500 }
        )
      }

      const expiredIds = (expiredRows || []).map(r => r.id)
      let deletedCount = 0

      if (expiredIds.length > 0) {
        // Hard-delete ONLY from chat_messages. Cascades handle child receipts.
        const { error: deleteError } = await supabase
          .from('chat_messages')
          .delete()
          .in('id', expiredIds)

        if (deleteError) {
          return NextResponse.json(
            { success: false, error: `Failed to delete expired messages: ${deleteError.message}` },
            { status: 500 }
          )
        }
        deletedCount = expiredIds.length
      }

      cleanupResult = {
        success: true,
        deleted_count: deletedCount,
        batches_processed: expiredIds.length > 0 ? 1 : 0,
        mode: 'direct_application_cleanup',
        retention_days: 14,
        cutoff_timestamp: cutoff,
      }
    }

    return NextResponse.json({
      success: true,
      result: cleanupResult,
    })
  } catch (error: any) {
    console.error('[ChatCleanup] Unexpected error in POST handler:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error during chat cleanup' },
      { status: 500 }
    )
  }
}

/**
 * Dry-run report for expired chat messages.
 * Requires admin authentication.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 503 }
      )
    }

    const resolved = await resolveRequestContext()
    if (!resolved.ok) {
      return NextResponse.json(
        { success: false, error: resolved.error.message },
        { status: resolved.error.status }
      )
    }

    const { context } = resolved
    if (!hasRole(context, 'SUPER_ADMIN', 'HR_ADMIN')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    const nowIso = new Date().toISOString()
    const cutoffIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    let { data, count, error } = await supabase
      .from('chat_messages')
      .select('company_id', { count: 'exact' })
      .lte('expires_at', nowIso)
      .is('deleted_at', null)

    if (error && error.message?.includes('expires_at')) {
      const fallback = await supabase
        .from('chat_messages')
        .select('company_id', { count: 'exact' })
        .lte('created_at', cutoffIso)
        .is('deleted_at', null)

      data = fallback.data
      count = fallback.count
      error = fallback.error
    }

    if (error) {
      console.error('[ChatCleanup] Failed to query expired chat messages:', error.message)
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve expired chat messages report' },
        { status: 500 }
      )
    }

    const companyMap = new Map<string, number>()
    for (const row of data || []) {
      const companyId = String(row.company_id || 'unknown')
      companyMap.set(companyId, (companyMap.get(companyId) || 0) + 1)
    }

    const byCompany = Array.from(companyMap.entries())
      .map(([companyId, count]) => ({
        companyId,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    const expiredCount = typeof count === 'number' ? count : (data?.length || 0)

    return NextResponse.json({
      success: true,
      retentionPolicyDays: 14,
      expiredCount,
      byCompany,
    })
  } catch (error: any) {
    console.error('[ChatCleanup] Unexpected error in GET handler:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error while retrieving report' },
      { status: 500 }
    )
  }
}
