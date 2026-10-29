# Feature: Solo Run

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-01 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-US-04 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-NFR-05 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-06 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| RUN-FR-01 – RUN-FR-08 | This feature | owns |
| ENG-FR-05 | [Battle Engine & Rules](battle-engine.md#3. Functional Requirements) | participates |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Solo Run
**ID Prefix:** RUN
**Summary:** The single-player ladder: choose one of four elemental starters, fight Cinder Warden, Rime Sentinel, Storm Herald and The Hollow Field, heal and pick rewards between fights, and finish with a victory or defeat summary. The run autosaves after every settled action and resumes the exact battle after a reload.
**Dependencies:** Game Shell & Presentation
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| RUN-US-01 | Solo player | see my progress, health and deck between fights | I understand how far I am and what I have built | Must |
| RUN-US-02 | Solo player | choose one of three rewards after a win | my deck grows in a direction I control | Must |
| RUN-US-03 | Interrupted player | reload and continue the same battle | a closed tab does not cost me the run | Must |
| RUN-US-04 | Returning player | see my best run record | I have a reason to start another run | Should |

---

## 3. Functional Requirements

```forge-requirement
{"id":"RUN-FR-01","kind":"requirement","text":"Start a solo run from one of the four starter decks at 40 health and run a fixed ladder of Cinder Warden, Rime Sentinel, Storm Herald and The Hollow Field, carrying health, deck and turn totals between battles."}
```

```forge-requirement
{"id":"RUN-FR-02","kind":"requirement","text":"After each normal-encounter victory heal 12 health capped at 40, grant one mandatory reward choice, and start the next battle only after the reward resolves; a boss victory ends the run without a reward."}
```

```forge-requirement
{"id":"RUN-FR-03","kind":"requirement","text":"Offer three unique reward cards drawn with the run PRNG from the chosen element plus Neutral; when health is below 20, replace the third card with a Heal 12 option, and accept exactly one choice."}
```

```forge-requirement
{"id":"RUN-FR-04","kind":"requirement","text":"Track encounters cleared, total turns, cards added and damage taken, and show a victory or defeat result with New Run and Menu actions."}
```

```forge-requirement
{"id":"RUN-FR-05","kind":"requirement","text":"Autosave the run to one versioned localStorage slot after every settled action, including card plays, turn ends, reward choices, encounter starts and run end, and offer Continue Run on load with the exact saved battle."}
```

```forge-requirement
{"id":"RUN-FR-06","kind":"requirement","text":"Discard a save whose schema version is unknown or whose JSON, run state or battle snapshot fails validation, remove only the run key, and return to the menu without crashing or partially restoring."}
```

```forge-requirement
{"id":"RUN-FR-07","kind":"requirement","text":"Maintain one local best-run record containing the furthest encounter reached, total boss clears and the fewest turns for a completed run, updating it only when a run ends."}
```

```forge-requirement
{"id":"RUN-FR-08","kind":"requirement","text":"Accept an integer seed query parameter for deterministic runs, use a random 32-bit seed otherwise, and persist seed and PRNG state so a reload resumes the same sequence."}
```

---

## 4. UI / Interaction Design

### 4.1 Run ladder

| Step | Enemy | Health | After victory |
|------|-------|--------|---------------|
| 1 | Cinder Warden | 30 | Heal 12, choose a reward |
| 2 | Rime Sentinel | 35 | Heal 12, choose a reward |
| 3 | Storm Herald | 40 | Heal 12, choose a reward |
| 4 | The Hollow Field (boss) | 60 | Run complete |

The player begins at 40 health. Health carries across battles; healing is applied after a victory and before the reward screen. The deck starts at 10 cards and grows by one card per reward.

### 4.2 Screens

**Solo setup.** Four deck cards show the element, its glyph, a one-line identity ("Ember: aggressive, piercing"), the ten card names and the two Shift cards. Selecting a deck and pressing Start Run creates the run. Back returns to the menu.

**Run overview.** Shows encounter progress as four steps ("1 of 4"), current health out of 40, deck size, total turns and the next enemy portrait and element. Next Battle starts the encounter. Menu saves and leaves.

**Reward.** Shows three large options. Card options show the full card face and effect. The heal option appears only when health is below 20 and shows "Heal 12". Exactly one option can be chosen; the screen has no skip. Choosing a card adds it to the deck and advances; choosing heal restores health and advances.

**Run result.** Victory shows encounters cleared (4 of 4), total turns, cards added, boss clears and whether the run set a new best. Defeat shows how far the run reached and the same totals. Actions: New Run (returns to solo setup) and Menu.

### 4.3 Save contract

Key: `fieldbound.run.v1`.

```json
{
  "schemaVersion": 1,
  "seed": 123456789,
  "rngState": 987654321,
  "run": {
    "schemaVersion": 1,
    "element": "ember",
    "health": 28,
    "deck": ["ember-cinder-jab"],
    "encounterIndex": 1,
    "turnsTotal": 14,
    "cardsAdded": 1,
    "damageTaken": 24,
    "phase": "battle"
  },
  "battle": { "schemaVersion": 1 },
  "pendingReward": null
}
```

Saves are written after every settled action: a card play that fully resolves, a completed turn, a reward choice, an encounter start and a run end. A reload offers Continue Run only when the payload validates. Continue restores the battle snapshot exactly; during a reward or result, it restores that screen.

[Battle Log & Dynamic Dialogue](battle-log.md) adds one optional additive `battleLog` array to this payload (`LOG-FR-06`). It is written only in the battle phase, capped at 80 entries and restored in order by Continue Run. `RUN_SAVE_SCHEMA_VERSION` stays at `1`: saves without the field remain valid and resume with an empty log, and a malformed log is dropped without discarding the rest of the save.

### 4.4 Best-run record

Key: `fieldbound.stats.v1`.

| Field | Meaning |
|-------|---------|
| furthestEncounter | Highest completed or reached step, 1–4 |
| bossClears | Number of completed runs |
| bestCompletedTurns | Fewest total turns across completed runs, or null |

The record updates once, when a run ends, so an abandoned run cannot inflate it.

### 4.5 Seeding

`?seed=12345` (any non-negative 32-bit integer) fixes the run seed. Without it, the app generates a seed from `crypto.getRandomValues`. The seed and current PRNG state are saved, so a reload is deterministic. The parameter is read only at run creation; changing it mid-run does nothing.

---

## 5. Implementation Tasks

| ID | Observable outcome | Owner | Depends | Outputs and tests | Check |
|----|--------------------|-------|---------|-------------------|-------|
| RUN-01 | Run model with ladder, healing and end states | solo-mode-engineer | ENG-05, CNT-02 | `src/run/run-model.ts`, `src/run/run-model.test.ts` | `npm test -- src/run/run-model.test.ts` |
| RUN-02 | Seeded reward offers and mandatory choice | solo-mode-engineer | RUN-01, CNT-01 | `src/run/rewards.ts`, `src/run/rewards.test.ts` | `npm test -- src/run/rewards.test.ts` |
| RUN-06 | Validated best-run record | solo-mode-engineer | RUN-01 | `src/persistence/stats.ts`, `src/persistence/stats.test.ts` | `npm test -- src/persistence/stats.test.ts` |
| RUN-03 | Versioned run save with safe corruption handling | solo-mode-engineer | RUN-01, RUN-02, ENG-05 | `src/persistence/run-save.ts`, `src/persistence/run-save.test.ts` | `npm test -- src/persistence/run-save.test.ts` |
| RUN-04 | Playable solo flow from setup through result | frontend-engineer | SHL-03, RUN-02, RUN-03, RUN-06 | `src/state/run-controller.ts`, `src/state/run-controller.test.ts`, `src/persistence/seed.ts`, `src/persistence/seed.test.ts`, `src/ui/screens/SoloSetupScreen.tsx`, `src/ui/screens/RunOverviewScreen.tsx`, `src/ui/screens/RewardScreen.tsx`, `src/ui/screens/RunResultScreen.tsx`, `src/App.tsx`, `src/App.solo.test.tsx` | `npm test -- src/App.solo.test.tsx src/state/run-controller.test.ts` |
| RUN-05 | Continue Run from a validated save, seed preserved | frontend-engineer | RUN-04 | `src/state/resume-run.ts`, `src/state/resume-run.test.ts`, `src/ui/screens/MenuScreen.tsx`, `src/App.tsx`, `src/App.continue.test.tsx` | `npm test -- src/App.continue.test.tsx src/state/resume-run.test.ts` |

### Phase 1: Run Model

```forge-task
{
  "id": "RUN-01",
  "title": "Implement run creation, ladder progression and healing",
  "description": "Build the pure solo run model: create a run from a starter element and seed, resolve the four-enemy ladder, carry health and deck, heal 12 after each normal win capped at 40, advance encounters, and expose victory and defeat states plus turns, cards added and damage taken. Do not persist, generate rewards or render UI.",
  "ownerAgent": "solo-mode-engineer",
  "dependencies": ["ENG-05", "CNT-02"],
  "expectedOutputs": ["src/run/run-model.ts", "src/run/run-model.test.ts"],
  "validationCommands": ["npm test -- src/run/run-model.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A new run starts at 40 health with a 10-card deck on the first ladder enemy", "Victory heals 12 before the reward and defeat or boss victory ends the run"],
    "requirementRefs": ["docs/features/solo-run.md#RUN-FR-01", "docs/features/solo-run.md#RUN-FR-02", "docs/features/solo-run.md#RUN-FR-04"],
    "acceptanceCriteria": ["Encounter order is Cinder Warden, Rime Sentinel, Storm Herald, The Hollow Field", "Healing 12 at 34 health yields 40 and never exceeds the maximum", "A normal victory moves to the reward phase and a boss victory moves to victory without a reward", "Defeat preserves the encounter reached and total turns", "Turn and damage totals accumulate exactly once per battle result"],
    "constraints": ["No localStorage, React or screen imports", "Do not embed enemy stats; read them from the content catalog"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#10. System States / Lifecycle", "docs/features/solo-run.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "RUN-02",
  "title": "Generate and apply seeded reward offers",
  "description": "Implement reward generation from the chosen element plus Neutral using the run PRNG, producing three unique cards, with the third slot replaced by Heal 12 when health is below 20. Implement applying a card or heal exactly once and rejecting a second choice. Do not render the reward screen or write saves.",
  "ownerAgent": "solo-mode-engineer",
  "dependencies": ["RUN-01", "CNT-01"],
  "expectedOutputs": ["src/run/rewards.ts", "src/run/rewards.test.ts"],
  "validationCommands": ["npm test -- src/run/rewards.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Three unique offers come from the chosen element plus Neutral and are deterministic for a seed", "Below 20 health the third offer is Heal 12 and the choice is exactly one"],
    "requirementRefs": ["docs/features/solo-run.md#RUN-FR-03"],
    "acceptanceCriteria": ["The same run seed and state produce the same three offers", "No offer repeats a card id and no offer is outside the element-plus-Neutral pool", "At 19 health the third offer is heal; at 20 health all three are cards", "Choosing a card appends exactly one copy to the deck and advances the encounter", "Choosing heal restores 12 health capped at 40 and appends no card", "A second choice against the same offer is rejected"],
    "constraints": ["Do not use Math.random", "Do not include enemy-only or out-of-pool cards"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-07"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/solo-run.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "RUN-06",
  "title": "Store and update the best-run record",
  "description": "Implement a versioned best-run record under fieldbound.stats.v1 with furthest encounter, boss clears and fewest completed turns. Validate on read, clamp impossible values, update only at run end, and expose a pure update function plus load and save helpers. Do not render stats.",
  "ownerAgent": "solo-mode-engineer",
  "dependencies": ["RUN-01"],
  "expectedOutputs": ["src/persistence/stats.ts", "src/persistence/stats.test.ts"],
  "validationCommands": ["npm test -- src/persistence/stats.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The record keeps the furthest encounter, boss clears and best completed turns", "Only a completed run updates the record"],
    "requirementRefs": ["docs/features/solo-run.md#RUN-FR-07"],
    "acceptanceCriteria": ["A first defeat records its furthest encounter and leaves boss clears at zero", "A completed 18-turn run increments boss clears and sets bestCompletedTurns to 18", "A later 24-turn completion keeps 18 while a 12-turn completion replaces it", "Invalid JSON and an unknown version fall back to an empty record without throwing", "Saving and loading a record round-trips exactly"],
    "constraints": ["Only the stats module may touch the stats key", "Do not overwrite run or settings keys"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-03"],
    "references": ["docs/PRD.md#8. Security and Privacy", "docs/features/solo-run.md#4. UI / Interaction Design"]
  }
}
```

### Phase 2: Persistence

```forge-task
{
  "id": "RUN-03",
  "title": "Persist and validate the solo run save",
  "description": "Implement the versioned run save under fieldbound.run.v1 covering run state, seed, PRNG state, optional battle snapshot and optional pending reward. Validate every field before use, remove only the run key on unknown versions or corruption, handle storage quota and unavailable storage without crashing, and expose save, load and clear. Do not render UI.",
  "ownerAgent": "solo-mode-engineer",
  "dependencies": ["RUN-01", "RUN-02", "ENG-05"],
  "expectedOutputs": ["src/persistence/run-save.ts", "src/persistence/run-save.test.ts"],
  "validationCommands": ["npm test -- src/persistence/run-save.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A valid save round-trips run, seed, PRNG state and battle snapshot", "Unknown versions, corrupt JSON and invalid snapshots are discarded without affecting other keys"],
    "requirementRefs": ["docs/features/solo-run.md#RUN-FR-05", "docs/features/solo-run.md#RUN-FR-06", "docs/features/solo-run.md#RUN-FR-08", "docs/PRD.md#VIS-NFR-05", "docs/PRD.md#VIS-SEC-02"],
    "acceptanceCriteria": ["Saving then loading restores the same run and battle state", "An unknown schemaVersion removes only fieldbound.run.v1 and returns null", "Corrupt JSON, a missing battle snapshot for a battle phase and an invalid card id are rejected", "A quota error returns an unavailable status and leaves in-memory play possible", "The module never reads or writes fieldbound.settings.v1 or fieldbound.stats.v1"],
    "constraints": ["Use an injectable storage adapter so tests avoid the real browser store", "Validation must precede any state reconstruction"],
    "constraintRefs": [],
    "references": ["docs/PRD.md#8. Security and Privacy", "docs/features/solo-run.md#4. UI / Interaction Design"]
  }
}
```

### Phase 3: Solo Flow

```forge-task
{
  "id": "RUN-04",
  "title": "Build the solo controller, seed handling and screens",
  "description": "Create the solo run controller over the battle engine, seed parsing from ?seed=, autosave hooks after settled actions, and the setup, overview, reward and result screens wired into App. Cover deck selection through battle plus reward and result screens with interaction tests. Do not implement the duel.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["SHL-03", "RUN-02", "RUN-03", "RUN-06"],
  "expectedOutputs": ["src/state/run-controller.ts", "src/state/run-controller.test.ts", "src/persistence/seed.ts", "src/persistence/seed.test.ts", "src/ui/screens/SoloSetupScreen.tsx", "src/ui/screens/RunOverviewScreen.tsx", "src/ui/screens/RewardScreen.tsx", "src/ui/screens/RunResultScreen.tsx", "src/App.tsx", "src/App.solo.test.tsx"],
  "validationCommands": ["npm test -- src/App.solo.test.tsx src/state/run-controller.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The solo flow is reachable from the menu and runs setup, battle, reward and result through App", "Every settled action triggers a save and the run seed is taken from the query parameter when present"],
    "requirementRefs": ["docs/features/solo-run.md#RUN-FR-01", "docs/features/solo-run.md#RUN-FR-02", "docs/features/solo-run.md#RUN-FR-04", "docs/features/solo-run.md#RUN-FR-08"],
    "acceptanceCriteria": ["Menu to solo setup lists four decks and Start Run opens the first battle", "The run overview shows 1 of 4, current health and deck size", "A forced victory shows the reward screen with three options and the heal rule at low health", "Choosing a reward adds the card and opens the next battle", "A boss victory and a defeat each show the result screen with encounters, turns and cards added", "A valid ?seed= produces the same first hand across two runs and an invalid value is ignored", "A save is written after a card play and after a completed turn"],
    "constraints": ["Do not duplicate battle rules in the controller or screens", "Do not add a routing library", "Do not implement Continue Run or duel wiring"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01", "docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#10. System States / Lifecycle", "docs/features/solo-run.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "RUN-05",
  "title": "Restore a saved run and offer Continue Run",
  "description": "Load and validate the run save on boot, show Continue Run on the menu only when it is valid, restore the exact battle, reward or result screen, and remove invalid saves without an error dialog. Add tests through App for a valid save, a corrupt save and a seed-preserved reload. Do not change run rules or the save schema.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["RUN-04"],
  "expectedOutputs": ["src/state/resume-run.ts", "src/state/resume-run.test.ts", "src/ui/screens/MenuScreen.tsx", "src/App.tsx", "src/App.continue.test.tsx"],
  "validationCommands": ["npm test -- src/App.continue.test.tsx src/state/resume-run.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A valid save exposes Continue Run and restores the exact saved screen and battle", "An invalid save hides Continue Run and is removed"],
    "requirementRefs": ["docs/features/solo-run.md#RUN-FR-05", "docs/features/solo-run.md#RUN-FR-06", "docs/features/solo-run.md#RUN-FR-08", "docs/PRD.md#VIS-NFR-06"],
    "acceptanceCriteria": ["With no save the menu omits Continue Run", "A saved mid-battle state restores the same health, hand, energy, field and enemy plan", "A saved reward state restores the same three offers", "A corrupt or unknown-version save shows the menu without Continue Run and removes only the run key", "A reloaded run replays the same next draw for the stored seed"],
    "constraints": ["Resume must use the engine snapshot validator, not a parallel parser", "Do not surface raw storage errors to the player"],
    "constraintRefs": [],
    "references": ["docs/PRD.md#10. System States / Lifecycle", "docs/features/solo-run.md#4. UI / Interaction Design"]
  }
}
```

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit | Ladder, healing, rewards, stats, save validation | Pure Vitest suites with fixture runs and a fake storage adapter |
| Integration | Controller transitions, autosave points | Play scripted battles to victory and defeat, assert saves |
| UI | Setup, overview, reward and result | Testing Library through `App` with seeded state |
| Persistence | Reload, corrupt data, unknown version | Render App with pre-populated localStorage and remount |
| E2E | Full run and reload | Playwright in Release Verification |

Key test scenarios:

1. Healing at 34 health caps at 40 and never overflows.
2. At 19 health the third reward becomes Heal 12; at 20 it stays a card.
3. A corrupted save removes only `fieldbound.run.v1` and leaves settings intact.
4. Continue Run restores the exact hand, energy and enemy plan.
5. A reloaded seeded run draws the same next card.
6. Winning the boss writes the stats record exactly once.

---

## 7. Acceptance Criteria

1. All eight RUN requirements are covered by passing tests.
2. A run can be started, won or lost entirely through the UI.
3. Health, deck and turn totals carry correctly across all four encounters.
4. Every settled action produces a save, and a reload resumes the same screen and state.
5. Corrupt or unknown saves never block play and never damage other keys.
6. The best-run record updates only on run end and shows on the result screen.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should rewards offer a skip? | No; one option is mandatory so the deck always grows. |
| 2 | Is 12 health the right 30% heal? | Yes; 30% of 40 rounds to 12 for the frozen v1 baseline. |
| 3 | Should health be fully restored between runs? | Yes; every new run starts at 40. |
| 4 | Should abandoning a run count as a completed run? | No; only an explicit victory or defeat updates the record. |
