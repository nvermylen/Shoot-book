import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { runInvoiceChase } from '@/lib/erp/invoice/chase';

export const dynamic = 'force-dynamic';

/**
 * Hourly Vercel Cron entry point for the payment chase (LENS-022e; schedule
 * in vercel.json). Hourly because send timing is local — the runner fires a
 * step only when it's 8–10am in each photographer's timezone.
 *
 * Auth: CRON_SECRET bearer check — this route has no user session, which is
 * also why it uses the admin client (cron is a system actor; every query in
 * the runner is explicitly photographer-scoped because RLS does not apply to
 * the service role). Fails closed when CRON_SECRET is unset.
 *
 * Idempotent per hour: chase state derives from comm_log (at most one
 * reminder per invoice per local day), so overlapping or repeated
 * invocations never double-send (LENS-D-024).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('cron.invoice_chase.missing_secret');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const authBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  const authorized =
    authBuf.length === expectedBuf.length && timingSafeEqual(authBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runInvoiceChase(supabase);

  if (result.error) {
    console.error('cron.invoice_chase.run_failed', { code: result.error.code });
    return NextResponse.json({ error: result.error.code }, { status: 500 });
  }

  // Counts and IDs only — never recipient addresses or body content (#11).
  const { sent, escalated, photographers, credentials_broken, skipped, errors } = result.data;
  if (errors.length > 0) {
    console.error('cron.invoice_chase.partial_errors', { count: errors.length });
  }
  return NextResponse.json({
    ok: true,
    photographers,
    sent,
    escalated,
    credentials_broken,
    skipped,
    error_count: errors.length,
  });
}
