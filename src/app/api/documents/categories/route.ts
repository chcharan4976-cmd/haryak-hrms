import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { DOCUMENT_CATEGORIES } from '@/lib/types/document'

export async function GET() {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const supabase = createAdminClient()
  let customCategories: any[] = []

  if (supabase) {
    try {
      const { data } = await supabase
        .from('document_categories')
        .select('*')
        .eq('company_id', context.companyId)
        .eq('is_active', true)

      if (data) {
        customCategories = data.map((c: any) => ({
          code: c.code,
          name: c.name,
          group: c.category_group,
          groupName: c.category_group.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          description: c.description || '',
          isMandatoryForEmployee: c.is_mandatory,
          hasExpiry: c.has_expiry,
          defaultRetentionMonths: c.default_retention_months,
          isCustom: true,
        }))
      }
    } catch (err) {
      console.warn('[GetCategories] DB custom category query skipped:', err)
    }
  }

  // Combine system default categories with company custom categories
  const allCategories = [...DOCUMENT_CATEGORIES, ...customCategories]

  return NextResponse.json({
    success: true,
    categories: allCategories,
  })
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can create document categories.' }, { status: 403 })
  }

  const body = await request.json()
  const { name, group, description, isMandatory, hasExpiry, defaultRetentionMonths } = body

  if (!name || !name.trim()) {
    return NextResponse.json({ success: false, error: 'Category name is required.' }, { status: 400 })
  }

  const code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('document_categories')
    .insert({
      company_id: context.companyId,
      code,
      name: name.trim(),
      category_group: group || 'employment_hr',
      description: description || null,
      is_mandatory: Boolean(isMandatory),
      has_expiry: Boolean(hasExpiry),
      default_retention_months: defaultRetentionMonths || 84,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Category "${name}" created successfully.`,
    category: data,
  })
}
