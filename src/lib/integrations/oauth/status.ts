import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntegrationService } from '@/types/erp';
import type { ErpResult } from '@/lib/erp/types';
import { toErpError } from '@/lib/erp/types';
import { GMAIL_READONLY_SCOPE } from '@/lib/integrations/google/oauth';

/**
 * Lightweight connection check for external integrations.
 *
 * Answers "is this service connected for the current photographer?" WITHOUT
 * loading or decrypting any tokens — it only asks whether a credential row
 * exists. RLS scopes the query to `auth.uid()`, so a caller only ever sees
 * their own connection state. Used by the dashboard to choose between the
 * "connect Google Calendar" prompt and live data (LENS-021d, Rule 4: honest
 * states, never a fabricated row).
 */
export async function isServiceConnected(
  supabase: SupabaseClient,
  service: IntegrationService,
): Promise<ErpResult<boolean>> {
  const { count, error } = await supabase
    .from('integration_credentials')
    .select('service', { count: 'exact', head: true })
    .eq('service', service);

  if (error) return { data: null, error: toErpError(error) };
  return { data: (count ?? 0) > 0, error: null };
}

/**
 * Is Gmail READING granted for the current photographer? Checks the `gmail`
 * row's verified scope[] (LENS-D-025: a row never claims a scope its token
 * lacks). Distinct from isServiceConnected('gmail'), which keys on the row's
 * existence (= gmail.send): a send-only grant keeps the payment chase alive
 * while intake reports "connect Gmail reading to capture inquiries"
 * (LENS-023b D4). Reads scope only — never token columns.
 */
export async function isGmailReadGranted(
  supabase: SupabaseClient,
): Promise<ErpResult<boolean>> {
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('scope')
    .eq('service', 'gmail')
    .maybeSingle();

  if (error) return { data: null, error: toErpError(error) };
  return {
    data: ((data?.scope as string[] | null) ?? []).includes(GMAIL_READONLY_SCOPE),
    error: null,
  };
}
