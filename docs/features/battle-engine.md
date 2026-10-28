# Feature: Battle Engine & Rules

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-01 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-NFR-04 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-06 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-CON-01 | [Vision](../PRD.md#1. Overview) | constrained by |
| VIS-CON-08 | [Vision](../PRD.md#7. Non-Functional Requirements) | constrained by |
| ENG-FR-01 – ENG-FR-11 | This feature | owns |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Battle Engine & Rules
**ID Prefix:** ENG
**Summary:** A framework-free TypeScript rules engine that owns the elemental field, energy, decks, damage, defense, statuses, enemy planning and deterministic randomness. Both game modes and all tests consume this engine; no React component contains a gameplay rule.
**Dependencies:** None
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| ENG-US-01 | Solo player | have the field's bonus and counter behave exactly as the rules panel says | I can plan a turn and trust the result | Must |
| ENG-US-02 | Shared-device duo | have both players resolve turns through the same rules | neither side gets an inconsistent advantage | Must |
| ENG-US-03 | Maintainer | reproduce any reported battle from its seed and actions | I can debug a bug without guessing | Must |

---

## 3. Functional Requirements

```forge-requirement
{"id":"ENG-FR-01","kind":"requirement","text":"Start each turn with exactly 3 energy, resetting rather than accumulating unspent energy; draw to a hand of 5, discard the entire hand at end of turn, reshuffle the discard pile when the draw pile empties, and burn cards drawn beyond 5. Card-granted energy may exceed 3 for the current turn."}
```

```forge-requirement
{"id":"ENG-FR-02","kind":"requirement","text":"Resolve each attack as base damage, then Focus and Weaken modifiers, then field modifiers, then persistent defense. A matching attack gains +2 and pierces; a countered attack deals ceiling half with a minimum of 1 before defense and cannot pierce; a matching Ward gains +2 defense; defense is capped at 8."}
```

```forge-requirement
{"id":"ENG-FR-03","kind":"requirement","text":"Implement Focus, Weaken and Regen as capped stacks: each attack consumes one Focus and one Weaken stack for +2 or -2 damage, Regen heals 2 at the owner's turn start and consumes one stack, caps are 3/3/2, and all statuses clear when the battle ends."}
```

```forge-requirement
{"id":"ENG-FR-04","kind":"requirement","text":"Begin each battle on a Neutral field with 0 defense, 40 player health and the enemy's configured health; apply each card atomically, reject unaffordable or out-of-turn actions, and end the battle immediately when either side reaches 0 health."}
```

```forge-requirement
{"id":"ENG-FR-05","kind":"requirement","text":"Drive shuffles, reward offers and AI tie-breaks from an explicit 32-bit seed and serializable PRNG state, so identical seeds and action sequences reproduce identical battles, and never call Math.random inside the engine."}
```

```forge-requirement
{"id":"ENG-FR-06","kind":"requirement","text":"Plan enemy turns deterministically: prefer a lethal sequence, then a Ward at 12 or less enemy health, then a field-enabling Shift, then field-matching and highest damage-per-energy attacks; break ties by card ID, never plan an unaffordable card, and let the boss prefer the element that counters the player's starter element."}
```

```forge-requirement
{"id":"ENG-FR-07","kind":"requirement","text":"Expose the enemy's full next-turn plan as an ordered card list with recomputed damage, defense, status and field effects; when the field or defense changes during the player turn, recompute the preview without changing the chosen cards."}
```

```forge-requirement
{"id":"ENG-FR-08","kind":"requirement","text":"Serialize and restore a complete battle snapshot covering decks, hands, discard, energy, health, defense, field, statuses, turn, phase, seed and PRNG state, such that a round-trip resumes to an identical next state."}
```

```forge-requirement
{"id":"ENG-FR-09","kind":"requirement","text":"Guarantee legality and termination under self-play: seeded AI-versus-AI battles end in victory or defeat within 100 turns and never accept an unaffordable card, a negative resource, an out-of-turn action or an action after battle end."}
```

```forge-requirement
{"id":"ENG-FR-10","kind":"requirement","text":"Scaffold a Vite 8 and React 19 TypeScript workspace with strict typechecking, Vitest with jsdom, a Playwright configuration, a base-path-aware static build, a same-origin CSP meta tag injected into the production HTML only, and documented npm scripts, using src/main.tsx and src/App.tsx as the composition root."}
```

```forge-requirement
{"id":"ENG-FR-11","kind":"requirement","text":"Model both battle sides symmetrically with independent health, defense, deck, hand, discard, energy, statuses and turn ownership; expose play-card and end-turn actions for either side, and keep AI planning in a separate module used only by the solo mode."}
```

---

## 4. UI / Interaction Design

This feature has no UI. It exposes pure functions and immutable data. The UI consumes `BattleState`, `EnemyPlan` and snapshots as defined below.

### 4.1 Turn sequence

1. **Turn start:** set energy to 3, tick the active side's Regen, draw to 5 (burning overdraw), then permit actions.
2. **Action phase:** play any affordable cards in any order. Energy is spent immediately; effects resolve atomically.
3. **Turn end:** discard the remaining hand and pass control. In solo the opposing side executes its telegraphed plan; in duel the next human turn begins after the privacy handoff.
4. **Enemy housekeeping (solo only):** after executing, the enemy discards, draws its next hand and plans the next turn, which is what the player sees during their turn.

The enemy draw-and-plan timing is deliberate: it makes the telegraph exact. Player turns still draw at turn start.

### 4.2 Damage pipeline

```text
raw = base
    + 2 if the attacker has at least 1 Focus stack (consume 1)
    - 2 if the attacker has at least 1 Weaken stack (consume 1)
raw = max(0, raw)

if attack.element == field:
    raw = raw + 2
    piercing = true
else if field beats attack.element:
    raw = max(1, ceil(raw / 2))
    piercing = false
else:
    piercing = card.piercing

if not piercing:
    raw = max(0, raw - defense)

damageDealt = raw
```

A countered attack always overrides a card's piercing keyword. Defense reduction happens after the countered floor, so persistent armor can still reduce a countered hit to 0. Focus and Weaken are consumed whenever an attack card is played, even if the final damage is 0.

### 4.3 Field matchup table

| Active field | Empowered attacks/Wards | Countered attacks |
|--------------|-------------------------|-------------------|
| Ember | Ember | Frost |
| Frost | Frost | Gale |
| Gale | Gale | Stone |
| Stone | Stone | Ember |
| Neutral | none | none |

Shift cards set the field to exactly one element and do not deal damage. The field never rotates automatically.

### 4.4 Status rules

| Status | Effect | Consumption | Cap |
|--------|--------|-------------|-----|
| Focus | +2 damage to the next attack card | One stack per attack card played | 3 |
| Weaken | -2 damage to the next attack card, floored at 0 | One stack per attack card played | 3 |
| Regen | Heal 2 at the owner's turn start | One stack per turn start | 2 |

If Focus and Weaken are both present, both apply and both consume a stack (net 0). Statuses never survive a battle or a duel round.

### 4.5 Enemy planning

The planner is a pure function from `BattleState` and `EnemyDefinition` to `EnemyPlan`. It simulates candidate sequences in priority order:

1. A sequence that reduces the player to 0 this turn.
2. A Ward when the enemy is at 12 health or less.
3. A Shift that enables the enemy's own element, or the boss's counter-element bias.
4. Remaining attacks ordered by field match, then damage per energy, then card ID.
5. Wards, then utility cards, then stop.

The plan never includes a card the enemy cannot afford in sequence. The preview recomputes per step so a Shift inside the plan changes the numbers of later cards. Preview values are derived from the live player defense and current field, so player actions update the displayed numbers without altering the plan.

### 4.6 Snapshot contract

`BattleSnapshot` is a plain JSON object with `schemaVersion`, all mutable battle fields, the full deck/hand/discard contents by card id, and the PRNG state. Restore rejects an unknown schema version, a card id missing from the supplied catalog, duplicate card-instance ids, or counts that exceed the deck. Functions never appear in a snapshot.

---

## 5. Implementation Tasks

| ID | Observable outcome | Owner | Depends | Outputs and tests | Check |
|----|--------------------|-------|---------|-------------------|-------|
| ENG-00 | Runnable strict workspace with test, typecheck and build scripts | frontend-engineer | None | `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/test/setup.ts`, `src/styles/base.css`, `src/vite-env.d.ts` | `npm test -- src/App.test.tsx`, `npm run build` |
| ENG-01 | Typed domain model and reproducible PRNG | rules-engineer | ENG-00 | `src/engine/types.ts`, `src/engine/rng.ts`, `src/engine/rng.test.ts` | `npm test -- src/engine/rng.test.ts` |
| ENG-02 | Damage and field resolution match the table | rules-engineer | ENG-01 | `src/engine/damage.ts`, `src/engine/damage.test.ts` | `npm test -- src/engine/damage.test.ts` |
| ENG-03 | Status stacks apply and expire correctly | rules-engineer | ENG-01 | `src/engine/status.ts`, `src/engine/status.test.ts` | `npm test -- src/engine/status.test.ts` |
| ENG-04 | Legal turn loop with decks, hand and win/lose | rules-engineer | ENG-02, ENG-03 | `src/engine/battle.ts`, `src/engine/battle.test.ts` | `npm test -- src/engine/battle.test.ts` |
| ENG-05 | Battle snapshot round-trips safely | rules-engineer | ENG-04 | `src/engine/snapshot.ts`, `src/engine/snapshot.test.ts` | `npm test -- src/engine/snapshot.test.ts` |
| ENG-06 | Deterministic enemy plan and exact intent preview | rules-engineer | ENG-04 | `src/engine/ai.ts`, `src/engine/intent.ts`, `src/engine/ai.test.ts`, `src/engine/intent.test.ts` | `npm test -- src/engine/ai.test.ts src/engine/intent.test.ts` |
| ENG-07 | Seeded self-play terminates and stays legal | rules-engineer | ENG-06 | `src/engine/self-play.test.ts` | `npm test -- src/engine/self-play.test.ts` |

### Phase 1: Workspace Foundation

```forge-task
{
  "id": "ENG-00",
  "title": "Scaffold the Vite React TypeScript workspace",
  "description": "Create the runnable workspace: Vite 8 with the React plugin, React 19, strict TypeScript 7, Vitest with jsdom, a Playwright config stub, a base-path-aware build, a Vite plugin that injects a same-origin CSP meta tag into the built HTML only, and npm scripts for dev, build, typecheck, unit tests, E2E, static serving and budget checks. Dev mode must stay CSP-free so React Fast Refresh keeps working. Mount a placeholder App through src/main.tsx. Do not implement game screens or engine rules.",
  "ownerAgent": "frontend-engineer",
  "dependencies": [],
  "expectedOutputs": ["package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "index.html", "src/main.tsx", "src/App.tsx", "src/App.test.tsx", "src/test/setup.ts", "src/styles/base.css", "src/vite-env.d.ts"],
  "validationCommands": ["npm test -- src/App.test.tsx", "npm run typecheck", "npm run build"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The workspace produces a static dist build that honors a non-root base path", "The built HTML carries a same-origin CSP meta tag while the dev server HTML does not", "The composition root renders the app shell and its scripts are documented"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-10", "docs/features/game-shell.md#SHL-FR-01", "docs/PRD.md#VIS-SEC-01"],
    "acceptanceCriteria": ["npm test, npm run typecheck and npm run build all succeed from the repository root", "The Vitest environment is jsdom and the App test renders the composition root", "Vite reads VITE_BASE and the built index references assets under that base", "dist/index.html contains the same-origin Content-Security-Policy meta tag and the HTML served by npm run dev does not, so Fast Refresh is unaffected", "package.json exposes dev, build, preview, typecheck, test, test:e2e, serve:dist, check:build and check:budget scripts"],
    "constraints": ["Use the verified versions from PRD section 6.1", "Inject the CSP through a build-only Vite plugin or a post-build step; do not hard-code it into the shared index.html template", "Do not add a state-management, routing or CSS framework dependency", "Do not implement gameplay or screens beyond the shell placeholder"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01", "docs/PRD.md#VIS-CON-02"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/PRD.md#8. Security and Privacy"]
  }
}
```

### Phase 2: Core Rules

```forge-task
{
  "id": "ENG-01",
  "title": "Define engine types and the seeded PRNG",
  "description": "Create the framework-free engine type model and a serializable 32-bit PRNG with seeded shuffle. Export Element, CardType, StatusKind, CardDefinition, EnemyDefinition, BattleState, BattleSnapshot, EnemyPlan and result types. Include the PRNG state in every random API call. Do not implement damage, turn flow or UI.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-00"],
  "expectedOutputs": ["src/engine/types.ts", "src/engine/rng.ts", "src/engine/rng.test.ts"],
  "validationCommands": ["npm test -- src/engine/rng.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The PRNG exposes nextUint32, shuffle and serialize/restore with identical sequences after restore"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-05"],
    "acceptanceCriteria": ["The same seed produces the same 100-value sequence and the same shuffle on repeat runs", "Restoring serialized PRNG state continues the exact sequence", "A shuffle is a permutation with no duplicated or dropped entries", "A repository grep finds no Math.random call under src/engine"],
    "constraints": ["No runtime dependency may be added for randomness", "All engine files must compile under strict TypeScript with no any"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01", "docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "ENG-02",
  "title": "Resolve field matchup, damage, defense and piercing",
  "description": "Implement the pure damage and field resolution functions from the pipeline and matchup table. Cover matching attacks (+2 and pierce), countered attacks (ceiling half, minimum 1 before defense, piercing overridden), Neutral fields, defense capped at 8, matching Ward bonus and persistent defense passed as an input. Exclude turn flow, drawing and enemy AI.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-01"],
  "expectedOutputs": ["src/engine/damage.ts", "src/engine/damage.test.ts"],
  "validationCommands": ["npm test -- src/engine/damage.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The full 5-by-5 field and attack-element matrix is implemented in one testable function", "Defense gain clamps at 8 and piercing skips defense"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-02"],
    "acceptanceCriteria": ["Table-driven tests cover every field and attack element combination, including Neutral", "Odd countered damage rounds up and never drops below 1 before defense", "A countered piercing attack does not bypass defense", "Defense clamps at 8 and a 9-point reduction request yields 8", "A matching Ward adds 2 defense and the total still clamps at 8"],
    "constraints": ["Do not read React, DOM or storage from the engine", "Do not hard-code card ids in damage logic"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "ENG-03",
  "title": "Apply Focus, Weaken and Regen stacks",
  "description": "Implement status application, per-attack consumption, turn-start Regen ticks and battle-end clearing with the caps in the status table. Expose helpers that the battle reducer and intent preview can call. Do not implement visual status display or card definitions.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-01"],
  "expectedOutputs": ["src/engine/status.ts", "src/engine/status.test.ts"],
  "validationCommands": ["npm test -- src/engine/status.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Focus and Weaken each consume one stack per attack while both can apply simultaneously", "Regen heals 2 and consumes one stack at the owner's turn start"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-03"],
    "acceptanceCriteria": ["Applying more than the cap keeps Focus and Weaken at 3 and Regen at 2", "An attack consumes one stack of each present status and returns the correct net modifier", "Both statuses present nets to zero damage change and consumes one of each", "Regen heals without exceeding maximum health and stops at zero stacks", "Clearing statuses leaves all counters at zero"],
    "constraints": ["Status effects must not mutate the input state object", "No UI or persistence concerns in this module"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

### Phase 3: Battle Loop

```forge-task
{
  "id": "ENG-04",
  "title": "Implement the legal battle state machine",
  "description": "Build battle setup and the symmetric two-side turn loop: seeded deck shuffle, opening hand of 5, energy reset to 3, draw to 5 with overdraw burn, discard at end of turn, discard reshuffle, card play validation, energy gain beyond 3, field shifts, ward application, victory and defeat. Every action takes an explicit side so solo and duel share the engine. Reject actions after battle end and out of turn. Do not implement AI planning or snapshot serialization.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-02", "ENG-03"],
  "expectedOutputs": ["src/engine/battle.ts", "src/engine/battle.test.ts"],
  "validationCommands": ["npm test -- src/engine/battle.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A turn starts with 3 energy and a hand of 5, and ends by discarding the hand", "Card plays are atomic and validate cost, turn and battle phase"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-01", "docs/features/battle-engine.md#ENG-FR-04", "docs/features/battle-engine.md#ENG-FR-11"],
    "acceptanceCriteria": ["Setup produces a 5-card hand and 3 energy on a Neutral field with 0 defense for both sides", "Unspent energy does not carry into the next turn and card-granted energy can exceed 3 in the current turn", "Drawing past 5 burns the extra card and drawing from an empty pile reshuffles the discard", "An unaffordable card, an out-of-turn action and an action after victory are rejected without changing state", "Reaching 0 health on either side ends the battle and further actions are rejected", "Each side has independent health, defense, deck, hand, discard, energy and statuses, and play-card accepts the acting side"],
    "constraints": ["All exported mutators return a new state rather than mutating the argument", "Card behavior comes from definitions, never from card-id conditionals"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "ENG-05",
  "title": "Serialize and restore battle snapshots",
  "description": "Implement a versioned BattleSnapshot serializer and validator for save/resume and duel round resets. Include every mutable battle field and the PRNG state, validate card ids against the supplied catalog, reject duplicate instance ids and impossible counts, and return typed errors. Do not read or write localStorage.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-04"],
  "expectedOutputs": ["src/engine/snapshot.ts", "src/engine/snapshot.test.ts"],
  "validationCommands": ["npm test -- src/engine/snapshot.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Snapshot round-trip preserves the exact next legal action set", "Unknown schema versions and invalid card ids fail with typed errors"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-08"],
    "acceptanceCriteria": ["Serializing and restoring a mid-battle state then playing the same card produces identical states", "PRNG state survives the round-trip and continues the same shuffle sequence", "Unknown schemaVersion, unknown card id, duplicate instance id and hand count above 5 are rejected", "The serialized object contains no functions and survives JSON stringify and parse"],
    "constraints": ["Validation must happen before any state is returned", "The module must not access browser storage"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#8. Security and Privacy", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

### Phase 4: Opponent and Verification

```forge-task
{
  "id": "ENG-06",
  "title": "Plan enemy turns and compute the intent preview",
  "description": "Implement the deterministic enemy planner and intent preview. Apply the priority order, affordability simulation, boss counter-element bias and card-ID tie-break. Let the enemy draw and plan at the end of its turn so the player sees an exact next-turn plan. Recompute preview numbers from live field and defense without changing the plan. Do not render the plan or implement UI.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-04"],
  "expectedOutputs": ["src/engine/ai.ts", "src/engine/intent.ts", "src/engine/ai.test.ts", "src/engine/intent.test.ts"],
  "validationCommands": ["npm test -- src/engine/ai.test.ts src/engine/intent.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The planner follows the lethal, Ward, Shift, attack, utility priority and is deterministic", "The preview lists each planned card with recomputed totals"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-06", "docs/features/battle-engine.md#ENG-FR-07"],
    "acceptanceCriteria": ["A lethal plan is chosen whenever an affordable sequence kills the player", "At 12 or less health a Ward is preferred before non-lethal attacks", "A Shift that enables the enemy element is preferred over an unmatched attack", "Equal candidates resolve by card ID and repeated planning returns the same plan", "Changing the field or player defense changes preview totals but not the planned card ids", "The boss prefers the Shift for the element that counters the player's starter element", "The enemy plans after drawing at the end of its turn and never plans an unaffordable card"],
    "constraints": ["AI uses the same damage and status functions as the player", "No randomness inside the planner beyond the seeded tie-break order"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "ENG-07",
  "title": "Verify seeded self-play legality and termination",
  "description": "Add a cross-module self-play test that runs seeded AI-versus-AI battles with representative decks, asserting termination, resource bounds, action legality and replay determinism. Keep it as an integration test over the public engine API. Do not add UI, persistence or content-specific tuning.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-06"],
  "expectedOutputs": ["src/engine/self-play.test.ts"],
  "validationCommands": ["npm test -- src/engine/self-play.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Every simulated battle terminates within 100 turns", "Seeded replay of the same action log produces an identical final state"],
    "requirementRefs": ["docs/features/battle-engine.md#ENG-FR-09", "docs/features/battle-engine.md#ENG-FR-01", "docs/features/battle-engine.md#ENG-FR-06"],
    "acceptanceCriteria": ["At least 200 seeded self-play battles finish with a winner or loser and no exception", "No state has negative energy, hand size above 5, defense above 8 or health above maximum", "Replaying one recorded seed and action log twice yields byte-identical snapshots", "A battle that would exceed 100 turns fails the test rather than hanging"],
    "constraints": ["Use fixture decks inside the test; do not import the content feature", "Keep the suite under 10 seconds on the CI runner"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/battle-engine.md#4. UI / Interaction Design"]
  }
}
```

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit | PRNG, damage, defense cap, field matrix, statuses | Table-driven Vitest suites with explicit boundary values |
| Integration | Turn loop, draw/reshuffle, snapshot round-trip, AI plans | Seeded fixtures and state assertions over the public API |
| Simulation | Legality and termination | 200 seeded AI-vs-AI battles in one bounded suite |
| Type | Engine contracts | `npm run typecheck` with strict settings |

Key test scenarios:

1. Odd countered damage (5) rounds up to 3, then defense applies; a countered piercing attack does not bypass defense.
2. Defense at 7 plus a matching Ward clamps at 8; a later 9-damage hit deals 1.
3. Field Ember empowers Ember and counters Frost; Neutral applies no modifier.
4. Focus and Weaken both present net to zero and consume one stack each.
5. Drawing from an empty draw pile reshuffles the discard; drawing at five cards burns the card.
6. A save restored mid-battle and replayed with the same action produces the same snapshot.
7. The boss plans the Shift that counters the chosen starter element when that Shift is affordable.

---

## 7. Acceptance Criteria

1. All nine ENG requirements are covered by passing Vitest suites and the typecheck.
2. No gameplay rule lives outside `src/engine`; UI and content files contain no damage formulas.
3. A fixed seed reproduces shuffles, plans and battle outcomes exactly.
4. Snapshot round-trip resumes to the identical next legal action set.
5. Self-play terminates within 100 turns for 200 seeds with no illegal state.
6. The engine has no React, DOM, storage or network imports.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Is persistent defense too strong with three energy? | Keep persistent defense and the 8 cap for v1; self-play exposes stalls and tuning follows later. |
| 2 | Should countered damage have a floor after defense? | No; the minimum 1 applies before defense, so armor can reduce a countered hit to 0. |
| 3 | Should the enemy plan react to the player's hand? | No; the enemy cannot see the hand and only recomputes preview numbers from public state. |
| 4 | How many turns is a healthy battle? | Target 6–12 turns per encounter; enforce only the 100-turn termination guard in v1. |
