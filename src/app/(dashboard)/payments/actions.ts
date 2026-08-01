"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  createInvoice,
  recordPayment,
  deletePayment,
  cancelInvoice,
} from "@/lib/erp/invoice";
import { setChasePaused } from "@/lib/erp/invoice/chase";
import type { Invoice, Payment } from "@/types/erp";

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Non-fatal side-effect failure (event publish / status recompute) — surfaced, never swallowed. */
  warning?: string;
}

// Zod at the API boundary (quality gate). Money is integer cents end-to-end;
// dollars exist only in the rendering layer.
const createInvoiceSchema = z.object({
  booking_id: z.string().uuid(),
  kind: z.enum(["deposit", "final", "addon"]), // 'refund' flows are Phase 2
  amount_cents: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  recipient_email: z.string().email().optional(),
  sent_at: z.string().datetime({ offset: true }).optional(),
});

const recordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  method: z.enum(["cash", "check", "other"]), // 'stripe' arrives via reconciliation (Phase 2)
  received_at: z.string().datetime({ offset: true }).optional(),
});

const idSchema = z.string().uuid();

function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createInvoiceAction(
  input: z.infer<typeof createInvoiceSchema>,
): Promise<ActionResult<Invoice>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await createInvoice(supabase, {
    photographer_id: user.id,
    ...parsed.data,
  });
  if (result.error) {
    const msg =
      result.error.code === "validation_error"
        ? result.error.detail
        : "Couldn’t create the invoice. Try again.";
    return { ok: false, error: msg };
  }

  revalidatePath("/payments");
  return { ok: true, data: result.data, warning: result.warning };
}

export async function recordPaymentAction(
  input: z.infer<typeof recordPaymentSchema>,
): Promise<ActionResult<Payment>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await recordPayment(supabase, {
    photographer_id: user.id,
    ...parsed.data,
  });
  if (result.error) {
    const msg =
      result.error.code === "validation_error"
        ? result.error.detail
        : "Couldn’t record the payment. Try again.";
    return { ok: false, error: msg };
  }

  revalidatePath("/payments");
  return { ok: true, data: result.data, warning: result.warning };
}

export async function deletePaymentAction(
  paymentId: string,
): Promise<ActionResult<Payment>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = idSchema.safeParse(paymentId);
  if (!parsed.success) return invalid(parsed.error);

  const result = await deletePayment(supabase, parsed.data);
  if (result.error) {
    const msg =
      result.error.code === "validation_error"
        ? result.error.detail
        : "Couldn’t delete the payment. Try again.";
    return { ok: false, error: msg };
  }

  revalidatePath("/payments");
  return { ok: true, data: result.data, warning: result.warning };
}

/** Pause/resume the payment chase for one invoice (pause intent only — LENS-D-027). */
export async function setChasePausedAction(
  invoiceId: string,
  paused: boolean,
): Promise<ActionResult<{ paused: boolean }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = idSchema.safeParse(invoiceId);
  if (!parsed.success) return invalid(parsed.error);

  const result = await setChasePaused(supabase, {
    photographer_id: user.id,
    invoice_id: parsed.data,
    paused,
  });
  if (result.error) {
    const msg =
      result.error.code === "validation_error"
        ? result.error.detail
        : "Couldn’t update the chase. Try again.";
    return { ok: false, error: msg };
  }

  revalidatePath("/payments");
  return { ok: true, data: result.data };
}

export async function cancelInvoiceAction(
  invoiceId: string,
): Promise<ActionResult<Invoice>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = idSchema.safeParse(invoiceId);
  if (!parsed.success) return invalid(parsed.error);

  const result = await cancelInvoice(supabase, parsed.data);
  if (result.error) {
    const msg =
      result.error.code === "validation_error"
        ? result.error.detail
        : "Couldn’t cancel the invoice. Try again.";
    return { ok: false, error: msg };
  }

  revalidatePath("/payments");
  return { ok: true, data: result.data, warning: result.warning };
}
