import { z } from 'zod';
import { registerTool } from './registry';
import { sendEmail } from '@/lib/integrations/gmail/client';
import { IntegrationAuthError } from '@/lib/integrations/errors';

/**
 * `gmail.send` tool (LENS-022d) — the outbound slice the payment chase
 * (BillingAgent territory) sends reminders through. The registry contract
 * eventually allows Lead/Comms/Delivery too; those grants activate when
 * those agents' flows ship — least privilege until then.
 */

export const gmailSendInput = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body_html: z.string().min(1),
  body_text: z.string().min(1),
});

export const gmailSendOutput = z.object({
  message_id: z.string().min(1),
  thread_id: z.string().min(1),
});

export type GmailSendInput = z.infer<typeof gmailSendInput>;
export type GmailSendOutput = z.infer<typeof gmailSendOutput>;

export function registerGmailSendTool(): void {
  registerTool<GmailSendInput, GmailSendOutput>({
    name: 'gmail.send',
    input: gmailSendInput,
    output: gmailSendOutput,
    allowedAgents: ['billing'],
    handler: async (input, ctx) => {
      const res = await sendEmail(ctx.supabase, ctx.photographerId, {
        to: input.to,
        subject: input.subject,
        bodyHtml: input.body_html,
        bodyText: input.body_text,
      });
      if (res.error) {
        // Dead credentials must escalate to a "reconnect Google" state —
        // a silently dead chase is the incumbent's exact failure mode.
        if (res.error.code === 'integration_auth_error') {
          throw new IntegrationAuthError(res.error.detail);
        }
        throw new Error(res.error.detail);
      }
      return { message_id: res.data.messageId, thread_id: res.data.threadId };
    },
  });
}
