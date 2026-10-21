import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newPassword = process.env.TEMP_ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !newPassword) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function main() {
  const email = "haryak@admin.com";

  const {
    data: { users },
    error: listError,
  } = await supabase.auth.admin.listUsers();

  if (listError) {
    throw listError;
  }

  const user = users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    throw new Error("Admin user not found");
  }

  const { error: updateError } =
    await supabase.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
      }
    );

  if (updateError) {
    throw updateError;
  }

  console.log("Admin password updated successfully.");
  console.log("User ID unchanged:", user.id);
}

main().catch((error) => {
  console.error("Password reset failed:", error.message);
  process.exit(1);
});