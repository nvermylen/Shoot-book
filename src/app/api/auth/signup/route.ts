import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { email, password, studioName, timezone } = await request.json();

  const supabase = await createClient();
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { studio_name: studioName } },
  });

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 400 });
  }

  if (data.user) {
    // admin: RLS requires active session; session isn't established until email confirmed or auto-confirm
    const admin = createAdminClient();
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
