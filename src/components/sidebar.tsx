"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Home, Inbox, Users, Route, FileText, Camera, Calendar,
  MapPin, DollarSign, BookOpen, Tag, Image, Mail, MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { Avatar } from "@/components/primitives";
import type { PhotographerIdentity } from "@/components/dashboard-shell";

const groups = [
  {
    role: "Front Desk",
    desc: "Receptionist",
    items: [
      { key: "/", label: "Mission Control", icon: Home },
      { key: "/inquiries", label: "Inquiries", icon: Inbox },
    ],
  },
  {
    role: "Clients",
    desc: "Coordinator",
    items: [
      { key: "/clients", label: "All Clients", icon: Users },
      { key: "/journey", label: "Journey Tracker", icon: Route },
      { key: "/notes", label: "Notes & Files", icon: FileText },
    ],
  },
  {
    role: "The Day",
    desc: "Operations Manager",
    items: [
      { key: "/shoot-day", label: "Shoot Day", icon: Camera },
      { key: "/calendar", label: "Calendar", icon: Calendar },
      { key: "/locations", label: "Locations", icon: MapPin },
    ],
  },
  {
    role: "Money",
    desc: "Billing & Books",
    items: [
      { key: "/payments", label: "Payments", icon: DollarSign },
      { key: "/finances", label: "Finances", icon: BookOpen },
      { key: "/expenses", label: "Expenses", icon: Tag },
    ],
  },
  {
    role: "Delivery",
    desc: "Gallery Assistant",
    items: [
      { key: "/galleries", label: "Galleries", icon: Image },
      { key: "/automations", label: "Email Automations", icon: Mail },
    ],
  },
];

/** "America/Chicago" → "CDT". Null for empty/unknown timezones — the footer
 *  then shows no zone rather than a wrong one. */
function tzAbbreviation(timezone: string): string | null {
  if (!timezone) return null;
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? null;
  } catch {
    return null;
  }
}

export function Sidebar({
  identity,
  metaphor = "subtle",
}: {
  identity: PhotographerIdentity;
  metaphor?: "subtle" | "medium" | "literal";
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (key: string) => {
    if (key === "/") return pathname === "/";
    return pathname.startsWith(key);
  };

  const tz = tzAbbreviation(identity.timezone);

  return (
    <aside
      style={{
        borderRight: "1px solid var(--rule)",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflowY: "auto",
        width: 248,
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(140deg, var(--ink), oklch(0.35 0.03 40))",
              color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display), var(--font-sans), sans-serif",
              fontSize: 17, fontWeight: 700, letterSpacing: "-0.04em",
            }}
          >
            P
          </div>
          <div>
            <div className="display" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Photographer<span style={{ color: "var(--accent)" }}>·</span>OS
            </div>
            {identity.businessName && (
              <div className="meta" style={{ fontSize: 10, marginTop: 2 }}>{identity.businessName}</div>
            )}
          </div>
        </div>
        {metaphor === "literal" && (
          <div
            style={{
              marginTop: 14, padding: "8px 10px", borderRadius: 8,
              background: "var(--accent-bg)", border: "1px solid oklch(0.88 0.05 55)",
              display: "flex", gap: 8, alignItems: "flex-start",
            }}
          >
            <Sparkles size={12} strokeWidth={1.8} />
            <div style={{ fontSize: 11.5, lineHeight: 1.35, color: "oklch(0.40 0.08 45)" }}>
              <b style={{ fontWeight: 600 }}>Your studio team is on today.</b><br />8 assistants standing by.
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "4px 0 24px" }}>
        {groups.map((g) => (
          <div key={g.role} style={{ marginBottom: 4 }}>
            <div className="nav-group-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{g.role.toUpperCase()}</span>
              {metaphor !== "subtle" && (
                <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic", color: "var(--ink-4)", fontWeight: 400, fontSize: 10 }}>
                  {g.desc}
                </span>
              )}
            </div>
            {g.items.map((it) => {
              const active = isActive(it.key);
              const IconComp = it.icon;
              return (
                <div
                  key={it.key}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => router.push(it.key)}
                  data-testid={`nav-${it.key.replace("/", "") || "home"}`}
                >
                  <span className="nav-icon"><IconComp size={14} /></span>
                  <span>{it.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer — the signed-in photographer, from their profile row */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={identity.displayName} size={30} color="oklch(0.48 0.08 50)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }} data-testid="sidebar-account-name">
            {identity.displayName}
          </div>
          <div className="meta" style={{ fontSize: 10 }}>Owner{tz ? ` · ${tz}` : ""}</div>
        </div>
        <MoreHorizontal size={14} />
      </div>
    </aside>
  );
}
