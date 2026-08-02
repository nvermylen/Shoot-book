import { describe, it, expect, vi } from 'vitest';
import { getPhotographer } from './index';

function mockSupabase(singleResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(singleResult),
  };
  chain.select.mockReturnValue(chain);
  return { from: vi.fn().mockReturnValue(chain) };
}

const PHOTOGRAPHER_ROW = {
  id: 'photo-1',
  business_name: 'Reyes Portrait Co.',
  display_name: 'Morgan Reyes',
  timezone: 'America/Chicago',
  default_email_signature: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

describe('getPhotographer', () => {
  it('returns the visible photographer row', async () => {
    const supabase = mockSupabase({ data: PHOTOGRAPHER_ROW, error: null });
    const result = await getPhotographer(supabase as never);

    expect(result.error).toBeNull();
    expect(result.data).toEqual(PHOTOGRAPHER_ROW);
    expect(supabase.from).toHaveBeenCalledWith('photographer');
  });

  it('maps a query error to an ErpError', async () => {
    const supabase = mockSupabase({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });
    const result = await getPhotographer(supabase as never);

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });
});
