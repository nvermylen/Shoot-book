# HABIT_DESIGN.md — Shoot Book Build Rules (Hooked Model)

> **For Claude Code and any LLM working in this repo.** These are habit-formation
> acceptance criteria derived from a Hook Model teardown of Shoot Book. They sit
> alongside the existing Global Rules. A feature is not done because it works — it
> is done when it serves the daily-operator habit defined here. When a feature
> decision is ambiguous, resolve it in favor of these rules.

## Who we are building for

A **daily operator** — a photographer with ~100 clients/year who is in the system
**every morning** answering: who owes me, who's next (when/where), what's late.
This is a standing daily ritual, not occasional event-driven use. Optimize for that
ritual above all else.

The habit we are building: **one morning sweep in Shoot Book replaces the four-tab
ritual** (Stripe + Calendar + Gmail + spreadsheet) the operator runs today.

---

## The seven build rules

### 1. The morning sweep is one screen
The "where do I stand" answer — who owes, who's next with when/where, what's late —
must be visible in a **single glance, zero navigation.** The north-star metric for
the dashboard is **time-to-confidence**: how fast the user goes from "I need to
know" to "I'm caught up." Every dashboard change is measured against it. If a
feature adds a click to the morning read, it is wrong by default.

### 2. Onboarding's job is single-system cutover — not a feature tour
The make-or-break moment is the first two weeks. A user running Shoot Book *and*
HoneyBook double-enters and feels the pain every morning — worse than either tool
alone.
**Onboarding Definition of Done:**
- Existing clients imported on day one
- Core rails connected (Stripe, Gmail, Google Calendar, QuickBooks)
- A clear, surfaced path to cancelling the incumbent tool
- Target: full cutover within 14 days
Do not build onboarding as a tutorial carousel. Build it as a migration.

### 3. Never open empty
Endowed-progress principle. The first session must show **real, imported data** —
never a blank slate. A 100-client operator rejects an empty database instantly. No
"add your first client" empty states for the primary user; seed from import.

### 4. Dashboard accuracy is a release gate (P0)
For a daily system of record, **data accuracy is the retention mechanic.** The user
abandons the tool the first morning the sweep is wrong — a cleared payment shown as
outstanding, a shoot that doesn't appear.
- Payment status, next-shoot, and delivery-deadline data must reconcile **exactly**
  with the source (Stripe / Google Calendar) before any release.
- A stale or incorrect morning read is a **P0 bug**, never a polish item.
- Prefer showing "syncing…" over showing stale-but-confident data.

### 5. Notification discipline
Owned triggers (payment cleared, lead arrived, delivery due) are the engine — but
only if trustworthy. Every push/alert must map to a **real business event the
operator would want surfaced.** No engagement-manufacturing nudges, no "you haven't
opened the app" nags. When in doubt, send fewer. A noisy trigger sends a daily
operator back to her tabs permanently.

### 6. No gamification of money or operations
The reward for this user is **relief and confidence**, delivered through speed,
completeness, and trust. Not points, streaks, badges, or confetti. Do not celebrate
an invoice clearing with animation. For a tool trusted with a livelihood,
manufactured delight reads as manipulative and breaks trust. (Manipulation Matrix:
we are a Facilitator. Keep it that way.)

### 7. Investment must compound and load the next trigger
Every connected rail and logged record should visibly make **tomorrow's sweep more
complete.** Prioritize setup actions that generate future cues — connect Stripe →
future payments become triggers; wire Gmail → future inquiries become triggers.
Stored value (client history, wired integrations, learned agent shorthand) is the
moat and the switching cost. Protect it; never silently lose user-entered data.

---

## How to use this file during a build

Before building or reviewing any feature, check it against the rules above:

> "Review this feature against HABIT_DESIGN.md. Does it serve the morning sweep,
> protect dashboard accuracy, and avoid the two-system trap? Flag any rule it
> violates before we build."

When the three review personas (Product Manager, Dev Manager, Architect) run, the
Product Manager must explicitly evaluate against these seven rules.

---

## The one risk to keep in view

**The two-system trap, felt every morning.** If the user is still hedging between
Shoot Book and her old tool at week three, the habit never forms — no dashboard
quality compensates. Every roadmap decision should ask: *does this get her fully
off the incumbent faster?* Cutover is the habit-formation event. Treat it as the
primary success metric of the first month.
