"use client";

import { useState } from "react";
import { Plus, Eye, Link, MoreHorizontal, Download } from "lucide-react";
import { Pill } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export default function GalleriesPage() {
  const [tab, setTab] = useState("active");
  const g = DATA.galleries;

  const statusPill = (s: string, label: string) => {
    if (s === "active") return <Pill kind="success">{label}</Pill>;
    if (s === "expiring") return <Pill kind="warn" dot>{label}</Pill>;
    if (s === "draft") return <Pill kind="info">{label}</Pill>;
    return <Pill kind="neutral">{label}</Pill>;
  };

  return (
    <div data-page="galleries">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Delivery</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Galleries</h1>
            <div className="meta" style={{ marginTop: 6 }}>
              {g.stats.deliveredMTD} delivered MTD · {g.stats.views7d} views 7d · {g.stats.expiring7d} expiring next 7d
            </div>
          </div>
          <button className="btn primary"><Plus size={13} /> New gallery</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 22 }}>
          {["active", "expiring", "drafts", "archived"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`chip ${tab === t ? "active" : ""}`}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "28px 56px 56px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {g.rows.map((r) => (
            <div key={r.id} className="card" style={{ overflow: "hidden" }}>
              <div style={{
                height: 100, background: `linear-gradient(135deg, ${r.hero}30, ${r.hero}08)`,
                display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 12,
              }}>
                {statusPill(r.status, r.statusLabel)}
              </div>
              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{r.client}</div>
                <div className="meta" style={{ fontSize: 10.5, marginBottom: 10 }}>{r.date}</div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-2)", marginBottom: 12 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Eye size={11} /> {r.views}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Download size={11} /> {r.downloads}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="meta" style={{ fontSize: 10 }}>Expires {r.expires}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn ghost sm" style={{ padding: "0 6px" }}><Eye size={12} /></button>
                    <button className="btn ghost sm" style={{ padding: "0 6px" }}><Link size={12} /></button>
                    <button className="btn ghost sm" style={{ padding: "0 6px" }}><MoreHorizontal size={12} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
