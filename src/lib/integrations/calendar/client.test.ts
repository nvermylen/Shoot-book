import { describe, it, expect, vi, afterEach } from 'vitest';
import { listCalendarEvents } from './client';
import * as auth from '@/lib/integrations/google/auth';

const SUPABASE = {} as never;
const WINDOW = { timeMin: '2026-07-06T00:00:00Z', timeMax: '2026-07-13T00:00:00Z' };

function stubToken(token = 'valid-token') {
  vi.spyOn(auth, 'getValidAccessToken').mockResolvedValue({ data: token, error: null });
}

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('listCalendarEvents', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps google events to the internal shape', async () => {
    stubToken();
    mockFetchOnce(200, {
      items: [
        {
          id: 'evt-1',
          status: 'confirmed',
          summary: 'Senior shoot — Emma',
          location: 'Riverside Park',
          start: { dateTime: '2026-07-08T17:30:00-05:00' },
          end: { dateTime: '2026-07-08T19:00:00-05:00' },
          attendees: [{ email: 'Emma@Example.com' }, { email: undefined }],
        },
      ],
    });

    const res = await listCalendarEvents(SUPABASE, 'photo-1', WINDOW);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([
      {
        id: 'evt-1',
        title: 'Senior shoot — Emma',
        start: '2026-07-08T17:30:00-05:00',
        end: '2026-07-08T19:00:00-05:00',
        allDay: false,
        location: 'Riverside Park',
        attendeeEmails: ['emma@example.com'], // lowercased, blanks dropped
        status: 'confirmed',
      },
    ]);
  });

  it('handles all-day events and missing optional fields', async () => {
    stubToken();
    mockFetchOnce(200, {
      items: [{ id: 'evt-2', start: { date: '2026-07-09' }, end: { date: '2026-07-10' } }],
    });
    const res = await listCalendarEvents(SUPABASE, 'photo-1', WINDOW);
    expect(res.data?.[0]).toMatchObject({
      id: 'evt-2',
      title: null,
      start: '2026-07-09',
      allDay: true,
      attendeeEmails: [],
      status: 'confirmed',
    });
  });

  it('drops cancelled events and events without a start', async () => {
    stubToken();
    mockFetchOnce(200, {
      items: [
        { id: 'evt-3', status: 'cancelled', start: { dateTime: '2026-07-08T10:00:00Z' } },
        { id: 'evt-4' }, // no start
        { id: 'evt-5', status: 'tentative', start: { dateTime: '2026-07-08T10:00:00Z' } },
      ],
    });
    const res = await listCalendarEvents(SUPABASE, 'photo-1', WINDOW);
    expect(res.data?.map((e) => e.id)).toEqual(['evt-5']);
    expect(res.data?.[0].status).toBe('tentative');
  });

  it('sends the window params and bearer token', async () => {
    stubToken('the-token');
    const fetchMock = mockFetchOnce(200, { items: [] });
    await listCalendarEvents(SUPABASE, 'photo-1', { ...WINDOW, maxResults: 50 });

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('timeMin')).toBe(WINDOW.timeMin);
    expect(parsed.searchParams.get('timeMax')).toBe(WINDOW.timeMax);
    expect(parsed.searchParams.get('singleEvents')).toBe('true');
    expect(parsed.searchParams.get('maxResults')).toBe('50');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer the-token' });
  });

  it('returns integration_error on API failure — no token in the detail', async () => {
    stubToken('secret-token');
    mockFetchOnce(401, { error: { message: 'Invalid Credentials' } });
    const res = await listCalendarEvents(SUPABASE, 'photo-1', WINDOW);
    expect(res.error?.code).toBe('integration_error');
    expect(res.error?.detail).toBe('calendar api http_401');
    expect(res.error?.detail).not.toContain('secret-token');
  });

  it('returns validation_error on a malformed response', async () => {
    stubToken();
    mockFetchOnce(200, { items: [{ id: 42 }] }); // id must be string
    const res = await listCalendarEvents(SUPABASE, 'photo-1', WINDOW);
    expect(res.error?.code).toBe('validation_error');
  });

  it('propagates not-connected from the token layer without calling the API', async () => {
    vi.spyOn(auth, 'getValidAccessToken').mockResolvedValue({
      data: null,
      error: { code: 'not_found', detail: 'integration_credentials calendar not found' },
    });
    const fetchMock = mockFetchOnce(200, {});
    const res = await listCalendarEvents(SUPABASE, 'photo-1', WINDOW);
    expect(res.error?.code).toBe('not_found');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
