"use client";

import { useState } from "react";
import { X, Mail, Phone, MessageSquare, FileText, AlertTriangle, Check } from "lucide-react";
import { Avatar, Pill, StageBar } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export function ClientDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "timeline" | "payments" | "messages" | "notes">("overview");
  const p = DATA.profile;

  return (
    <>
      <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`drawer ${open ? "open" : ""}`}>
        {/* Header */}
        <div style={{ padding: "24px 28px 0", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Avatar name={p.client} color={p.typeColor} size={44} />
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>#{p.id}</div>
                <div className="display" style={{ fontSize: 22, fontWeight: 500 }}>{p.client}</div>
                {p.parent && (
                  <div className="meta" style={{ marginTop: 4 }}>
                    Parent: {p.parent} · <span style={{ color: "var(--accent)" }}>billing contact</span>
                  </div>
                )}
              </div>
            </div>
            <button className="btn ghost sm" onClick={onClose} aria-label="Close" data-testid="drawer-close">
              <X size={14} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Pill kind="warn" dot>Final due tomorrow</Pill>
            <Pill kind="success" dot>2 locations confirmed</Pill>
          </div>

          <div style={{ marginBottom: 16 }}>
            <StageBar idx={p.stageIdx} />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
            {(["overview", "timeline", "payments", "messages", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 14px", fontSize: 12.5, fontWeight: tab === t ? 600 : 450,
                  color: tab === t ? "var(--ink)" : "var(--ink-3)",
                  borderBottom: tab === t ? "2px solid var(--ink)" : "2px solid transparent",
                  background: "transparent", border: "none", borderTop: "none", borderLeft: "none", borderRight: "none",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {tab === "overview" && <OverviewTab />}
          {tab === "timeline" && <TimelineTab />}
          {tab === "payments" && <PaymentsTab />}
          {tab === "messages" && <MessagesTab />}
          {tab === "notes" && <NotesTab />}
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "120px 1fr", padding: "10px 14px",
        borderBottom: "1px solid var(--rule)", fontSize: 13,
        background: accent ? "var(--accent-bg)" : "transparent",
      }}
    >
      <span className="meta" style={{ fontSize: 11 }}>{label}</span>
      <span style={{ color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

function OverviewTab() {
  const p = DATA.profile;
  return (
    <>
      <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <InfoRow label="Session date" value={p.sessionDate} />
        <InfoRow label="Package" value={p.package} />
        <InfoRow label="Locations" value={p.locations.join(", ")} />
        <InfoRow label="Client" value={`${p.client} · ${p.clientPhone}`} />
        <InfoRow label="Parent" value={`${p.parent} · ${p.parentPhone}`} accent />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Deposit</div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" }}>${p.deposit.amount}</div>
          <div className="meta" style={{ marginTop: 4 }}>
            <Check size={10} /> Paid {p.deposit.paidAt}
          </div>
        </div>
        <div className="card" style={{ padding: 16, borderColor: "oklch(0.86 0.08 80)" }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Final payment</div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" }}>${p.final.amount}</div>
          <div className="meta" style={{ marginTop: 4, color: "var(--warn)" }}>
            <AlertTriangle size={10} /> Due {p.final.dueAt}
          </div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>Quick actions</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn sm"><Mail size={12} /> Send reminder</button>
        <button className="btn sm"><Mail size={12} /> Email</button>
        <button className="btn sm"><MessageSquare size={12} /> Text</button>
        <button className="btn sm"><FileText size={12} /> Edit</button>
        <button className="btn sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Cancel</button>
      </div>
    </>
  );
}

function TimelineTab() {
  const p = DATA.profile;
  return (
    <div style={{ position: "relative", paddingLeft: 20 }}>
      <div style={{ position: "absolute", left: 5, top: 4, bottom: 4, width: 1, background: "var(--rule)" }} />
      {[...p.timeline].reverse().map((t, i) => (
        <div key={i} style={{ position: "relative", paddingBottom: 20 }}>
          <div
            style={{
              position: "absolute", left: -18, top: 4, width: 8, height: 8, borderRadius: 999,
              background: t.kind === "success" ? "var(--success)" : t.kind === "warn" ? "var(--warn)" : "var(--info)",
            }}
          />
          <div style={{ fontSize: 13, color: "var(--ink)" }}>{t.label}</div>
          <div className="meta" style={{ marginTop: 2 }}>{t.when}</div>
        </div>
      ))}
    </div>
  );
}

function PaymentsTab() {
  const p = DATA.profile;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Deposit</div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" }}>${p.deposit.amount}</div>
          <Pill kind="success" dot>Paid {p.deposit.paidAt}</Pill>
        </div>
        <div className="card" style={{ padding: 16, borderColor: "oklch(0.86 0.08 80)" }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Final</div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" }}>${p.final.amount}</div>
          <Pill kind="warn" dot>Due {p.final.dueAt}</Pill>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Reminder sequence</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill kind="success">#1 sent</Pill>
          <Pill kind="success">#2 sent</Pill>
          <Pill kind="neutral">#3 scheduled</Pill>
        </div>
      </div>
    </>
  );
}

function MessagesTab() {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
      <Mail size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
      <div style={{ fontSize: 13 }}>No messages yet</div>
    </div>
  );
}

function NotesTab() {
  const p = DATA.profile;
  return (
    <div>
      <textarea
        defaultValue={p.notes}
        style={{
          width: "100%", minHeight: 200, border: "1px solid var(--rule)", borderRadius: 8,
          padding: 14, fontSize: 13, lineHeight: 1.55, color: "var(--ink)",
          background: "var(--paper-2)", outline: "none", resize: "vertical", fontFamily: "inherit",
        }}
      />
    </div>
  );
}
