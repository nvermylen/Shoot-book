"use client";

type PillKind = "neutral" | "success" | "warn" | "danger" | "accent" | "info";

export function Pill({
  kind = "neutral",
  children,
  dot = false,
}: {
  kind?: PillKind;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill ${kind}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}
