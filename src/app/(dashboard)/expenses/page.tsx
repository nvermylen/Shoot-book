"use client";

import { useState } from "react";
import { Plus, Car, Download, Check, Clock } from "lucide-react";
import { SessionDot } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export default function ExpensesPage() {
  const [catFilter, setCatFilter] = useState("All");
  const exp = DATA.expenses;

  return (
    <div data-page="expenses">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Books</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Expenses</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm"><Car size={12} /> Add mileage</button>
            <button className="btn primary"><Plus size={13} /> Add expense</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "20px 56px", borderBottom: "1px solid var(--rule)", display: "flex", gap: 40 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>YTD</div>
          <div className="stat-num" style={{ fontSize: 28 }}>${exp.stats.ytd.toLocaleString()}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>MTD</div>
          <div className="stat-num" style={{ fontSize: 28 }}>${exp.stats.mtd.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: "16px 56px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {exp.categories.map((c) => (
          <button key={c} onClick={() => setCatFilter(c)} className={`chip ${catFilter === c ? "active" : ""}`}>{c}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="chip" style={{ borderStyle: "dashed" }}>Date: All</span>
        <button className="btn sm"><Download size={12} /> CSV</button>
      </div>

      {/* Table */}
      <div style={{ padding: "8px 56px 56px" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "90px 120px 1fr 100px 100px 60px 80px",
            padding: "10px 20px", borderBottom: "1px solid var(--rule)", background: "var(--paper-2)", alignItems: "center",
          }}>
            <div className="eyebrow">Date</div>
            <div className="eyebrow">Category</div>
            <div className="eyebrow">Description</div>
            <div className="eyebrow">Amount</div>
            <div className="eyebrow">Booking</div>
            <div className="eyebrow">Receipt</div>
            <div className="eyebrow">QB</div>
          </div>

          {exp.rows.map((r, i) => (
            <div key={r.id} className="row-hover" style={{
              display: "grid", gridTemplateColumns: "90px 120px 1fr 100px 100px 60px 80px",
              padding: "14px 20px", alignItems: "center",
              borderBottom: i < exp.rows.length - 1 ? "1px solid var(--rule)" : "none",
            }}>
              <span className="meta">{r.date}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <SessionDot color={r.catColor} />
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.cat}</span>
              </div>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>{r.desc}</span>
              <span className="num" style={{ fontWeight: 500 }}>${r.amount.toFixed(2)}</span>
              <span className="meta" style={{ fontSize: 10 }}>{r.booking || "—"}</span>
              <span style={{ fontSize: 11, color: r.receipt ? "var(--success)" : "var(--ink-4)" }}>
                {r.receipt ? <Check size={12} /> : "—"}
              </span>
              <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4,
                color: r.qb === "synced" ? "var(--success)" : "var(--warn)" }}>
                {r.qb === "synced" ? <Check size={11} /> : <Clock size={11} />}
                {r.qb}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
