# ONBOARDING.md
## Lens — Read This First

> **Purpose**: Orient a fresh Claude Code session in under 5 minutes. The `/init` companion. Read this before touching any feature spec or prompt. It tells you what Lens does, what makes this codebase different from a standard Next.js app, and where to find everything.
>
> **Not for:** end users, external contributors, human onboarding. This is written for an AI coding agent picking up the codebase cold.

---

## What Lens Is

**Lens** — an AI-native operating system for independent photographers. The central hub for the photography business.

In a typical session, a photographer opens Lens to: see today's bookings, send the next round of automated client comms, follow up on unpaid invoices, deliver finished galleries, and respond to new leads. The system runs the cradle-to-grave workflow from "stranger inquires" through "session paid for and delivered" with AI agents handling the operational glue.

**Current state:** Phase 1 — Foundation. LENS-001 (auth + photographer/client/lead schema) shipped. Sprint 2 (ERP completion + AI infrastructure) in progress. The Lead → Booking → Comms loop is the Phase 1 deliverable; Sprint 3 ships the first agent.

---

## What Makes This Codebase Different from a Standard Next.js App

Three things that will trip you up if you treat this like a generic CRUD app:

### 1. Lens is an agent-on-ERP system, not "AI sprinkled on a CRUD app"
Lens has three layers — Integration / Agent / ERP — with strict rules about how they interact. The ERP layer is the source of truth. The agent layer is the only path to writes that should go through an agent. The integration layer holds derived state, never canonical state.

**Read first:** `docs/architecture/AGENT_ARCHITECTURE.md`. Everything else builds on it.

### 2. All LLM calls go through `src/lib/ai/gateway.ts`
There is one file allowed to import the LLM SDK. Every agent calls the gateway. The gateway handles retries, prompt versioning, eval mode, structured logging (token counts only — ZDR posture), and tool routing.

**Anti-pattern:** `import Anthropic from '@anthropic-ai/sdk'` outside `gateway.ts` will get the PR rejected.

### 3. Migrations are SQL files; CC never executes them
You generate `migrations/migration_[NNN]_*.sql`. A human applies it via Supabase dashboard. Never `psql`, never `supabase db push`, never `db migrate` from inside CC.

---

## The 5 Most Important Files

In this order:

| # | File | Why |
|---|------|-----|
| 1 | `CLAUDE.md` | Current build state — last migration, last ticket, active branch. Always read first. |
| 2 | `docs/architecture/AGENT_ARCHITECTURE.md` | The system's spine. Three layers, six agents, gateway pattern, coordination rules. |
| 3 | `docs/architecture/ERP_DATA_MODEL.md` | Canonical entities and relationships. Schema decisions reference this. |
| 4 | `docs/architecture/ANTI_PATTERNS.md` | The mistakes this codebase is prone to. Reading this prevents most rework. |
| 5 | The current Feature Spec in `docs/features/` | What you're building this session. |

---

## How a Sprint Works

Every sprint follows this pipeline. You'll typically be handed a Feature Spec.

```
1. Read CLAUDE.md             → current build state (migration #, ticket #, branch)
2. Read the Feature Spec      → what's being built
3. Read docs/architecture/AGENT_ARCHITECTURE    → if touching agents
4. Read docs/architecture/ERP_DATA_MODEL        → if touching schema
5. Read docs/architecture/INTEGRATION_REGISTRY  → if touching external systems
6. Read docs/architecture/ANTI_PATTERNS         → before writing code
7. Read relevant persona      → ARCH for design, DEV for implementation
8. Execute the CC Prompt      → work through PRs in dependency order
9. Generate migrations        → SQL files only, never run them
10. Quality gate              → npx tsc --noEmit + npm run lint pass
11. Commit + PR               → ticket ID in commit message
```

You will not apply migrations, merge PRs, or deploy. Those are manual human steps.

---

## Project Map

```
lens/
├── CLAUDE.md                    ← START HERE
├── ONBOARDING.md                ← (this file)
├── docs/
│   ├── architecture/
│   │   ├── AGENT_ARCHITECTURE.md    ← keystone — agents, gateway, coordination
│   │   ├── ERP_DATA_MODEL.md        ← canonical entities + relationships
│   │   ├── INTEGRATION_REGISTRY.md  ← Gmail, Calendar, Stripe, QuickBooks, Storage
│   │   ├── ANTI_PATTERNS.md         ← never-do-this list
│   │   ├── DECISIONS_LOG.md         ← why key decisions were made
│   │   ├── DOMAIN_GLOSSARY.md       ← precise terminology
│   │   ├── DESIGN_SYSTEM.md         ← tokens, components
│   │   ├── SECURITY.md              ← Tier 1/2/3/4 data classification
│   │   └── TESTING_STRATEGY.md      ← test pyramid, conventions
│   └── personas/
│       ├── PERSONA_PM.md            ← product thinking, scope rules
│       ├── PERSONA_ARCH.md          ← schema, API, layering standards
│       ├── PERSONA_DEV.md           ← file structure, TS, naming
│       ├── PERSONA_QA.md            ← AC writing, eval design
│       ├── PERSONA_UX.md            ← state coverage, interaction patterns
│       └── persona-end-user.md      ← Morgan (design partner #1)
│
├── phases/
│   └── Phase[N]_Implementation_Plan.md
│
├── docs/features/
│   └── Phase[N]/Sprint[N]_[Name].md
│
├── prompts/
│   └── [WeekN]_CC_Prompt.md
│
├── supabase/migrations/
│   └── migration_[NNN]_[name].sql
│
├── src/
│   ├── app/                     ← Next.js routes
│   ├── components/              ← React components
│   ├── lib/
│   │   ├── supabase/            ← client.ts | server.ts | admin.ts
│   │   ├── ai/
│   │   │   ├── gateway.ts       ← THE gateway
│   │   │   ├── tools/registry.ts
│   │   │   ├── agents/[a]/      ← per-agent prompts, tools, run.ts
│   │   │   └── evals/[a]/
│   │   ├── erp/[entity]/        ← business logic
│   │   ├── integrations/[svc]/  ← Gmail, Stripe, etc.
│   │   ├── events/              ← domain event bus
│   │   └── crypto/tokens.ts     ← OAuth token encryption
│   ├── types/                   ← erp.ts, agent.ts, events.ts, api.ts
│   └── middleware.ts
│
└── tests/
    ├── e2e/
    ├── unit/
    └── load/
```

---

## Key Conventions at a Glance

| Convention | Rule |
|-----------|------|
| Migrations | Generate SQL files only — never execute |
| TypeScript | `npx tsc --noEmit` passes before every commit, zero errors |
| Auth | Photographer ID from `supabase.auth.getUser()` — never request params |
| DB clients | `client.ts` (browser), `server.ts` (user routes), `admin.ts` (rare) |
| LLM calls | All through `src/lib/ai/gateway.ts` — never direct SDK |
| Integration calls | All through `src/lib/integrations/[svc]/` — never direct SDK |
| Cross-agent calls | Forbidden directly — use ERP-mediated or events |
| Model strings | Resolved via `getActiveVersion()` — never hardcoded |
| Prompts | Typed constants in `prompts/system.v[N].ts` — never inline strings |
| RLS | Every table photographer-scoped, in the same migration |
| Selectors | `data-testid` only in tests — never CSS classes |
| Data fetch (client) | SWR — never `useEffect` + `fetch` |
| Soft delete | `deleted_at timestamptz` — never hard delete user data |
| Logging | Token counts only — never prompt content, never Tier 1/2 data |
| Scope | Implement exactly the spec — log extras as `// TODO: LENS-NNN` |
| Branching | First PR off `main`; subsequent PRs off the previous branch |

---

## What to Do When Stuck

**Ambiguous spec** → State the ambiguity and the two most likely interpretations. Ask. Don't guess on foundational decisions.

**Conflicting patterns in existing code** → Follow the more recent pattern. Check `docs/architecture/DECISIONS_LOG.md` for context. Flag the inconsistency in your PR description.

**TypeScript error you can't resolve** → Show the error, the relevant code, what you've tried. Don't `as any` to silence it.

**Missing dependency** → Stop. Name what's missing (table, lib function, env var). Don't reimplement what should already exist.

**Performance concern** → Flag as `// TODO: LENS-NNN — perf` and continue. Don't over-optimize unless the spec explicitly requires.

**Security uncertainty** → Read `docs/architecture/SECURITY.md`. If still uncertain, stop and ask. Never guess on security.

**Agent boundary unclear** → Read `docs/architecture/AGENT_ARCHITECTURE.md` § Agent Boundary Decisions in `docs/personas/PERSONA_ARCH.md`. If the feature spans two agents, declare which owns the write.

**Cross-agent coordination needed** → Use ERP-mediated by default. Domain events second. Direct calls — never.

---

## Domain Context

Lens operates in the photography business — specifically, solo photographers and small studios who run sessions, deliver galleries, and chase payments. Two terms have non-obvious meaning in this domain:

- **Senior Session** — a portrait session for a high-school senior. The student is the subject; the parent typically pays. This is why `client.parent_email`, `client.parent_name`, `client.parent_phone` exist as separate fields. Morgan's #1 pain point is that payment reminders go to the teen subject, who ignores them, instead of to the parent who has the credit card.

- **Locations Gallery** — a photographer's catalog of reusable shoot locations. Locations are organized by category (nature/rustic, downtown, studio, beach). A booking selects multiple locations, but they must all share the same category. This constraint is enforced at the data layer because clients otherwise pick incompatible mixes.

For full domain terminology: `docs/architecture/DOMAIN_GLOSSARY.md`.
For data handling rules specific to photography: `docs/architecture/SECURITY.md` § Data Classification.

---

## Completed Phases (Build History)

| Phase | Theme | Key Deliverables |
|-------|-------|------------------|
| Phase 0 | Setup | Repo, Supabase project, Vercel deploy, foundational docs |
| Phase 1 (current) | Foundation: Lead → Booking → Comms loop | In progress |
| Phase 2 (next) | Money: BillingAgent, deposit + final payment, Stripe | Future |
| Phase 3 | Workflow completion: Expense + Delivery agents | Future |
| Phase 4 | Multi-agent orchestration | Future |

Full phase details when they exist: `phases/Phase[N]_Implementation_Plan.md`.

---

*Lens | Onboarding | Last updated: 2026-05-06*
