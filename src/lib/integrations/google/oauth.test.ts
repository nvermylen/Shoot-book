import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildConsentUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  resolveGrantedServices,
  GoogleOAuthConfigError,
  GoogleOAuthExchangeError,
  CALENDAR_READONLY_SCOPE,
  GMAIL_SEND_SCOPE,
  GMAIL_READONLY_SCOPE,
} from './oauth';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-test-secret';
const REDIRECT = 'http://localhost:3000/api/integrations/google/callback';

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('google oauth helper', () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = CLIENT_SECRET;
  });
  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('buildConsentUrl', () => {
    it('includes offline access, forced consent, scope, state, and redirect', () => {
      const url = new URL(buildConsentUrl({ redirectUri: REDIRECT, state: 'abc123' }));
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
      expect(url.searchParams.get('response_type')).toBe('code');
      // One combined consent — calendar read + gmail.send + gmail.readonly
      // (LENS-D-025; readonly added by LENS-023a per the revisit trigger).
      expect(url.searchParams.get('scope')).toBe(
        `${CALENDAR_READONLY_SCOPE} ${GMAIL_SEND_SCOPE} ${GMAIL_READONLY_SCOPE}`,
      );
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('abc123');
    });

    it('never includes the client secret', () => {
      const url = buildConsentUrl({ redirectUri: REDIRECT, state: 's' });
      expect(url).not.toContain(CLIENT_SECRET);
    });

    it('throws a config error when client id is missing', () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      expect(() => buildConsentUrl({ redirectUri: REDIRECT, state: 's' })).toThrow(
        GoogleOAuthConfigError,
      );
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('parses a valid token response and computes expiry', async () => {
      const before = Date.now();
      mockFetchOnce(200, {
        access_token: 'ya29.access',
        refresh_token: '1//refresh',
        expires_in: 3600,
        scope: CALENDAR_READONLY_SCOPE,
        token_type: 'Bearer',
      });

      const tokens = await exchangeCodeForTokens({ code: 'auth-code', redirectUri: REDIRECT });
      expect(tokens.accessToken).toBe('ya29.access');
      expect(tokens.refreshToken).toBe('1//refresh');
      expect(tokens.scope).toEqual([CALENDAR_READONLY_SCOPE]);
      const expiresMs = new Date(tokens.expiresAt).getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(before + 3599 * 1000);
      expect(expiresMs).toBeLessThanOrEqual(Date.now() + 3601 * 1000);
    });

    it('sends grant_type=authorization_code with code and secret in the body', async () => {
      const fetchMock = mockFetchOnce(200, {
        access_token: 'a', expires_in: 60, token_type: 'Bearer',
      });
      await exchangeCodeForTokens({ code: 'the-code', redirectUri: REDIRECT });

      const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('the-code');
      expect(body.get('client_secret')).toBe(CLIENT_SECRET);
      expect(body.get('redirect_uri')).toBe(REDIRECT);
    });

    it('throws with Google error code on failure — message carries no token', async () => {
      mockFetchOnce(400, { error: 'invalid_grant' });
      const err: unknown = await exchangeCodeForTokens({ code: 'bad', redirectUri: REDIRECT }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(GoogleOAuthExchangeError);
      const exchangeErr = err as GoogleOAuthExchangeError;
      expect(exchangeErr.code).toBe('invalid_grant');
      expect(exchangeErr.message).not.toContain('ya29');
    });

    it('rejects a malformed success response', async () => {
      mockFetchOnce(200, { access_token: '', expires_in: -1 });
      await expect(
        exchangeCodeForTokens({ code: 'c', redirectUri: REDIRECT }),
      ).rejects.toMatchObject({ code: 'malformed_token_response' });
    });
  });

  describe('resolveGrantedServices', () => {
    it('recognizes all capabilities when the full union was granted', () => {
      expect(
        resolveGrantedServices([
          CALENDAR_READONLY_SCOPE,
          GMAIL_SEND_SCOPE,
          GMAIL_READONLY_SCOPE,
        ]),
      ).toEqual({ calendar: true, gmail: true, gmailRead: true });
    });

    it('handles partial grants — each capability tracked independently', () => {
      expect(resolveGrantedServices([CALENDAR_READONLY_SCOPE])).toEqual({
        calendar: true,
        gmail: false,
        gmailRead: false,
      });
      // Send without readonly: chase alive, intake off.
      expect(resolveGrantedServices([GMAIL_SEND_SCOPE])).toEqual({
        calendar: false,
        gmail: true,
        gmailRead: false,
      });
      // Readonly without send: no gmail row is created (callback keys on
      // gmail/send) — intake reports not-connected rather than half-working.
      expect(resolveGrantedServices([GMAIL_READONLY_SCOPE])).toEqual({
        calendar: false,
        gmail: false,
        gmailRead: true,
      });
    });

    it('treats a missing scope field as nothing verified — never assume from the request', () => {
      expect(resolveGrantedServices(null)).toEqual({
        calendar: false,
        gmail: false,
        gmailRead: false,
      });
      expect(resolveGrantedServices([])).toEqual({
        calendar: false,
        gmail: false,
        gmailRead: false,
      });
    });

    it('ignores unrelated scopes (openid, email, …)', () => {
      expect(
        resolveGrantedServices(['openid', 'https://www.googleapis.com/auth/userinfo.email']),
      ).toEqual({ calendar: false, gmail: false, gmailRead: false });
    });
  });

  describe('refreshAccessToken', () => {
    it('returns null refreshToken when Google omits it (normal on refresh)', async () => {
      mockFetchOnce(200, { access_token: 'ya29.new', expires_in: 3600, token_type: 'Bearer' });
      const tokens = await refreshAccessToken('1//stored-refresh');
      expect(tokens.accessToken).toBe('ya29.new');
      expect(tokens.refreshToken).toBeNull();
    });

    it('sends grant_type=refresh_token with the stored token', async () => {
      const fetchMock = mockFetchOnce(200, {
        access_token: 'a', expires_in: 60, token_type: 'Bearer',
      });
      await refreshAccessToken('1//stored-refresh');
      const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('1//stored-refresh');
    });
  });
});
