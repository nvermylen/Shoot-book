"use client";

import { DATA } from "@/lib/mock/data";

export function StageBar({
  idx = 0,
  stages,
  showLabel = true,
  compact = false,
}: {
  idx?: number;
  stages?: string[];
  showLabel?: boolean;
  compact?: boolean;
}) {
  const S = stages || DATA.stages;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 6, minWidth: compact ? 120 : 180 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {S.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: compact ? 4 : 5,
              borderRadius: 999,
              background: i <= idx ? "var(--ink)" : "var(--paper-3)",
            }}
          />
        ))}
      </div>
      {showLabel && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="meta" style={{ fontSize: 10.5 }}>{S[idx] || S[S.length - 1]}</span>
          <span className="meta" style={{ fontSize: 10.5 }}>{idx + 1}/{S.length}</span>
        </div>
      )}
    </div>
  );
}
