import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'

export async function GET() {
  try {
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }
    const { companyId } = resolution.context

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Database not configured.' }, { status: 500 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable.' }, { status: 500 })
    }

    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (error || !company) {
      return NextResponse.json({ success: false, error: 'Company not found.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        legalName: company.legal_name,
        logoUrl: company.logo_url,
        website: company.website,
        email: company.email,
        phone: company.phone,
        address: {
          line1: company.address_line1,
          line2: company.address_line2,
          city: company.city,
          state: company.state,
          pincode: company.pincode,
          country: company.country,
        },
        gstin: company.gstin,
        cin: company.cin,
        pan: company.pan,
        fiscalYearStart: company.fiscal_year_start,
        currency: company.currency,
        timezone: company.timezone,
        dateFormat: company.date_format,
        employeeIdPrefix: company.employee_id_prefix,
      },
    })
  } catch (error: any) {
    console.error('Error fetching company:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }

    if (!isAdmin(resolution.context)) {
      return NextResponse.json(
        { success: false, error: 'Only administrators can update company settings.' },
        { status: 403 }
      )
    }

    const { companyId } = resolution.context
    const body = await request.json()

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable.' }, { status: 500 })
    }

    const updateData: Record<string, any> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.legalName !== undefined) updateData.legal_name = body.legalName
    if (body.email !== undefined) updateData.email = body.email
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.website !== undefined) updateData.website = body.website
    if (body.address?.line1 !== undefined) updateData.address_line1 = body.address.line1
    if (body.address?.line2 !== undefined) updateData.address_line2 = body.address.line2
    if (body.address?.city !== undefined) updateData.city = body.address.city
    if (body.address?.state !== undefined) updateData.state = body.address.state
    if (body.address?.pincode !== undefined) updateData.pincode = body.address.pincode
    if (body.timezone !== undefined) updateData.timezone = body.timezone
    if (body.dateFormat !== undefined) updateData.date_format = body.dateFormat
    updateData.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', companyId)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Company settings updated.' })
  } catch (error: any) {
    console.error('Error updating company:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
