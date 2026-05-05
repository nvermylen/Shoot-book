"use client";

import { useState } from "react";
import { Plus, Paperclip, Download, Trash2, Tag, Edit } from "lucide-react";
import { Pill } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export default function NotesPage() {
  const [sel, setSel] = useState(DATA.notes[0].id);
  const [tab, setTab] = useState("all");
  const notes = DATA.notes;
  const current = notes.find((n) => n.id === sel)!;

  return (
    <div data-page="notes">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Coordinator</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Notes & Files</h1>
          <button className="btn primary"><Plus size={13} /> New note</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 22 }}>
          {[
            ["all", "All", String(notes.length)],
            ["due", "Due", String(notes.filter((n) => n.due).length)],
            ["tagged", "Tagged to client", String(notes.filter((n) => n.client).length)],
            ["untagged", "Untagged", String(notes.filter((n) => !n.client).length)],
          ].map(([k, l, c]) => (
            <button key={k} onClick={() => setTab(k)} className={`chip ${tab === k ? "active" : ""}`}>
              {l} <span className="num" style={{ opacity: 0.7 }}>{c}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", minHeight: "calc(100vh - 220px)" }}>
        {/* List */}
        <div style={{ borderRight: "1px solid var(--rule)", overflowY: "auto" }}>
          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => setSel(n.id)}
              style={{
                padding: "14px 20px", borderBottom: "1px solid var(--rule)", cursor: "pointer",
                background: sel === n.id ? "var(--accent-bg)" : "transparent",
                borderLeft: sel === n.id ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 4 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4, marginBottom: 6,
                display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {n.body}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {n.client && <Pill kind="accent">{n.client}</Pill>}
                {n.due && <Pill kind="warn">Due {n.due}</Pill>}
                {n.attach && <span className="meta" style={{ fontSize: 10 }}><Paperclip size={9} /> {n.attach}</span>}
                <span className="meta" style={{ marginLeft: "auto", fontSize: 10 }}>{n.updated}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ padding: "28px 40px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {current.client && <Pill kind="accent">{current.client}</Pill>}
            {current.due && <Pill kind="warn">Due {current.due}</Pill>}
            {!current.client && <Pill kind="neutral">General</Pill>}
          </div>

          <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>{current.title}</div>
          <div className="meta" style={{ marginTop: 6, marginBottom: 24 }}>Updated {current.updated}</div>

          <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-2)", whiteSpace: "pre-line", marginBottom: 24 }}>
            {current.body}
          </div>

          {current.attach && (
            <div className="card" style={{ padding: 16, marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
              <div className="ph" style={{ width: 48, height: 48 }}>IMG</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{current.attach}</div>
                <div className="meta" style={{ marginTop: 2 }}>Attachment</div>
              </div>
              <button className="btn sm"><Download size={12} /> Download</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm"><Edit size={12} /> Edit</button>
            <button className="btn sm"><Paperclip size={12} /> Attach</button>
            <button className="btn sm"><Tag size={12} /> Tag client</button>
            <div style={{ flex: 1 }} />
            <button className="btn sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}><Trash2 size={12} /> Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
