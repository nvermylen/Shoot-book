# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Lens

> **This file is read automatically by Claude Code at every session start.**
> Keep it current. If Claude Code asks something this file should answer, update this file — don't answer it in chat.
> Operational state (migration number, ticket range, last branch) must be updated at the START of each sprint.

---

## Project Identity

| Field | Value |
|-------|-------|
| **Project** | Lens |
| **One-liner** | AI-native operating system for independent photographers — the central hub for the photography business. |
| **Thesis** | Replace vertical photo SaaS (HoneyBook, Pixieset, Session). Integrate with horizontal infrastructure (Gmail, QuickBooks, Stripe, Calendar). |
| **Repo** | https://github.com/nvermylen/Shoot-book |
| **Deployment** | https://shoot-book.vercel.app |
| **Supabase** | https://vvcuennzifsovbbylolx.supabase.co |
| **Linear** | [LINEAR_PROJECT_URL] |
| **Ticket prefix** | LENS |
| **Owner** | Nate Vermylen |
| **Design partner** | Morgan Vermylen Photography (`docs/personas/persona-end-user.md`) |

---

## Product Truth — Read Before Building Any Feature

> Full rules: **`HABIT_DESIGN.md`** (root). This is the *why* behind the *what*.

Lens is a **daily-operator system of record**, not an occasional-use tool. The
archetype user (Morgan, ~100 clients/year) is in the system **every morning**
answering: who owes me, who's next (when/where), what's late. The habit we are
building is **one morning sweep in Lens replacing the four-tab ritual** (Stripe +
Calendar + Gmail + spreadsheet) she runs today.

Every feature is evaluated against that habit. A feature is not done because it
works — it is done when it serves the daily sweep. The seven rules in
`HABIT_DESIGN.md` are binding; the four that touch the build most often:

- **Morning sweep is one screen** — who owes / who's next / what's late, single
  glance, zero navigation. North-star metric: *time-to-confidence.*
- **Dashboard accuracy is a P0 release gate** — for a daily system of record,
  accuracy IS the retention mechanic. A stale or wrong morning read is a P0 bug,
  never polish. Prefer "syncing…" over stale-but-confident data.
- **Never open empty / notification discipline** — endowed progress (seed from
  import, no blank slates for the primary user); every alert maps to a real
  business event, never an engagement nudge.
- **No gamification of money or operations** — reward is relief and confidence via
  speed, completeness, and trust. No points, streaks, or confetti. (Manipulation
  Matrix: we are a Facilitator. Keep it that way.)

The one risk that overrides roadmap debates: **the two-system trap.** If the user
hedges between Lens and her old tool, the habit never forms. Onboarding's job is
**single-system cutover within 14 days**, not a feature tour. Ask of every roadmap
call: *does this get her fully off the incumbent faster?*

---

## Architecture (Read These First)

| File | Why |
|------|-----|
| `docs/architecture/AGENT_ARCHITECTURE.md` | **Keystone.** Three-layer system, six agents, gateway pattern, multi-agent coordination rules. |
| `docs/architecture/ERP_DATA_MODEL.md` | Canonical entities and relationships. The intent layer. |
| `docs/architecture/INTEGRATION_REGISTRY.md` | External system contracts (Gmail, Calendar, Stripe, QuickBooks, Storage). |
| `docs/personas/PERSONA_ARCH.md` | Schema, API, layer-separation standards. |
| `docs/personas/PERSONA_DEV.md` | File structure, TS standards, naming. |
| `HABIT_DESIGN.md` (root) | **Product truth.** Why we build what we build. Lens is a daily-operator system of record; every feature serves the morning sweep. Seven enforceable habit rules. |

If a Claude Code question can be answered by these files, the answer is in those files — not in this one.

---

## Current Build State

> ⚠️ Update this section at the END of every sprint / after every merge that introduces a new ticket or migration.
> CC uses it to avoid naming conflicts and sequence work correctly.
> **Sprint-close ritual:** update ticket #, migration #, branch name, and feature spec path before closing the sprint.

```
Current phase:       Phase 1 — Foundation (Lead → Booking → Comms loop)
Current sprint:      Sprint 3 — LENS-023 COMPLETE (a/b/c merged #42/#43/#44). Phase 1 loop code-complete: inquiry → lead → qualification → inquiries surface → booking → invoice → chase. Intake inert until gmail.readonly granted on an account.
Last ticket:         LENS-023c MERGED #44 (inquiries page real via listLeads + inquiries-view.tsx; dashboard Fresh-inquiries card real; DATA.inquiries mock deleted; honest connect/watching/paused/failed states). CRON_SECRET live; migration_006 applied prod+test; gmail.readonly on GCC consent screen.
Next ticket:         None kicked off — next is acceptance + cutover prep, then Phase 1 wrap or next spec. PENDING OWNER ACTIONS: (1) apply migration_007 to prod + test — thread_id write degrades to reported error until then; (2) reconnect Google on prod test account — all three consent boxes (intake activates only then), calendar sync unchanged, gmail scope[] includes readonly; (3) E2E chase + intake acceptance per specs (chase: real send on test account; intake: double-run zero dupes, new-sender/client-reply/spam triage, inquiries page count reconciles with lead rows exactly). Before Morgan sees the sweep: seed prod test account invoice book + hand-reconcile (accuracy release gate).
Last migration:      migration_007_lead_thread_id.sql (in repo via #43 — NOT YET APPLIED. migration_006 applied to prod + test 2026-08-01 per owner; migration_005 applied 2026-07-07)
Next migration:      migration_008 (none planned — 023c is UI-only)
Last PR branch:      LENS-023c-inquiries-real (merged as #44)
Active feature spec: docs/features/Phase1/LENS-023_gmail-lead-intake.md (LENS-022 spec: docs/features/Phase1/LENS-022_who-owes-invoices.md)
```

---

## Development Commands

```bash
npm run dev          # Start dev server (Next.js on localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (eslint-config-next)
npx tsc --noEmit     # Type check (run before every commit)
npm test             # Unit tests (excludes RLS suite)
npm run test:rls     # RLS isolation tests (requires .env.test with test project creds)
npm run check:error-handling  # ANTI_PATTERNS #37 grep gate
```

Path alias: `@/*` maps to `./src/*` (configured in `tsconfig.json`).

---

## Stack (Locked — Do Not Change Mid-Build)

| Layer | Technology | Version | Location |
|-------|-----------|---------|----------|
| Framework | Next.js App Router | 16.x | `src/app/` |
| Language | TypeScript (strict) | 5.x | `tsconfig.json` |
| Styling | Tailwind CSS | 4.x | `src/app/globals.css` (`@theme inline`) |
| Database | Supabase (PostgreSQL) | — | See `docs/architecture/ERP_DATA_MODEL.md` |
| Auth | Supabase Auth | — | `src/lib/supabase/` |
| Data fetching | SWR | 2.x | Client components only |
| AI | Anthropic Claude SDK | latest | `src/lib/ai/gateway.ts` (only file) |
| Validation | Zod | 3.x | At every API + tool boundary |
| Testing | Playwright + Vitest + k6 | latest | `tests/` |
| Deployment | Vercel | — | Auto-deploy on `main` merge |

---

## Directory Structure

> Full structure documented in `docs/personas/PERSONA_DEV.md`. Highlights:

```
src/
├── app/
│   ├── (auth)/                 ← Login, signup, OAuth callback (unauthenticated)
│   ├── (dashboard)/            ← All authenticated pages (sidebar layout)
│   ├── api/                    ← API routes (excluded from middleware auth)
│   ├── layout.tsx              ← Root layout (fonts, metadata)
│   └── globals.css             ← Tailwind + design tokens (@theme inline)
├── components/
│   └── primitives/             ← Avatar, Pill, Section, CopyButton, etc.
├── lib/
│   ├── supabase/               ← client.ts | server.ts | admin.ts
│   ├── ai/
│   │   ├── gateway.ts          ← THE gateway (only file allowed to import LLM SDK)
│   │   ├── tools/registry.ts
│   │   ├── agents/[agent]/     ← per-agent prompts, tools, run loop
│   │   └── evals/[agent]/      ← per-agent evals
│   ├── erp/[entity]/           ← ERP business logic
│   ├── integrations/[svc]/     ← external system adapters
│   ├── events/                 ← domain event bus
│   └── crypto/tokens.ts        ← OAuth token encryption
├── types/                      ← erp.ts, agent.ts, events.ts, api.ts
└── middleware.ts               ← Supabase session refresh + auth redirect
```

---

## Key Architectural Patterns

**Route groups.** `(auth)` holds login/signup/callback — unauthenticated pages. `(dashboard)` holds all authenticated pages and provides the sidebar + top-bar layout. Middleware redirects unauthenticated users to `/login` and authenticated users away from auth routes.

**Supabase three-client pattern.** Three clients, each for a different context:
- `client.ts` — browser client (`createBrowserClient`), used in `"use client"` components
- `server.ts` — server client (`createServerClient` with cookies), used in Server Components and Route Handlers
- `admin.ts` — service-role client, bypasses RLS, used only for privileged server-side operations (e.g., signup user creation)

**Design tokens.** OKLCH color system defined in `src/app/globals.css` via CSS custom properties. Semantic names: `--paper` / `--ink` for surfaces and text, `--accent` / `--success` / `--warn` / `--danger` / `--info` for status. Exposed to Tailwind via `@theme inline` block (e.g., `bg-paper`, `text-ink-2`). Three font stacks: `--font-sans` (Inter), `--font-display` (Inter Tight), `--font-mono` (JetBrains Mono).

---

## The Six Agents

See `docs/architecture/AGENT_ARCHITECTURE.md` for full ownership/tool/boundary specs.

| Agent | Phase | Owns |
|-------|-------|------|
| LeadAgent | 1 | Lead intake, qualification, conversion |
| BookingAgent | 1 | Session booking — package, date, location, contract |
| CommsAgent | 1 | All client communication |
| BillingAgent | 2 | Invoicing, payment chasing, reconciliation |
| ExpenseAgent | 3 | Expense capture, categorization, accounting export |
| DeliveryAgent | 3 | Gallery delivery, download tracking |

---

## Integrations

See `docs/architecture/INTEGRATION_REGISTRY.md` for full per-integration spec.

| Service | Phase | Direction | Primary agent(s) |
|---------|-------|-----------|------------------|
| Gmail | 1 | ⬌ | LeadAgent, CommsAgent |
| Google Calendar | 1 | ⬌ | BookingAgent |
| Stripe | 2 | ⬌ | BillingAgent |
| QuickBooks | 3 | ⬆ | BillingAgent, ExpenseAgent |
| Cloud Storage | 3 | ⬆ | DeliveryAgent |

---

## Environment Variables

| Variable | Used In | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients | Public — safe for client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `client.ts` | Public — RLS enforces access |
| `SUPABASE_SERVICE_ROLE_KEY` | `admin.ts` only | Secret — never expose |
| `ANTHROPIC_API_KEY` | `gateway.ts` only | Secret — server only |
| `TOKEN_ENCRYPTION_KEY` | `crypto/tokens.ts` | Secret — used to encrypt OAuth tokens at rest |
| `GOOGLE_OAUTH_CLIENT_ID` | `integrations/gmail/client.ts`, `integrations/calendar/client.ts` | Public OK |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same | Secret |
| `STRIPE_API_KEY` | `integrations/stripe/client.ts` | Secret (Phase 2) |
| `STRIPE_WEBHOOK_SECRET` | `integrations/stripe/webhooks.ts` | Secret (Phase 2) |
| `CRON_SECRET` | `api/cron/invoice-chase/route.ts` | Secret — bearer auth for Vercel Cron (LENS-022e); route fails closed if unset |

**Rules:** `.env.local` never committed. No `NEXT_PUBLIC_` prefix on secrets. Service role key in `admin.ts` only.

---

## Migration Rules

1. **Generate SQL only** — filename: `migration_[NNN]_[description].sql`.
2. **Never execute** migrations via Claude Code — applied manually in Supabase dashboard.
3. **Current highest:** `migration_002_phase1_erp.sql` (applied) — next file = next sequential number.
4. **Every new table:** RLS enabled + at least one photographer-scoped policy in the same migration.
5. **File header:** `-- Migration: [NNN] | [description] | [date]`.
6. **After applying:** update Current Build State above.

---

## Git & Branching

| Rule | Convention |
|------|-----------|
| Branch naming | `LENS-[NNN]-[short-slug]` |
| Commit message | `LENS-[NNN]: [PR title]` |
| First PR of feature | Branch from `main` |
| Subsequent PRs | Branch from previous PR's branch |
| Merge strategy | Squash merge to `main` |
| Vercel | Auto-deploys on every merge to `main` |

---

## Quality Gates (Every PR)

```bash
npx tsc --noEmit    # zero errors
npm run lint        # zero errors
```

- [ ] New tables: RLS enabled + at least one photographer-scoped policy.
- [ ] New tools: registered in `src/lib/ai/tools/registry.ts` with Zod input + output.
- [ ] New tools: declared in the consuming agent's `tools.ts`.
- [ ] API routes: auth check at the top of every handler.
- [ ] UI elements: `data-testid` on all interactive elements.
- [ ] No hardcoded model strings (use `getActiveVersion()`).
- [ ] No `console.log` in production paths.
- [ ] No prompt content logged anywhere.
- [ ] Migrations: SQL files only, not executed.
- [ ] Security/crypto modules: test file in the same PR (anti-pattern #33).
- [ ] DECISIONS_LOG entries describe implementation behavior accurately. If you write "logged," the code logs. If the code doesn't log, the decision says "silently dropped." Code and decision must agree.
- [ ] Feature serves the daily sweep (`HABIT_DESIGN.md`). Any dashboard/data-surfacing change preserves accuracy (P0) and time-to-confidence. No gamification, no empty-state for the primary user, no engagement-nudge notifications. PM persona owns this check.

---

## What NOT To Do

> Top of `docs/architecture/ANTI_PATTERNS.md`. Non-negotiable.

| # | Never | Instead |
|---|-------|---------|
| 1 | Run migrations | Generate SQL only |
| 2 | Use `any` type | Explicit types; `unknown` if uncertain |
| 3 | Import LLM SDK outside `gateway.ts` | All LLM calls flow through gateway |
| 4 | Import external integration SDK outside its adapter | All integration calls flow through adapters |
| 5 | Have one agent call another agent directly | Use ERP-mediated or event-driven coordination |
| 6 | Trust client-supplied user IDs | Always `supabase.auth.getUser()` server-side |
| 7 | Use `useEffect` for data fetching | SWR |
| 8 | Hardcode model string or prompt | `getActiveVersion()` and prompt registry |
| 9 | Implement out-of-spec scope | Log as `// TODO: LENS-NNN`, don't build |
| 10 | Skip `npx tsc --noEmit` | Run before every commit |
| 11 | Log prompt content or tokens | Token counts only — ZDR posture |

> Full list and explanations: `docs/architecture/ANTI_PATTERNS.md`.

---

## Sprint Workflow

```
1. Read this file                                    → current build state
2. Read the active Feature Spec                      → what's being built
3. Read HABIT_DESIGN.md                              → does this feature serve the daily sweep?
4. Read docs/architecture/AGENT_ARCHITECTURE.md      → if touching agents
5. Read docs/architecture/ERP_DATA_MODEL.md          → if touching schema
6. Read docs/architecture/INTEGRATION_REGISTRY.md    → if touching integrations
7. Read docs/architecture/ANTI_PATTERNS.md           → before writing code
8. Read relevant persona                             → ARCH for design, DEV for implementation
9. Execute CC Prompt                                 → work through PRs in dependency order
10. Generate migrations                              → SQL files only, never run them
11. Quality gate                                     → tsc + lint + habit check pass before commit
12. Update Current Build State                       → ticket #, migration #, branch name, feature spec path
```

---

## Key Reference Files

| File | Read When |
|------|-----------|
| `HABIT_DESIGN.md` (root) | Before any feature scope or dashboard/UX decision — does it serve the daily sweep? |
| `docs/architecture/AGENT_ARCHITECTURE.md` | Anything touching agents, tools, gateway, prompts |
| `docs/architecture/ERP_DATA_MODEL.md` | Anything touching entities or schema |
| `docs/architecture/INTEGRATION_REGISTRY.md` | Anything touching Gmail / Calendar / Stripe / QB / Storage |
| `docs/architecture/ANTI_PATTERNS.md` | Before starting any PR |
| `docs/architecture/DECISIONS_LOG.md` | When a pattern seems wrong — was it a deliberate decision? |
| `docs/architecture/DOMAIN_GLOSSARY.md` | Naming anything domain-specific |
| `docs/architecture/DESIGN_SYSTEM.md` | Building any UI component |
| `docs/architecture/SECURITY.md` | Touching auth, encryption, OAuth, external APIs |
| `docs/personas/PERSONA_ARCH.md` | Schema or API contract decisions |
| `docs/personas/PERSONA_DEV.md` | Implementation pattern questions |
| `docs/personas/PERSONA_QA.md` | Writing acceptance criteria or tests |
| `docs/personas/PERSONA_PM.md` | Scope decisions, what to build / not build — enforce `HABIT_DESIGN.md` rules |
| `docs/personas/PERSONA_UX.md` | UI flow, interaction, state coverage |
| `docs/personas/persona-end-user.md` | Understanding Morgan (design partner #1) |

---

*Lens | CLAUDE.md | Updated: 2026-08-01 | Phase 1 Sprint 3 | + HABIT_DESIGN*
