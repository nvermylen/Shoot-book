# CLAUDE.md
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
| **Repo** | [GITHUB_REPO_URL] |
| **Deployment** | [VERCEL_PROJECT_URL] |
| **Supabase** | [SUPABASE_PROJECT_URL] |
| **Linear** | [LINEAR_PROJECT_URL] |
| **Ticket prefix** | LENS |
| **Owner** | Nate Vermylen |
| **Design partner** | Morgan Vermylen Photography (`personas/persona-end-user.md`) |

---

## Architecture (Read These First)

| File | Why |
|------|-----|
| `AGENT_ARCHITECTURE.md` | **Keystone.** Three-layer system, six agents, gateway pattern, multi-agent coordination rules. |
| `ERP_DATA_MODEL.md` | Canonical entities and relationships. The intent layer. |
| `INTEGRATION_REGISTRY.md` | External system contracts (Gmail, Calendar, Stripe, QuickBooks, Storage). |
| `personas/PERSONA_ARCH.md` | Schema, API, layer-separation standards. |
| `personas/PERSONA_DEV.md` | File structure, TS standards, naming. |

If a Claude Code question can be answered by these five files, the answer is in those files — not in this one.

---

## Current Build State

> ⚠️ Update this section at the START of every sprint. CC uses it to avoid naming conflicts and sequence work correctly.

```
Current phase:       Phase 1 — Foundation (Lead → Booking → Comms loop)
Current sprint:      Sprint 1 — Auth + ERP foundation + LeadAgent skeleton
Last ticket:         LENS-000  (project initialized)
Next ticket:         LENS-001
Last migration:      —
Next migration:      migration_001_photographer_and_clients.sql
Last PR branch:      —
Active feature spec: features/Sprint1_Foundation_Feature_Spec.md
```

---

## Stack (Locked — Do Not Change Mid-Build)

| Layer | Technology | Version | Location |
|-------|-----------|---------|----------|
| Framework | Next.js App Router | 15.x | `src/app/` |
| Language | TypeScript (strict) | 5.x | `tsconfig.json` |
| Styling | Tailwind CSS | 4.x | `tailwind.config.ts` |
| Database | Supabase (PostgreSQL) | — | See `ERP_DATA_MODEL.md` |
| Auth | Supabase Auth | — | `src/lib/supabase/` |
| Data fetching | SWR | 2.x | Client components only |
| AI | Anthropic Claude SDK | latest | `src/lib/ai/gateway.ts` (only file) |
| Validation | Zod | 3.x | At every API + tool boundary |
| Testing | Playwright + Vitest + k6 | latest | `tests/` |
| Deployment | Vercel | — | Auto-deploy on `main` merge |

---

## Directory Structure

> Full structure documented in `personas/PERSONA_DEV.md`. Highlights:

```
src/
├── app/                        ← Next.js routes
├── components/                 ← React components
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
└── middleware.ts               ← Supabase session refresh
```

---

## The Six Agents

See `AGENT_ARCHITECTURE.md` for full ownership/tool/boundary specs.

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

See `INTEGRATION_REGISTRY.md` for full per-integration spec.

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

**Rules:** `.env.local` never committed. No `NEXT_PUBLIC_` prefix on secrets. Service role key in `admin.ts` only.

---

## Migration Rules

1. **Generate SQL only** — filename: `migration_[NNN]_[description].sql`.
2. **Never execute** migrations via Claude Code — applied manually in Supabase dashboard.
3. **Current highest:** none yet — next file = `migration_001_photographer_and_clients.sql`.
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

---

## What NOT To Do

> Top of `ANTI_PATTERNS.md`. Non-negotiable.

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

> Full list and explanations: `ANTI_PATTERNS.md`.

---

## Sprint Workflow

```
1. Read this file               → current build state
2. Read the active Feature Spec → what's being built
3. Read AGENT_ARCHITECTURE.md   → if touching agents
4. Read ERP_DATA_MODEL.md       → if touching schema
5. Read INTEGRATION_REGISTRY.md → if touching integrations
6. Read ANTI_PATTERNS.md        → before writing code
7. Read relevant persona        → ARCH for design, DEV for implementation
8. Execute CC Prompt            → work through PRs in dependency order
9. Generate migrations          → SQL files only, never run them
10. Quality gate                → tsc + lint pass before commit
11. Update this file            → new ticket #, new migration #, new branch
```

---

## Key Reference Files

| File | Read When |
|------|-----------|
| `AGENT_ARCHITECTURE.md` | Anything touching agents, tools, gateway, prompts |
| `ERP_DATA_MODEL.md` | Anything touching entities or schema |
| `INTEGRATION_REGISTRY.md` | Anything touching Gmail / Calendar / Stripe / QB / Storage |
| `ANTI_PATTERNS.md` | Before starting any PR |
| `DECISIONS_LOG.md` | When a pattern seems wrong — was it a deliberate decision? |
| `DOMAIN_GLOSSARY.md` | Naming anything domain-specific |
| `DESIGN_SYSTEM.md` | Building any UI component |
| `SECURITY.md` | Touching auth, encryption, OAuth, external APIs |
| `personas/PERSONA_ARCH.md` | Schema or API contract decisions |
| `personas/PERSONA_DEV.md` | Implementation pattern questions |
| `personas/PERSONA_QA.md` | Writing acceptance criteria or tests |
| `personas/PERSONA_PM.md` | Scope decisions, what to build / not build |
| `personas/PERSONA_UX.md` | UI flow, interaction, state coverage |
| `personas/persona-end-user.md` | Understanding Morgan (design partner #1) |

---

*Lens | CLAUDE.md | Updated: [DATE] | Phase 1 Sprint 1*
