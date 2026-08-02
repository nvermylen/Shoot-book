"use client";

import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { Pill, Section } from "@/components/primitives";

export interface DashboardKpis {
  activeClients: number | null;
  shootsThisWeek: number | null;
  /** Integer cents. null = money not loadable or no invoices entered yet ("—"). */
  outstanding: number | null;
  sessionsBooked30d: number | null;
}

/** One fresh inquiry row (LENS-023c) — a real `lead`, status 'new'. */
export interface InquiryRow {
  /** lead id */
  id: string;
  name: string;
  sourceLabel: string;
  preview: string;
  /** Preformatted in the photographer's timezone server-side. */
  receivedLabel: string;
  needsInfo: boolean;
}

export interface InquiriesCardData {
  /** Newest 'new' leads, capped for the sweep. */
  rows: InquiryRow[];
  newCount: number;
  /** gmail.readonly granted — intake is actually watching the inbox (Rule 4). */
  captureOn: boolean;
}

/** One open invoice in the "who owes / what's late" card (LENS-022c). */
export interface MoneyRow {
  /** invoice id */
  id: string;
  clientName: string;
  /** Parent name when the invoice routes to the parent on file; null when it goes to the client. */
  routedToParentName: string | null;
  balanceCents: number;
  /** Derived at read time in the photographer's timezone (LENS-D-023). 0 unless late. */
  daysOverdue: number;
  /** Days until due (negative = past). */
  dueInDays: number;
  /** Real count from comm_log (LENS-D-024). */
  remindersSent: number;
  /** Chase hit the overdue-send cap — "your turn", the one chase escalation signal (Rule 5). */
  chaseEscalated: boolean;
  /** Photographer paused this invoice's chase (LENS-D-027). */
  chasePaused: boolean;
}

/**
 * "Who owes / what's late" view model. null at the component boundary means
 * the read failed — render the explicit failed state, never a fake zero
 * (Rule 4). hasInvoices=false → cutover assist (Rule 3), never a blank slate.
 */
export interface MoneyCardData {
  hasInvoices: boolean;
  outstandingCents: number;
  overdueCents: number;
  lateCount: number;
  dueCount: number;
  /** Most-overdue first, capped for the card; lateCount carries the true total. */
  late: MoneyRow[];
  /** Soonest-due first, capped for the card; dueCount carries the true total. */
  dueNext: MoneyRow[];
  /** Upcoming bookings with no invoice — the cutover-assist seed when hasInvoices=false. */
  uninvoicedCount: number;
  /** Open invoices exist but Gmail isn't connected — the chase is NOT sending (LENS-022e, Rule 5). */
  chaseSendingBroken: boolean;
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/**
 * "Who's next" view model for the dashboard card (LENS-021d). Populated from
 * calendar-synced bookings (LENS-021c). Intentionally carries NO payment status
 * — "who owes" lives in its own card (LENS-022c). A paid/balance pill on a
 * shoot row must reconcile exactly with the invoice table or not ship (Rule 4).
 */
export interface UpcomingShoot {
  /** booking id */
  id: string;
  clientName: string;
  /** ISO date/datetime of the session. */
  sessionDate: string;
  /** true when the source event had no time (all-day). */
  allDay: boolean;
  locations: string[];
}

function formatShootWhen(sessionDate: string, allDay: boolean): { day: string; time: string | null } {
  const d = new Date(sessionDate);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (allDay) return { day, time: null };
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { day, time };
}

function formatKpiValue(
  value: number | null,
  format?: "currency",
): string {
  if (value === null) return "—";
  if (format === "currency") return dollars(value);
  return String(value);
}

function kpiSubtitle(key: string, value: number | null): string {
  if (value === null) return "syncing…";
  switch (key) {
    case "activeClients":
      return "in your book";
    case "shootsThisWeek":
      return "this week";
    case "outstanding":
      return "open invoices";
    case "sessionsBooked30d":
      return "vs prior period";
    default:
      return "";
  }
}

export default function MissionControl({
  kpis,
  upcomingShoots,
  calendarConnected,
  unmatchedCount = 0,
  syncFailureCount = 0,
  syncFailed = false,
  money,
  inquiries,
}: {
  kpis: DashboardKpis;
  /** null = syncing (not yet loaded); [] = connected but nothing upcoming. */
  upcomingShoots: UpcomingShoot[] | null;
  calendarConnected: boolean;
  /** Calendar events that couldn't be matched to a client — surfaced, never dropped (Rule 4). */
  unmatchedCount?: number;
  /** Matched events whose booking write failed this sync — missing rows, loud (Rule 4). */
  syncFailureCount?: number;
  /** Sync failed this load — bookings shown are last-synced, flagged as such. */
  syncFailed?: boolean;
  /** "Who owes / what's late" (LENS-022c). null = read failed — explicit failed state, never fake zeros. */
  money: MoneyCardData | null;
  /** Fresh inquiries (LENS-023c). null = read failed — explicit failed state. */
  inquiries: InquiriesCardData | null;
}) {
  const router = useRouter();

  return (
    <div data-page="home">
      {/* KPI Stats */}
      <div style={{ padding: "40px 56px 32px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", gap: 48, alignItems: "flex-end" }}>
          {([
            ["Total clients", "activeClients", undefined] as const,
            ["Shoots this week", "shootsThisWeek", undefined] as const,
            ["Outstanding", "outstanding", "currency"] as const,
            ["Booked last 30d", "sessionsBooked30d", undefined] as const,
          ]).map(([label, key, format]) => (
            <div key={key} data-testid={`kpi-${key}`}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
              <div className="stat-num">{formatKpiValue(kpis[key], format)}</div>
              <div className="meta" style={{ marginTop: 4 }}>{kpiSubtitle(key, kpis[key])}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "36px 56px 80px" }}>
        {/* Who owes / what's late (LENS-022c). Rule 1: readable at a glance, the
            Payments link is for acting, never for knowing. Rule 4: overdue is
            derived, red only when true; failed reads say so; zero is only shown
            when it's a true zero. Rule 6: a paid invoice simply leaves the list. */}
        <Section
          eyebrow="Billing"
          title="Who owes / what's late"
          right={
            <button className="btn sm" data-testid="money-open-payments" onClick={() => router.push("/payments")}>
              Open Payments →
            </button>
          }
        >
          {money === null ? (
            <div className="card" data-testid="money-failed" style={{ padding: 24 }}>
              <span className="meta" style={{ color: "var(--warn)" }}>
                Couldn&apos;t load invoices this time — refresh to retry. Not showing
                stale numbers.
              </span>
            </div>
          ) : !money.hasInvoices ? (
            <div className="card" data-testid="money-cutover" style={{ padding: 24 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                {money.uninvoicedCount > 0
                  ? `${money.uninvoicedCount} upcoming ${money.uninvoicedCount === 1 ? "shoot has" : "shoots have"} no invoice on file`
                  : "No invoices in Lens yet"}
              </div>
              <div className="meta" style={{ marginBottom: 14 }}>
                Bring your open book in and this card answers “who owes me” every
                morning.
              </div>
              <button className="btn sm" data-testid="money-cutover-cta" onClick={() => router.push("/payments")}>
                Add invoices →
              </button>
            </div>
          ) : money.lateCount === 0 && money.dueCount === 0 ? (
            <div className="card" data-testid="money-all-settled" style={{ padding: 24 }}>
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Nothing outstanding — every invoice is settled.
              </span>
            </div>
          ) : (
            <div className="card" data-testid="money-card" style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {/* What's late — the anxiety line, most overdue first */}
                <div style={{ borderRight: "1px solid var(--rule)" }}>
                  <div
                    style={{
                      padding: "10px 20px",
                      borderBottom: "1px solid var(--rule)",
                      background: "var(--paper-2)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="eyebrow" style={{ color: money.lateCount > 0 ? "var(--danger)" : undefined }}>
                      What&apos;s late{money.lateCount > 0 ? ` (${money.lateCount})` : ""}
                    </span>
                    {money.lateCount > 0 && (
                      <span className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>
                        {dollars(money.overdueCents)}
                      </span>
                    )}
                  </div>
                  {money.late.length === 0 ? (
                    <div className="meta" data-testid="money-none-late" style={{ padding: "14px 20px" }}>
                      Nothing late.
                    </div>
                  ) : (
                    money.late.map((r, i) => (
                      <div
                        key={r.id}
                        className="row-hover"
                        data-testid={`money-late-row-${r.id}`}
                        onClick={() => router.push("/payments")}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          padding: "11px 20px",
                          cursor: "pointer",
                          borderBottom: i < money.late.length - 1 ? "1px solid var(--rule)" : "none",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.clientName}</div>
                          <div className="meta" style={{ fontSize: 10.5, marginTop: 1 }}>
                            {r.routedToParentName ? `→ ${r.routedToParentName} (parent)` : "→ client"}
                            {" · "}
                            {r.chaseEscalated ? (
                              <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                                your turn — chase stopped after {r.remindersSent} notes
                              </span>
                            ) : r.chasePaused ? (
                              "chase paused"
                            ) : r.remindersSent === 0 ? (
                              "no reminders yet"
                            ) : (
                              `${r.remindersSent} reminder${r.remindersSent === 1 ? "" : "s"} sent`
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div className="num" style={{ fontWeight: 600, fontSize: 13, color: "var(--danger)" }}>
                            {dollars(r.balanceCents)}
                          </div>
                          <div className="meta" style={{ fontSize: 10.5, color: "var(--danger)" }}>
                            {r.daysOverdue}d late
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {money.lateCount > money.late.length && (
                    <div className="meta" style={{ padding: "8px 20px", fontSize: 10.5 }}>
                      +{money.lateCount - money.late.length} more late
                    </div>
                  )}
                </div>

                {/* Who owes next — soonest due first */}
                <div>
                  <div
                    style={{
                      padding: "10px 20px",
                      borderBottom: "1px solid var(--rule)",
                      background: "var(--paper-2)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span className="eyebrow">
                      Who owes next{money.dueCount > 0 ? ` (${money.dueCount})` : ""}
                    </span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                      {dollars(money.outstandingCents - money.overdueCents)}
                    </span>
                  </div>
                  {money.dueNext.length === 0 ? (
                    <div className="meta" data-testid="money-none-due" style={{ padding: "14px 20px" }}>
                      Nothing else open.
                    </div>
                  ) : (
                    money.dueNext.map((r, i) => (
                      <div
                        key={r.id}
                        className="row-hover"
                        data-testid={`money-due-row-${r.id}`}
                        onClick={() => router.push("/payments")}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          padding: "11px 20px",
                          cursor: "pointer",
                          borderBottom: i < money.dueNext.length - 1 ? "1px solid var(--rule)" : "none",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.clientName}</div>
                          <div className="meta" style={{ fontSize: 10.5, marginTop: 1 }}>
                            {r.routedToParentName ? `→ ${r.routedToParentName} (parent)` : "→ client"}
                            {" · "}
                            {r.chaseEscalated ? (
                              <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                                your turn — chase stopped after {r.remindersSent} notes
                              </span>
                            ) : r.chasePaused ? (
                              "chase paused"
                            ) : r.remindersSent === 0 ? (
                              "no reminders yet"
                            ) : (
                              `${r.remindersSent} reminder${r.remindersSent === 1 ? "" : "s"} sent`
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div className="num" style={{ fontWeight: 600, fontSize: 13 }}>
                            {dollars(r.balanceCents)}
                          </div>
                          <div className="meta" style={{ fontSize: 10.5 }}>
                            {r.dueInDays === 0
                              ? "due today"
                              : r.dueInDays === 1
                                ? "due tomorrow"
                                : `due in ${r.dueInDays}d`}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {money.dueCount > money.dueNext.length && (
                    <div className="meta" style={{ padding: "8px 20px", fontSize: 10.5 }}>
                      +{money.dueCount - money.dueNext.length} more open
                    </div>
                  )}
                </div>
              </div>
              {money.chaseSendingBroken && (
                <div
                  data-testid="money-chase-broken"
                  style={{
                    padding: "10px 20px",
                    borderTop: "1px solid var(--rule)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span className="meta" style={{ color: "var(--warn)" }}>
                    Chase paused — Google isn&apos;t connected for sending, so no
                    payment reminders are going out.
                  </span>
                  {/* Full navigation — the connect route 307s to Google */}
                  <a className="btn sm" href="/api/integrations/google/connect" data-testid="money-reconnect-google">
                    Reconnect →
                  </a>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* TODO: LENS-020 — "Action required", "On track", and "Recently
            wrapped" return here once bookings + payments can derive them.
            Their mock-data versions were removed (LENS-CLEANUP-009): a real
            account must never see fabricated clients on the sweep (Rule 4). */}

        {/* Who's next — real calendar-synced shoots (LENS-021d). Rule 4: honest
            connect / syncing / empty states, never a fabricated row. No payment
            pill here — money lives in the "Who owes / what's late" card above;
            a pill on a shoot row ships only if its join reconciles exactly. */}
        <Section
          eyebrow="Operations"
          title="Who's next"
          right={<button className="btn sm" onClick={() => router.push("/shoot-day")}>Open Shoot Day →</button>}
        >
          {!calendarConnected ? (
            <div className="card" data-testid="whos-next-connect" style={{ padding: 28, textAlign: "center" }}>
              <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>
                Connect Google Calendar
              </div>
              <div className="meta" style={{ marginBottom: 16 }}>
                Pull your upcoming shoots in automatically — who&apos;s next, when, and where.
              </div>
              {/* Full navigation (not router.push) — the connect route 307s to Google */}
              <a className="btn sm" href="/api/integrations/google/connect" data-testid="connect-calendar">
                Connect Calendar →
              </a>
            </div>
          ) : upcomingShoots === null ? (
            <div className="card" data-testid="whos-next-syncing" style={{ padding: 28 }}>
              <span className="meta">Syncing your calendar…</span>
            </div>
          ) : upcomingShoots.length === 0 ? (
            <div className="card" data-testid="whos-next-empty" style={{ padding: 28 }}>
              <span className="meta">No upcoming shoots on your calendar.</span>
            </div>
          ) : (
            <div data-testid="whos-next-list" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {upcomingShoots.map((s) => {
                const when = formatShootWhen(s.sessionDate, s.allDay);
                return (
                  <div
                    key={s.id}
                    className="card"
                    data-testid="whos-next-card"
                    style={{ padding: 20, cursor: "pointer" }}
                    onClick={() => router.push("/shoot-day")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <div className="eyebrow" style={{ marginBottom: 4 }}>
                          {when.day}{when.time ? ` · ${when.time}` : ""}
                        </div>
                        <div className="display" style={{ fontSize: 22, fontWeight: 500 }}>{s.clientName}</div>
                      </div>
                      {s.allDay && <Pill kind="info">All day</Pill>}
                    </div>
                    {s.locations.length > 0 && (
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {s.locations.map((l) => <span key={l} className="chip"><MapPin size={11} /> {l}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {calendarConnected && syncFailed && (
            <div className="meta" data-testid="whos-next-sync-failed" style={{ marginTop: 10, color: "var(--warn)" }}>
              Calendar sync failed this time — showing last synced shoots.
            </div>
          )}
          {calendarConnected && syncFailureCount > 0 && (
            <div className="meta" data-testid="whos-next-write-failures" style={{ marginTop: 10, color: "var(--warn)" }}>
              {syncFailureCount} calendar event{syncFailureCount === 1 ? "" : "s"}
              {" couldn't be saved as bookings this sync — the list above may be missing shoots."}
            </div>
          )}
          {calendarConnected && !syncFailed && unmatchedCount > 0 && (
            <div className="meta" data-testid="whos-next-unmatched" style={{ marginTop: 10 }}>
              {unmatchedCount} calendar event{unmatchedCount === 1 ? "" : "s"}
              {" couldn't be matched to a client yet."}
            </div>
          )}
        </Section>

        {/* Fresh inquiries (LENS-023c) — real leads. Rule 4: a fabricated
            inquiry is a false business event; every state below is derived or
            an explicit failure. Rule 5: this section IS the notification. */}
        <Section
          eyebrow="Front desk"
          title="Fresh inquiries"
          right={
            <button className="btn sm" data-testid="inquiries-open" onClick={() => router.push("/inquiries")}>
              Open Inquiries
              {inquiries && inquiries.newCount > 0 ? ` (${inquiries.newCount} new)` : ""} →
            </button>
          }
        >
          {inquiries === null ? (
            <div className="card" data-testid="inquiries-card-failed" style={{ padding: 28 }}>
              <span className="meta" style={{ color: "var(--warn)" }}>
                Couldn&apos;t load inquiries this time — open the Inquiries page to check.
              </span>
            </div>
          ) : !inquiries.captureOn && inquiries.rows.length === 0 ? (
            <div className="card" data-testid="inquiries-card-connect" style={{ padding: 28, textAlign: "center" }}>
              <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>
                Connect Gmail
              </div>
              <div className="meta" style={{ marginBottom: 16 }}>
                New inquiry emails become leads on their own — nothing to retype.
              </div>
              {/* Full navigation — the connect route 307s to Google */}
              <a className="btn sm" href="/api/integrations/google/connect" data-testid="inquiries-card-connect-btn">
                Connect Google →
              </a>
            </div>
          ) : inquiries.rows.length === 0 ? (
            <div className="card" data-testid="inquiries-card-watching" style={{ padding: 28 }}>
              <span className="meta">
                No new inquiries. Watching your inbox — checked every 10 minutes.
              </span>
            </div>
          ) : (
            <div className="card" data-testid="inquiries-card-list">
              {inquiries.rows.map((i, idx) => (
                <div
                  key={i.id}
                  className="row-hover"
                  data-testid={`inquiry-card-row-${i.id}`}
                  onClick={() => router.push("/inquiries")}
                  style={{
                    display: "grid", gridTemplateColumns: "220px 1fr 120px 90px",
                    padding: "16px 20px", gap: 20, alignItems: "center",
                    borderBottom: idx < inquiries.rows.length - 1 ? "1px solid var(--rule)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--ink)", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }} />
                      {i.name}
                    </div>
                    <div className="meta" style={{ marginTop: 2 }}>{i.sourceLabel}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i.preview}
                  </div>
                  <div>{i.needsInfo ? <Pill kind="warn">needs info</Pill> : <Pill kind="info">new</Pill>}</div>
                  <span className="meta" style={{ textAlign: "right" }}>{i.receivedLabel}</span>
                </div>
              ))}
              {!inquiries.captureOn && (
                <div
                  data-testid="inquiries-card-capture-off"
                  style={{
                    padding: "10px 20px", borderTop: "1px solid var(--rule)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  }}
                >
                  <span className="meta" style={{ color: "var(--warn)" }}>
                    Inquiry capture is off — new inquiries aren&apos;t arriving on their own.
                  </span>
                  {/* Full navigation — the connect route 307s to Google */}
                  <a className="btn sm" href="/api/integrations/google/connect" data-testid="inquiries-card-reconnect">
                    Connect Gmail reading →
                  </a>
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
