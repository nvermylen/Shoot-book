import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '@/lib/erp/types';
import { getValidAccessToken } from '@/lib/integrations/google/auth';
import { GoogleOAuthExchangeError } from '@/lib/integrations/google/oauth';

/**
 * Gmail adapter — the ONLY file that talks to the Gmail API (anti-pattern
 * #4). LENS-022d shipped the `gmail.send` slice (payment reminders from the
 * photographer's own address); LENS-023a adds the read slice (inbox listing
 * + message fetch) for lead intake. Pub/Sub push, thread reads, search, and
 * labels remain later tickets.
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
 * Load a currently-valid access token, mapping a revoked refresh grant
 * (invalid_grant) to the reconnect signal. Shared by every Gmail call.
 */
async function getGmailAccessToken(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<ErpResult<string>> {
  try {
    return await getValidAccessToken(supabase, photographerId, 'gmail');
  } catch (err) {
    if (err instanceof GoogleOAuthExchangeError && err.code === 'invalid_grant') {
      return {
        data: null,
        error: { code: 'integration_auth_error', detail: 'gmail token refresh: invalid_grant' },
      };
    }
    throw err;
  }
}

/** Bearer-authed fetch with the registry's 429 backoff (max 3 retries). */
async function gmailRequest(
  accessToken: string,
  url: string,
  init: RequestInit,
  retryDelays: number[],
): Promise<Response> {
  let res: Response | undefined;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });
    if (res.status !== 429) break;
    if (attempt < retryDelays.length) await sleep(retryDelays[attempt]);
  }
  // The loop always assigns res at least once; this keeps TS honest.
  if (!res) throw new Error('unreachable: gmailRequest made no attempt');
  return res;
}

function statusError(res: Response): ErpResult<never> {
  if (res.status === 401) {
    return {
      data: null,
      error: { code: 'integration_auth_error', detail: 'gmail api http_401 — reconnect Google' },
    };
  }
  return {
    data: null,
    error: { code: 'integration_error', detail: `gmail api http_${res.status}` },
  };
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
  const token = await getGmailAccessToken(supabase, photographerId);
  if (token.error) return { data: null, error: token.error };

  const raw = Buffer.from(buildMimeMessage(input), 'utf8').toString('base64url');

  const res = await gmailRequest(
    token.data,
    SEND_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    },
    opts?.retryDelaysMs ?? RETRY_DELAYS_MS,
  );
  if (!res.ok) return statusError(res);

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

// ---------------------------------------------------------------------------
// Read slice (LENS-023a) — inbox listing + message fetch for lead intake.
// Requires the gmail.readonly scope (granted via the combined consent,
// recorded in the credential row's scope[]; intake gates on it).
// ---------------------------------------------------------------------------

const MESSAGES_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

const listResponseSchema = z.object({
  messages: z
    .array(z.object({ id: z.string().min(1), threadId: z.string().min(1) }))
    .optional(),
});

const headerSchema = z.object({ name: z.string(), value: z.string() });

// Recursive part schema — Gmail nests multipart/* arbitrarily deep.
interface RawPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: RawPart[];
}
const partSchema: z.ZodType<RawPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(partSchema).optional(),
  }),
);

const messageResponseSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  internalDate: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  payload: z
    .object({
      mimeType: z.string().optional(),
      headers: z.array(headerSchema).optional(),
      body: z.object({ data: z.string().optional() }).optional(),
      parts: z.array(partSchema).optional(),
    })
    .optional(),
});

export interface InboxMessageRef {
  id: string;
  threadId: string;
}

export interface InboundMessage {
  messageId: string;
  threadId: string;
  /** First message of its thread (Gmail: message id === thread id). */
  isThreadStart: boolean;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  bodyText: string;
  /** ISO 8601, from Gmail's internalDate. */
  receivedAt: string;
  /** Gmail system/user labels (e.g. SENT marks mail this account sent). */
  labelIds: string[];
}

// RFC 2047 encoded-word decoding — inbound subjects and display names arrive
// as =?charset?B|Q?...?=. Unknown charsets fall back to utf8; a word that
// fails to decode is passed through raw rather than dropped.
function decodeQ(text: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '_') {
      bytes.push(0x20);
    } else if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(text.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodeMimeWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (whole, charset: string, enc: string, text: string) => {
      try {
        const buf =
          enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : decodeQ(text);
        const cs = charset.toLowerCase();
        return buf.toString(cs.includes('8859') || cs === 'latin1' ? 'latin1' : 'utf8');
      } catch {
        return whole;
      }
    },
  );
}

/** Parse a From: header — `Name <a@b>`, `"Name" <a@b>`, or a bare address. */
function parseFromHeader(value: string): { name: string | null; email: string } | null {
  const decoded = decodeMimeWords(value).trim();
  const angled = decoded.match(/^(?:"?([^"<]*)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/);
  if (angled) {
    return { name: angled[1]?.trim() || null, email: angled[2].trim().toLowerCase() };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded)) {
    return { name: null, email: decoded.toLowerCase() };
  }
  return null;
}

function findPartBody(part: RawPart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findPartBody(child, mimeType);
    if (found) return found;
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBody(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

/**
 * List recent inbox message refs. Stateless by design (spec LENS-023 D1):
 * callers re-query a rolling window each run and rely on source_message_id
 * dedup — no sync cursor to corrupt.
 */
export async function listInboxMessageIds(
  supabase: SupabaseClient,
  photographerId: string,
  opts?: { newerThanDays?: number; maxResults?: number; retryDelaysMs?: number[] },
): Promise<ErpResult<InboxMessageRef[]>> {
  const token = await getGmailAccessToken(supabase, photographerId);
  if (token.error) return { data: null, error: token.error };

  const params = new URLSearchParams({
    q: `in:inbox newer_than:${opts?.newerThanDays ?? 2}d`,
    maxResults: String(opts?.maxResults ?? 50),
  });
  const res = await gmailRequest(
    token.data,
    `${MESSAGES_ENDPOINT}?${params.toString()}`,
    { method: 'GET' },
    opts?.retryDelaysMs ?? RETRY_DELAYS_MS,
  );
  if (!res.ok) return statusError(res);

  const json: unknown = await res.json();
  const parsed = listResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { data: null, error: { code: 'validation_error', detail: 'malformed gmail api response' } };
  }
  return { data: parsed.data.messages ?? [], error: null };
}

/**
 * Fetch one message as a clean internal shape: headers parsed (RFC 2047
 * decoded), text/plain body preferred with an HTML-strip fallback. Returns
 * null data with a validation error when the message has no parseable
 * sender — callers skip it (a message we can't attribute can't be a lead).
 */
export async function getMessage(
  supabase: SupabaseClient,
  photographerId: string,
  messageId: string,
  opts?: { retryDelaysMs?: number[] },
): Promise<ErpResult<InboundMessage>> {
  const token = await getGmailAccessToken(supabase, photographerId);
  if (token.error) return { data: null, error: token.error };

  const res = await gmailRequest(
    token.data,
    `${MESSAGES_ENDPOINT}/${encodeURIComponent(messageId)}?format=full`,
    { method: 'GET' },
    opts?.retryDelaysMs ?? RETRY_DELAYS_MS,
  );
  if (!res.ok) return statusError(res);

  const json: unknown = await res.json();
  const parsed = messageResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { data: null, error: { code: 'validation_error', detail: 'malformed gmail api response' } };
  }
  const msg = parsed.data;

  const headers = msg.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  const fromRaw = header('From');
  const from = fromRaw ? parseFromHeader(fromRaw) : null;
  if (!from) {
    return { data: null, error: { code: 'validation_error', detail: 'message has no parseable From header' } };
  }

  const root: RawPart = msg.payload ?? {};
  const plain = findPartBody(root, 'text/plain');
  const html = plain ? null : findPartBody(root, 'text/html');
  const bodyText = plain ? decodeBody(plain).trim() : html ? stripHtml(decodeBody(html)) : '';

  return {
    data: {
      messageId: msg.id,
      threadId: msg.threadId,
      isThreadStart: msg.id === msg.threadId,
      fromName: from.name,
      fromEmail: from.email,
      subject: decodeMimeWords(header('Subject') ?? '').trim(),
      bodyText,
      receivedAt: msg.internalDate
        ? new Date(Number(msg.internalDate)).toISOString()
        : new Date().toISOString(),
      labelIds: msg.labelIds ?? [],
    },
    error: null,
  };
}
