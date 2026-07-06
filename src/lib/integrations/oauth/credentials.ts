import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntegrationService } from '@/types/erp';
import type { ErpResult } from '@/lib/erp/types';
import { toErpError, notFound } from '@/lib/erp/types';
import { encryptToken, decryptToken } from '@/lib/crypto/tokens';

/**
 * Encrypted OAuth-token storage for external integrations (Calendar, Gmail, …).
 *
 * Tokens are encrypted at rest via `crypto/tokens` (AES-256-GCM) and stored in
 * the `integration_credentials` table (bytea columns). Access is RLS-scoped:
 * every query filters implicitly by `photographer_id = auth.uid()`, so a caller
 * only ever touches their own credentials. Plaintext tokens never leave this
 * module and are never logged (ZDR posture / anti-pattern #11).
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  /** ISO 8601 timestamp when the access token expires, if known. */
  expiresAt?: string | null;
  scope?: string[] | null;
}

export interface StoredOAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string[] | null;
  keyVersion: number;
}

// PostgREST represents bytea as a hex string prefixed with `\x` (verified against
// Supabase). Encode Buffers on write, decode on read.
function toBytea(buf: Buffer): string {
  return '\\x' + buf.toString('hex');
}
function fromBytea(value: string): Buffer {
  return value.startsWith('\\x')
    ? Buffer.from(value.slice(2), 'hex')
    : Buffer.from(value, 'base64');
}

/**
 * Encrypt and upsert OAuth tokens for (photographer, service). Idempotent on the
 * unique (photographer_id, service) constraint — reconnecting overwrites.
 */
export async function storeOAuthCredentials(
  supabase: SupabaseClient,
  photographerId: string,
  service: IntegrationService,
  tokens: OAuthTokens,
): Promise<ErpResult<void>> {
  const access = encryptToken(tokens.accessToken);
  const refresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

  const { error } = await supabase.from('integration_credentials').upsert(
    {
      photographer_id: photographerId,
      service,
      access_token_ciphertext: toBytea(access.ciphertext),
      refresh_token_ciphertext: refresh ? toBytea(refresh.ciphertext) : null,
      key_version: access.keyVersion,
      expires_at: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
    },
    { onConflict: 'photographer_id,service' },
  );

  if (error) return { data: null, error: toErpError(error) };
  return { data: undefined, error: null };
}

/**
 * Load and decrypt the current photographer's tokens for a service.
 * Returns not_found when the service isn't connected.
 */
export async function loadOAuthCredentials(
  supabase: SupabaseClient,
  service: IntegrationService,
): Promise<ErpResult<StoredOAuthCredentials>> {
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('access_token_ciphertext, refresh_token_ciphertext, key_version, expires_at, scope')
    .eq('service', service)
    .maybeSingle();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('integration_credentials', service) };

  const accessToken = decryptToken(fromBytea(data.access_token_ciphertext), data.key_version);
  const refreshToken = data.refresh_token_ciphertext
    ? decryptToken(fromBytea(data.refresh_token_ciphertext), data.key_version)
    : null;

  return {
    data: {
      accessToken,
      refreshToken,
      expiresAt: data.expires_at ?? null,
      scope: data.scope ?? null,
      keyVersion: data.key_version,
    },
    error: null,
  };
}

/** Disconnect a service — deletes the current photographer's stored credentials. */
export async function deleteOAuthCredentials(
  supabase: SupabaseClient,
  service: IntegrationService,
): Promise<ErpResult<void>> {
  const { error } = await supabase
    .from('integration_credentials')
    .delete()
    .eq('service', service);

  if (error) return { data: null, error: toErpError(error) };
  return { data: undefined, error: null };
}
