import { z } from 'zod';

/**
 * Google OAuth 2.0 helper — consent URL construction, code exchange, refresh.
 *
 * Confined to the integrations layer (anti-pattern #4): no other module talks
 * to Google's OAuth endpoints. Plain fetch against the documented endpoints —
 * no SDK needed for OAuth itself. External responses are Zod-validated at the
 * boundary. Token values are returned to the caller (which encrypts them via
 * integrations/oauth/credentials) and are NEVER logged (anti-pattern #11).
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/**
 * The one combined consent request (LENS-D-025 / spec D6): Calendar and Gmail
 * share a single Google identity and a single "Connect Google" action. Never
 * request gmail.send alone — a narrower re-consent can drop the calendar grant
 * that LENS-021 sync depends on.
 */
export const GOOGLE_CONNECT_SCOPES = [CALENDAR_READONLY_SCOPE, GMAIL_SEND_SCOPE];

export class GoogleOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleOAuthConfigError';
  }
}

export class GoogleOAuthExchangeError extends Error {
  /** Google's machine error code (e.g. "invalid_grant") — never contains tokens. */
  readonly code: string;
  constructor(code: string) {
    super(`google token exchange failed: ${code}`);
    this.name = 'GoogleOAuthExchangeError';
    this.code = code;
  }
}

function getClientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new GoogleOAuthConfigError('GOOGLE_OAUTH_CLIENT_ID is not set');
  return v;
}

function getClientSecret(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!v) throw new GoogleOAuthConfigError('GOOGLE_OAUTH_CLIENT_SECRET is not set');
  return v;
}

/**
 * Build the consent-screen URL. `access_type=offline` + `prompt=consent` force
 * Google to issue a refresh token every time (not just the first connect).
 * `include_granted_scopes=true` folds previously granted scopes into the new
 * grant so a re-consent never silently narrows what the stored tokens can do.
 */
export function buildConsentUrl(input: {
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: (input.scopes ?? GOOGLE_CONNECT_SCOPES).join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string(),
});

const errorResponseSchema = z.object({
  error: z.string(),
});

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  /** ISO 8601 expiry computed from expires_in. */
  expiresAt: string;
  scope: string[] | null;
}

function toGoogleTokens(raw: z.infer<typeof tokenResponseSchema>): GoogleTokens {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: new Date(Date.now() + raw.expires_in * 1000).toISOString(),
    scope: raw.scope ? raw.scope.split(' ') : null,
  };
}

async function postTokenEndpoint(body: URLSearchParams): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json: unknown = await res.json();

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json);
    throw new GoogleOAuthExchangeError(
      parsed.success ? parsed.data.error : `http_${res.status}`,
    );
  }

  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new GoogleOAuthExchangeError('malformed_token_response');
  }
  return toGoogleTokens(parsed.data);
}

/** Exchange an authorization code (from the callback) for tokens. */
export async function exchangeCodeForTokens(input: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  return postTokenEndpoint(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: input.redirectUri,
    }),
  );
}

/**
 * Granular-consent guard (LENS-D-025 / spec D6): Google lets the user uncheck
 * individual scopes on the consent screen, so the callback must decide per
 * service from the scopes the token response says were ACTUALLY granted —
 * never from what was requested. A credential row must never claim a scope
 * its token lacks; that lie surfaces days later as a mid-chase 403.
 */
export function resolveGrantedServices(scope: string[] | null): {
  calendar: boolean;
  gmail: boolean;
} {
  const granted = new Set(scope ?? []);
  return {
    calendar: granted.has(CALENDAR_READONLY_SCOPE),
    gmail: granted.has(GMAIL_SEND_SCOPE),
  };
}

/**
 * Refresh an access token. Google usually omits refresh_token in this response;
 * callers should keep the stored one when `refreshToken` comes back null.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  return postTokenEndpoint(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
    }),
  );
}
