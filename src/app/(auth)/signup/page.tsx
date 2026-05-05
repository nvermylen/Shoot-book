"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studioName, setStudioName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { studio_name: studioName },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("photographer").insert({
        id: data.user.id,
        business_name: studioName,
        display_name: studioName,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
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
            Create your studio
          </h1>
          <p style={{ color: "var(--ink-3)", fontSize: 14, marginTop: 8 }}>
            Get started with Photographer·OS
          </p>
        </div>

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 16 }}>
            <label className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
              Studio name
            </label>
            <input
              type="text"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              placeholder="e.g. Reyes Portrait Co."
              required
              data-testid="signup-studio"
              style={{
                width: "100%", height: 40, padding: "0 12px", borderRadius: 8,
                border: "1px solid var(--rule)", background: "var(--paper)",
                fontSize: 14, color: "var(--ink)", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="signup-email"
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
              minLength={8}
              data-testid="signup-password"
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
            data-testid="signup-submit"
            style={{ width: "100%", height: 44, fontSize: 14, borderRadius: 10, justifyContent: "center" }}
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--ink-3)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
