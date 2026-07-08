import { createClient } from "@/lib/supabase/server";
import {
  listInvoices,
  listUpcomingBookingsWithoutInvoice,
} from "@/lib/erp/invoice";
import { listChaseStates } from "@/lib/erp/invoice/chase";
import { isServiceConnected } from "@/lib/integrations/oauth/status";
import { PaymentsTable } from "./payments-table";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const [invoicesResult, uninvoicedResult, chaseResult, gmailResult] =
    await Promise.all([
      listInvoices(supabase),
      listUpcomingBookingsWithoutInvoice(supabase),
      listChaseStates(supabase),
      isServiceConnected(supabase, "gmail"),
    ]);

  if (invoicesResult.error || uninvoicedResult.error) {
    return (
      <div data-page="payments" style={{ padding: "32px 56px" }}>
        <div className="eyebrow">Billing</div>
        <h1
          className="display"
          style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}
        >
          Payments
        </h1>
        <div
          className="card"
          data-testid="payments-error"
          style={{
            marginTop: 20,
            padding: 24,
            textAlign: "center",
            color: "var(--danger)",
          }}
        >
          <p style={{ margin: 0 }}>
            Couldn’t load payments. Try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PaymentsTable
      invoices={invoicesResult.data.invoices}
      timezone={invoicesResult.data.timezone}
      uninvoiced={uninvoicedResult.data}
      chaseStates={chaseResult.error ? {} : chaseResult.data}
      gmailConnected={gmailResult.error ? false : gmailResult.data}
    />
  );
}
