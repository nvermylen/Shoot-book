import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { runGmailLeadIntakeAll } from '@/lib/erp/lead/intake';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron entry point for Gmail lead intake (LENS-023b; every 10 minutes
 * per spec D1 — speed-to-lead ≤10min beats inquiries sitting in Gmail for
 * hours). Stateless: each run re-queries a rolling inbox window; the
 * (photographer_id, source_message_id) unique index makes overlapping or
 * repeated invocations no-ops.
 *
 * Auth: CRON_SECRET bearer check, same contract as the invoice-chase route —
 * no user session, admin client, every runner query explicitly
 * photographer-scoped. Fails closed when CRON_SECRET is unset.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('cron.gmail_lead_intake.missing_secret');
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
  const result = await runGmailLeadIntakeAll(supabase);

  if (result.error) {
    console.error('cron.gmail_lead_intake.run_failed', { code: result.error.code });
    return NextResponse.json({ error: result.error.code }, { status: 500 });
  }

  // Counts and IDs only — never sender addresses, subjects, or bodies (#11).
  const {
    agent_unavailable,
    photographers,
    readonly_missing,
    credentials_broken,
    seen,
    candidates,
    created,
    duplicates,
    skipped,
    errors,
  } = result.data;
  if (errors.length > 0) {
    console.error('cron.gmail_lead_intake.partial_errors', { count: errors.length });
  }
  if (agent_unavailable) {
    console.error('cron.gmail_lead_intake.agent_unavailable');
  }
  return NextResponse.json({
    ok: true,
    agent_unavailable,
    photographers,
    readonly_missing,
    credentials_broken,
    seen,
    candidates,
    created,
    duplicates,
    skipped,
    error_count: errors.length,
  });
}
