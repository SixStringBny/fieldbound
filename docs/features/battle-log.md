# Feature: Battle Log & Dynamic Dialogue

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-03 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-NFR-02 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-03 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-04 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-05 | [Vision](../PRD.md#7. Non-Functional Requirements) | constrained by |
| VIS-NFR-06 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-CON-01 | [Vision](../PRD.md#1. Overview) | constrained by |
| VIS-CON-05 | [Vision](../PRD.md#1. Overview) | constrained by |
| VIS-CON-06 | [Vision](../PRD.md#1. Overview) | constrained by |
| VIS-CON-08 | [Vision](../PRD.md#1. Overview) | constrained by |
| SHL-FR-02 | [Game Shell & Presentation](game-shell.md#3. Functional Requirements) | participates |
| RUN-FR-05 | [Solo Run](solo-run.md#3. Functional Requirements) | participates |
| DUEL-FR-03 | [Local Duel](local-duel.md#3. Functional Requirements) | participates |
| DUEL-FR-04 | [Local Duel](local-duel.md#3. Functional Requirements) | participates |
| LOG-FR-01 – LOG-FR-07 | This feature | owns |
| LOG-NF-01 – LOG-NF-03 | This feature | owns |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Battle Log & Dynamic Dialogue
**ID Prefix:** LOG
**Summary:** A bounded, chronological battle journal that records every settled action as structured facts and renders it as plain-English prose with deterministic narrator and per-enemy dialogue. It gives players a readable account of what happened in a turn without changing the rules, the board layout or the existing live-region announcement. Solo logs persist with the run save; duel logs are public-only and never survive the privacy handoff.
**Dependencies:** Battle Engine & Rules, Card & Enemy Content, Game Shell & Presentation, Solo Run, Local Duel, Release Verification (Playwright harness only)
**Priority:** Must

---

## 2. Context: Existing System State

**Completed Feature Tasks:** All six v1 features are implemented and release-verified: `ENG-00`–`ENG-07`, `CNT-01`–`CNT-03`, `SHL-01`–`SHL-07`, `RUN-01`–`RUN-06`, `DUEL-01`–`DUEL-03` and `REL-01`–`REL-06`. `docs/PROGRESS.md` records the completed work and `docs/reviews/v1-release-review.json` records the human release review.

**Relevant Existing Components:**

| Component | Current behavior | Why this feature touches it |
|-----------|------------------|-----------------------------|
| `src/state/battle-controller.ts` | Reduces engine actions into state, a cue list and one typed report. It already walks each telegraphed enemy plan step, so it has the per-step before/after states a log needs. | Adds the bounded log to controller state and records settled transitions. |
| `src/ui/screens/BattleScreen.tsx` | Renders `BattleBoard` and turns each settled transition into one polite announcement through `describeBattleUpdate`. | Adds the log surface beside the board without changing the announcement. |
| `src/ui/screens/DuelBattleScreen.tsx` | Renders the redacted `DuelBattleView`; the opponent appears as a hand count. | Adds the shared public log to the active-turn view only. |
| `src/duel/round.ts` | Owns the privacy gate, the redacted views and per-action engine calls. | Adds log state and strips it from the privacy view. |
| `src/persistence/run-save.ts` | Owns `fieldbound.run.v1`, validates every field before use, and discards only the affected key. | Adds an additive optional `battleLog` field and drops a malformed log without losing the save. |
| `src/state/resume-run.ts` | Rebuilds the controller state from the validated save and restored snapshot. | Rehydrates the saved log into the resumed controller state. |
| `src/ui/a11y/announcements.ts` | Produces the single polite sentence for a settled transition. | Remains the only live-region source; the log must not double-announce. |
| `docs/features/game-shell.md` §4.2 | Already reserves an event log behind a "Log" toggle on mobile and a right-hand column at 1024px or wider. | This feature owns that reserved surface. |

**Existing Agents Involved:** `rules-engineer` (pure log derivation and validation), `content-designer` (factual prose and dialogue content), `ux-engineer` (log presentation and CSS), `frontend-engineer` (controller and screen integration, accessibility accountability), `duel-mode-engineer` (privacy-safe duel log), `solo-mode-engineer` (run-save extension and resume), `qa-automation-engineer` (browser verification).

**Established Conventions:**

- The engine in `src/engine/` owns every rule; controllers are the only layer that calls engine mutators, and screens never compute damage, draw, status or affordability (`VIS-CON-08`).
- Every random decision uses one seeded PRNG and must be reproducible (`VIS-NFR-04`). A presentation feature must not consume or advance the engine PRNG.
- All persistence is local and versioned. Existing keys are `fieldbound.run.v1`, `fieldbound.settings.v1` and `fieldbound.stats.v1`; a feature may not add a fourth key (`VIS-NFR-05`).
- Persisted payloads are validated before use; corrupt data removes only the affected key and never blocks play (`VIS-NFR-06`).
- All copy is bundled English (`VIS-CON-05`); assets and audio stay local (`VIS-CON-06`).
- No runtime, state, routing, CSS or audio dependency may be added (`VIS-CON-01`).

---

## 3. Feature Goals and Non-Goals

### 3.1 Goals

- Give every settled battle action a readable entry, so a player can reconstruct a turn from words rather than from health and defense numbers.
- Explain why a number changed: field empowerment or counter, Focus and Weaken, Wards, Regen and healing all appear in the entry that caused them.
- Add short deterministic dialogue that reacts to notable moments without changing the rules, the battle sequence or the engine PRNG.
- Work in solo and local duel. The duel log records only public information and disappears behind the privacy interstitial.
- Keep the solo log across a reload and Continue Run, while keeping the save payload bounded and backward-compatible.
- Preserve the existing single polite live announcement and the 375px board layout; the log is an addition, not a second announcement channel.

### 3.2 Non-Goals

- No combat replay, turn scrubbing, timeline scrubbing, export, sharing or copy-to-clipboard.
- No AI-generated runtime text, remote content, network calls or telemetry.
- No localization; all strings are bundled English.
- No change to card, enemy, damage, health, healing, defense, status or reward numbers.
- No change to enemy planning, intent preview or battle snapshot schema.
- No new localStorage key, no duel persistence and no log history across solo encounters.
- No voice acting, audio narration, music or new sound cues.
- No replacement of the existing live-region summary and no formal WCAG audit.

---

## 4. User Stories

| ID | Canonical Source | Ownership | Priority |
|----|------------------|-----------|----------|
| LOG-US-01 | [Owning definition](#4. User Stories) | Owns | Must |
| LOG-US-02 | [Owning definition](#4. User Stories) | Owns | Must |
| LOG-US-03 | [Owning definition](#4. User Stories) | Owns | Must |
| LOG-US-04 | [Owning definition](#4. User Stories) | Owns | Must |

```forge-requirement
{"id":"LOG-US-01","kind":"story","text":"As a solo player, I want a readable history of each turn that names the cards, damage, defense, statuses and field changes, so that I can understand what happened without reconstructing it from the board numbers."}
```

```forge-requirement
{"id":"LOG-US-02","kind":"story","text":"As a first-time player, I want short contextual lines that explain notable moments such as a field shift or a heavy hit, so that I learn the elemental rules by reading the battle as it unfolds."}
```

```forge-requirement
{"id":"LOG-US-03","kind":"story","text":"As one of two players sharing a device, I want a public battle history that never reveals an unplayed card or a hidden hand, so that the log does not break the privacy model."}
```

```forge-requirement
{"id":"LOG-US-04","kind":"story","text":"As a player who was interrupted, I want the same log history to return when I continue my run, so that the resumed battle still explains how I reached the current state."}
```

---

## 5. Technical Approach

### 5.1 Impact on Existing Architecture

| File or area | Change |
|--------------|--------|
| `src/battle-log/types.ts` | New domain types for entries, effects and the 80-entry limit. Plain JSON, no functions. |
| `src/battle-log/derive.ts` | New pure transition-to-entry derivation. Compares two `BattleState` values and formats no prose. |
| `src/battle-log/validate.ts` | New untrusted-log validator and cap. Returns a canonical array or `null`; never throws. |
| `src/battle-log/text.ts` | New pure renderer that turns entries plus catalog, names and seed into factual and dialogue lines. |
| `src/content/battle-dialogue.ts` | New bundled narrator and per-enemy line sets plus the deterministic picker. |
| `src/state/battle-controller.ts` | Adds `log` to `BattleControllerState`; records setup, player card, each enemy plan step and each turn handoff; accepts `initialLog`. |
| `src/ui/components/BattleLog.tsx` | New latest-line strip, toggle and scrollable history drawer / desktop column. |
| `src/styles/battle-log.css` | New layout styles for the strip, drawer, desktop column, focus and reduced-motion behavior. |
| `src/ui/screens/BattleScreen.tsx` | Renders the log from controller state through the text renderer. |
| `src/ui/screens/DuelBattleScreen.tsx` | Renders the shared public log from the active-turn view. |
| `src/duel/round.ts` | Adds `log` to round state and the battle view; redacts it from privacy and result views. |
| `src/persistence/run-save.ts` | Adds optional `battleLog` to the canonical payload, validates it, and drops only a malformed log. |
| `src/state/run-controller.ts` | Copies the battle log into each battle-phase save. |
| `src/state/resume-run.ts` | Restores saved entries into the resumed controller state. |
| `docs/features/game-shell.md` §4.2 | Cross-reference the log owner; no requirement text changes. |
| `docs/features/solo-run.md` §4.3 | Note the additive optional `battleLog` field; no save-schema version change. |

The battle snapshot does not change. The log is presentation state stored beside the snapshot, so `BattleSnapshot` remains about rules only and the engine stays unaware of prose, dialogue or UI.

### 5.2 New Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| Log domain model | `src/battle-log/types.ts` | Entry, effect, actor and limit types. |
| Log derivation | `src/battle-log/derive.ts` | One entry from one settled transition, using state deltas only. |
| Log validation | `src/battle-log/validate.ts` | Validate, order-check and cap an untrusted array. |
| Log text | `src/battle-log/text.ts` | Factual sentences plus one dialogue line per notable entry. |
| Dialogue content | `src/content/battle-dialogue.ts` | Narrator lines and per-enemy triggers, with the pure picker. |
| Log view | `src/ui/components/BattleLog.tsx` | Latest line, toggle, drawer and desktop column. |
| Log styles | `src/styles/battle-log.css` | Responsive and reduced-motion layout. |

### 5.3 Technology Additions

None. The feature uses the existing React 19.3.1, Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Testing Library 16.3.3 and Playwright 1.64.1 versions from PRD section 6.1. It adds no runtime package, no CSS framework, no icon library, no animation library and no content service. Dialogue is bundled TypeScript data; no file, font, image or audio is fetched.

### 5.4 Data Flow

```text
engine transition (before, after, actor, card)
        │
        ▼
deriveBattleLogEntry  ──▶ BattleLogEntry (facts only, ordinal, turn)
        │
        ▼
appendBattleLog (cap 80) ──▶ BattleControllerState.log / DuelRoundState.log
        │
        ▼
renderBattleLog(entries, seed, names, catalog, dialogue)
        │
        ├──▶ factual line
        └──▶ at most one narrator or enemy dialogue line
        │
        ▼
BattleLog: latest strip + drawer / desktop column
        │
        └── solo: serialize battleLog inside fieldbound.run.v1
                   └── Continue Run restores entries and re-renders identically
```

### 5.5 What an Entry Contains

| Field | Meaning |
|-------|---------|
| `id` | Stable string unique inside one battle, for example `t3-e12`. |
| `ordinal` | Strictly increasing integer assigned when the entry is created. Dialogue selection uses this value, so dropping the oldest entries never changes the text of the survivors. |
| `turn` | The engine turn number after the transition. |
| `kind` | `battle-start`, `card` or `turn`. |
| `actor` | `player`, `opponent` or `system` (battle start). |
| `cardId` | Present only on a `card` entry; resolved from the played instance, never guessed from prose. |
| `effects` | Ordered facts derived from the before/after states: `start`, `damage`, `heal`, `defense`, `status`, `field` or `outcome`. |

Effects carry only values the engine already produced, including remaining and maximum health, total defense, status stacks, the previous and next field, and the settled outcome. The log never re-runs the damage pipeline, never reads a hidden hand and never infers a draw.

### 5.6 Dialogue Triggers

| Trigger | Applies to | Speaker | Rule |
|---------|------------|---------|------|
| `battle-start` | First entry | Enemy (solo) / narrator (duel) | Introduces the opponent and the opening field. |
| `field-shift` | Entry with a field effect | Narrator | Names the new field and the matchup in words. |
| `first-blood` | First damage to the opponent | Narrator | Once per battle. |
| `big-hit` | Damage of 6 or more to either side | Narrator | At most once per entry. |
| `low-health-player` | Player at 25% health or less | Narrator | Once per battle, after the entry that crossed the threshold. |
| `low-health-enemy` | Enemy at 25% health or less | Enemy | Once per battle, after the entry that crossed the threshold. |
| `victory` | Winning entry | Enemy or narrator | Closes the log. |
| `defeat` | Losing entry | Enemy or narrator | Closes the log. |

The picker uses a local 32-bit integer hash of `(battle.seed, entry.ordinal, triggerTag)`. It never calls `Math.random`, never reads `BattleState.rngState` as an input and never writes it, so dialogue variety cannot change a shuffle, reward or enemy plan. The same seed and transition sequence always produce the same lines.

### 5.7 Persistence Shape

The existing save contract gains one optional additive field:

```json
{
  "schemaVersion": 1,
  "seed": 123456789,
  "rngState": { "state": 987654321 },
  "run": { "schemaVersion": 1, "phase": "battle" },
  "battle": { "schemaVersion": 1 },
  "battleLog": [
    { "id": "t4-e17", "ordinal": 17, "turn": 4, "kind": "card", "actor": "player", "cardId": "ember-cinder-jab", "effects": [] }
  ],
  "pendingReward": null
}
```

- `battleLog` is written only in the battle phase and is `null` outside a battle.
- `RUN_SAVE_SCHEMA_VERSION` stays at `1`. Existing v1 saves without the field remain valid and resume with an empty log.
- A malformed log is dropped to `[]` while the rest of the validated save is kept, so a presentation defect never costs Continue Run.
- A log longer than 80 entries is normalized to the last 80 entries on read, matching the controller cap.
- No new storage key is introduced. Duel logs are never written to storage.

---

## 6. Functional Requirements

| ID | Canonical Source | Affects Existing | Priority |
|----|------------------|------------------|----------|
| LOG-FR-01 | [Owning definition](#6. Functional Requirements) | Yes — `battle-controller`, `duel/round` | Must |
| LOG-FR-02 | [Owning definition](#6. Functional Requirements) | No — new log text module | Must |
| LOG-FR-03 | [Owning definition](#6. Functional Requirements) | No — new dialogue content | Must |
| LOG-FR-04 | [Owning definition](#6. Functional Requirements) | Yes — battle screens and CSS | Must |
| LOG-FR-05 | [Owning definition](#6. Functional Requirements) | Yes — `duel/round` | Must |
| LOG-FR-06 | [Owning definition](#6. Functional Requirements) | Yes — `run-save`, `run-controller`, `resume-run` | Must |
| LOG-FR-07 | [Owning definition](#6. Functional Requirements) | Yes — `BattleScreen`, live region boundary | Must |

```forge-requirement
{"id":"LOG-FR-01","kind":"requirement","text":"Record exactly one battle-log entry for each settled transition: a battle-start entry at setup, one card entry for every card played by either side, and one turn entry when control passes between sides. Each entry carries a stable id, a strictly increasing ordinal, the turn number, the acting side, the optional played card id, and an ordered effects list covering damage, healing, defense, status application, field shift and battle outcome. Rejected actions and renders add no entry. Keep at most 80 entries per battle by dropping the oldest."}
```

```forge-requirement
{"id":"LOG-FR-02","kind":"requirement","text":"Render each entry as one factual English sentence, plus at most one dialogue line, from its effects and the card catalog: name the actor and card, state each non-zero delta with remaining and maximum health or total defense, name status stacks and the field matchup in words, and state victory or defeat. Omit zero-value effects. The renderer must not compute damage, draw, status or affordability rules; it only formats engine-reported facts."}
```

```forge-requirement
{"id":"LOG-FR-03","kind":"requirement","text":"Provide deterministic dynamic dialogue: a neutral narrator line for notable public events and authored per-enemy lines for the battle start, enemy low health, field shift, victory and defeat, including the boss. Select a line from the applicable set using a pure 32-bit hash of the battle seed, the entry ordinal and a trigger tag; never read or advance the engine PRNG, never use Math.random, and never produce more than one dialogue line per entry."}
```

```forge-requirement
{"id":"LOG-FR-04","kind":"requirement","text":"Present the log in both battle screens as a labelled, scrollable region: a one-line latest-entry strip is always visible; a Log toggle with a 44px target opens and closes the history drawer on mobile; at 1024px and wider the history is a right-hand column. The drawer closes on Escape and returns focus to the toggle. Newest entries are reachable, the page does not scroll horizontally at 375px, and reduced motion makes entry appearance instant."}
```

```forge-requirement
{"id":"LOG-FR-05","kind":"requirement","text":"Record only public information in a duel: card plays, damage, healing, defense, status applications, field shifts, turn boundaries and outcomes. Never record hand contents, draws, deck order, intent, hidden energy or another player's unplayed cards. The privacy interstitial exposes no log or log toggle; the battle view exposes the shared public log; each round starts a fresh log."}
```

```forge-requirement
{"id":"LOG-FR-06","kind":"requirement","text":"Persist the solo battle log as an additive optional battleLog array inside the existing fieldbound.run.v1 payload, capped at 80 entries, written with every settled-action save and restored byte-for-byte in order by Continue Run. A missing log restores an empty log; an invalid log is dropped without discarding the rest of the save. Add no localStorage key and do not change the run save schema version."}
```

```forge-requirement
{"id":"LOG-FR-07","kind":"requirement","text":"Keep the log out of the live-region path: it is a labelled region and ordered list, not an aria-live area, and the existing single polite battle summary remains the only announcement per settled transition, so no event is announced twice. Entries are readable in DOM order, the latest entry is programmatically discoverable, and the toggle and drawer are fully keyboard operable."}
```

---

## 7. Non-Functional Requirements

| ID | Canonical Source | Priority |
|----|------------------|----------|
| LOG-NF-01 | [Owning definition](#7. Non-Functional Requirements) | Must |
| LOG-NF-02 | [Owning definition](#7. Non-Functional Requirements) | Must |
| LOG-NF-03 | [Owning definition](#7. Non-Functional Requirements) | Must |

```forge-requirement
{"id":"LOG-NF-01","kind":"requirement","text":"Derive log entries, dialogue selection and rendered text as pure functions of the battle seed and the settled transition sequence, such that replaying the same seed and actions produces identical entries and text, and rendering the log leaves BattleState, its PRNG state and the battle outcome unchanged."}
```

```forge-requirement
{"id":"LOG-NF-02","kind":"requirement","text":"Hold at most 80 entries per battle, keep the latest entry visible without layout shift, and keep the production initial JavaScript plus CSS at or below the existing 300 KB gzip budget with no new runtime dependency."}
```

```forge-requirement
{"id":"LOG-NF-03","kind":"requirement","text":"Keep the feature local-only: no network request, telemetry or remote content; store log data only inside the existing solo run key; never write duel logs to storage."}
```

---

## 8. Agent Impact Assessment

### 8.1 Existing Agents — Extended Responsibilities

| Agent | New Responsibilities | Modified Boundaries |
|-------|----------------------|---------------------|
| `rules-engineer` | Own `LOG-FR-01` and `LOG-NF-01`: define the pure entry model, derive effects from before/after `BattleState`, validate untrusted logs and enforce the 80-entry cap. | Adds `src/battle-log/` outside `src/engine/`. The engine remains untouched: the new module may import engine types and frozen constants but calls no engine mutator, imports no React/DOM/storage/content and never writes PRNG state. |
| `content-designer` | Own `LOG-FR-02` and `LOG-FR-03`: author narrator and per-enemy dialogue, the deterministic picker and the factual text renderer. | Adds `src/content/battle-dialogue.ts` and `src/battle-log/text.ts`. Card, deck and enemy data and the manifest are unchanged; all copy stays bundled English. |
| `ux-engineer` | Own `LOG-FR-04` and the presentation half of `LOG-FR-07`: build the latest strip, toggle, drawer, desktop column, focus styling and reduced-motion behavior. | Adds `src/ui/components/BattleLog.tsx` and `src/styles/battle-log.css`. The component takes rendered lines only and imports no engine mutator, controller, content catalog or storage module. |
| `frontend-engineer` | Own `LOG-FR-07` accountability and the integration work for `LOG-FR-02`/`LOG-FR-04`: add log state to the battle controller, wire both battle screens, and prove reachability through `App`. | `src/state/battle-controller.ts`, `src/ui/screens/BattleScreen.tsx`, `src/ui/screens/DuelBattleScreen.tsx`. The controller remains the only layer that calls engine mutators; screens do not compute prose or rules. |
| `duel-mode-engineer` | Own `LOG-FR-05`: carry the public log through duel round state, expose it only in the active battle view, and redact it from privacy and result views. | `src/duel/round.ts`. The privacy model is unchanged: no log in the privacy view, no persisted duel state, no AI planner, no hidden hand data in any entry. |
| `solo-mode-engineer` | Own `LOG-FR-06`: add the additive `battleLog` field to the run save, validate it safely and restore it through Continue Run. | `src/persistence/run-save.ts`, `src/state/run-controller.ts`, `src/state/resume-run.ts`. The run key and schema version stay unchanged; only the run module touches the key. |
| `qa-automation-engineer` | Verify the log in the production build: solo entry visibility, reload history, duel privacy redaction, keyboard drawer, 375px and 1280px layouts and the bundle budget. | Adds `tests/e2e/battle-log.spec.ts` and reuses the existing Playwright harness and helpers. |

### 8.2 New Agents Required

None. The feature is a cross-cutting presentation and persistence increment inside domains the existing team already owns. Adding a dedicated "log agent" would duplicate the controller, privacy and save boundaries that make this feature safe, and the dialogue content is a natural extension of the content author's role.

### 8.3 Existing Agents — No Changes

| Agent | Reason |
|-------|--------|
| `project-orchestrator` | Coordinates existing specialists; no new domain or task type. |
| `workflow-orchestrator` | Runs the compiled manifest; the feature adds no new execution mechanism. |
| `forge-team-builder` | Only used for team generation; this increment does not require new agents. |

---

## 9. Implementation Phases

### 9.1 Task Review Table

| ID | Observable outcome | Owner | Prerequisite interface | Outputs and tests | Acceptance-to-check mapping | Exclusions |
|----|--------------------|-------|------------------------|-------------------|-----------------------------|------------|
| LOG-01 | A pure log entry model, transition derivation and validator | `rules-engineer` | `BattleState`, `Side`, `StatusCounters` from `src/engine/types.ts` | `src/battle-log/types.ts`, `src/battle-log/derive.ts`, `src/battle-log/validate.ts`, `src/battle-log/derive.test.ts`, `src/battle-log/validate.test.ts` | `npm test -- src/battle-log/derive.test.ts src/battle-log/validate.test.ts`; `npm run typecheck` | No prose, no content import, no engine mutator, no React/DOM/storage. |
| LOG-02 | Factual lines, narrator lines and per-enemy dialogue with a deterministic picker | `content-designer` | `BattleLogEntry` from LOG-01; card catalog from CNT-01 | `src/content/battle-dialogue.ts`, `src/content/battle-dialogue.test.ts`, `src/battle-log/text.ts`, `src/battle-log/text.test.ts` | `npm test -- src/content/battle-dialogue.test.ts src/battle-log/text.test.ts`; `npm run typecheck` | No card/enemy data change, no React, no network, no engine PRNG consumption. |
| LOG-03 | Battle controller state carries a bounded log for every settled transition | `frontend-engineer` | `deriveBattleLogEntry` and `appendBattleLog` from LOG-01; text contract from LOG-02 | `src/state/battle-controller.ts`, `src/state/battle-controller.test.ts` | `npm test -- src/state/battle-controller.test.ts`; `npm run typecheck` | No prose, no storage, no screen render, no engine rule change. |
| LOG-04 | Accessible latest-line strip, drawer and desktop column | `ux-engineer` | Rendered `BattleLogLine[]` from LOG-02; board layout from SHL-02 | `src/ui/components/BattleLog.tsx`, `src/ui/components/BattleLog.test.tsx`, `src/styles/battle-log.css` | `npm test -- src/ui/components/BattleLog.test.tsx`; `npm run typecheck` | No screen wiring, no engine/content/controller/storage import, no new dependency. |
| LOG-05 | Privacy-safe public log in duel round state and battle view | `duel-mode-engineer` | `BattleLogEntry` from LOG-01; `DuelRoundState` from DUEL-02 | `src/duel/round.ts`, `src/duel/round.test.ts` | `npm test -- src/duel/round.test.ts`; `npm run typecheck` | No AI planner, no persistence, no hidden hand data, no engine rule change. |
| LOG-06 | Both battle screens render the log through `App` without changing announcements | `frontend-engineer` | Controller log from LOG-03; `BattleLog` from LOG-04; duel view log from LOG-05 | `src/ui/screens/BattleScreen.tsx`, `src/ui/screens/DuelBattleScreen.tsx`, `src/App.battle-log.test.tsx` | `npm test -- src/App.battle-log.test.tsx`; `npm run typecheck` | No rules or prose in screens, no new screen, no `aria-live` on the log. |
| LOG-07 | Solo log persists and resumes through the existing run key | `solo-mode-engineer` | Log entries from LOG-01; controller log from LOG-03; run save from RUN-03/RUN-05 | `src/persistence/run-save.ts`, `src/persistence/run-save.test.ts`, `src/state/run-controller.ts`, `src/state/run-controller.test.ts`, `src/state/resume-run.ts`, `src/state/resume-run.test.ts` | `npm test -- src/persistence/run-save.test.ts src/state/run-controller.test.ts src/state/resume-run.test.ts`; `npm run typecheck` | No new key, no schema version bump, no log in non-battle phases, no whole-save discard for a bad log. |
| LOG-08 | Browser proof of solo history, duel privacy, reload and responsive layout | `qa-automation-engineer` | Log screens from LOG-06; persistence from LOG-07; harness from REL-01 | `tests/e2e/battle-log.spec.ts` | `npm run test:e2e -- tests/e2e/battle-log.spec.ts`; `node scripts/check-budget.mjs` | No application logic change, no mock of internal modules, no new harness dependency. |
| LOG-HR-1 | Human judgment of log readability and dialogue tone in both modes | Human reviewer | LOG-08 evidence and the running static build | `docs/reviews/battle-log-review.json` (review file) | Human review criteria in the task contract | No code change, no automated approval. |

### Phase 1: Log Domain and Prose

```forge-task
{
  "id": "LOG-01",
  "title": "Define the battle-log domain, derivation and validator",
  "description": "Create the pure battle-log domain module: typed entries and effects, the transition-to-entry derivation, and the untrusted-log validator. Derive damage, healing, defense, status applications, field shifts and outcome by comparing before/after BattleState; take the played card id from the supplied context. Require a strictly increasing ordinal and a unique id; cap a validated log at the last 80 entries. Do not render prose, import content, call engine mutators, or touch React, DOM or storage.",
  "ownerAgent": "rules-engineer",
  "dependencies": ["ENG-01", "ENG-04"],
  "expectedOutputs": ["src/battle-log/types.ts", "src/battle-log/derive.ts", "src/battle-log/validate.ts", "src/battle-log/derive.test.ts", "src/battle-log/validate.test.ts"],
  "validationCommands": ["npm test -- src/battle-log/derive.test.ts src/battle-log/validate.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Damage, healing, defense, status, field and outcome effects are derived from before/after state deltas only", "A validated log is capped at the last 80 entries and preserves the ordinals of the surviving entries", "A card entry requires a card id and a battle-start entry requires the opening opposing maximum health and field"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-01", "docs/features/battle-log.md#LOG-NF-01", "docs/PRD.md#VIS-NFR-04"],
    "acceptanceCriteria": ["Table-driven tests cover damage to either side, healing, defense gain, status application, field shift and victory/defeat, and a zero-delta transition produces no damage, heal, defense, status or field effect", "A card entry without a card id is rejected, and a validated entry with a duplicate id or a non-increasing ordinal is rejected", "An input array of 81 valid entries validates to the last 80 entries with their original ordinals intact", "JSON.stringify then JSON.parse of a validated log round-trips without functions or undefined values", "A repository grep over src/battle-log finds no Math.random call and no engine mutator import"],
    "constraints": ["No prose, dialogue or UI strings in this module", "Import only types and frozen constants from src/engine; never import src/content, React, DOM, storage or a controller", "Return canonical new arrays; never mutate the supplied entries"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/features/battle-log.md#5. Technical Approach", "docs/features/battle-engine.md#4.2 Damage pipeline", "docs/features/battle-engine.md#4.4 Status rules"]
  }
}
```

```forge-task
{
  "id": "LOG-02",
  "title": "Author battle prose and deterministic dialogue",
  "description": "Author the battle prose and dialogue layer: a bundled narrator set plus per-enemy lines for all four enemies and the boss, a deterministic trigger-to-line picker, and a pure renderer that turns entries into factual and dialogue lines. Use a local 32-bit hash of the battle seed, entry ordinal and trigger tag; never call Math.random or consume the engine PRNG. Keep every line English and at most 140 characters. Do not change card, enemy or battle data, and do not render React.",
  "ownerAgent": "content-designer",
  "dependencies": ["LOG-01", "CNT-01"],
  "expectedOutputs": ["src/content/battle-dialogue.ts", "src/content/battle-dialogue.test.ts", "src/battle-log/text.ts", "src/battle-log/text.test.ts"],
  "validationCommands": ["npm test -- src/content/battle-dialogue.test.ts src/battle-log/text.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Factual lines name the actor, the card and every non-zero effect with its remaining or total value", "Dialogue selection is stable for a seed, ordinal and trigger and covers the narrator plus Cinder Warden, Rime Sentinel, Storm Herald and The Hollow Field", "Rendering a log returns plain strings and leaves the battle state and its PRNG state unchanged"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-02", "docs/features/battle-log.md#LOG-FR-03", "docs/features/battle-log.md#LOG-NF-01", "docs/PRD.md#VIS-NFR-04"],
    "acceptanceCriteria": ["Every enemy id, including the boss, has battle-start, low-health, victory and defeat line sets, and the narrator has every non-enemy trigger", "The same seed, ordinal and trigger returns the same line on repeated calls, while at least two ordinals select different lines from a set of two or more", "Rendering a battle log does not change BattleState.rngState or the outcome", "A card line includes the card name, the actor and each non-zero damage, heal or defense value; a zero-value effect is omitted", "A field line names the empowered and countered elements in words, and a victory or defeat line closes the final entry", "No line exceeds 140 characters and no test or module calls Math.random"],
    "constraints": ["All copy is bundled English; no fetch, remote content or localization framework", "Do not modify card, deck or enemy definitions and do not add a runtime dependency", "The text module imports no React component, controller or storage module"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01", "docs/PRD.md#VIS-CON-05", "docs/PRD.md#VIS-CON-06"],
    "references": ["docs/features/battle-log.md#5.5 What an Entry Contains", "docs/features/battle-log.md#5.6 Dialogue Triggers", "docs/features/card-content.md#4. UI / Interaction Design"]
  }
}
```

### Phase 2: Controller and Presentation

```forge-task
{
  "id": "LOG-03",
  "title": "Carry a bounded battle log through the battle controller",
  "description": "Extend the battle controller state with the bounded battle log and append entries for every settled transition: battle setup, each player card, each telegraphed enemy plan step, and each turn handoff. Preserve the existing cue and report contract and the rejection behavior; a rejected intent appends nothing. Accept an optional initial log so a resumed battle keeps its history. Do not render prose, read storage or change engine rules.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["LOG-01", "LOG-02", "SHL-03"],
  "expectedOutputs": ["src/state/battle-controller.ts", "src/state/battle-controller.test.ts"],
  "validationCommands": ["npm test -- src/state/battle-controller.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A new controller state starts with exactly one battle-start entry and every settled player card, enemy plan step and turn handoff appends exactly one entry", "A rejected intent appends no entry and leaves the existing report and cue behavior unchanged", "An optional initial log is adopted without re-deriving or re-ordering it, and the 80-entry cap drops only the oldest entry"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-01", "docs/features/battle-log.md#LOG-NF-01", "docs/features/battle-log.md#LOG-NF-02", "docs/PRD.md#VIS-NFR-04"],
    "acceptanceCriteria": ["A fresh controller state has one battle-start entry with ordinal 0 and the opening field", "Playing one affordable card appends exactly one card entry with that card id, the correct actor and the damage, defense, status or field effects the engine produced", "Ending a turn appends one enemy card entry per executed plan step and one turn entry for the handoff back to the player", "A rejected unaffordable or out-of-turn play appends no entry and leaves sequence, report and cues unchanged", "Passing an initial log with three entries yields those three entries unchanged and appends the next ordinal after them", "Appending 81 entries leaves the last 80 in order and preserves their ordinals", "The existing battle-controller tests still pass without changes to their cue or report assertions"],
    "constraints": ["The controller remains the only layer that calls engine mutators", "Do not generate prose, dialogue or JSX in the controller", "Do not read or write storage"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/features/battle-log.md#5.4 Data Flow", "docs/features/battle-engine.md#4.1 Turn sequence", "docs/features/game-shell.md#4.2 Battle board layout"]
  }
}
```

```forge-task
{
  "id": "LOG-04",
  "title": "Build the accessible battle log strip and drawer",
  "description": "Build the BattleLog presentational component and its CSS: a one-line latest-entry strip, a 44px Log toggle with aria-expanded, a scrollable history drawer that closes on Escape and restores focus, and a desktop column at 1024px and wider. Render pre-rendered lines only; do not import engine, content, controller or storage modules. Keep the markup a labelled region and ordered list, not an aria-live area. Do not wire screens.",
  "ownerAgent": "ux-engineer",
  "dependencies": ["LOG-02", "SHL-02"],
  "expectedOutputs": ["src/ui/components/BattleLog.tsx", "src/ui/components/BattleLog.test.tsx", "src/styles/battle-log.css"],
  "validationCommands": ["npm test -- src/ui/components/BattleLog.test.tsx", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The latest entry is always visible and the history is an ordered list inside a labelled region", "The Log toggle is at least 44px, reports aria-expanded and opens and closes the drawer by pointer, Enter and Space; Escape closes it and returns focus to the toggle", "At 1024px and wider the log is a right-hand column, and reduced motion makes entry appearance instant"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-04", "docs/features/battle-log.md#LOG-FR-07", "docs/features/battle-log.md#LOG-NF-02", "docs/PRD.md#VIS-NFR-01", "docs/PRD.md#VIS-NFR-03"],
    "acceptanceCriteria": ["Rendering with an empty log shows a labelled empty state and no latest sentence; rendering with entries shows the newest text in the strip", "The log container has no aria-live attribute and the history is an ordered list in chronological DOM order", "The toggle exposes aria-expanded false then true, and Enter, Space and a pointer click all operate it", "Pressing Escape while the drawer is open closes it and focus returns to the toggle", "Eighty lines render in the list and the drawer is the only scroll container", "The desktop class or data attribute is present at the 1024px breakpoint and the reduced-motion branch sets at most a 1ms transition", "A repository grep of the component and CSS finds no engine, content, controller or storage import and no new dependency"],
    "constraints": ["Use plain CSS with custom properties; no UI framework, icon library or animation library", "No hover-only action and no positive tabindex values", "Do not add a second live region"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/features/battle-log.md#4. User Stories", "docs/features/game-shell.md#4.2 Battle board layout", "docs/PRD.md#9. Accessibility"]
  }
}
```

### Phase 3: Duel Privacy and Screen Wiring

```forge-task
{
  "id": "LOG-05",
  "title": "Add the privacy-safe duel battle log",
  "description": "Add the shared public battle log to the duel round model: create a battle-start entry, append entries for each settled play and turn handoff, reset per round and cap at 80. Expose the log only in the active battle view; the privacy view and result view carry no log, and no entry may contain a card id that was not played or any other hidden information. Do not persist duel state or call the AI planner.",
  "ownerAgent": "duel-mode-engineer",
  "dependencies": ["LOG-01", "LOG-02", "DUEL-02"],
  "expectedOutputs": ["src/duel/round.ts", "src/duel/round.test.ts"],
  "validationCommands": ["npm test -- src/duel/round.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A new duel round starts with one battle-start entry and appends one card entry per settled play and one turn entry per handoff", "The privacy view and result view expose no log, while the active battle view exposes the shared public entries", "No entry contains an unplayed card id, hand count, deck order, intent or hidden energy, and each round starts a fresh log"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-01", "docs/features/battle-log.md#LOG-FR-05", "docs/features/battle-log.md#LOG-NF-01", "docs/PRD.md#VIS-NFR-05"],
    "acceptanceCriteria": ["A new round's battle view contains one battle-start entry and the privacy view has no log field or log text", "Playing a card appends one card entry naming only that card id and its public effects; the opponent's other hand ids never appear in the serialized view", "Ending a turn appends one turn entry and returns to privacy with no log exposed", "The round result view has no log, and creating the next round starts a new log with ordinal 0", "The log is capped at 80 entries without changing the surviving ordinals", "No localStorage key is read or written and the AI planner is never called"],
    "constraints": ["Do not add hidden information to any view", "Do not persist duel state", "Do not copy damage or draw rules into the round controller"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/features/battle-log.md#5.4 Data Flow", "docs/features/local-duel.md#4.3 Privacy interstitial", "docs/features/local-duel.md#4.4 Duel battle"]
  }
}
```

```forge-task
{
  "id": "LOG-06",
  "title": "Wire the battle log into both battle screens",
  "description": "Wire the battle log into both battle screens: render the controller's entries through the text renderer and pass the resulting lines to BattleLog; use the enemy name and battle seed in solo and viewer-relative player names in duel. Place the latest strip and drawer without covering End Turn; hide the log entirely on the duel privacy screen. Add App-level tests that navigate to a solo battle and a duel, play a card, end a turn, open the drawer with the keyboard and assert the log; keep the existing live-region announcement single. Do not compute rules or duplicate prose in screens.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["LOG-03", "LOG-04", "LOG-05"],
  "expectedOutputs": ["src/ui/screens/BattleScreen.tsx", "src/ui/screens/DuelBattleScreen.tsx", "src/App.battle-log.test.tsx"],
  "validationCommands": ["npm test -- src/App.battle-log.test.tsx", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Rendering App and navigating to a solo battle shows the latest log line and a Log toggle that opens the history", "Rendering App and navigating to a duel shows the shared public log only after privacy is dismissed, and the privacy screen exposes no log", "The existing polite announcement remains the only live-region message for a settled transition"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-02", "docs/features/battle-log.md#LOG-FR-04", "docs/features/battle-log.md#LOG-FR-05", "docs/features/battle-log.md#LOG-FR-07", "docs/PRD.md#VIS-NFR-03"],
    "acceptanceCriteria": ["The App-level solo test starts a battle, sees the battle-start line, plays a card, sees a new latest line naming the card, ends a turn and sees an enemy entry", "The App-level solo test opens the log with Enter or Space, closes it with Escape and finds focus back on the toggle", "The App-level duel test starts a match, asserts the privacy screen has no log or Log toggle, dismisses privacy, plays a card and sees only the public entry", "The live region receives exactly one summary per settled transition and the log region is not an aria-live area", "The log is rendered through src/battle-log/text.ts and neither screen imports a damage, status or draw function", "The latest strip and drawer do not prevent End Turn from being reachable at 375px"],
    "constraints": ["Screens may not import engine mutators or duplicate prose", "Do not add a new screen, route or storage read", "Do not change the existing announcement wording or make the log live"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/features/battle-log.md#5.4 Data Flow", "docs/features/game-shell.md#4.2 Battle board layout", "docs/PRD.md#9. Accessibility"]
  }
}
```

### Phase 4: Persistence and Verification

```forge-task
{
  "id": "LOG-07",
  "title": "Persist and restore the solo battle log",
  "description": "Add the additive battleLog field to the run save contract and carry it through solo creation, autosave and resume. Serialize the battle controller's bounded log in the battle phase, normalize it to null outside a battle, validate untrusted entries, and drop only the log when it is malformed so the rest of the save still resumes. Restore the entries into the resumed controller state in order. Do not add a storage key or bump the save schema version.",
  "ownerAgent": "solo-mode-engineer",
  "dependencies": ["LOG-01", "LOG-03", "RUN-03", "RUN-05"],
  "expectedOutputs": ["src/persistence/run-save.ts", "src/persistence/run-save.test.ts", "src/state/run-controller.ts", "src/state/run-controller.test.ts", "src/state/resume-run.ts", "src/state/resume-run.test.ts"],
  "validationCommands": ["npm test -- src/persistence/run-save.test.ts src/state/run-controller.test.ts src/state/resume-run.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A battle-phase save carries the exact bounded log and a non-battle-phase save carries null", "A valid save round-trips the entries in order and Continue Run restores them into the controller state", "A missing battleLog restores an empty log and a malformed battleLog is dropped without discarding the rest of the save"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-06", "docs/features/battle-log.md#LOG-NF-03", "docs/features/solo-run.md#RUN-FR-05", "docs/PRD.md#VIS-NFR-05", "docs/PRD.md#VIS-NFR-06"],
    "acceptanceCriteria": ["Saving a battle with three log entries then loading it returns the same three entries in the same order", "A battle-phase save without battleLog validates and resumes with an empty log", "A battleLog containing an unknown effect, a duplicate id, a non-increasing ordinal or a non-integer amount is dropped to an empty log while the run and restored battle still load", "A battleLog with 81 valid entries loads as the last 80 entries", "A reward-phase, overview-phase or result-phase save serializes battleLog as null", "Saving, loading and resuming never read or write fieldbound.settings.v1, fieldbound.stats.v1 or a fourth key", "RUN_SAVE_SCHEMA_VERSION remains 1 and the existing run-save tests still pass"],
    "constraints": ["Only the run module may touch fieldbound.run.v1", "Validate before reconstructing any state; a bad log must not become a thrown error", "Do not change the run save schema version or add a storage key"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-03"],
    "references": ["docs/features/solo-run.md#4.3 Save contract", "docs/features/battle-log.md#5.7 Persistence Shape", "docs/features/battle-log.md#5.4 Data Flow"]
  }
}
```

```forge-task
{
  "id": "LOG-08",
  "title": "Verify the battle log in the production build",
  "description": "Add a Playwright journey for the battle log against the production build: start a seeded solo run, play a card, assert the latest line names the action, open and close the log with the keyboard, reload mid-battle, resume and assert the history returns; then start a duel, assert the privacy screen exposes no log, dismiss, play a public card and assert the log; check 375px has no horizontal scroll and 1280px shows the log column. Fail on console errors and keep the existing budget check passing.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["LOG-06", "LOG-07", "REL-01"],
  "expectedOutputs": ["tests/e2e/battle-log.spec.ts"],
  "validationCommands": ["npm run test:e2e -- tests/e2e/battle-log.spec.ts", "node scripts/check-budget.mjs"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A seeded solo battle shows a new log line after a card play and after a completed turn", "A mid-battle reload followed by Continue Run restores the same log history", "A duel privacy screen exposes no log or log toggle, and the active duel turn exposes only public entries", "The log drawer is keyboard operable at 375px without horizontal page scroll, and the desktop column is visible at 1280px"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-04", "docs/features/battle-log.md#LOG-FR-05", "docs/features/battle-log.md#LOG-FR-06", "docs/features/battle-log.md#LOG-FR-07", "docs/features/battle-log.md#LOG-NF-02", "docs/features/battle-log.md#LOG-NF-03", "docs/PRD.md#VIS-NFR-01", "docs/PRD.md#VIS-NFR-02", "docs/PRD.md#VIS-NFR-07"],
    "acceptanceCriteria": ["The solo spec plays one affordable card and asserts the latest region text contains that card's name and the acting player", "The solo spec opens the drawer with Enter, closes it with Escape, reloads mid-battle, resumes with Continue Run and asserts the same entry text is still present", "The duel spec asserts no log text or Log toggle exists while privacy is displayed, then after dismissal plays a card and asserts a public entry appears", "At 375x667 the document scrollWidth does not exceed innerWidth while the drawer is open and closed, and End Turn remains reachable", "At 1280x800 the log column is visible without opening a drawer", "The spec collects console errors and fails on any non-empty collection, and node scripts/check-budget.mjs still passes"],
    "constraints": ["Use the existing tests/e2e/helpers.ts journey helpers and the production dist served by playwright.config.ts", "Do not mock application modules or reach into controller state; assert user-visible text and roles", "Keep the long solo journey on Chromium; do not add a new Playwright project"],
    "constraintRefs": [],
    "references": ["docs/features/battle-log.md#4. User Stories", "docs/features/release-verification.md#4.1 E2E harness", "docs/features/release-verification.md#4.4 Responsive and accessibility checks"]
  }
}
```

```forge-task
{
  "id": "LOG-HR-1",
  "title": "Human review of battle-log readability and dialogue",
  "description": "Review the running static build at 390x844 and 1280x800. Complete a solo battle far enough to see player cards, an enemy turn, a field shift and a victory or defeat, and complete a duel turn after dismissing privacy. Judge whether the latest line makes the turn understandable without opening the drawer, whether the drawer is discoverable and keyboard operable, whether dialogue tone and frequency help rather than distract, and whether the duel log ever exposes hidden information. Record what was exercised, viewport sizes, and any gaps in docs/reviews/battle-log-review.json.",
  "dependencies": ["LOG-08"],
  "expectedOutputs": [],
  "validationCommands": [],
  "contract": {
    "version": 2,
    "kind": "human-review",
    "reviewFile": "docs/reviews/battle-log-review.json",
    "requirements": ["The reviewer completes the primary solo and duel journeys against the running production build", "The review judges readability, dialogue tone and frequency, drawer discoverability and duel privacy", "The review records what was exercised and any unresolved gaps"],
    "requirementRefs": ["docs/features/battle-log.md#LOG-FR-03", "docs/features/battle-log.md#LOG-FR-04", "docs/features/battle-log.md#LOG-FR-05", "docs/PRD.md#VIS-NFR-03"],
    "acceptanceCriteria": ["The reviewer completed a solo battle and a duel turn at 390x844 and 1280x800 against the built app", "The review states whether the latest line alone explained each turn and whether the drawer was discoverable without instruction", "The review states whether dialogue tone and frequency were acceptable and whether any line was confusing or repetitive", "The review confirms the duel privacy screen exposed no log, card name, health, field or intent information", "The review records what was exercised and any unresolved gaps in docs/reviews/battle-log-review.json"],
    "constraints": ["Do not approve from screenshots alone; the primary journeys must be completed against the running system", "Do not claim WCAG conformance or a formal accessibility audit", "Do not change implementation files during the review"],
    "constraintRefs": [],
    "references": ["docs/features/battle-log.md#4. User Stories", "docs/features/battle-log.md#5.6 Dialogue Triggers", "docs/reviews/v1-release-review.json"]
  }
}
```

---

## 10. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit | Entry derivation, validation, text rendering, dialogue selection | Pure Vitest suites with table-driven fixtures and explicit zero-delta and boundary cases. |
| Integration | Battle controller log, duel round log and privacy redaction, run save round-trip | Reducer and controller tests over the real engine; save tests with an injectable storage adapter. |
| Component | Latest strip, toggle, drawer, focus, ordered list and reduced motion | Testing Library render and interaction assertions without engine or content imports. |
| App integration | Solo and duel log reachable through `App` | Render `App`, navigate with the existing seams, play a card and end a turn. |
| E2E | Production build, reload, privacy and viewports | Playwright Chromium journey plus the existing budget check. |
| Human | Readability, dialogue tone, discoverability and privacy | One review at 390×844 and 1280×800 against the built app. |

Key test scenarios:

1. A player card that deals 5 damage produces one card entry with a damage effect of 5 and the opponent's remaining health; a card with no visible effect still produces one card entry.
2. An enemy turn with two planned cards produces two enemy card entries and one turn-handoff entry, in order.
3. A rejected unaffordable play appends no entry and leaves the previous latest line unchanged.
4. A field shift renders the new field, the empowered element and the countered element in words.
5. The same seed, ordinal and trigger always selects the same dialogue line; rendering does not change `rngState`.
6. A battle-phase save with 80 entries round-trips; an 81st entry drops the oldest; a malformed log leaves the battle resumable with an empty log.
7. A duel privacy view contains no log text, no card name and no Log toggle; the next active turn shows only public entries.
8. At 375px the drawer opens without horizontal page scroll and Escape returns focus to the toggle; at 1280px the column is visible.
9. The existing live region still announces exactly one sentence per settled transition and the log is not an `aria-live` region.

---

## 11. Rollback Considerations

- **New files:** `src/battle-log/*`, `src/content/battle-dialogue.ts`, `src/ui/components/BattleLog.tsx`, `src/styles/battle-log.css` and `tests/e2e/battle-log.spec.ts` can be removed without touching rules or content data.
- **Modified files:** revert the log additions in `src/state/battle-controller.ts`, `src/duel/round.ts`, `src/persistence/run-save.ts`, `src/state/run-controller.ts`, `src/state/resume-run.ts`, `src/ui/screens/BattleScreen.tsx` and `src/ui/screens/DuelBattleScreen.tsx`. The existing report, cue, announcement, privacy and save behavior must remain unchanged.
- **Persisted data:** `battleLog` is an additive optional field inside the existing `fieldbound.run.v1` payload. A rollback that stops writing it leaves old saves readable; a save written by this feature is still loadable by the previous code because unknown extra keys are ignored. No migration or key removal is required.
- **No data loss on rollback:** the battle snapshot, run state, rewards and stats keys are untouched. Only the log history disappears.
- **Regression tests:** the existing `battle-controller`, `duel/round`, `run-save`, `resume-run`, `App.battle`, `App.duel`, `App.a11y` and release-verification suites must pass before and after the rollback. `npm run typecheck`, `node scripts/check-budget.mjs` and the Playwright smoke suite remain the regression gate.

---

## 12. Acceptance Criteria

1. Every canonical `LOG-FR-01`–`LOG-FR-07` and `LOG-NF-01`–`LOG-NF-03` requirement is covered by a passing unit, integration, component, App or E2E check.
2. A settled player card, every telegraphed enemy plan step and every turn handoff produce exactly one entry; a rejected action produces none; the log is capped at 80 entries.
3. Factual lines name the actor, card and every non-zero effect, and dialogue is selected deterministically without reading or changing the engine PRNG.
4. Solo and duel battle screens show a latest-entry strip and an accessible drawer; the desktop column appears at 1024px and wider; the page has no horizontal scroll at 375px.
5. A duel privacy screen exposes no log, no log toggle and no hidden card, hand, health, field or intent information.
6. A solo battle log survives a settled-action save and Continue Run; a missing log restores empty; a malformed log is dropped without discarding the run or battle.
7. No new localStorage key, network request, telemetry or runtime dependency is introduced; the production initial JavaScript plus CSS stays at or below 300 KB gzip.
8. The existing single polite live announcement is unchanged and the log is not an `aria-live` region.
9. The human review records a completed solo and duel journey at phone and desktop sizes and finds the log readable, discoverable and privacy-safe.

---

## 13. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | How long should the log be? | Cap at 80 entries per battle; keep the latest line visible and drop the oldest entries. |
| 2 | Should the log record card draws, reshuffles and overdraw burns? | No; record public actions and their results only, so the duel cannot leak hidden draws. |
| 3 | Should the desktop log be open by default? | Yes; at 1024px and wider the history is a visible right-hand column, and the toggle is hidden. |
| 4 | Should old saves without a log show anything? | They resume with an empty log and start recording from the next settled action; no synthetic history is invented. |
| 5 | Should dialogue be localized or authored per language? | No; v1 remains English-only with bundled strings. |
| 6 | Should the log include the enemy's telegraphed intent? | No; it records only actions that resolved. The existing intent preview remains the place for planned actions. |
| 7 | Should the duel log persist across rounds? | No; each round starts a fresh log, and duels never persist to storage. |
| 8 | Should the log replace the live-region announcement? | No; the single polite summary remains, and the log is a separate labelled region. |
