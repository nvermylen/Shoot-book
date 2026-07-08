import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendEmail } from './client';
import * as auth from '@/lib/integrations/google/auth';
import { GoogleOAuthExchangeError } from '@/lib/integrations/google/oauth';

const SUPABASE = {} as never;
const NO_WAIT = { retryDelaysMs: [0, 0, 0] };

const INPUT = {
  to: 'susan@example.com',
  subject: 'Payment reminder',
  bodyHtml: '<p>Hi Susan, $250 is due Friday.</p>',
  bodyText: 'Hi Susan, $250 is due Friday.',
};

function stubToken(token = 'ya29.valid-token') {
  vi.spyOn(auth, 'getValidAccessToken').mockResolvedValue({ data: token, error: null });
}

function mockFetch(...responses: Array<{ status: number; body?: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    });
  }
  // Repeat the last response if the code retries beyond what was scripted.
  const last = responses[responses.length - 1];
  fn.mockResolvedValue({
    ok: last.status >= 200 && last.status < 300,
    status: last.status,
    json: async () => last.body ?? {},
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const OK_BODY = { id: 'msg-123', threadId: 'thr-456' };

describe('sendEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a base64url RFC 2822 message with bearer auth and returns ids', async () => {
    stubToken();
    const fetchMock = mockFetch({ status: 200, body: OK_BODY });

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ messageId: 'msg-123', threadId: 'thr-456' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer ya29.valid-token');

    const { raw } = JSON.parse(init.body as string) as { raw: string };
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: susan@example.com');
    expect(mime).toContain('Subject: Payment reminder');
    expect(mime).toContain('Content-Type: multipart/alternative');
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    // Parts are base64-encoded — bodies present after decode.
    expect(mime).toContain(Buffer.from(INPUT.bodyText, 'utf8').toString('base64'));
    expect(mime).toContain(Buffer.from(INPUT.bodyHtml, 'utf8').toString('base64'));
  });

  it('RFC 2047-encodes non-ASCII subjects', async () => {
    stubToken();
    const fetchMock = mockFetch({ status: 200, body: OK_BODY });

    await sendEmail(SUPABASE, 'photo-1', { ...INPUT, subject: 'Emma’s señior session' });

    const { raw } = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { raw: string };
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('Subject: =?UTF-8?B?');
    expect(mime).not.toContain('Subject: Emma’s');
  });

  it('backs off on 429 and succeeds on a later attempt', async () => {
    stubToken();
    const fetchMock = mockFetch(
      { status: 429 },
      { status: 429 },
      { status: 200, body: OK_BODY },
    );

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT, NO_WAIT);
    expect(res.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after max retries of 429 with an integration error', async () => {
    stubToken();
    const fetchMock = mockFetch({ status: 429 });

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT, NO_WAIT);
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ code: 'integration_error', detail: 'gmail api http_429' });
    // 1 initial attempt + 3 retries per the registry contract.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('maps 401 to integration_auth_error — the reconnect signal', async () => {
    stubToken();
    mockFetch({ status: 401 });

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT);
    expect(res.error?.code).toBe('integration_auth_error');
  });

  it('maps a revoked refresh grant (invalid_grant) to integration_auth_error', async () => {
    vi.spyOn(auth, 'getValidAccessToken').mockRejectedValue(
      new GoogleOAuthExchangeError('invalid_grant'),
    );

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT);
    expect(res.error?.code).toBe('integration_auth_error');
  });

  it('passes through credential-load errors (e.g. gmail not connected)', async () => {
    vi.spyOn(auth, 'getValidAccessToken').mockResolvedValue({
      data: null,
      error: { code: 'not_found', detail: 'integration_credentials gmail not found' },
    });

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT);
    expect(res.error?.code).toBe('not_found');
  });

  it('rejects a malformed gmail response', async () => {
    stubToken();
    mockFetch({ status: 200, body: { id: '' } });

    const res = await sendEmail(SUPABASE, 'photo-1', INPUT);
    expect(res.error).toEqual({ code: 'validation_error', detail: 'malformed gmail api response' });
  });

  it('never logs tokens or email content (ZDR / anti-pattern #11)', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');
    const warnSpy = vi.spyOn(console, 'warn');

    stubToken('ya29.SECRET-TOKEN');
    mockFetch({ status: 429 }); // exercise the failure path too
    const failed = await sendEmail(SUPABASE, 'photo-1', INPUT, NO_WAIT);
    mockFetch({ status: 200, body: OK_BODY });
    await sendEmail(SUPABASE, 'photo-1', INPUT);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    // Error details carry machine codes only.
    expect(failed.error?.detail).not.toContain('SECRET-TOKEN');
    expect(failed.error?.detail).not.toContain('Susan');
  });
});
