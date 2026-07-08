import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { callTool, clearTools, getTool, ToolPermissionError } from './registry';
import { registerGmailSendTool } from './gmail-send';
import { IntegrationAuthError } from '@/lib/integrations/errors';
import { sendEmail } from '@/lib/integrations/gmail/client';
import type { ToolContext } from '@/types/agent';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/integrations/gmail/client', () => ({
  sendEmail: vi.fn(),
}));

const sendEmailMock = vi.mocked(sendEmail);

function makeCtx(agentId: ToolContext['agentId'] = 'billing'): ToolContext {
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  return {
    agentId,
    photographerId: 'phot-001',
    supabase: { from: vi.fn().mockReturnValue({ insert: insertFn }) } as unknown as SupabaseClient,
  };
}

const INPUT = {
  to: 'susan@example.com',
  subject: 'Payment reminder',
  body_html: '<p>due Friday</p>',
  body_text: 'due Friday',
};

describe('gmail.send tool', () => {
  beforeEach(() => {
    clearTools();
    registerGmailSendTool();
    sendEmailMock.mockReset();
  });

  it('registers with Zod input/output and billing-only permission', () => {
    const tool = getTool('gmail.send');
    expect(tool).toBeDefined();
    expect(tool?.allowedAgents).toEqual(['billing']);
  });

  it('maps adapter output to the tool contract shape', async () => {
    sendEmailMock.mockResolvedValue({
      data: { messageId: 'msg-1', threadId: 'thr-1' },
      error: null,
    });

    const out = await callTool('gmail.send', INPUT, makeCtx());
    expect(out).toEqual({ message_id: 'msg-1', thread_id: 'thr-1' });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.anything(), 'phot-001', {
      to: INPUT.to,
      subject: INPUT.subject,
      bodyHtml: INPUT.body_html,
      bodyText: INPUT.body_text,
    });
  });

  it('rejects agents outside the allowed set', async () => {
    await expect(callTool('gmail.send', INPUT, makeCtx('booking'))).rejects.toThrow(
      ToolPermissionError,
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input at the boundary', async () => {
    await expect(
      callTool('gmail.send', { ...INPUT, to: 'not-an-email' }, makeCtx()),
    ).rejects.toThrow(ZodError);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('throws IntegrationAuthError on dead credentials — the reconnect signal', async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { code: 'integration_auth_error', detail: 'gmail api http_401 — reconnect Google' },
    });

    await expect(callTool('gmail.send', INPUT, makeCtx())).rejects.toThrow(IntegrationAuthError);
  });

  it('throws a plain error on other adapter failures', async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { code: 'integration_error', detail: 'gmail api http_500' },
    });

    const err: unknown = await callTool('gmail.send', INPUT, makeCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(IntegrationAuthError);
  });
});
