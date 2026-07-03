"use client";

import { useState, useTransition } from "react";
import { X, Mail, MessageSquare, Calendar, CreditCard } from "lucide-react";
import { Avatar, CopyButton } from "@/components/primitives";
import { updateClientContactAction } from "@/app/(dashboard)/clients/actions";
import type { Client } from "@/types/erp";

type Tab = "overview" | "timeline" | "payments" | "messages" | "notes";

const SOURCE_LABELS: Record<string, string> = {
  web_form: "Web form",
  gmail: "Gmail",
  manual: "Manual",
  imported: "Imported",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ClientDrawer({
  client,
  open,
  onClose,
}: {
  client: Client | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  // Local copy so an in-drawer save reflects immediately without a page reload.
  // The layout keys this component by client id, so it remounts (and re-inits)
  // when a different client is opened.
  const [current, setCurrent] = useState(client);

  return (
    <>
      <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`drawer ${open ? "open" : ""}`}>
        {!current ? (
          <EmptyDrawer onClose={onClose} />
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "24px 28px 0", borderBottom: "1px solid var(--rule)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <Avatar name={current.display_name} size={44} />
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                      {SOURCE_LABELS[current.source] ?? current.source} · added {formatDate(current.created_at)}
                    </div>
                    <div className="display" style={{ fontSize: 22, fontWeight: 500 }}>
                      {current.display_name}
                    </div>
                    {current.parent_name && (
                      <div className="meta" style={{ marginTop: 4 }}>
                        Parent: {current.parent_name} ·{" "}
                        <span style={{ color: "var(--accent)" }}>billing contact</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="btn ghost sm"
                  onClick={onClose}
                  aria-label="Close"
                  data-testid="drawer-close"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
                {(["overview", "timeline", "payments", "messages", "notes"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    data-testid={`drawer-tab-${t}`}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12.5,
                      fontWeight: tab === t ? 600 : 450,
                      color: tab === t ? "var(--ink)" : "var(--ink-3)",
                      borderBottom: tab === t ? "2px solid var(--ink)" : "2px solid transparent",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
              {tab === "overview" && <OverviewTab client={current} onSaved={setCurrent} />}
              {tab === "notes" && <NotesTab client={current} onSaved={setCurrent} />}
              {tab === "timeline" && (
                <EmptyTab
                  icon={<Calendar size={24} />}
                  title="No sessions yet"
                  detail="Session history appears here once bookings sync from your calendar."
                />
              )}
              {tab === "payments" && (
                <EmptyTab
                  icon={<CreditCard size={24} />}
                  title="No payments yet"
                  detail="Invoices and payment status appear here once billing is connected."
                />
              )}
              {tab === "messages" && (
                <EmptyTab
                  icon={<Mail size={24} />}
                  title="No messages yet"
                  detail="Emails and texts with this client will appear here."
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function OverviewTab({ client, onSaved }: { client: Client; onSaved: (c: Client) => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    phone: client.phone ?? "",
    parent_name: client.parent_name ?? "",
    parent_email: client.parent_email ?? "",
    parent_phone: client.parent_phone ?? "",
  });

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateClientContactAction(client.id, form);
      if (!res.ok || !res.client) {
        setError(res.error ?? "Couldn’t save.");
        return;
      }
      onSaved(res.client);
      setEditing(false);
    });
  };

  const cancel = () => {
    setForm({
      phone: client.phone ?? "",
      parent_name: client.parent_name ?? "",
      parent_email: client.parent_email ?? "",
      parent_phone: client.parent_phone ?? "",
    });
    setError(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Edit contact</div>
        <Field label="Client phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testid="edit-phone" />
        <Field label="Parent name" value={form.parent_name} onChange={(v) => setForm({ ...form, parent_name: v })} testid="edit-parent-name" />
        <Field label="Parent email" value={form.parent_email} onChange={(v) => setForm({ ...form, parent_email: v })} testid="edit-parent-email" />
        <Field label="Parent phone" value={form.parent_phone} onChange={(v) => setForm({ ...form, parent_phone: v })} testid="edit-parent-phone" />
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }} data-testid="edit-error">
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn primary sm" onClick={save} disabled={pending} data-testid="edit-save">
            {pending ? "Saving…" : "Save"}
          </button>
          <button className="btn ghost sm" onClick={cancel} disabled={pending} data-testid="edit-cancel">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <ContactRow label="Client email" value={client.email} />
        <ContactRow label="Client phone" value={client.phone} />
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <ContactRow label="Parent name" value={client.parent_name} accent />
        <ContactRow label="Parent email" value={client.parent_email} accent />
        <ContactRow label="Parent phone" value={client.parent_phone} accent />
      </div>

      <button className="btn sm" onClick={() => setEditing(true)} data-testid="edit-contact">
        Edit contact
      </button>
    </>
  );
}

function ContactRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr auto",
        padding: "10px 14px",
        borderBottom: "1px solid var(--rule)",
        fontSize: 13,
        alignItems: "center",
        gap: 8,
        background: accent ? "var(--accent-bg)" : "transparent",
      }}
    >
      <span className="meta" style={{ fontSize: 11 }}>{label}</span>
      {value ? (
        <>
          <span
            style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {value}
          </span>
          <CopyButton value={value} />
        </>
      ) : (
        <span className="meta" style={{ fontStyle: "italic" }}>Not set</span>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  testid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testid: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="meta" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid var(--rule)",
          background: "var(--paper-2)",
          fontSize: 13,
          fontFamily: "inherit",
          color: "var(--ink)",
          outline: "none",
        }}
      />
    </label>
  );
}

function NotesTab({ client, onSaved }: { client: Client; onSaved: (c: Client) => void }) {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(client.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = notes !== (client.notes ?? "");

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateClientContactAction(client.id, { notes });
      if (!res.ok || !res.client) {
        setError(res.error ?? "Couldn’t save.");
        return;
      }
      onSaved(res.client);
      setSaved(true);
    });
  };

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        data-testid="notes-input"
        placeholder="Notes about this client…"
        style={{
          width: "100%",
          minHeight: 200,
          border: "1px solid var(--rule)",
          borderRadius: 8,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--ink)",
          background: "var(--paper-2)",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <button
          className="btn primary sm"
          onClick={save}
          disabled={pending || !dirty}
          data-testid="notes-save"
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
        {saved && !dirty && <span className="meta" style={{ color: "var(--success)" }}>Saved</span>}
        {error && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</span>}
      </div>
    </div>
  );
}

function EmptyTab({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
      <div style={{ marginBottom: 8, opacity: 0.5, display: "flex", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{title}</div>
      <div className="meta" style={{ marginTop: 4 }}>{detail}</div>
    </div>
  );
}

function EmptyDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn ghost sm" onClick={onClose} aria-label="Close" data-testid="drawer-close">
          <X size={14} />
        </button>
      </div>
      <div style={{ textAlign: "center", padding: 40, color: "var(--ink-3)" }}>
        <MessageSquare size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
        <div style={{ fontSize: 13 }}>Select a client to see their details.</div>
      </div>
    </div>
  );
}
