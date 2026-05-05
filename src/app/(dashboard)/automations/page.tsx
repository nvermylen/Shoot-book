"use client";

import { Plus, ToggleRight, MoreHorizontal, FileText, Send, Clock, Check } from "lucide-react";
import { Pill } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export default function AutomationsPage() {
  const a = DATA.automations;

  return (
    <div data-page="automations">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Delivery</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Email Automations</h1>
          <button className="btn primary"><Plus size={13} /> New automation</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "20px 56px", borderBottom: "1px solid var(--rule)", display: "flex", gap: 32 }}>
        {[
          ["Sent this week", String(a.stats.sentThisWeek)],
          ["Sent this month", String(a.stats.sentThisMonth)],
          ["Delivery rate", a.stats.deliveryRate],
          ["Top sender", a.stats.topSender],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: label === "Top sender" ? 13 : 20, fontWeight: label === "Top sender" ? 500 : 600,
              fontFamily: label === "Top sender" ? "inherit" : "var(--font-display)" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "28px 56px 56px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 28 }}>
        {/* Groups */}
        <div>
          {a.groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{g.label}</div>
                  <div className="meta" style={{ marginTop: 2 }}>{g.desc}</div>
                </div>
                <span className="meta">{g.items.length} emails</span>
              </div>
              <div className="card" style={{ overflow: "hidden" }}>
                {g.items.map((item, i) => (
                  <div key={item.id} style={{
                    display: "grid", gridTemplateColumns: "24px 1fr 180px 120px 100px 60px 30px",
                    padding: "12px 16px", alignItems: "center", gap: 10,
                    borderBottom: i < g.items.length - 1 ? "1px solid var(--rule)" : "none",
                  }}>
                    <ToggleRight size={16} style={{ color: item.enabled ? "var(--success)" : "var(--ink-4)" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                      <div className="meta" style={{ fontSize: 10, marginTop: 2 }}>{item.subject}</div>
                    </div>
                    <span className="meta" style={{ fontSize: 10.5 }}>{item.offset}</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{item.audience}</span>
                    <span className="meta" style={{ fontSize: 10 }}>{item.sent7} sent 7d</span>
                    <Pill kind={item.enabled ? "success" : "neutral"}>{item.enabled ? "On" : "Off"}</Pill>
                    <MoreHorizontal size={12} style={{ color: "var(--ink-3)" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right rail */}
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Quick actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn sm" style={{ justifyContent: "flex-start" }}><FileText size={12} /> Template library</button>
              <button className="btn sm" style={{ justifyContent: "flex-start" }}><Send size={12} /> Send test email</button>
              <button className="btn sm" style={{ justifyContent: "flex-start" }}><Clock size={12} /> Send history</button>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <Check size={12} style={{ color: "var(--success)" }} />
              <span style={{ color: "var(--success)" }}>All systems running</span>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>From address</div>
            <div style={{ fontSize: 12.5 }}>morgan@reyesportrait.co</div>
            <div className="meta" style={{ marginTop: 4 }}>
              <Check size={10} /> Verified
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
