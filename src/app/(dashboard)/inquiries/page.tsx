import { createClient } from "@/lib/supabase/server";
import { listLeads } from "@/lib/erp/lead";
import { isGmailReadGranted } from "@/lib/integrations/oauth/status";
import { InquiriesView } from "./inquiries-view";

export default async function InquiriesPage() {
  const supabase = await createClient();
  const [leadsResult, readResult, tzResult] = await Promise.all([
    listLeads(supabase),
    isGmailReadGranted(supabase),
    supabase.from("photographer").select("timezone").single(),
  ]);

  if (leadsResult.error) {
    return (
      <div data-page="inquiries" style={{ padding: "32px 56px" }}>
        <div className="eyebrow">Front desk</div>
        <h1
          className="display"
          style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}
        >
          Inquiries
        </h1>
        <div
          className="card"
          data-testid="inquiries-error"
          style={{
            marginTop: 20,
            padding: 24,
            textAlign: "center",
            color: "var(--danger)",
          }}
        >
          <p style={{ margin: 0 }}>
            Couldn’t load inquiries. Try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <InquiriesView
      leads={leadsResult.data}
      // Connection state degrades to "not granted" on error — the prompt to
      // connect is the honest fallback, never a fabricated "watching" state.
      gmailReadGranted={readResult.error ? false : readResult.data}
      timezone={tzResult.data?.timezone ?? "UTC"}
    />
  );
}
