"use client";

import { useState } from "react";
import { Download, Plus, MoreHorizontal, Check, ToggleRight } from "lucide-react";
import { Pill } from "@/components/primitives";
import { useDrawer } from "@/lib/drawer-context";
import { DATA } from "@/lib/mock/data";

export default function PaymentsPage() {
  const [tab, setTab] = useState("outstanding");
  const pay = DATA.payments;
  const { openDrawer } = useDrawer();

  const statusPill = (s: string) => {
    if (s === "overdue") return <Pill kind="danger" dot>Overdue</Pill>;
    if (s === "due_soon") return <Pill kind="warn" dot>Due soon</Pill>;
    if (s === "paid") return <Pill kind="success" dot>Paid</Pill>;
    return <Pill kind="neutral">Scheduled</Pill>;
  };

  return (
    <div data-page="payments">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Billing</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Payments</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm"><Download size={12} /> Export</button>
            <button className="btn primary"><Plus size={13} /> Record payment</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "24px 56px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            ["Outstanding", `$${pay.stats.outstanding.toLocaleString()}`, "var(--accent)", "var(--accent-bg)"],
            ["Overdue", `$${pay.stats.overdue.toLocaleString()}`, "var(--danger)", "var(--danger-bg)"],
            ["Paid MTD", `$${pay.stats.paidMTD.toLocaleString()}`, "var(--success)", "var(--success-bg)"],
          ].map(([label, value, color, bg]) => (
            <div key={String(label)} className="card" style={{ padding: "16px 20px", borderColor: color as string }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
              <div className="stat-num" style={{ fontSize: 32, color: color as string }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: "16px 56px 0", display: "flex", gap: 6 }}>
        {[["outstanding", "Outstanding"], ["paid", "Paid"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`chip ${tab === k ? "active" : ""}`}>{l}</button>
        ))}
      </div>

      <div style={{ padding: "20px 56px 56px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 28 }}>
        {/* Table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 160px 110px 120px 100px 160px 40px",
            padding: "10px 20px", borderBottom: "1px solid var(--rule)", background: "var(--paper-2)", alignItems: "center",
          }}>
            <div className="eyebrow">Client</div>
            <div className="eyebrow">Session</div>
            <div className="eyebrow">Amount</div>
            <div className="eyebrow">Due</div>
            <div className="eyebrow">Reminders</div>
            <div className="eyebrow">Status</div>
            <div />
          </div>

          {pay.rows.map((r, i) => (
            <div key={r.id} className="row-hover" onClick={() => openDrawer()}
              style={{
                display: "grid", gridTemplateColumns: "1fr 160px 110px 120px 100px 160px 40px",
                padding: "14px 20px", alignItems: "center", cursor: "pointer",
                borderBottom: i < pay.rows.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
              <div>
                <div style={{ fontWeight: 500 }}>{r.client}</div>
                {r.parent && <div className="meta" style={{ fontSize: 10.5, marginTop: 2 }}>→ {r.routing === "parent" ? r.parent : "Client"}</div>}
              </div>
              <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.session}</span>
              <span className="num" style={{ fontWeight: 500 }}>${r.amount}</span>
              <span className="meta">{r.due}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((n) => (
                  <span key={n} style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: n < r.reminders ? (r.status === "overdue" ? "var(--danger)" : "var(--warn)") : "var(--paper-3)",
                  }} />
                ))}
                <span className="meta" style={{ marginLeft: 4, fontSize: 10 }}>{r.reminders}/3</span>
              </div>
              {statusPill(r.status)}
              <MoreHorizontal size={12} style={{ color: "var(--ink-3)" }} />
            </div>
          ))}
        </div>

        {/* Right rail */}
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Automations</div>
            {pay.rules.map((r) => (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                borderBottom: "1px solid var(--rule)", fontSize: 12.5,
              }}>
                <ToggleRight size={16} style={{ color: r.enabled ? "var(--success)" : "var(--ink-4)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{r.label}</div>
                  <div className="meta" style={{ fontSize: 10 }}>{r.when}</div>
                </div>
                <span className="meta" style={{ fontSize: 10 }}>{r.sends} sent</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Routing note</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Reminders go to the parent if one is on file. Direct to client otherwise.
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Check size={12} style={{ color: "var(--success)" }} />
              <span className="meta">Stripe connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
