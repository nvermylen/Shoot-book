import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildConsentUrl } from "@/lib/integrations/google/oauth";

export const STATE_COOKIE = "google_oauth_state";

/**
 * Starts the Google connect flow — one combined consent for Calendar read +
 * gmail.send (LENS-D-025 / spec D6; scopes default in buildConsentUrl).
 * Auth-guarded; sets a CSRF state cookie and redirects to Google's consent
 * screen.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/integrations/google/callback", request.url).toString();

  const response = NextResponse.redirect(buildConsentUrl({ redirectUri, state }));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes to finish the consent screen
    path: "/api/integrations/google",
  });
  return response;
}
