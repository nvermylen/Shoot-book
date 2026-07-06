import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntegrationService } from '@/types/erp';
import type { ErpResult } from '@/lib/erp/types';
import { toErpError } from '@/lib/erp/types';

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
