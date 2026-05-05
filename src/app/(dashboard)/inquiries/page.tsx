"use client";

import { useState } from "react";
import { Wand2, Plus, Users, MoreHorizontal, Sparkles, Image, FileText } from "lucide-react";
import { Pill } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export default function InquiriesPage() {
  const [sel, setSel] = useState(DATA.inquiries[0].id);
  const [tab, setTab] = useState("unread");
  const inquiries = DATA.inquiries;
  const current = inquiries.find((i) => i.id === sel)!;

  const quickReplies = [
    { key: "waitlist", label: "Add to waitlist", desc: "Sends autoreply + adds to Nov waitlist" },
    { key: "senior-info", label: "Senior info + availability", desc: "Pricing guide + book-direct link" },
    { key: "decline", label: "Politely decline", desc: "Out-of-season / not a fit" },
  ];

  return (
    <div data-page="inquiries">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Front desk</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Inquiries</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm"><Wand2 size={12} /> Auto-reply rules</button>
            <button className="btn sm primary"><Plus size={12} /> Compose</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 22 }}>
          {[
            ["unread", "Unread", "2"],
            ["all", "All", "23"],
            ["waitlisted", "Waitlisted", "4"],
            ["converted", "Converted", "14"],
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
          {inquiries.map((i) => (
            <div
              key={i.id}
              onClick={() => setSel(i.id)}
              style={{
                padding: "14px 20px", borderBottom: "1px solid var(--rule)", cursor: "pointer",
                background: sel === i.id ? "var(--accent-bg)" : "transparent",
                borderLeft: sel === i.id ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {i.unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }} />}
                  <span style={{ fontWeight: i.unread ? 600 : 500, fontSize: 13.5 }}>{i.name}</span>
                </div>
                <span className="meta" style={{ fontSize: 10.5 }}>{i.received}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <Pill kind="accent">{i.sessionType}</Pill>
                <span className="meta" style={{ fontSize: 10.5 }}>{i.source}</span>
              </div>
              <div
                style={{
                  fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.4,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}
              >
                {i.preview}
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ padding: "28px 40px", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>{current.name}</div>
              <div className="meta" style={{ marginTop: 4 }}>{current.email} · {current.source} · {current.received}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sm"><Users size={12} /> Convert to booking</button>
              <button className="btn sm"><MoreHorizontal size={12} /></button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Pill kind="accent">{current.sessionType}</Pill>
            <Pill kind="neutral">{current.age || "No age"}</Pill>
            <Pill kind="neutral">Source · {current.source}</Pill>
          </div>

          <div className="card" style={{ marginTop: 24, padding: "24px 28px", background: "var(--paper-2)" }}>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-2)", whiteSpace: "pre-line" }}>
              {current.preview}{"\n\n"}Thanks so much,{"\n"}{current.name}
            </div>
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Suggested replies</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {quickReplies.map((q) => (
                <button
                  key={q.key}
                  className="card"
                  style={{
                    padding: 16, textAlign: "left", background: "var(--paper)", cursor: "pointer",
                    display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--rule)",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>
                    <Sparkles size={12} />
                    {q.label}
                  </div>
                  <div className="meta" style={{ fontSize: 11, color: "var(--ink-3)" }}>{q.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 24, padding: 18 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10 }}>
              <span className="eyebrow">Reply as</span>
              <span style={{ fontSize: 13 }}>morgan@reyesportrait.co</span>
              <div style={{ flex: 1 }} />
              <span className="chip">Template: Senior info</span>
            </div>
            <textarea
              defaultValue={`Hi ${current.name.split(" ")[0]} — thanks for reaching out! Senior season is busy but I have a few November openings left. Here's the pricing guide + my self-book link: [link]. Let me know if any dates catch your eye!\n\nxo Morgan`}
              style={{
                width: "100%", minHeight: 150, border: "none", outline: "none", resize: "vertical",
                fontFamily: "inherit", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55, background: "transparent",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
              <button className="btn sm ghost"><Image size={12} /> Image</button>
              <button className="btn sm ghost"><FileText size={12} /> Pricing</button>
              <div style={{ flex: 1 }} />
              <button className="btn sm">Save draft</button>
              <button className="btn sm btn-accent">Send reply</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
