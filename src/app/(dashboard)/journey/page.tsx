"use client";

import { Filter, ArrowUpDown, Download, MoreHorizontal } from "lucide-react";
import { SessionDot } from "@/components/primitives";
import { useDrawer } from "@/lib/drawer-context";
import { DATA } from "@/lib/mock/data";

export default function JourneyPage() {
  const j = DATA.journey;
  const { openDrawer } = useDrawer();

  return (
    <div data-page="journey">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Coordinator</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Journey tracker</h1>
            <div className="meta" style={{ marginTop: 6 }}>Every active booking, by stage. Spot stuck clients before they slip.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="chip" style={{ borderStyle: "dashed" }}><Filter size={11} /> Type: All</span>
            <span className="chip"><ArrowUpDown size={11} /> Sort: Days in stage</span>
            <button className="btn sm"><Download size={12} /> Export</button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ padding: "14px 56px", background: "var(--paper-2)", borderBottom: "1px solid var(--rule)", display: "flex", gap: 24, alignItems: "center" }}>
        {j.stageStats.map((s) => {
          const color = s.avgDays > 7 ? "var(--danger)" : s.avgDays > 4 ? "var(--warn)" : "var(--ink-2)";
          return (
            <div key={s.stage} style={{ fontSize: 11.5 }}>
              <span style={{ color: "var(--ink-3)" }}>{s.stage}: </span>
              <span className="num" style={{ color, fontWeight: 500 }}>{s.avgDays}d avg</span>
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--danger)", fontWeight: 500 }}>{j.stuckCount} stuck</span>
      </div>

      {/* Kanban */}
      <div style={{ padding: "28px 56px 56px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 12, minWidth: "max-content" }}>
          {j.columns.map((col) => (
            <div key={col.key} style={{ width: 220, flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 500 }}>{col.label}</div>
                  <div className="display" style={{ fontSize: 28, fontWeight: 600, marginTop: 2 }}>{col.count}</div>
                </div>
                <button className="btn ghost sm" style={{ padding: "0 4px" }}><MoreHorizontal size={14} /></button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.cards.map((c) => (
                  <div
                    key={c.id}
                    className="card row-hover"
                    onClick={() => openDrawer()}
                    style={{
                      padding: "12px 14px", cursor: "pointer",
                      borderLeft: c.stuck ? `2px solid ${c.stuck === "danger" ? "var(--danger)" : "var(--warn)"}` : "1px solid var(--rule)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <SessionDot color={c.color} />
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.client}
                      </span>
                    </div>
                    <div className="meta" style={{ fontSize: 10.5 }}>{c.date}</div>
                    {c.stuck && (
                      <div style={{ marginTop: 6, fontSize: 11, color: c.stuck === "danger" ? "var(--danger)" : "var(--warn)", fontWeight: 500 }}>
                        {c.days}d in stage
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
