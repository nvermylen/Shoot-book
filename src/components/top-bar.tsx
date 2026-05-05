"use client";

import { Search, Sun, Bell, Settings } from "lucide-react";
import { Avatar } from "@/components/primitives";
import { DATA } from "@/lib/mock/data";

export function TopBar() {
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
        <span className="meta" style={{ color: "var(--ink-3)" }}>
          <Sun size={12} /> Sunset{" "}
          <span className="num" style={{ color: "var(--ink-2)", marginLeft: 4 }}>{DATA.sunset}</span>
        </span>
        <button className="btn ghost sm" aria-label="Notifications" data-testid="notifications-btn">
          <Bell size={14} />
        </button>
        <button className="btn ghost sm" aria-label="Settings" data-testid="settings-btn">
          <Settings size={14} />
        </button>
        <div style={{ width: 1, height: 20, background: "var(--rule)", margin: "0 4px" }} />
        <Avatar name={DATA.photographer.name} size={28} color="oklch(0.48 0.08 50)" />
      </div>
    </div>
  );
}
