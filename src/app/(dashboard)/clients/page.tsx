import { createClient } from "@/lib/supabase/server";
import { listClients } from "@/lib/erp/client";
import { ClientsTable } from "./clients-table";
import { getPhotographer } from "@/lib/erp/photographer";

export default async function ClientsPage() {
  const supabase = await createClient();
  const result = await listClients(supabase);

  if (result.error) {
    const message =
      result.error.code === "not_found"
        ? "No clients found."
        : "Couldn’t load clients. Try refreshing the page.";

    return (
      <div data-page="clients" style={{ padding: "32px 56px" }}>
        <div className="eyebrow">Coordinator</div>
        <h1
          className="display"
          style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}
        >
          All clients
        </h1>
        <div
          className="card"
          data-testid="clients-error"
          style={{
            marginTop: 20,
            padding: 24,
            textAlign: "center",
            color: "var(--danger)",
          }}
        >
          <p style={{ margin: 0 }}>{message}</p>
        </div>
      </div>
    );
  }

  const photographer = await getPhotographer(supabase);
  return <ClientsTable clients={result.data} timezone={photographer.data?.timezone ?? "UTC"} />;
}
