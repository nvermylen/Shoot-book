"use client";

import { Search, Bell, Settings } from "lucide-react";
import { Avatar } from "@/components/primitives";
import type { PhotographerIdentity } from "@/components/dashboard-shell";

export function TopBar({ identity }: { identity: PhotographerIdentity }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 32px", borderBottom: "1px solid var(--rule)",
        position: "sticky", top: 0, background: "var(--paper)", zIndex: 10,
      }}
    >
      <div
        style={{
          flex: 1, display: "flex", alignItems: "center", gap: 10, maxWidth: 440,
          padding: "6px 10px", background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8,
        }}
      >
        <Search size={14} />
        <input
          placeholder="Jump to client, booking, or inquiry…"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 13, color: "var(--ink)", fontFamily: "inherit",
          }}
          data-testid="global-search"
        />
        <span className="kbd">⌘K</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn ghost sm" aria-label="Notifications" data-testid="notifications-btn">
          <Bell size={14} />
        </button>
        <button className="btn ghost sm" aria-label="Settings" data-testid="settings-btn">
          <Settings size={14} />
        </button>
        <div style={{ width: 1, height: 20, background: "var(--rule)", margin: "0 4px" }} />
        <Avatar name={identity.displayName} size={28} color="oklch(0.48 0.08 50)" />
      </div>
    </div>
  );
}
