"use client";

import { Download, Check, TrendingUp } from "lucide-react";
import { DATA } from "@/lib/mock/data";

export default function FinancesPage() {
  const f = DATA.finances;
  const pctGoal = Math.round((f.ytd / f.annualGoal) * 100);
  const monthExpected = Math.round(f.annualGoal * f.monthExpectedShare);
  const maxActual = Math.max(...f.seasonality.map((s) => s.actual ?? 0));

  return (
    <div data-page="finances">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Books</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>Finances</h1>
            <div className="meta" style={{ marginTop: 6 }}>{pctGoal}% to annual goal · ${f.ytd.toLocaleString()} / ${f.annualGoal.toLocaleString()}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm"><Download size={12} /> Tax export</button>
            <button className="btn sm"><Check size={12} /> QuickBooks</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 56px 56px" }}>
        {/* Am I on pace? */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Am I on pace? · October</div>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32, alignItems: "flex-start" }}>
            <div>
              <div className="stat-num" style={{ fontSize: 36 }}>${f.monthActual.toLocaleString()}</div>
              <div className="meta" style={{ marginTop: 6 }}>
                vs ${monthExpected.toLocaleString()} expected ({Math.round(f.monthExpectedShare * 100)}%)
              </div>
              <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
                <TrendingUp size={12} />
                +{Math.round(((f.monthActual - f.sameMonthLY) / f.sameMonthLY) * 100)}% vs Oct last year
              </div>
            </div>

            {/* Seasonality chart */}
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120 }}>
              {f.seasonality.map((s, i) => {
                const expectedH = (s.expected / 0.18) * 100;
                const actualH = s.actual ? (s.actual / maxActual) * 100 : 0;
                const isCurrent = s.m === "Oct";
                return (
                  <div key={s.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", position: "relative" }}>
                      {/* Expected (dashed) */}
                      <div style={{
                        position: "absolute", bottom: 0, width: "60%", height: `${expectedH}%`,
                        border: "1px dashed var(--rule-strong)", borderRadius: 3, background: "transparent",
                      }} />
                      {/* Actual */}
                      {s.actual !== null && (
                        <div style={{
                          position: "relative", width: "60%", height: `${actualH}%`, minHeight: 4,
                          background: isCurrent ? "var(--accent)" : "var(--ink)", borderRadius: 3, opacity: isCurrent ? 1 : 0.6,
                        }} />
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: isCurrent ? "var(--accent)" : "var(--ink-3)", fontWeight: isCurrent ? 600 : 400 }}>{s.m}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Take-home + Taxes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card" style={{ padding: 24, background: "var(--accent-bg)" }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Take-home this month</div>
            <div className="stat-num" style={{ fontSize: 32, color: "var(--accent)" }}>${f.takeHome.toLocaleString()}</div>
            <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
              Revenue ${f.monthActual.toLocaleString()} − Expenses ${(f.monthActual - f.takeHome - f.setAside).toLocaleString()} − Set aside ${f.setAside.toLocaleString()} = Net
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Tax reserve</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
              <div className="stat-num" style={{ fontSize: 32 }}>${f.netTaxes.reserved.toLocaleString()}</div>
              <span className="meta" style={{ color: "var(--warn)" }}>Should be ${f.netTaxes.shouldBe.toLocaleString()}</span>
            </div>
            <div style={{ height: 6, background: "var(--paper-3)", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${(f.netTaxes.reserved / f.netTaxes.shouldBe) * 100}%`, background: "var(--warn)", borderRadius: 999 }} />
            </div>
            <div className="meta" style={{ fontSize: 11 }}>
              Next: ${f.netTaxes.nextAmount.toLocaleString()} due {f.netTaxes.nextDue}
            </div>
          </div>
        </div>

        {/* Health indicators */}
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Is the business healthy?</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {f.health.map((h) => (
              <div key={h.label} style={{ padding: "12px 16px", background: "var(--paper-2)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>{h.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-display)" }}>{h.value}</div>
                <div className="meta" style={{ marginTop: 4, color: "var(--success)" }}>{h.delta}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
