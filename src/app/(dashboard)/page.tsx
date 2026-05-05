"use client";

import { useRouter } from "next/navigation";
import { Filter, ChevronRight, Check, Sun, Camera, MapPin } from "lucide-react";
import { Pill, StageBar, Avatar, SessionDot, Section } from "@/components/primitives";
import { useDrawer } from "@/lib/drawer-context";
import { DATA } from "@/lib/mock/data";

export default function MissionControlPage() {
  const mc = DATA.missionControl;
  const k = DATA.kpis;
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
          {[
            ["Active clients", k.activeClients, "in pipeline"],
            ["Shoots this week", k.shootsThisWeek, "Wed · Thu · Fri · Sat · Sat"],
            ["Outstanding", `$${k.outstanding.toLocaleString()}`, "across 3 bookings"],
            ["Booked last 30d", k.sessionsBooked30d, "+38% vs prior"],
          ].map(([lbl, val, sub]) => (
            <div key={String(lbl)}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{lbl}</div>
              <div className="stat-num">{val}</div>
              <div className="meta" style={{ marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "36px 56px 80px" }}>
        {/* Action Required */}
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

        {/* On Track + Recently Completed */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, marginBottom: 40 }}>
          <Section
            eyebrow="Coordinator"
            title="On track"
            right={<button className="btn ghost sm" onClick={() => router.push("/clients")}>See all 38 →</button>}
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

        {/* Today's Shoots */}
        <Section
          eyebrow="Operations"
          title="Today's shoots"
          right={<button className="btn sm" onClick={() => router.push("/shoot-day")}>Open Shoot Day →</button>}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {DATA.todayShoots.map((s) => (
              <div key={s.id} className="card" style={{ padding: 20, cursor: "pointer" }} onClick={() => router.push("/shoot-day")}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>{s.meetAt.split(" · ")[0]}</div>
                    <div className="display" style={{ fontSize: 22, fontWeight: 500 }}>{s.client}</div>
                  </div>
                  {s.paid ? (
                    <Pill kind="success" dot>Paid in full</Pill>
                  ) : (
                    <Pill kind="warn" dot>Balance ${s.total - s.paidAmount} due today</Pill>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  {s.locations.map((l) => <span key={l} className="chip"><MapPin size={11} /> {l}</span>)}
                </div>
                <div className="meta" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{s.notes}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Fresh Inquiries */}
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
