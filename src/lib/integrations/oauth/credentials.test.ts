import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  storeOAuthCredentials,
  loadOAuthCredentials,
  deleteOAuthCredentials,
} from './credentials';

const VALID_KEY = randomBytes(32).toString('base64');
const ACCESS = 'ya29.a0AfH6SMB_access_token_plaintext';
const REFRESH = '1//refresh_token_plaintext';

/** Mock for the store path: from().upsert() -> { error }. Captures the row. */
function mockUpsert(result: { error: unknown } = { error: null }) {
  const upsert = vi.fn().mockResolvedValue(result);
  return { supabase: { from: vi.fn().mockReturnValue({ upsert }) }, upsert };
}

/** Mock for the load path: from().select().eq().maybeSingle() -> { data, error }. */
function mockLoad(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return { from: vi.fn().mockReturnValue(chain) };
}

/** Mock for delete: from().delete().eq() -> { error }. */
function mockDelete(result: { error: unknown } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const del = vi.fn().mockReturnValue({ eq });
  return { supabase: { from: vi.fn().mockReturnValue({ delete: del }) }, eq };
}

describe('oauth credentials store', () => {
  let originalKey: string | undefined;
  beforeEach(() => {
    originalKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('encrypts tokens before storing — ciphertext is bytea hex, never plaintext', async () => {
    const { supabase, upsert } = mockUpsert();
    const res = await storeOAuthCredentials(supabase as never, 'photo-1', 'calendar', {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: '2026-07-02T18:00:00Z',
      scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    expect(res.error).toBeNull();
    const row = upsert.mock.calls[0][0];
    // stored as \x-prefixed hex, and the plaintext appears nowhere
    expect(row.access_token_ciphertext).toMatch(/^\\x[0-9a-f]+$/);
    expect(row.refresh_token_ciphertext).toMatch(/^\\x[0-9a-f]+$/);
    expect(row.access_token_ciphertext).not.toContain(ACCESS);
    expect(JSON.stringify(row)).not.toContain(ACCESS);
    expect(JSON.stringify(row)).not.toContain(REFRESH);
    expect(row.key_version).toBe(1);
    expect(row.photographer_id).toBe('photo-1');
    expect(row.service).toBe('calendar');
  });

  it('stores null refresh ciphertext when no refresh token given', async () => {
    const { supabase, upsert } = mockUpsert();
    await storeOAuthCredentials(supabase as never, 'photo-1', 'calendar', { accessToken: ACCESS });
    expect(upsert.mock.calls[0][0].refresh_token_ciphertext).toBeNull();
  });

  it('surfaces db errors', async () => {
    const { supabase } = mockUpsert({ error: { code: '23505', message: 'dupe' } });
    const res = await storeOAuthCredentials(supabase as never, 'photo-1', 'calendar', { accessToken: ACCESS });
    expect(res.error?.code).toBe('db_error');
  });

  it('round-trips: stored ciphertext decrypts back to the original tokens', async () => {
    // capture what store would write, then feed it to the load mock
    const { supabase, upsert } = mockUpsert();
    await storeOAuthCredentials(supabase as never, 'photo-1', 'calendar', {
      accessToken: ACCESS,
      refreshToken: REFRESH,
    });
    const stored = upsert.mock.calls[0][0];

    const loadSupabase = mockLoad({
      data: {
        access_token_ciphertext: stored.access_token_ciphertext,
        refresh_token_ciphertext: stored.refresh_token_ciphertext,
        key_version: stored.key_version,
        expires_at: null,
        scope: null,
      },
      error: null,
    });

    const res = await loadOAuthCredentials(loadSupabase as never, 'calendar');
    expect(res.error).toBeNull();
    expect(res.data?.accessToken).toBe(ACCESS);
    expect(res.data?.refreshToken).toBe(REFRESH);
  });

  it('returns not_found when the service is not connected', async () => {
    const loadSupabase = mockLoad({ data: null, error: null });
    const res = await loadOAuthCredentials(loadSupabase as never, 'calendar');
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('not_found');
  });

  it('deletes credentials on disconnect', async () => {
    const { supabase, eq } = mockDelete();
    const res = await deleteOAuthCredentials(supabase as never, 'calendar');
    expect(res.error).toBeNull();
    expect(eq).toHaveBeenCalledWith('service', 'calendar');
  });
});
