import { createClient } from "@/lib/supabase/server";
import { countClients } from "@/lib/erp/client";
import { listUpcomingBookings } from "@/lib/erp/booking";
import {
  listInvoices,
  listUpcomingBookingsWithoutInvoice,
  localDateString,
  type InvoiceListRow,
} from "@/lib/erp/invoice";
import { listChaseStates, type InvoiceChaseState } from "@/lib/erp/invoice/chase";
import { listLeads } from "@/lib/erp/lead";
import { isServiceConnected, isGmailReadGranted } from "@/lib/integrations/oauth/status";
import { syncCalendarToBookings } from "@/lib/integrations/calendar/sync";
import MissionControl from "./mission-control";
import type {
  DashboardKpis,
  UpcomingShoot,
  MoneyCardData,
  MoneyRow,
  InquiriesCardData,
} from "./mission-control";

/** How far ahead the morning sweep looks. */
const SYNC_WINDOW_DAYS = 90;
const SHOOTS_SHOWN = 6;
const MONEY_ROWS_SHOWN = 4;
const INQUIRY_ROWS_SHOWN = 3;

const SOURCE_LABEL: Record<string, string> = {
  gmail_inbound: "Gmail",
  web_form: "Website",
  referral: "Referral",
  social: "Social",
  other: "Other",
};

/** Whole days from `from` to `to` (YYYY-MM-DD each). Negative = past. */
function daysUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

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
  let syncFailureCount = 0;
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
      else {
        unmatchedCount = sync.data.unmatched.length;
        // Per-event insert failures are real missing rows on the sweep —
        // loud, never swallowed (how the migration_004 gap stayed invisible).
        syncFailureCount = sync.data.failures.length;
        if (syncFailureCount > 0) {
          console.error("dashboard.calendar_sync.event_failures", {
            count: syncFailureCount,
            details: sync.data.failures.map((f) => f.detail),
          });
        }
      }

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

  // "Who owes / what's late" (LENS-022c). Rule 4: derived overdue only, never
  // stored; a load failure renders an explicit failed state, never a stale or
  // fake number. money === null means the read failed.
  let money: MoneyCardData | null = null;
  const invoicesResult = await listInvoices(supabase);
  if (!invoicesResult.error) {
    const { invoices, timezone } = invoicesResult.data;
    const today = localDateString(timezone);
    const open = invoices.filter((i) => i.status === "sent" || i.status === "partial");

    // Chase state (LENS-022e) — derived from comm_log; escalations are the
    // one operator-facing chase signal (Rule 5). Failure degrades to "no
    // chase info", never blocks the money read.
    const chaseResult = await listChaseStates(supabase);
    const chase: Record<string, InvoiceChaseState> = chaseResult.error
      ? {}
      : chaseResult.data;
    const gmailStatus = await isServiceConnected(supabase, "gmail");
    const gmailConnected = gmailStatus.error ? false : gmailStatus.data;

    const toRow = (i: InvoiceListRow): MoneyRow => ({
      id: i.id,
      clientName: i.client.display_name,
      routedToParentName:
        i.client.parent_email !== null && i.recipient_email === i.client.parent_email
          ? i.client.parent_name ?? i.client.parent_email
          : null,
      balanceCents: i.balance_cents,
      daysOverdue: i.days_overdue,
      dueInDays: daysUntil(today, i.due_date),
      remindersSent: i.reminders_sent,
      chaseEscalated: chase[i.id]?.escalated ?? false,
      chasePaused: chase[i.id]?.paused ?? false,
    });

    const late = open
      .filter((i) => i.is_overdue)
      .sort((a, b) => b.days_overdue - a.days_overdue)
      .map(toRow);
    // listInvoices orders by due_date asc, so dueNext is already soonest-first.
    const dueNext = open.filter((i) => !i.is_overdue).map(toRow);

    // Cutover assist (Rule 3): only relevant when she hasn't entered any
    // invoices yet — count upcoming shoots with no invoice on file.
    let uninvoicedCount = 0;
    if (invoices.length === 0) {
      const uninvoiced = await listUpcomingBookingsWithoutInvoice(supabase);
      if (!uninvoiced.error) uninvoicedCount = uninvoiced.data.length;
    }

    money = {
      hasInvoices: invoices.length > 0,
      outstandingCents: open.reduce((sum, i) => sum + i.balance_cents, 0),
      overdueCents: open
        .filter((i) => i.is_overdue)
        .reduce((sum, i) => sum + i.balance_cents, 0),
      lateCount: late.length,
      dueCount: dueNext.length,
      late: late.slice(0, MONEY_ROWS_SHOWN),
      dueNext: dueNext.slice(0, MONEY_ROWS_SHOWN),
      uninvoicedCount,
      // The chase's second (and only other) operator signal: a paused chase
      // presented as running is the incumbent's exact failure (Rule 5).
      chaseSendingBroken: open.length > 0 && !gmailConnected,
    };
  }

  // Fresh inquiries (LENS-023c) — real 'new' leads, needs-info first (the
  // "what to ask" queue). null = read failed → explicit failed state.
  let inquiries: InquiriesCardData | null = null;
  const leadsResult = await listLeads(supabase);
  if (!leadsResult.error) {
    const readGranted = await isGmailReadGranted(supabase);
    const { data: photographer } = await supabase
      .from("photographer")
      .select("timezone")
      .single();
    const receivedFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: photographer?.timezone ?? "UTC",
      month: "short",
      day: "numeric",
    });
    const isNeedsInfo = (notes: string | null) =>
      notes !== null && /Missing: /.test(notes);

    const fresh = leadsResult.data
      .filter((l) => l.qualification_status === "new")
      .sort((a, b) => {
        const na = isNeedsInfo(a.qualification_notes) ? 0 : 1;
        const nb = isNeedsInfo(b.qualification_notes) ? 0 : 1;
        if (na !== nb) return na - nb;
        return b.received_at.localeCompare(a.received_at);
      });

    inquiries = {
      newCount: fresh.length,
      captureOn: readGranted.error ? false : readGranted.data,
      rows: fresh.slice(0, INQUIRY_ROWS_SHOWN).map((l) => ({
        id: l.id,
        name: l.display_name,
        sourceLabel: SOURCE_LABEL[l.source] ?? l.source,
        preview: l.intent_summary ?? "",
        receivedLabel: receivedFmt.format(new Date(l.received_at)),
        needsInfo: isNeedsInfo(l.qualification_notes),
      })),
    };
  }

  const kpis: DashboardKpis = {
    activeClients: clientCount.error ? null : clientCount.data,
    shootsThisWeek,
    // Cents. null = load failed OR no invoices entered yet — both render "—";
    // "$0" is only shown when invoices exist and all are settled (a true zero).
    outstanding: money !== null && money.hasInvoices ? money.outstandingCents : null,
    // TODO: LENS-022 — derive from booking.created_at once bookings have volume
    sessionsBooked30d: null,
  };

  return (
    <MissionControl
      kpis={kpis}
      upcomingShoots={upcomingShoots}
      calendarConnected={calendarConnected}
      unmatchedCount={unmatchedCount}
      syncFailureCount={syncFailureCount}
      syncFailed={syncFailed}
      money={money}
      inquiries={inquiries}
    />
  );
}
