import { describe, it, expect, vi, afterEach } from 'vitest';
import { isServiceConnected } from './status';

/** Mock: from().select(sel, {count,head}).eq() -> { count, error }. */
function mockCount(result: { count: number | null; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ eq });
  return { supabase: { from: vi.fn().mockReturnValue({ select }) }, select, eq };
}

describe('isServiceConnected', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns true when a credential row exists for the service', async () => {
    const { supabase, eq } = mockCount({ count: 1, error: null });
    const res = await isServiceConnected(supabase as never, 'calendar');
    expect(res.error).toBeNull();
    expect(res.data).toBe(true);
    expect(eq).toHaveBeenCalledWith('service', 'calendar');
  });

  it('returns false when no row exists (count 0)', async () => {
    const { supabase } = mockCount({ count: 0, error: null });
    const res = await isServiceConnected(supabase as never, 'calendar');
    expect(res.error).toBeNull();
    expect(res.data).toBe(false);
  });

  it('treats a null count as not connected', async () => {
    const { supabase } = mockCount({ count: null, error: null });
    const res = await isServiceConnected(supabase as never, 'calendar');
    expect(res.data).toBe(false);
  });

  it('uses a head/count query — never selects token columns', async () => {
    const { supabase, select } = mockCount({ count: 1, error: null });
    await isServiceConnected(supabase as never, 'calendar');
    const [columns, opts] = select.mock.calls[0];
    expect(columns).toBe('service');
    expect(opts).toMatchObject({ head: true, count: 'exact' });
    // no ciphertext columns are ever requested
    expect(columns).not.toContain('ciphertext');
  });

  it('surfaces db errors as an erp error', async () => {
    // 42P01 (undefined_table) — a generic db failure. Note 42501 would map to
    // rls_denied via toErpError, which is its own classification, not db_error.
    const { supabase } = mockCount({ count: null, error: { code: '42P01', message: 'missing' } });
    const res = await isServiceConnected(supabase as never, 'calendar');
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('db_error');
  });
});
