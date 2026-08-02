import type { LucideIcon } from "lucide-react";

/**
 * Honest placeholder for pages whose feature hasn't been built yet.
 * Replaces the demo mock data these pages used to show — a real account
 * must never see fabricated business data (HABIT_DESIGN: accuracy is P0).
 */
export function ComingSoon({
  page,
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  page: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div data-page={page}>
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>{title}</h1>
      </div>

      <div style={{ padding: "48px 56px" }}>
        <div
          className="card"
          style={{
            padding: "48px 40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <Icon size={22} strokeWidth={1.6} style={{ color: "var(--ink-3)" }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>Not built yet</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 420, lineHeight: 1.5 }}>
            {description} When it ships, everything here will come from your real
            business — nothing on this screen will ever be sample data.
          </div>
        </div>
      </div>
    </div>
  );
}
