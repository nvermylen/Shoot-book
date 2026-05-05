export function Section({
  eyebrow,
  title,
  right,
  children,
  style = {},
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={{ marginBottom: 40, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, gap: 20 }}>
        <div>
          {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
          <h2 className="display" style={{ margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.1 }}>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
