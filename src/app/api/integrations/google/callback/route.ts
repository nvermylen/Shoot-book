import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForTokens,
  GoogleOAuthExchangeError,
} from "@/lib/integrations/google/oauth";
import { storeOAuthCredentials } from "@/lib/integrations/oauth/credentials";
import { STATE_COOKIE } from "../connect/route";

/**
 * Google OAuth callback. Verifies the CSRF state cookie, exchanges the code,
 * encrypts + stores tokens, and redirects home with a status query param.
 * Error redirects carry machine codes only — never token material.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const fail = (code: string) => {
    const dest = new URL("/", request.url);
    dest.searchParams.set("calendar_error", code);
    const res = NextResponse.redirect(dest);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // User clicked "cancel" on the consent screen, or Google errored.
  const providerError = url.searchParams.get("error");
  if (providerError) return fail(providerError);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("state_mismatch");
  }

  const redirectUri = new URL("/api/integrations/google/callback", request.url).toString();

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri });

    const stored = await storeOAuthCredentials(supabase, user.id, "calendar", {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
    if (stored.error) return fail("store_failed");

    const dest = new URL("/", request.url);
    dest.searchParams.set("calendar_connected", "1");
    const res = NextResponse.redirect(dest);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    const code =
      err instanceof GoogleOAuthExchangeError ? err.code : "exchange_failed";
    return fail(code);
  }
}
