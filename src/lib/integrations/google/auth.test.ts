import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getValidAccessToken } from './auth';
import * as credentials from '@/lib/integrations/oauth/credentials';
import * as oauth from './oauth';

const SUPABASE = {} as never;

function stubLoaded(over: Partial<credentials.StoredOAuthCredentials> = {}) {
  vi.spyOn(credentials, 'loadOAuthCredentials').mockResolvedValue({
    data: {
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(), // fresh by default
      scope: ['scope-a'],
      keyVersion: 1,
      ...over,
    },
    error: null,
  });
}

describe('getValidAccessToken', () => {
  beforeEach(() => {
    vi.spyOn(credentials, 'storeOAuthCredentials').mockResolvedValue({
      data: undefined,
      error: null,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns the stored token untouched while fresh — no refresh call', async () => {
    stubLoaded();
    const refreshSpy = vi.spyOn(oauth, 'refreshAccessToken');
    const res = await getValidAccessToken(SUPABASE, 'photo-1');
    expect(res.data).toBe('stored-access');
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('refreshes when expired and stores the new token, keeping the stored refresh token', async () => {
    stubLoaded({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    vi.spyOn(oauth, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: null, // Google omits it on refresh
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: null,
    });

    const res = await getValidAccessToken(SUPABASE, 'photo-1');
    expect(res.data).toBe('new-access');

    const storeCall = vi.mocked(credentials.storeOAuthCredentials).mock.calls[0];
    expect(storeCall[3].refreshToken).toBe('stored-refresh'); // preserved
    expect(storeCall[3].accessToken).toBe('new-access');
    expect(storeCall[3].scope).toEqual(['scope-a']); // preserved when refresh omits
  });

  it('refreshes when expiry is within the 2-minute buffer', async () => {
    stubLoaded({ expiresAt: new Date(Date.now() + 30_000).toISOString() });
    const refreshSpy = vi.spyOn(oauth, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: null,
    });
    await getValidAccessToken(SUPABASE, 'photo-1');
    expect(refreshSpy).toHaveBeenCalledOnce();
  });

  it('returns the stored token when expired but no refresh token exists', async () => {
    stubLoaded({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      refreshToken: null,
    });
    const res = await getValidAccessToken(SUPABASE, 'photo-1');
    expect(res.data).toBe('stored-access'); // API call will surface the failure
  });

  it('propagates not_found when the service is not connected', async () => {
    vi.spyOn(credentials, 'loadOAuthCredentials').mockResolvedValue({
      data: null,
      error: { code: 'not_found', detail: 'integration_credentials calendar not found' },
    });
    const res = await getValidAccessToken(SUPABASE, 'photo-1');
    expect(res.error?.code).toBe('not_found');
  });
});
