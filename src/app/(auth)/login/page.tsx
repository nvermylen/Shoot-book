"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--paper)", padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px",
              background: "linear-gradient(140deg, var(--ink), oklch(0.35 0.03 40))",
              color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display), var(--font-sans), sans-serif",
              fontSize: 24, fontWeight: 700, letterSpacing: "-0.04em",
            }}
          >
            P
          </div>
          <h1
            className="display"
            style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}
          >
            Photographer<span style={{ color: "var(--accent)" }}>·</span>OS
          </h1>
          <p style={{ color: "var(--ink-3)", fontSize: 14, marginTop: 8 }}>
            Sign in to your studio
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="login-email"
              style={{
                width: "100%", height: 40, padding: "0 12px", borderRadius: 8,
                border: "1px solid var(--rule)", background: "var(--paper)",
                fontSize: 14, color: "var(--ink)", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="login-password"
              style={{
                width: "100%", height: 40, padding: "0 12px", borderRadius: 8,
                border: "1px solid var(--rule)", background: "var(--paper)",
                fontSize: 14, color: "var(--ink)", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                background: "var(--danger-bg)", color: "var(--danger)",
                fontSize: 13, border: "1px solid oklch(0.86 0.08 30)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn primary"
            data-testid="login-submit"
            style={{ width: "100%", height: 44, fontSize: 14, borderRadius: 10, justifyContent: "center" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--ink-3)" }}>
          No account?{" "}
          <Link href="/signup" style={{ color: "var(--accent)", fontWeight: 500 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
