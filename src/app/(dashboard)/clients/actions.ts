"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateClientContact, type ClientContactPatch } from "@/lib/erp/client";
import type { Client } from "@/types/erp";

export interface UpdateContactResult {
  ok: boolean;
  client?: Client;
  error?: string;
}

/**
 * Server action: update a client's contact fields from the drawer.
 * Auth-guarded (anti-pattern #6); RLS further scopes the write to the
 * photographer's own clients.
 */
export async function updateClientContactAction(
  clientId: string,
  patch: ClientContactPatch,
): Promise<UpdateContactResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await updateClientContact(supabase, clientId, patch);
  if (result.error) {
    const msg =
      result.error.code === "validation_error"
        ? result.error.detail
        : "Couldn’t save. Try again.";
    return { ok: false, error: msg };
  }

  revalidatePath("/clients");
  return { ok: true, client: result.data };
}
