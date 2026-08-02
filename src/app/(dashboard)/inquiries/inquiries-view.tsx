"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/primitives";
import type { Lead, LeadQualificationStatus } from "@/types/erp";

/**
 * Inquiries — real leads from `listLeads` (LENS-023c; the last mock-backed
 * page on the primary path goes live). Read-only in this ticket: replying is
 * CommsAgent territory (spec: deferred), converting qualified leads to
 * bookings ships with the booking-from-lead flow. No notifications anywhere —
 * a new lead appearing here and in the morning sweep IS the notification
 * (Rule 5).
 */

type TabKey = "new" | "qualified" | "converted" | "disqualified";

// "Answer first, act second": new + needs-info lead the tab order; the
// disqualified ledger is last, present but non-primary (D-029: rejected
// leads are kept, never deleted).
const TABS: { key: TabKey; label: string; statuses: LeadQualificationStatus[] }[] = [
  { key: "new", label: "New", statuses: ["new"] },
  { key: "qualified", label: "Qualified", statuses: ["qualified"] },
  { key: "converted", label: "Converted", statuses: ["converted"] },
  { key: "disqualified", label: "Disqualified", statuses: ["disqualified"] },
];

const SOURCE_LABEL: Record<string, string> = {
  gmail_inbound: "Gmail",
  web_form: "Website",
  referral: "Referral",
  social: "Social",
  other: "Other",
};

/**
 * needs_info leads keep status 'new'; the agent records what to ask as a
 * "Missing: field, field" segment in qualification_notes (LeadAgent run.ts).
 * Parsed here — display only, never re-derived by a model.
 */
function missingFields(lead: Lead): string[] {
  if (lead.qualification_status !== "new" || !lead.qualification_notes) return [];
  const m = lead.qualification_notes.match(/Missing: (.+)$/);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function statusPill(status: LeadQualificationStatus) {
  if (status === "qualified") return <Pill kind="success">Qualified</Pill>;
  if (status === "converted") return <Pill kind="accent">Converted</Pill>;
  if (status === "disqualified") return <Pill kind="neutral">Disqualified</Pill>;
  return <Pill kind="info">New</Pill>;
}

export function InquiriesView({
  leads,
  gmailReadGranted,
  timezone,
}: {
  leads: Lead[];
  /** gmail.readonly present in the verified grant — intake is actually running. */
  gmailReadGranted: boolean;
  timezone: string;
}) {
  const [tab, setTab] = useState<TabKey>("new");
  const [selId, setSelId] = useState<string | null>(null);

  // Fixed timezone (photographer's) keeps server and client renders identical.
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [timezone],
  );
  const received = (iso: string) => fmt.format(new Date(iso));

  const byTab = useMemo(() => {
    const map = new Map<TabKey, Lead[]>();
    for (const t of TABS) {
      const rows = leads
        .filter((l) => t.statuses.includes(l.qualification_status))
        .sort((a, b) => {
          // Within New, needs-info floats first — it's the "what to ask" queue.
          if (t.key === "new") {
            const na = missingFields(a).length > 0 ? 0 : 1;
            const nb = missingFields(b).length > 0 ? 0 : 1;
            if (na !== nb) return na - nb;
          }
          return b.received_at.localeCompare(a.received_at);
        });
      map.set(t.key, rows);
    }
    return map;
  }, [leads]);

  const rows = byTab.get(tab) ?? [];
  const current = rows.find((l) => l.id === selId) ?? rows[0] ?? null;

  return (
    <div data-page="inquiries">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Front desk</div>
        <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>
          Inquiries
        </h1>
        <div style={{ display: "flex", gap: 6, marginTop: 22 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelId(null);
              }}
              className={`chip ${tab === t.key ? "active" : ""}`}
              data-testid={`inquiries-tab-${t.key}`}
            >
              {t.label}{" "}
              <span className="num" style={{ opacity: 0.7 }}>
                {byTab.get(t.key)?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!gmailReadGranted && leads.length > 0 && (
        <div
          data-testid="inquiries-capture-paused"
          style={{
            padding: "10px 56px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span className="meta" style={{ color: "var(--warn)" }}>
            Inquiry capture paused — Gmail reading isn&apos;t connected, so new
            inquiries are NOT arriving on their own.
          </span>
          {/* Full navigation — the connect route 307s to Google */}
          <a className="btn sm" href="/api/integrations/google/connect" data-testid="inquiries-reconnect">
            Connect Gmail reading →
          </a>
        </div>
      )}

      {leads.length === 0 ? (
        <div style={{ padding: "36px 56px" }}>
          {gmailReadGranted ? (
            <div className="card" data-testid="inquiries-watching" style={{ padding: 28, textAlign: "center" }}>
              <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>
                Watching your inbox
              </div>
              <div className="meta">
                New inquiries land here on their own — your inbox is checked
                every 10 minutes. Nothing to import, nothing to retype.
              </div>
            </div>
          ) : (
            <div className="card" data-testid="inquiries-connect" style={{ padding: 28, textAlign: "center" }}>
              <div style={{ fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>
                Connect Gmail
              </div>
              <div className="meta" style={{ marginBottom: 16 }}>
                New inquiry emails become leads here automatically — no
                retyping, no lost inquiries.
              </div>
              {/* Full navigation — the connect route 307s to Google */}
              <a className="btn sm" href="/api/integrations/google/connect" data-testid="inquiries-connect-btn">
                Connect Google →
              </a>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", minHeight: "calc(100vh - 220px)" }}>
          {/* List */}
          <div style={{ borderRight: "1px solid var(--rule)", overflowY: "auto" }}>
            {rows.length === 0 ? (
              <div className="meta" data-testid="inquiries-tab-empty" style={{ padding: "20px" }}>
                Nothing {tab === "new" ? "new" : tab} right now.
              </div>
            ) : (
              rows.map((l) => {
                const missing = missingFields(l);
                const active = current?.id === l.id;
                return (
                  <div
                    key={l.id}
                    onClick={() => setSelId(l.id)}
                    data-testid={`inquiry-row-${l.id}`}
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid var(--rule)",
                      cursor: "pointer",
                      background: active ? "var(--accent-bg)" : "transparent",
                      borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 13.5 }}>{l.display_name}</span>
                      <span className="meta" style={{ fontSize: 10.5 }}>{received(l.received_at)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <Pill kind="neutral">{SOURCE_LABEL[l.source] ?? l.source}</Pill>
                      {missing.length > 0 && <Pill kind="warn">needs info</Pill>}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--ink-3)",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {l.intent_summary ?? ""}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Detail */}
          {current ? (
            <div style={{ padding: "28px 40px", overflowY: "auto" }} data-testid="inquiry-detail">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>
                    {current.display_name}
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    {current.email} · {SOURCE_LABEL[current.source] ?? current.source} ·{" "}
                    {received(current.received_at)}
                  </div>
                </div>
                <div>{statusPill(current.qualification_status)}</div>
              </div>

              {missingFields(current).length > 0 && (
                <div
                  className="card"
                  data-testid="inquiry-missing-fields"
                  style={{ marginTop: 20, padding: "14px 18px", borderColor: "var(--warn)" }}
                >
                  <div className="eyebrow" style={{ marginBottom: 6, color: "var(--warn)" }}>
                    To ask when you reply
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {missingFields(current).map((f) => (
                      <Pill key={f} kind="warn">{f}</Pill>
                    ))}
                  </div>
                </div>
              )}

              <div className="card" style={{ marginTop: 24, padding: "24px 28px", background: "var(--paper-2)" }}>
                <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-2)", whiteSpace: "pre-line" }}>
                  {current.intent_summary ?? "No message content captured."}
                </div>
              </div>

              {current.qualification_notes && (
                <div style={{ marginTop: 24 }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Qualification notes</div>
                  <div className="meta" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    {current.qualification_notes}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "28px 40px" }}>
              <span className="meta">Select an inquiry.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
