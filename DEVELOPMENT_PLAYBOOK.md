# DEVELOPMENT_PLAYBOOK.md
## Lens — Master Operating Doc

> **Purpose**: How Lens is built, end to end. Methodology, file workflow, and ticket conventions. This is what you `/init` against when seeding Claude Code with full project context.

---

## 1. Project Metadata

| Field | Value |
|-------|-------|
| Project | Lens |
| Ticket prefix | LENS |
| Owner | Nate Vermylen |
| Repo | [GITHUB_REPO_URL] |
| Deployment | Vercel (auto on `main`) |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI provider | Anthropic Claude (ZDR configured) |
| Stack | Next.js 16 App Router · TypeScript strict · Tailwind 4 · SWR · Zod · Playwright + Vitest + k6 |

---

## 2. Methodology in One Picture

```
IDEATE (the why)
    ↓
PHASE PLAN (3–8 features, sprint table, dep map, risks)
    ↓
FEATURE SPEC per Sprint (problem → solution → PRs with ACs)
    ↓
CC PROMPT per Feature (paste into CC)
    ↓
BUILD (paste prompt, CC executes, owner reviews each PR)
    ↓
UAT (validate against Acceptance Criteria)
    ↓
NEXT PHASE
```

**The Feature Spec is the contract** between product thinking and engineering execution. **The CC Prompt is the trigger** that hands that contract to Claude Code. **The Phase Plan is the roadmap** that sequences features.

---

## 3. The File System

### Read-by-CC files (full project context)

| File | Read when |
|------|-----------|
| `CLAUDE.md` | Every session — current build state |
| `ONBOARDING.md` | First session in a new context window |
| `docs/architecture/AGENT_ARCHITECTURE.md` | Anything touching agents, gateway, prompts, tools |
| `docs/architecture/ERP_DATA_MODEL.md` | Anything touching schema or entities |
| `docs/architecture/INTEGRATION_REGISTRY.md` | Anything touching Gmail / Calendar / Stripe / QB / Storage |
| `docs/architecture/ANTI_PATTERNS.md` | Before any PR |
| `docs/architecture/DECISIONS_LOG.md` | When a pattern looks wrong — was it deliberate? |
| `docs/architecture/DOMAIN_GLOSSARY.md` | Naming anything domain-specific |
| `docs/architecture/SECURITY.md` | Auth, encryption, OAuth, AI prompts, integrations |
| `docs/architecture/TESTING_STRATEGY.md` | Writing tests |
| `docs/architecture/DESIGN_SYSTEM.md` | Building UI |

### Persona files (invoked situationally)

| Persona | Invoke for |
|---------|-----------|
| `docs/personas/PERSONA_PM.md` | Scope decisions, prioritization |
| `docs/personas/PERSONA_ARCH.md` | Schema, API, layering decisions |
| `docs/personas/PERSONA_DEV.md` | Implementation patterns, naming |
| `docs/personas/PERSONA_QA.md` | AC writing, eval design |
| `docs/personas/PERSONA_UX.md` | UI flow, state coverage |
| `docs/personas/persona-end-user.md` | Understanding Morgan (design partner #1) |

### Process templates (per-instance)

| Template | Used as |
|----------|---------|
| `PHASE_TEMPLATE.md` | Copy → `phases/Phase[N]_Implementation_Plan.md` |
| `FEATURE_SPEC_TEMPLATE.md` | Copy → `docs/features/Phase[N]/Sprint[N]_[Name].md` |
| `CC_PROMPT_TEMPLATE.md` | Copy → `prompts/[WeekN]_CC_Prompt.md` |

---

## 4. Repo Structure

```
lens/
├── CLAUDE.md                       ← live build state
├── ONBOARDING.md                   ← fast orientation
├── DEVELOPMENT_PLAYBOOK.md         ← (this file)
├── docs/
│   ├── architecture/
│   │   ├── AGENT_ARCHITECTURE.md   ← keystone
│   │   ├── ERP_DATA_MODEL.md
│   │   ├── INTEGRATION_REGISTRY.md
│   │   ├── ANTI_PATTERNS.md
│   │   ├── DECISIONS_LOG.md
│   │   ├── DOMAIN_GLOSSARY.md
│   │   ├── DESIGN_SYSTEM.md
│   │   ├── SECURITY.md
│   │   └── TESTING_STRATEGY.md
│   └── personas/
│       ├── PERSONA_PM.md
│       ├── PERSONA_ARCH.md
│       ├── PERSONA_DEV.md
│       ├── PERSONA_QA.md
│       ├── PERSONA_UX.md
│       └── persona-end-user.md
│
├── PHASE_TEMPLATE.md
├── FEATURE_SPEC_TEMPLATE.md
├── CC_PROMPT_TEMPLATE.md
│
├── phases/
│   └── Phase[N]_Implementation_Plan.md
├── docs/features/
│   └── Phase[N]/Sprint[N]_[Name].md
├── prompts/
│   └── [WeekN]_CC_Prompt.md
├── supabase/migrations/
│   └── migration_[NNN]_[name].sql
│
├── src/                            ← (see docs/personas/PERSONA_DEV.md for full structure)
└── tests/
```

---

## 5. Ticket Conventions

| Field | Convention |
|-------|------------|
| Format | `LENS-[NNN]` |
| Title | Imperative present tense ("Add booking creation API") |
| First PR of feature | Branch from `main` |
| Subsequent PRs | Branch from previous PR's branch |
| Branch name | `LENS-[NNN]-[short-slug]` |
| Commit message | `LENS-[NNN]: [PR title]` |
| Merge | Squash to `main`; auto-deploys via Vercel |

Tickets are created in Linear before CC executes the corresponding CC Prompt.

---

## 6. Feature Workflow

```
1. Phase plan exists in phases/Phase[N]_Implementation_Plan.md
2. Pick the next feature from the phase's table
3. Copy FEATURE_SPEC_TEMPLATE.md → docs/features/Phase[N]/Sprint[N]_[Name].md
4. Fill the spec: Problem, Solution, PR breakdown, ACs
5. Create Linear tickets matching the PR breakdown
6. Copy CC_PROMPT_TEMPLATE.md → prompts/[WeekN]_CC_Prompt.md
7. Fill the prompt — reference the spec by path
8. Paste into Claude Code
9. CC implements PRs in order, generating migrations as SQL files
10. Owner applies migrations via Supabase dashboard between PRs as needed
11. Owner reviews each PR, merges to main; Vercel deploys
12. Update CLAUDE.md current build state
13. UAT against ACs
14. Move to next feature
```

---

## 7. Daily / Sprint Cadence

### Sprint start checklist
- [ ] Update `CLAUDE.md` Current Build State (last ticket, last migration).
- [ ] Confirm the sprint's Feature Spec is complete and reviewed.
- [ ] Confirm tickets are created in Linear.
- [ ] Confirm CC Prompt is filled and references the spec.

### Per-PR checklist
- [ ] Branch named correctly (`LENS-[NNN]-[slug]`).
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] All scoped ACs pass.
- [ ] Migrations are SQL files only.
- [ ] No `console.log` in production paths.

### Sprint end checklist
- [ ] All sprint tickets in Done.
- [ ] All migrations applied.
- [ ] Test PR shipped with the spec's TC- coverage.
- [ ] `CLAUDE.md` updated.
- [ ] Demo run cleanly.

---

## 8. Quality Gates (Non-Negotiable)

```bash
npx tsc --noEmit    # zero errors
npm run lint        # zero errors
```

Plus the agent-on-ERP gates:

- All LLM calls flow through `src/lib/ai/gateway.ts` (no SDK imports elsewhere).
- All integration calls flow through `src/lib/integrations/[svc]/` (no SDK imports elsewhere).
- All cross-agent coordination via ERP state or domain events (no direct calls).
- All new tools registered in `src/lib/ai/tools/registry.ts` with Zod schemas.
- All new prompts versioned in `src/lib/ai/agents/[a]/prompts/` (no hardcoded strings).
- All token / Tier 1/2 data excluded from logs.

---

## 9. When to Update Each File

| File | Update when |
|------|-------------|
| `CLAUDE.md` | Sprint start; after every applied migration |
| `docs/architecture/AGENT_ARCHITECTURE.md` | New agent, agent boundary change, gateway extension |
| `docs/architecture/ERP_DATA_MODEL.md` | New entity or relationship change |
| `docs/architecture/INTEGRATION_REGISTRY.md` | New integration or scope/sync change |
| `docs/architecture/ANTI_PATTERNS.md` | Bug traced to a pattern; recurring PR rejection |
| `docs/architecture/DECISIONS_LOG.md` | Any non-obvious decision between viable options |
| `docs/architecture/DOMAIN_GLOSSARY.md` | Spec introduces a new term; naming inconsistency surfaces |
| `docs/architecture/DESIGN_SYSTEM.md` | New component built; tokens established |
| `docs/architecture/SECURITY.md` | New integration; auth change; data exposure consideration |
| `docs/architecture/TESTING_STRATEGY.md` | New test pattern; load test budget set |

---

## 10. The Bar

Lens is built to the standard implied by these documents — not below it. Specifically:

- **Every architectural decision is logged.** Future-you and future-CC will thank past-you.
- **Every prompt change ships with evals.** No exceptions.
- **Every feature has a Feature Spec.** No "vibe-coded" features.
- **Every PR passes type-check and lint.** Every one.
- **Every agent has a defined boundary.** When boundaries blur, surface and decide.
- **The ERP is the source of truth.** Always.

When in doubt, the answer is in one of these files. If it isn't, surface the gap and add it.

---

*Lens | Development Playbook | Last updated: 2026-05-06*
