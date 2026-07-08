import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '@/lib/erp/types';
import { getValidAccessToken } from '@/lib/integrations/google/auth';
import { GoogleOAuthExchangeError } from '@/lib/integrations/google/oauth';

/**
 * Gmail outbound adapter — the ONLY file that talks to the Gmail API
 * (anti-pattern #4). LENS-022d ships the minimal `gmail.send` slice: payment
 * reminders must come from the photographer's own address so replies land in
 * the inbox she already works. Inbound (Pub/Sub), thread reads, search, and
 * labels are a later ticket.
 *
 * Error contract (INTEGRATION_REGISTRY): 429 → exponential backoff, max 3
 * retries; 401 / revoked grant → `integration_auth_error`, which callers must
 * surface as a "reconnect Google" state — never a silent stop. Neither tokens
 * nor email content are ever logged (anti-pattern #11); `comm_log` is the
 * ledger for content.
 */

const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/** Exponential backoff schedule for 429s — max 3 retries per the registry. */
const RETRY_DELAYS_MS = [500, 1000, 2000];

// --- External boundary schema (only the fields we consume) ---------------

const sendResponseSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
});

// --- Internal shape --------------------------------------------------------

export interface SendEmailInput {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface SentMessage {
  /** Gmail message id — maps to comm_log.external_message_id. */
  messageId: string;
  threadId: string;
}

// RFC 2047 encoded-word — Subject lines like "Emma's señor session" must
// survive the RFC 2822 ASCII envelope.
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * Build the RFC 2822 message Gmail expects in `raw`: multipart/alternative
 * with text/plain first, text/html last (clients render the last part they
 * support). Parts are base64-encoded so arbitrary UTF-8 bodies are safe.
 */
function buildMimeMessage(input: SendEmailInput): string {
  const boundary = `lens_${randomBytes(12).toString('hex')}`;
  return [
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.bodyText, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.bodyHtml, 'utf8').toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send an email as the connected photographer. Returns Gmail's message and
 * thread ids on success — the caller (chase engine, LENS-022e) writes the
 * `comm_log` row AFTER a successful send (send-then-log per spec D5;
 * DECISIONS_LOG entry lands with 022e).
 */
export async function sendEmail(
  supabase: SupabaseClient,
  photographerId: string,
  input: SendEmailInput,
  opts?: { retryDelaysMs?: number[] },
): Promise<ErpResult<SentMessage>> {
  let accessToken: string;
  try {
    const token = await getValidAccessToken(supabase, photographerId, 'gmail');
    if (token.error) return { data: null, error: token.error };
    accessToken = token.data;
  } catch (err) {
    // Refresh failed at the OAuth endpoint. invalid_grant = the user revoked
    // access (or the refresh token died) — reconnect is the only fix.
    if (err instanceof GoogleOAuthExchangeError && err.code === 'invalid_grant') {
      return {
        data: null,
        error: { code: 'integration_auth_error', detail: 'gmail token refresh: invalid_grant' },
      };
    }
    throw err;
  }

  const raw = Buffer.from(buildMimeMessage(input), 'utf8').toString('base64url');
  const retryDelays = opts?.retryDelaysMs ?? RETRY_DELAYS_MS;

  let res: Response | undefined;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    res = await fetch(SEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (res.status !== 429) break;
    if (attempt < retryDelays.length) await sleep(retryDelays[attempt]);
  }
  // Loop always assigns res at least once; the check keeps TS honest.
  if (!res) {
    return { data: null, error: { code: 'integration_error', detail: 'gmail api unreachable' } };
  }

  if (res.status === 401) {
    return {
      data: null,
      error: { code: 'integration_auth_error', detail: 'gmail api http_401 — reconnect Google' },
    };
  }
  if (!res.ok) {
    return {
      data: null,
      error: { code: 'integration_error', detail: `gmail api http_${res.status}` },
    };
  }

  const json: unknown = await res.json();
  const parsed = sendResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: 'validation_error', detail: 'malformed gmail api response' },
    };
  }

  return {
    data: { messageId: parsed.data.id, threadId: parsed.data.threadId },
    error: null,
  };
}
