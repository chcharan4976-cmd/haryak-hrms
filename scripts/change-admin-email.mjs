import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ADMIN_USER_ID = '5228e48d-76d7-4523-840c-97c7320c7121'
const NEW_EMAIL = 'admin@haryak.com'

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase environment variables')
}

if (NEW_EMAIL === 'YOUR_NEW_ADMIN_EMAIL') {
  throw new Error('Replace YOUR_NEW_ADMIN_EMAIL first')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const { data, error } = await supabase.auth.admin.updateUserById(
  ADMIN_USER_ID,
  {
    email: NEW_EMAIL,
    email_confirm: true,
  }
)

if (error) {
  console.error(error)
  process.exit(1)
}

console.log('Admin email updated successfully:', data.user.email)