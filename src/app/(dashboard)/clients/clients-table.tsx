"use client";

import { useState } from "react";
import { Plus, Filter, ChevronRight, Users } from "lucide-react";
import { Pill } from "@/components/primitives";
import { useDrawer } from "@/lib/drawer-context";
import type { Client } from "@/types/erp";

const SOURCE_LABELS: Record<string, string> = {
  web_form: "Web form",
  gmail: "Gmail",
  manual: "Manual",
  imported: "Imported",
};

function formatDate(iso: string, timeZone: string): string {
  // Pinned zone: server and client must render identical text (hydration),
  // and dates belong to the photographer's day, not the viewer's.
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
}

export function ClientsTable({ clients, timezone }: { clients: Client[]; timezone: string }) {
  const [search, setSearch] = useState("");
  const { openDrawer } = useDrawer();

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.display_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone?.toLowerCase().includes(q) ?? false) ||
      (c.parent_name?.toLowerCase().includes(q) ?? false) ||
      (c.parent_phone?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div data-page="clients">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Coordinator</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1
            className="display"
            style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}
          >
            All clients
          </h1>
          <button className="btn primary" data-testid="new-booking-btn">
            <Plus size={13} /> New booking
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 24,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="client-search"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--rule)",
              background: "var(--paper-2)",
              fontSize: 13,
              width: 220,
            }}
          />
          <span className="chip" style={{ borderStyle: "dashed" }}>
            <Filter size={11} /> Source: All
          </span>
          <div style={{ flex: 1 }} />
          <span className="meta">{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div style={{ padding: "0 56px 56px" }}>
        {filtered.length === 0 ? (
          <div
            className="card"
            style={{
              marginTop: 20,
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--ink-3)",
            }}
            data-testid="clients-empty"
          >
            <Users size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p style={{ margin: 0, fontWeight: 500 }}>
              {search ? "No clients match your search" : "No clients yet"}
            </p>
            <p className="meta" style={{ marginTop: 4 }}>
              {search
                ? "Try a different search term"
                : "Clients will appear here when leads are converted or added manually"}
            </p>
          </div>
        ) : (
          <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px 140px 140px 40px",
                padding: "12px 20px",
                borderBottom: "1px solid var(--rule)",
                background: "var(--paper-2)",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div className="eyebrow">Client</div>
              <div className="eyebrow">Email</div>
              <div className="eyebrow">Source</div>
              <div className="eyebrow">Added</div>
              <div />
            </div>

            {filtered.map((client, i) => (
              <div
                key={client.id}
                className="row-hover"
                onClick={() => openDrawer(client)}
                data-testid={`client-row-${client.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 180px 140px 140px 40px",
                  padding: "14px 20px",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  borderBottom:
                    i < filtered.length - 1
                      ? "1px solid var(--rule)"
                      : "none",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{client.display_name}</div>
                  {client.parent_name && (
                    <div
                      className="meta"
                      style={{ fontSize: 10.5, marginTop: 2 }}
                    >
                      Parent: {client.parent_name}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {client.email}
                </span>
                <Pill kind="neutral">
                  {SOURCE_LABELS[client.source] ?? client.source}
                </Pill>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {formatDate(client.created_at, timezone)}
                </span>
                <ChevronRight size={12} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
