# Project File Inventory — Photography Platform Build

## Tier 1 — Use Dan's Templates As-Is
*Already uploaded. Fill the placeholders, ship.*

| File | Purpose | Day 1? |
|------|---------|--------|
| `CLAUDE.md` | Live build state Claude Code reads at every session | ✅ |
| `ONBOARDING.md` | 5-min orientation for fresh CC sessions | ✅ |
| `ANTI_PATTERNS.md` | Never-do-this list with explanations | ✅ |
| `DECISIONS_LOG.md` | Why key decisions were made | ✅ |
| `DOMAIN_GLOSSARY.md` | Precise photography + agent terminology | ✅ |
| `SECURITY.md` | Threat model, data classification, OAuth handling | ✅ |
| `TESTING_STRATEGY.md` | Test pyramid, conventions | Phase 1 |
| `DESIGN_SYSTEM.md` | Tokens, components, Tailwind patterns | Phase 1 |
| `PHASE_TEMPLATE.md` | Copy → `Phase1_Implementation_Plan.md` | Phase 1 |
| `FEATURE_SPEC_TEMPLATE.md` | Copy → per-feature specs | Phase 1 |
| `persona-end-user.md` (Morgan) | Real end user, design partner #1 | ✅ |

---

## Tier 2 — Referenced in Dan's Template But Not In Your Upload Set
*You'll need to draft these (or get them from Dan).*

| File | Purpose | Day 1? |
|------|---------|--------|
| `PERSONA_PM.md` | Product thinking, scope rules, prioritization discipline | ✅ |
| `PERSONA_ARCH.md` | Schema, API contracts, system design standard | ✅ |
| `PERSONA_DEV.md` | Implementation patterns, file structure, TS standards | ✅ |
| `PERSONA_QA.md` | Test strategy, AC writing, edge case discipline | Phase 1 |
| `PERSONA_UX.md` | Interaction patterns, states, accessibility | Phase 1 |
| `CC_PROMPT_TEMPLATE.md` | Per-feature execution prompt template for CC | Phase 1 |
| `DEVELOPMENT_PLAYBOOK.md` | Master playbook with feature chaining workflow | ✅ |

---

## Tier 3 — What Dan Would Add for Agent-on-ERP
*These don't exist in his generic template because they solve failure modes specific to this architecture. Each one is here because a real failure pattern exists if it's missing.*

### ⭐ `AGENT_ARCHITECTURE.md` — KEYSTONE
**Purpose:** The thinking layer for everything agent-related. Gateway pattern, agent ownership boundaries, ERP-as-source-of-truth principle, prompt versioning principles, eval gates before promotion, multi-agent coordination rules.
**Solves:** Agent boundary violations, prompt drift, sync conflicts, tool sprawl, cross-agent coupling.
**Update when:** A new agent is added, an agent boundary shifts, the gateway pattern is extended.
**Boundary:** Architecture and principles only.
- Specific entities → `ERP_DATA_MODEL.md`
- Specific external systems → `INTEGRATION_REGISTRY.md`
- Specific prompt versions → `AGENT_PROMPT_REGISTRY.md`

### `ERP_DATA_MODEL.md`
**Purpose:** Canonical entities and relationships — clients, leads, bookings, contracts, invoices, payments, expenses, galleries, deliverables. The *intent* layer; migrations are the *implementation* layer.
**Solves:** Schema drift, inconsistent naming, agents writing to entities they shouldn't own, ambiguity about which entity owns which fact.
**Update when:** Adding/changing an entity, before any migration, before any agent gets new write access.
**Boundary:** Entity definitions and relationships only. RLS → `SECURITY.md`. Column types → migration SQL.

### `INTEGRATION_REGISTRY.md`
**Purpose:** Per-integration spec — Gmail, QuickBooks, Stripe, Google Calendar, cloud storage. OAuth scope, token storage, refresh strategy, sync direction (inbound / outbound / bidirectional), which agents call which integration as a tool, error handling.
**Solves:** OAuth chaos across integrations, unclear sync semantics, tool call sprawl, "who owns the Stripe webhook" debates.
**Update when:** Adding a new integration, changing sync direction, extending OAuth scope.
**Boundary:** External system contracts only. Internal data shape → `ERP_DATA_MODEL.md`.

### `AGENT_PROMPT_REGISTRY.md` *(defer until first agent ships)*
**Purpose:** Per-agent prompt versioning, eval coverage requirements, promotion gates dev → staging → prod.
**Solves:** Prompt change shipping without re-eval, regressions in production agent behavior, "which prompt version is in prod" confusion.
**Boundary:** Prompt versioning only. Eval mechanics → `EVAL_HARNESS.md`.

### `EVAL_HARNESS.md` *(defer until first agent ships)*
**Purpose:** Eval discipline — fixture data structure, eval types (regression, new-capability, adversarial), promotion gates, run cadence, failure handling.
**Solves:** Coverage gaps when prompts evolve, untested agent capabilities shipping, no shared definition of "this agent is ready."
**Boundary:** Eval mechanics only. What's evaluated per agent → `AGENT_PROMPT_REGISTRY.md`.

---

## Agent-on-ERP Additions to `ANTI_PATTERNS.md`
*Append these to Dan's existing list — they're specific to this architecture.*

- ❌ **Calling the LLM SDK directly from agent code** → must go through `lib/ai/gateway.ts`
- ❌ **Hardcoded prompt strings inside agent files** → must come from versioned registry
- ❌ **Agent writing to an integration without writing to ERP first** → ERP is source of truth, integrations are side effects
- ❌ **Cross-agent state via shared mutable globals** → explicit orchestration only
- ❌ **Shipping a prompt change without re-running per-agent eval suite**
- ❌ **Adding a new agent tool without updating `INTEGRATION_REGISTRY.md`**
- ❌ **Cross-agent reads via direct DB queries** → go through the ERP read API
- ❌ **Booking Agent reading expense data, Expense Agent reading booking data** → if it happens twice, the boundary is wrong, not the code

---

## Day 1 Build Order
*Drafting order matters — each file informs the next.*

1. **`AGENT_ARCHITECTURE.md`** — keystone. Everything else references it.
2. **`ERP_DATA_MODEL.md`** — drives schema, migrations, and agent boundaries.
3. **`PERSONA_ARCH.md`** — refines #1 + #2 into the technical standard CC enforces.
4. **`CLAUDE.md`** — fill with project specifics (stack, env vars, agent-on-ERP framing, integration list, current build state).
5. **`DOMAIN_GLOSSARY.md`** — lock photography terms + agent/ERP terms before any naming inconsistencies sneak in.
6. **`ANTI_PATTERNS.md`** — fill with agent-on-ERP additions above.
7. **`DECISIONS_LOG.md`** — log the foundational decisions you've already made (Replace vs Integrate, ERP source-of-truth, monorepo gateway pattern reuse, etc.). Don't lose these.
8. **`PERSONA_PM.md`, `PERSONA_DEV.md`** — fill with your taste; Dan's template is the skeleton.
9. **`INTEGRATION_REGISTRY.md`** — start with just Gmail (first integration target). QuickBooks, Stripe, Calendar added when needed.
10. **`SECURITY.md`** — fill, with extra attention to OAuth token storage and integration scopes.
11. **`ONBOARDING.md`** — fill last; references everything else.

---

## Phase 1 Prep Set
*Once Day 1 set is solid, before sprint 1 starts.*

- `PERSONA_QA.md`, `PERSONA_UX.md` filled
- `DESIGN_SYSTEM.md` filled
- `TESTING_STRATEGY.md` filled
- `Phase1_Implementation_Plan.md` (from `PHASE_TEMPLATE.md`)
- `Sprint1_Feature_Spec.md` (from `FEATURE_SPEC_TEMPLATE.md`)
- `Sprint1_CC_Prompt.md` (from `CC_PROMPT_TEMPLATE.md`)

---

## Reuse vs Build From Scratch
*From your existing monorepo (marketing agent project):*

| Asset | Reuse? | Notes |
|-------|--------|-------|
| Gateway pattern (`lib/ai/gateway.ts`) | ✅ Yes | Should drop in mostly unchanged |
| Versioned prompt loader | ✅ Yes | Photography prompts replace marketing prompts |
| Per-agent eval harness | ✅ Yes | Fixtures rebuilt for photography domain |
| Marketing agent itself | ❌ No | Different domain, different tools |
| Existing CLAUDE.md / spec docs | 🟡 Reference | Read for tone/discipline; rewrite for this project |

---

*Photography Platform | File Inventory | Updated for agent-on-ERP architecture*
