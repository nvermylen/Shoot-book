"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Sun, MapPin, Check } from "lucide-react";
import { Pill, SessionDot } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export default function CalendarPage() {
  const [view, setView] = useState("week");
  const cal = DATA.calendarWeek;

  return (
    <div data-page="calendar">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Operations</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Calendar</h1>
            <div className="meta" style={{ marginTop: 6 }}>Week of {cal.weekOf}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 0, border: "1px solid var(--rule)", borderRadius: 999, padding: 2, background: "var(--paper-2)" }}>
              {["month", "week", "day"].map((v) => (
                <button key={v} onClick={() => setView(v)} className="chip"
                  style={view === v ? { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" } : { border: "1px solid transparent", background: "transparent" }}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn ghost sm"><ChevronLeft size={14} /></button>
            <button className="btn sm">Today</button>
            <button className="btn ghost sm"><ChevronRight size={14} /></button>
            <button className="btn primary"><Plus size={13} /> New booking</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 56px 56px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 28 }}>
        {/* Week grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {cal.days.map((d) => (
            <div key={d.date} className="card" style={{ padding: 0, overflow: "hidden", minHeight: 180, opacity: d.day === "Sun" ? 0.65 : 1 }}>
              <div style={{
                padding: "10px 12px", borderBottom: "1px solid var(--rule)",
                background: d.today ? "var(--ink)" : "var(--paper-2)", color: d.today ? "var(--paper)" : "var(--ink)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500, opacity: 0.7 }}>{d.day}</div>
                  <div className="display" style={{ fontSize: 24, fontWeight: 600, marginTop: 2 }}>{d.date}</div>
                </div>
                <div className="num" style={{ fontSize: 10, opacity: 0.6 }}>
                  <Sun size={9} /> {d.sunset}
                </div>
              </div>

              <div style={{ padding: "8px 8px" }}>
                {d.events.map((e, i) => (
                  <div key={i} style={{
                    padding: "6px 8px", marginBottom: 4, borderRadius: 6,
                    borderLeft: `3px solid ${e.color}`, background: "var(--paper-2)", fontSize: 11.5,
                  }}>
                    <div className="num" style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 2 }}>{e.time}</div>
                    <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{e.title}</div>
                    {e.location && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2 }}><MapPin size={8} /> {e.location}</div>}
                  </div>
                ))}
                {d.events.length === 0 && <div style={{ fontSize: 11, color: "var(--ink-4)", padding: "8px 4px" }}>Open</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Right rail */}
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>This week</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>Hours booked</span>
                <span className="num" style={{ fontWeight: 500 }}>{cal.stats.hoursBooked}h</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>Golden-hour slots open</span>
                <span className="num" style={{ fontWeight: 500, color: "var(--success)" }}>{cal.stats.goldenOpen}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>Unconfirmed</span>
                <span className="num" style={{ fontWeight: 500, color: "var(--warn)" }}>{cal.stats.unconfirmed}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Integrations</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <Check size={12} style={{ color: "var(--success)" }} />
              <span className="meta" style={{ fontSize: 11 }}>{cal.syncStatus}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Milestones</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { date: "Nov 15", label: "Peak senior season ends" },
                { date: "Dec 10", label: "Q4 tax set-aside" },
                { date: "Jan 15", label: "Quarterly tax payment" },
              ].map((m) => (
                <div key={m.label} style={{ display: "flex", gap: 10, fontSize: 12, alignItems: "flex-start" }}>
                  <span className="num" style={{ color: "var(--ink-3)", minWidth: 50, fontSize: 11 }}>{m.date}</span>
                  <span style={{ color: "var(--ink-2)" }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
