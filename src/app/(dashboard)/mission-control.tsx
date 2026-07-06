"use client";

import { useRouter } from "next/navigation";
import { Filter, ChevronRight, Check, MapPin } from "lucide-react";
import { Pill, StageBar, Avatar, SessionDot, Section } from "@/components/primitives";
import { useDrawer } from "@/lib/drawer-context";
import { DATA } from "@/lib/mock/data";

export interface DashboardKpis {
  activeClients: number | null;
  shootsThisWeek: number | null;
  outstanding: number | null;
  sessionsBooked30d: number | null;
}

/**
 * "Who's next" view model for the dashboard card (LENS-021d). Populated from
 * calendar-synced bookings (LENS-021c). Intentionally carries NO payment status
 * — "who owes" is LENS-022; the card must never fabricate a paid/balance pill.
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
  if (format === "currency") return `$${value.toLocaleString()}`;
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
      return "across bookings";
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
  syncFailed = false,
}: {
  kpis: DashboardKpis;
  /** null = syncing (not yet loaded); [] = connected but nothing upcoming. */
  upcomingShoots: UpcomingShoot[] | null;
  calendarConnected: boolean;
  /** Calendar events that couldn't be matched to a client — surfaced, never dropped (Rule 4). */
  unmatchedCount?: number;
  /** Sync failed this load — bookings shown are last-synced, flagged as such. */
  syncFailed?: boolean;
}) {
  const mc = DATA.missionControl;
  const router = useRouter();
  const { openDrawer } = useDrawer();

  const sevPill = (s: "danger" | "warn") => {
    if (s === "danger") return <Pill kind="danger" dot>Overdue</Pill>;
    return <Pill kind="warn" dot>Needs nudge</Pill>;
  };

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
        {/* TODO: LENS-020 — Action Required needs bookings + payments data */}
        <Section
          eyebrow="Mission control"
          title="Action required"
          right={<button className="btn sm"><Filter size={12} /> All zones</button>}
        >
          <div className="card" style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "grid", gridTemplateColumns: "1fr 180px 220px 160px 40px",
                padding: "10px 20px", borderBottom: "1px solid var(--rule)", background: "var(--paper-2)",
              }}
            >
              <div className="eyebrow">Client</div>
              <div className="eyebrow">Session</div>
              <div className="eyebrow">Issue</div>
              <div className="eyebrow">Stage</div>
              <div />
            </div>
            {mc.actionRequired.map((r) => (
              <div
                key={r.id}
                className="row-hover"
                onClick={() => openDrawer()}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 180px 220px 160px 40px",
                  padding: "14px 20px", alignItems: "center",
                  borderBottom: "1px solid var(--rule)", cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={r.client} color={r.sessionTypeColor} size={32} />
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--ink)" }}>{r.client}</div>
                    {r.parent && <div className="meta" style={{ fontSize: 10.5, marginTop: 2 }}>Mom: {r.parent}</div>}
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SessionDot color={r.sessionTypeColor} />
                    <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{r.sessionType}</span>
                  </div>
                  <div className="meta" style={{ marginTop: 3 }}>{r.date}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {sevPill(r.severity)}
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.issue}</span>
                </div>
                <StageBar idx={r.stageIdx} showLabel compact />
                <ChevronRight size={14} />
              </div>
            ))}
          </div>
        </Section>

        {/* TODO: LENS-020 — On Track + Recently Completed need bookings data */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, marginBottom: 40 }}>
          <Section
            eyebrow="Coordinator"
            title="On track"
            right={<button className="btn ghost sm" onClick={() => router.push("/clients")}>See all {kpis.activeClients ?? "…"} →</button>}
            style={{ marginBottom: 0 }}
          >
            <div className="card" style={{ padding: "4px 0" }}>
              {mc.onTrack.map((r, i) => (
                <div
                  key={r.id}
                  className="row-hover"
                  onClick={() => openDrawer()}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 110px 160px 16px",
                    padding: "12px 20px", alignItems: "center",
                    borderBottom: i < mc.onTrack.length - 1 ? "1px solid var(--rule)" : "none",
                    cursor: "pointer", gap: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <SessionDot color={r.sessionTypeColor} />
                    <span style={{ fontWeight: 500 }}>{r.client}</span>
                  </div>
                  <span className="meta">{r.date}</span>
                  <StageBar idx={r.stageIdx} showLabel={false} compact />
                  <ChevronRight size={12} />
                </div>
              ))}
            </div>
          </Section>

          <Section eyebrow="Last 14 days" title="Recently wrapped" style={{ marginBottom: 0 }}>
            <div className="card" style={{ padding: "4px 0" }}>
              {mc.recentlyCompleted.map((r, i) => (
                <div
                  key={r.id}
                  className="row-hover"
                  style={{ padding: "12px 20px", borderBottom: i < mc.recentlyCompleted.length - 1 ? "1px solid var(--rule)" : "none" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 500 }}>{r.client}</span>
                    <span className="meta">{r.date}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: "var(--success)" }}>
                    <Check size={12} />
                    <span style={{ fontSize: 12 }}>{r.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Who's next — real calendar-synced shoots (LENS-021d). Rule 4: honest
            connect / syncing / empty states, never a fabricated row. No payment
            pill here — "who owes" is LENS-022. */}
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
          {calendarConnected && !syncFailed && unmatchedCount > 0 && (
            <div className="meta" data-testid="whos-next-unmatched" style={{ marginTop: 10 }}>
              {unmatchedCount} calendar event{unmatchedCount === 1 ? "" : "s"}
              {" couldn't be matched to a client yet."}
            </div>
          )}
        </Section>

        {/* TODO: LENS-020 — Fresh Inquiries needs leads/inquiries data */}
        <Section
          eyebrow="Front desk"
          title="Fresh inquiries"
          right={
            <button className="btn sm" onClick={() => router.push("/inquiries")}>
              Inbox ({DATA.inquiries.filter((i) => i.unread).length} unread) →
            </button>
          }
        >
          <div className="card">
            {DATA.inquiries.slice(0, 3).map((i, idx) => (
              <div
                key={i.id}
                className="row-hover"
                onClick={() => router.push("/inquiries")}
                style={{
                  display: "grid", gridTemplateColumns: "220px 1fr 140px 80px",
                  padding: "16px 20px", gap: 20, alignItems: "center",
                  borderBottom: idx < 2 ? "1px solid var(--rule)" : "none", cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontWeight: i.unread ? 600 : 450, color: "var(--ink)", display: "flex", gap: 6, alignItems: "center" }}>
                    {i.unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }} />}
                    {i.name}
                  </div>
                  <div className="meta" style={{ marginTop: 2 }}>{i.source}</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.preview}
                </div>
                <Pill kind="accent">{i.sessionType}</Pill>
                <span className="meta" style={{ textAlign: "right" }}>{i.received}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
