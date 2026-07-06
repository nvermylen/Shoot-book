import { createClient } from "@/lib/supabase/server";
import { countClients } from "@/lib/erp/client";
import { listUpcomingBookings } from "@/lib/erp/booking";
import { isServiceConnected } from "@/lib/integrations/oauth/status";
import { syncCalendarToBookings } from "@/lib/integrations/calendar/sync";
import MissionControl from "./mission-control";
import type { DashboardKpis, UpcomingShoot } from "./mission-control";

/** How far ahead the morning sweep looks. */
const SYNC_WINDOW_DAYS = 90;
const SHOOTS_SHOWN = 6;

export default async function MissionControlPage() {
  const supabase = await createClient();
  const clientCount = await countClients(supabase);
  const calendarStatus = await isServiceConnected(supabase, "calendar");
  const calendarConnected = calendarStatus.error ? false : calendarStatus.data;

  // "Who's next" (LENS-021d): sync-on-load, then read bookings. Rule 4 — if
  // sync fails we still show last-synced bookings, flagged as such, and
  // unmatched events are surfaced, never dropped.
  let upcomingShoots: UpcomingShoot[] | null = null;
  let shootsThisWeek: number | null = null;
  let unmatchedCount = 0;
  let syncFailed = false;

  if (calendarConnected) {
    const now = new Date();
    const timeMax = new Date(now.getTime() + SYNC_WINDOW_DAYS * 24 * 3600 * 1000);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const sync = await syncCalendarToBookings(supabase, user.id, {
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
      });
      if (sync.error) syncFailed = true;
      else unmatchedCount = sync.data.unmatched.length;

      const bookings = await listUpcomingBookings(supabase, {
        from: now.toISOString(),
      });

      if (!bookings.error) {
        const weekCutoff = now.getTime() + 7 * 24 * 3600 * 1000;
        shootsThisWeek = bookings.data.filter(
          (b) => b.session_date && new Date(b.session_date).getTime() <= weekCutoff,
        ).length;

        upcomingShoots = bookings.data.slice(0, SHOOTS_SHOWN).map((b) => ({
          id: b.id,
          clientName: b.client?.display_name ?? "Unknown client",
          sessionDate: b.session_date ?? "",
          // Calendar sync stores no duration for all-day events (LENS-021c).
          allDay: b.duration_minutes === null,
          locations: [], // booking_location isn't populated by calendar sync
        }));
      }
      // bookings.error → upcomingShoots stays null → honest "syncing…" state
    }
  }

  const kpis: DashboardKpis = {
    activeClients: clientCount.error ? null : clientCount.data,
    shootsThisWeek,
    // TODO: LENS-022 — needs invoices/payments
    outstanding: null,
    // TODO: LENS-022 — derive from booking.created_at once bookings have volume
    sessionsBooked30d: null,
  };

  return (
    <MissionControl
      kpis={kpis}
      upcomingShoots={upcomingShoots}
      calendarConnected={calendarConnected}
      unmatchedCount={unmatchedCount}
      syncFailed={syncFailed}
    />
  );
}
