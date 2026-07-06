import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '@/lib/erp/types';
import {
  loadOAuthCredentials,
  storeOAuthCredentials,
} from '@/lib/integrations/oauth/credentials';
import { refreshAccessToken } from './oauth';

/**
 * Refresh-on-expiry wiring for stored Google credentials.
 *
 * Returns a currently-valid access token for the photographer's Google
 * connection, transparently refreshing (and re-storing, encrypted) when the
 * stored token is expired or about to expire. Token values are returned to
 * adapter callers only — never logged (anti-pattern #11).
 */

/** Refresh when the stored token expires within this window. */
const EXPIRY_BUFFER_MS = 120_000;

export async function getValidAccessToken(
  supabase: SupabaseClient,
  photographerId: string,
  service: 'calendar' | 'gmail' = 'calendar',
): Promise<ErpResult<string>> {
  const loaded = await loadOAuthCredentials(supabase, service);
  if (loaded.error) return { data: null, error: loaded.error };

  const { accessToken, refreshToken, expiresAt, scope } = loaded.data;

  const isFresh =
    expiresAt !== null && new Date(expiresAt).getTime() - Date.now() > EXPIRY_BUFFER_MS;
  if (isFresh) return { data: accessToken, error: null };

  // Expired (or unknown expiry) — refresh if we can, otherwise hand back the
  // stored token and let the API call surface the failure honestly.
  if (!refreshToken) return { data: accessToken, error: null };

  const refreshed = await refreshAccessToken(refreshToken);

  const stored = await storeOAuthCredentials(supabase, photographerId, service, {
    accessToken: refreshed.accessToken,
    // Google usually omits refresh_token on refresh — keep the stored one.
    refreshToken: refreshed.refreshToken ?? refreshToken,
    expiresAt: refreshed.expiresAt,
    scope: refreshed.scope ?? scope,
  });
  if (stored.error) return { data: null, error: stored.error };

  return { data: refreshed.accessToken, error: null };
}
