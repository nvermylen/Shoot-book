import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { email, password, studioName, timezone } = await request.json();

  // admin: signup is a public operation but we need the admin client
  // to also insert the photographer row in the same request
  const admin = createAdminClient();

  const { data, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { studio_name: studioName },
  });

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 400 });
  }

  if (data.user) {
    const { error: profileError } = await admin.from("photographer").insert({
      id: data.user.id,
      business_name: studioName,
      display_name: studioName,
      timezone: timezone || "America/Chicago",
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
