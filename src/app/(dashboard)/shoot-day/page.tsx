"use client";

import { Sun, Camera, Route, MapPin, Mail, FileText, Phone, Check, AlertTriangle } from "lucide-react";
import { Pill, CopyButton } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

function ContactRow({ label, name, phone, email, primary }: {
  label: string; name: string; phone: string; email?: string | null; primary?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 12, alignItems: "center",
        padding: "8px 10px", borderRadius: 8, background: primary ? "var(--paper-2)" : "transparent",
      }}
    >
      <div className="meta" style={{ fontSize: 10.5 }}>{label}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 2, color: "var(--ink-2)", fontSize: 12 }}>
          <span className="num">{phone}</span>
          {email && <><span style={{ color: "var(--ink-4)" }}>·</span><span>{email}</span></>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn sm" style={{ padding: "0 8px" }} aria-label="Call"><Phone size={12} /></button>
        <CopyButton value={phone} />
      </div>
    </div>
  );
}

function CheckBox({ label, ok, sub }: { label: string; ok: boolean; sub: string }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: 8,
        background: ok ? "var(--success-bg)" : "var(--warn-bg)",
        border: `1px solid ${ok ? "oklch(0.86 0.06 150)" : "oklch(0.86 0.08 80)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {ok ? <Check size={12} /> : <AlertTriangle size={12} />}
        <span className="eyebrow" style={{ color: ok ? "var(--success)" : "oklch(0.48 0.12 70)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>{sub}</div>
    </div>
  );
}

export default function ShootDayPage() {
  const shoots = DATA.todayShoots;

  return (
    <div data-page="shootday">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Operations · {DATA.today}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Shoot day</h1>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <span className="meta"><Sun size={12} /> Sunset <span className="num" style={{ color: "var(--ink-2)" }}>{DATA.sunset}</span></span>
            <span className="meta"><Camera size={12} /> <span className="num" style={{ color: "var(--ink-2)" }}>2</span> sessions today</span>
            <button className="btn sm"><Route size={12} /> Route map</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "32px 56px 56px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {shoots.map((s, i) => (
          <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                padding: "20px 24px", borderBottom: "1px solid var(--rule)",
                background: i === 0 ? "var(--accent-bg)" : "var(--paper-2)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Session {i + 1} of 2 · {s.meetAt.split(" · ")[0]}</div>
                  <div className="display" style={{ fontSize: 26, fontWeight: 500 }}>{s.client}</div>
                  <div className="meta" style={{ marginTop: 4 }}>{s.package}</div>
                </div>
                {s.paid
                  ? <Pill kind="success" dot>Paid in full</Pill>
                  : <Pill kind="danger" dot>Balance ${s.total - s.paidAmount} due today</Pill>}
              </div>
            </div>

            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--rule)", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <MapPin size={16} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{s.meetAt}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {s.locations.map((l) => <span key={l} className="chip">{l}</span>)}
                </div>
              </div>
              <button className="btn sm">Directions →</button>
            </div>

            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--rule)" }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Contacts</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <ContactRow label={s.parent ? "Client (senior)" : "Client"} name={s.client} phone={s.phone} />
                {s.parent && s.parentPhone && (
                  <ContactRow label="Parent — billing" name={s.parent} phone={s.parentPhone} email={s.parentEmail} primary />
                )}
              </div>
            </div>

            <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <CheckBox label="Paid" ok={s.paid} sub={s.paid ? `$${s.total}` : `$${s.paidAmount} / $${s.total}`} />
              <CheckBox label="Location" ok sub={`${s.locations.length} confirmed`} />
              <CheckBox label="Style guide" ok sub="Opened" />
            </div>

            {s.outfits && (
              <div style={{ padding: "0 24px 16px" }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Outfits</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{s.outfits}</div>
              </div>
            )}

            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--rule)", background: "var(--paper-2)" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{s.notes}</div>
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--rule)", display: "flex", gap: 8 }}>
              <button className="btn"><Mail size={12} /> Message</button>
              <button className="btn"><FileText size={12} /> Contract</button>
              <div style={{ flex: 1 }} />
              {!s.paid && <button className="btn btn-accent">Send payment link</button>}
              <button className="btn primary">Open booking</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
