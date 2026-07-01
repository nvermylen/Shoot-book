import { createClient } from "@/lib/supabase/server";
import { countClients } from "@/lib/erp/client";
import MissionControl from "./mission-control";
import type { DashboardKpis } from "./mission-control";

export default async function MissionControlPage() {
  const supabase = await createClient();
  const clientCount = await countClients(supabase);

  const kpis: DashboardKpis = {
    activeClients: clientCount.error ? null : clientCount.data,
    // TODO: LENS-020 — needs bookings table
    shootsThisWeek: null,
    // TODO: LENS-020 — needs invoices/payments
    outstanding: null,
    // TODO: LENS-020 — needs bookings table
    sessionsBooked30d: null,
  };

  return <MissionControl kpis={kpis} />;
}
