"use client";

import { useState } from "react";
import { Plus, Filter, ArrowUpDown, ChevronRight } from "lucide-react";
import { Pill, StageBar, SessionDot } from "@/components/primitives";
import { useDrawer } from "@/lib/drawer-context";
import { DATA } from "@/lib/mock/data";

export default function ClientsPage() {
  const [filter, setFilter] = useState("active");
  const rows = DATA.clientsList;
  const { openDrawer } = useDrawer();

  return (
    <div data-page="clients">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Coordinator</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>All clients</h1>
          <button className="btn primary"><Plus size={13} /> New booking</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--rule)", borderRadius: 999, padding: 2, background: "var(--paper-2)" }}>
            {["active", "past", "all"].map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className="chip"
                style={
                  filter === t
                    ? { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }
                    : { border: "1px solid transparent", background: "transparent" }
                }
              >
                {t[0].toUpperCase() + t.slice(1)}
                {t === "active" && <span className="num" style={{ marginLeft: 4, opacity: 0.7 }}>42</span>}
              </button>
            ))}
          </div>
          <span className="chip" style={{ borderStyle: "dashed" }}><Filter size={11} /> Type: All</span>
          <span className="chip" style={{ borderStyle: "dashed" }}>Stage: Any</span>
          <span className="chip" style={{ borderStyle: "dashed" }}>Payment: Any</span>
          <div style={{ flex: 1 }} />
          <div className="chip"><ArrowUpDown size={11} /> Sort: Session date</div>
        </div>
      </div>

      <div style={{ padding: "0 56px 56px" }}>
        <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
          <div
            style={{
              display: "grid", gridTemplateColumns: "32px 1fr 140px 150px 170px 180px 40px",
              padding: "12px 20px", borderBottom: "1px solid var(--rule)", background: "var(--paper-2)",
              alignItems: "center", gap: 12,
            }}
          >
            <div />
            <div className="eyebrow">Client</div>
            <div className="eyebrow">Type</div>
            <div className="eyebrow">Session date</div>
            <div className="eyebrow">Payment</div>
            <div className="eyebrow">Stage</div>
            <div />
          </div>

          {rows.map((r, i) => {
            const payKind = r.payment === "danger" ? "danger" : r.payment === "warn" ? "warn" : "success";
            return (
              <div
                key={r.id}
                className="row-hover"
                onClick={() => openDrawer()}
                style={{
                  display: "grid", gridTemplateColumns: "32px 1fr 140px 150px 170px 180px 40px",
                  padding: "14px 20px", alignItems: "center", gap: 12, cursor: "pointer",
                  borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
                }}
              >
                <SessionDot color={r.color} />
                <div>
                  <div style={{ fontWeight: 500 }}>{r.client}</div>
                  {r.parent && <div className="meta" style={{ fontSize: 10.5, marginTop: 2 }}>Parent: {r.parent}</div>}
                </div>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{r.type}</span>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink)" }}>{r.date}</div>
                  <div className="meta" style={{ fontSize: 10.5, marginTop: 2 }}>#{r.id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill kind={payKind} dot>{r.payLabel}</Pill>
                  {!r.location && <Pill kind="neutral">No location</Pill>}
                </div>
                <StageBar idx={r.stage} showLabel={false} compact />
                <ChevronRight size={12} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
