# Claude Code Prompt — [FEATURE_NAME]
## Lens | LENS-[NNN-NNN] | Phase [N], Sprint [N]

> **What this is**: The execution instruction for Claude Code for [FEATURE_NAME]. Paste into CC after `/init`. References the Feature Spec at `docs/features/Phase[N]/Sprint[N]_[FeatureName].md`.
>
> **Use this template by**: copying it, replacing all `[BRACKET]` placeholders, and either pasting directly into CC (standard mode) or staging in `[phaseN]/cc-prompts/` for ORCHESTRATOR-driven feature chaining.

---

## Mission

Implement the [FEATURE_NAME] feature as specified in `docs/features/Phase[N]/Sprint[N]_[FeatureName].md`. Work through PRs in the order declared in the spec. Stop at any decision point not covered by the spec — do not guess on foundational decisions.

---

## Pre-flight (Read in Order, Do Not Skip)

1. `CLAUDE.md` — current build state. Confirm next ticket # and migration #.
2. `docs/architecture/ANTI_PATTERNS.md` — refresh the never-do-this list.
3. `docs/architecture/AGENT_ARCHITECTURE.md` — if this feature touches agents.
4. `docs/architecture/ERP_DATA_MODEL.md` — if this feature touches schema.
5. `docs/architecture/INTEGRATION_REGISTRY.md` — if this feature touches Gmail / Calendar / Stripe / QuickBooks / Storage.
6. `docs/personas/PERSONA_ARCH.md` — for any architectural decision.
7. `docs/personas/PERSONA_DEV.md` — for file structure and naming.
8. The Feature Spec itself — the contract you are implementing.

---

## Execution Order

| PR | Ticket | Title | Depends On |
|----|--------|-------|------------|
| 1 | LENS-[NNN] | [PR1_TITLE] | None (foundation) |
| 2 | LENS-[NNN] | [PR2_TITLE] | LENS-[NNN] |
| 3 | LENS-[NNN] | [PR3_TITLE] | LENS-[NNN] |
| 4 | LENS-[NNN] | [PR4_TITLE] | LENS-[NNN], LENS-[NNN] |

For each PR:
1. Branch from previous PR's branch (or `main` for PR 1).
2. Implement exactly the scope in the Feature Spec — no extras.
3. Generate any migrations as SQL files; do not execute.
4. Run `npx tsc --noEmit` and `npm run lint`. Both must pass.
5. Commit with message `LENS-[NNN]: [PR title]`.
6. Push and open PR.

---

## Hard Constraints

These are violations that cause automatic PR rejection. Surface and stop if you find yourself about to violate any:

- ❌ Importing `@anthropic-ai/sdk` outside `src/lib/ai/gateway.ts`.
- ❌ Importing an integration SDK outside `src/lib/integrations/[svc]/`.
- ❌ Hardcoded prompt strings — load via `getActiveVersion()`.
- ❌ Hardcoded model strings — model selected by gateway per agent.
- ❌ Direct cross-agent calls — use ERP-mediated or events.
- ❌ `useEffect` for data fetching — SWR only.
- ❌ Direct Supabase calls from React components.
- ❌ Missing RLS on a new table.
- ❌ User ID from request body or params (use `auth.getUser()`).
- ❌ `any` type without explicit `// reason: ...` comment.
- ❌ `console.log` in production code paths.
- ❌ Logging prompt content, AI response content, or Tier 1/2 data.
- ❌ Implementing scope outside the Feature Spec (log as `// TODO: LENS-NNN` instead).
- ❌ Executing migrations.

Full list with rationale: `docs/architecture/ANTI_PATTERNS.md`.

---

## Decision Points

Stop and surface — do not guess — when:
- The spec is silent on a foundational decision (PK type, API contract shape, agent ownership).
- A required pattern conflicts with existing code in the repo.
- A migration would rename or drop an existing column.
- Adding scope feels obviously useful but isn't in the spec.
- A dependency is missing (table, function, env var) that should already exist.
- A security choice is ambiguous (auth, encryption, OAuth scope).

When stopping, state the options and tradeoffs. Wait for direction.

---

## Quality Gates Before Each Commit

```bash
npx tsc --noEmit    # zero errors
npm run lint        # zero errors
```

Plus:
- [ ] Migrations are SQL files only.
- [ ] New tables have RLS + policy in the same migration.
- [ ] New tools registered in `src/lib/ai/tools/registry.ts` with Zod schemas.
- [ ] New tools added to consuming agent's `tools.ts` allowed-set.
- [ ] API routes start with auth check.
- [ ] All interactive UI elements have `data-testid`.
- [ ] No prompt content or Tier 1/2 data in any log line.
- [ ] No `console.log` in production paths.

---

## Definition of Done (Per PR)

- [ ] All Acceptance Criteria for this PR pass.
- [ ] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [ ] Test PR (the final PR in the feature) lands with the spec's full TC- coverage.
- [ ] No `// TODO` without a `LENS-NNN` ticket reference.
- [ ] If the PR added an agent capability: regression + adversarial evals exist.
- [ ] If the PR added an integration tool: registered, scoped, signature-verified.
- [ ] Update `CLAUDE.md` Current Build State with the new ticket # and (if applicable) migration #.

---

## Specific Implementation Notes for [FEATURE_NAME]

> Replace this section with feature-specific notes. Things that are obvious from the spec don't need to be repeated here — only call out:
> - Pre-existing patterns to match (point at file paths).
> - Subtle constraints from the data model or architecture.
> - Photography-domain specifics (e.g., parent_email defaulting, location category constraint).
> - Anything CC has gotten wrong before in similar features.

[FEATURE_SPECIFIC_NOTES]

---

## Chain Integration (Feature Chaining Mode Only)

> Use this block when this prompt runs as part of an ORCHESTRATOR-driven chain (see `DEVELOPMENT_PLAYBOOK.md` § Feature Chaining). Standard one-at-a-time CC sessions can ignore this block.

### Chain Position
- **This feature:** `[NN]_[FeatureName]`
- **Previous in chain:** `[NN-1]_[Previous]` (if this isn't first)
- **Next in chain:** `[NN+1]_[Next]` (if this isn't last)

### Chain Inputs
- Read previous gate report: `[phaseN]/gates/[NN-1]_GATE_PASSED.md` (if exists).
- Read previous SQL manifest: `[phaseN]/sql-manifests/[NN-1]_*.md` and confirm it was applied (CLAUDE.md migration # should reflect it).

### Chain Outputs (CC writes these — no human asks)
1. **Gate report** at `[phaseN]/gates/[NN]_[FeatureName]_GATE.md`:
   - PASSED if all PRs merged, all ACs pass, all quality gates green.
   - BLOCKED if a hard-stop decision point was hit. Include: blocker description, options surfaced, what was attempted.
2. **SQL manifest** at `[phaseN]/sql-manifests/[NN]_[FeatureName]_sql.md`:
   - Migration files in apply order.
   - Verification queries to run after applying each.
   - CLAUDE.md fields to update.
3. **Move spec** from `[phaseN]/features/queue/[NN]_*.md` → `[phaseN]/features/completed/[NN]_*.md`.

### Chain Stop Conditions
- BLOCKED gate report → stop. Do not proceed to `[NN+1]`.
- Migration generation succeeded but cannot be verified without human apply → write SQL manifest and stop with status = AWAITING_SQL_APPLY.

---

*Lens | CC Prompt for [FEATURE_NAME] | LENS-[NNN-NNN] | [DATE]*
