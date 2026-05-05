"use client";

import { useState } from "react";
import { Plus, Eye, Edit, Map, MoreHorizontal, MapPin, Camera } from "lucide-react";
import { Pill } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

const catColors: Record<string, string> = {
  "Nature & Rustic": "#7A8F5A",
  "Downtown": "#6B7B99",
  "Studio": "#A8916B",
  "Rustic": "#B58A5C",
};

export default function LocationsPage() {
  const [catFilter, setCatFilter] = useState("All");
  const locs = DATA.locations;
  const allCats = ["All", "Nature & Rustic", "Downtown", "Studio", "Rustic"];
  const totalSessions = [...locs.active, ...locs.archived].reduce((s, l) => s + l.usage, 0);

  return (
    <div data-page="locations">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Scout</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Locations</h1>
            <div className="meta" style={{ marginTop: 6 }}>
              {locs.active.length} active · {locs.archived.length} archived · {totalSessions} total sessions
            </div>
          </div>
          <button className="btn primary"><Plus size={13} /> Add location</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 22 }}>
          {allCats.map((c) => (
            <button key={c} onClick={() => setCatFilter(c)} className={`chip ${catFilter === c ? "active" : ""}`}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "28px 56px 56px" }}>
        {/* Map preview */}
        <div className="card" style={{ padding: 24, marginBottom: 28, position: "relative", overflow: "hidden" }}>
          <svg viewBox="0 0 800 200" style={{ width: "100%", height: 200 }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="oklch(0.92 0.004 250)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="800" height="200" fill="url(#grid)" />
            <path d="M100,100 L300,80 L500,120 L700,90" fill="none" stroke="oklch(0.85 0.005 250)" strokeWidth="2" />
            <path d="M150,60 L400,150 L650,70" fill="none" stroke="oklch(0.88 0.005 250)" strokeWidth="1.5" />
            {locs.active.map((l, i) => {
              const x = 100 + i * 85;
              const y = 80 + (i % 3) * 30;
              const color = catColors[l.cat] || "#9BA0A6";
              return (
                <g key={l.id}>
                  <circle cx={x} cy={y} r={12} fill={color} opacity={0.15} />
                  <circle cx={x} cy={y} r={5} fill={color} />
                  <text x={x} y={y + 22} textAnchor="middle" fontSize="8" fill="var(--ink-3)" fontFamily="var(--font-mono)">{l.name.split(" ")[0]}</text>
                </g>
              );
            })}
          </svg>
          <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
            {Object.entries(catColors).map(([cat, color]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--ink-3)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                {cat}
              </div>
            ))}
          </div>
        </div>

        {/* Active locations */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 }}>
          {locs.active
            .filter((l) => catFilter === "All" || l.cat === catFilter)
            .map((l) => {
              const color = catColors[l.cat] || "#9BA0A6";
              return (
                <div key={l.id} className="card" style={{ overflow: "hidden" }}>
                  <div style={{
                    height: 80, background: `linear-gradient(135deg, ${color}22, ${color}08)`,
                    display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 14px 10px",
                  }}>
                    <Pill kind="neutral">{l.cat}</Pill>
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{l.name}</div>
                    <div className="meta" style={{ fontSize: 10.5, marginBottom: 8 }}>
                      <MapPin size={9} /> {l.miles}mi · <Camera size={9} /> {l.usage} sessions
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {l.note}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
                      <button className="btn ghost sm" style={{ padding: "0 6px" }}><Eye size={12} /></button>
                      <button className="btn ghost sm" style={{ padding: "0 6px" }}><Edit size={12} /></button>
                      <button className="btn ghost sm" style={{ padding: "0 6px" }}><Map size={12} /></button>
                      <button className="btn ghost sm" style={{ padding: "0 6px" }}><MoreHorizontal size={12} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Archived */}
        {locs.archived.length > 0 && (
          <details>
            <summary className="eyebrow" style={{ cursor: "pointer", marginBottom: 16 }}>
              Archived ({locs.archived.length})
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, opacity: 0.65 }}>
              {locs.archived.map((l) => {
                const color = catColors[l.cat] || "#9BA0A6";
                return (
                  <div key={l.id} className="card" style={{ overflow: "hidden" }}>
                    <div style={{ height: 60, background: `linear-gradient(135deg, ${color}15, ${color}05)`, display: "flex", alignItems: "flex-end", padding: "0 14px 8px" }}>
                      <Pill kind="neutral">{l.cat}</Pill>
                      <Pill kind="danger" dot>Archived</Pill>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{l.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>{l.note}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
