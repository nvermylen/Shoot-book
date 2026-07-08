import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForTokens,
  resolveGrantedServices,
  GoogleOAuthExchangeError,
} from "@/lib/integrations/google/oauth";
import {
  storeOAuthCredentials,
  type OAuthTokens,
} from "@/lib/integrations/oauth/credentials";
import { STATE_COOKIE } from "../connect/route";

/**
 * Google OAuth callback. Verifies the CSRF state cookie, exchanges the code,
 * and stores encrypted tokens per service ACTUALLY granted (LENS-D-025 /
 * spec D6): the same token pair is written to the 'calendar' row and upserted
 * onto the 'gmail' row, each recording the granted scope union. Granular
 * consent (user unchecked a scope) never writes a row claiming a scope its
 * token lacks — and never overwrites the existing calendar credential with a
 * narrower grant. Error redirects carry machine codes only — never tokens.
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
    const granted = resolveGrantedServices(tokens.scope);

    // Everything unchecked (or Google omitted the scope field — treat as
    // nothing verified): store no rows, keep any prior credentials intact.
    if (!granted.calendar && !granted.gmail) return fail("no_scopes_granted");

    const stored: OAuthTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };

    if (granted.calendar) {
      const res = await storeOAuthCredentials(supabase, user.id, "calendar", stored);
      if (res.error) return fail("store_failed");
    }
    if (granted.gmail) {
      const res = await storeOAuthCredentials(supabase, user.id, "gmail", stored);
      if (res.error) return fail("store_failed");
    }

    const dest = new URL("/", request.url);
    if (granted.calendar) dest.searchParams.set("calendar_connected", "1");
    else dest.searchParams.set("calendar_error", "scope_not_granted");
    if (granted.gmail) dest.searchParams.set("gmail_connected", "1");
    else dest.searchParams.set("gmail_error", "scope_not_granted");

    const res = NextResponse.redirect(dest);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    const code =
      err instanceof GoogleOAuthExchangeError ? err.code : "exchange_failed";
    return fail(code);
  }
}
