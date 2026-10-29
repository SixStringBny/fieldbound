---
name: battle-log-and-deterministic-dialogue
description: "Implement and verify the bounded battle log: one entry per settled transition, 80-entry truncation that preserves ordinals, public-only duel entries, factual prose plus one locally hashed dialogue line, non-live presentation, and additive solo save and resume."
---

# Skill: Battle Log and Deterministic Dialogue

Use this skill when changing `src/battle-log/`, `src/content/battle-dialogue.ts`, the battle or duel controllers' log state, the `BattleLog` surface, or the `battleLog` field in the solo run save. It keeps derivation, prose, dialogue, privacy, persistence and accessibility from drifting apart across seven owners.

Load `references/battle-log-contract.md` when defining entry fields, wiring the 80-entry cap, adding a dialogue trigger, or checking what a duel view may expose.

---

## Process

### Step 1: Fix the entry shape before deriving anything

Define plain, JSON-safe types in `src/battle-log/types.ts`:

- `id` unique per battle (`"t3-e12"`), `ordinal` strictly increasing from 0, `turn` after the transition.
- `kind`: `battle-start`, `card` or `turn`; `actor`: `player`, `opponent` or `system`.
- `cardId` only on a `card` entry; take it from the played instance, never from prose.
- `effects`: an ordered list of `start`, `damage`, `heal`, `defense`, `status`, `field`, `outcome`, each carrying only values the engine already produced.

Every field must survive `JSON.stringify`/`JSON.parse`. No functions, class instances, `undefined` or `Date`.

**Output:** `types.ts` plus a type-level or round-trip test proving the payload is plain JSON.

### Step 2: Derive exactly one entry per settled transition

`deriveBattleLogEntry(before, after, context)` compares two `BattleState` values; it never re-runs damage, draw, affordability or status math.

- Create one `battle-start` entry at setup with the opening opposing maximum health and field.
- Create one `card` entry for every played card, including each telegraphed enemy plan step.
- Create one `turn` entry when control passes back to the player.
- Emit nothing for a rejected intent, a render, a React effect re-run or a log drawer toggle.
- Read deltas only: health lost, health healed, defense gained, status stacks added, `field` changed, `outcome` settled. Omit zero-value effects.

If a transition produced no observable delta, then emit no fact effect, not a synthetic "+0".

**Output:** derived entries plus table-driven tests for damage, heal, defense, status, field and outcome.

### Step 3: Cap at 80 without rewriting history

`appendBattleLog(entries, entry)` returns a new array and applies the cap after appending.

- Keep the newest 80 entries in chronological order and drop only the oldest.
- Preserve every surviving `ordinal` and `id`; never renumber on truncation.
- Key dialogue selection on `ordinal`, so dropping an old entry cannot change a surviving line.
- Have the validator normalize an untrusted 81-entry array to the last 80 the same way. Read path and write path must agree.

**Output:** cap tests at 80, 81 and 100 entries that assert surviving ordinals are unchanged.

### Step 4: Render facts and at most one dialogue line

`src/battle-log/text.ts` turns an entry plus the catalog, names and seed into strings.

- One factual English sentence names the actor, the card and every non-zero effect with remaining/maximum health or total defense.
- Name elemental matchups in words ("Ember is empowered; Frost is countered"), not as glyphs or raw ids.
- Select at most one dialogue line by hashing `(battle.seed, entry.ordinal, triggerTag)` locally in `src/content/battle-dialogue.ts`.
- Never call `Math.random`, `nextUint32` or `createRng`, and never read or write `BattleState.rngState`.
- Return `null` for an empty line set; render no fallback invented at runtime.
- Keep every line bundled English and at most 140 characters.

**Output:** factual and dialogue tests, including a frozen-state assertion that rendering leaves `rngState` and `outcome` unchanged.

### Step 5: Gate the duel log by the privacy boundary

Add `log` to `DuelRoundState`, but let `duelRoundView` decide what leaves the controller.

- `DuelPrivacyView` and `DuelRoundResultView` carry no `log` field and no log text.
- `DuelBattleView` carries the shared public entries only.
- Each round starts a fresh log with `ordinal` 0; duel logs are never persisted.
- A card entry may name only the card actually played. Never include hand contents, draws, deck order, intent, hidden energy or the other player's unplayed cards.
- Reset the log when the next round is created; do not carry it across the privacy handoff.

**Output:** round tests that serialize every view and search the privacy/result output for any entry or unplayed card id.

### Step 6: Persist the solo log additively

Add `battleLog` to `RunSaveV1` as optional and nullable.

- Write the exact bounded controller log in `battle` phase; write `null` in every other phase.
- Keep `RUN_SAVE_SCHEMA_VERSION` at `1` and the key at `fieldbound.run.v1`.
- A missing field restores `[]`. A malformed field drops only the log, never the run or battle snapshot.
- Validate with `validateBattleLog`; do not hand-roll a second parser in `run-save.ts`.
- Restore entries in order into the resumed controller through `initialLog`, without re-deriving or re-ordering.

**Output:** save, run-controller and resume-run tests for valid, missing, malformed and 81-entry payloads.

### Step 7: Present history without announcing it twice

Render the log as a labelled region containing an ordered list.

- Mount one visible latest-entry strip; no `aria-live` and no `role="log"` anywhere in the log surface.
- Provide a real 44px Log button with `aria-expanded`/`aria-controls`, Escape-to-close and focus return.
- At 1024px and wider, show the history as a right-hand column; below that, use the drawer.
- Keep the existing polite `describeBattleUpdate` announcement as the only announcement per settled transition.
- Feed the component pre-rendered `BattleLogLine[]`; it imports no engine, content, controller or storage module.

**Output:** `BattleLog` tests for semantics, focus, 44px target and absence of live attributes.

### Step 8: Verify in the production build

Add one Playwright journey against the production build.

- Solo: play a card, see the latest line name it, open with Enter, close with Escape, reload mid-battle, Continue Run, assert the history returns.
- Duel: privacy screen exposes no log or toggle; after dismissal the public entry appears.
- Layout: 375x667 has no page-level horizontal scroll; 1280x800 shows the column; console errors fail the run.
- Run `node scripts/check-budget.mjs` and keep the 300 KB gzip budget.

**Output:** `tests/e2e/battle-log.spec.ts` plus a passing budget check.

---

## Gotchas

- **One entry per engine call instead of per settled transition.** An enemy turn can execute several plan steps; each settled step gets an entry, but the rejected/refused branches get none. Counting reducer dispatches undercounts the enemy turn and counting renders duplicates everything.
- **Renumbering after the 80-entry cap.** If you rebuild ordinals as `0..79`, dialogue text changes after truncation. Keep the original ordinals and only slice the oldest entries.
- **Dialogue reading `rngState`.** Passing the engine PRNG into the picker couples presentation to shuffles. Hash seed, ordinal and trigger locally and leave the state untouched.
- **Dialogue keyed by array position.** Once the log is capped, the same entry sits at a different index and picks a different line. Use `ordinal`.
- **Privacy view built by spreading round state.** `{ ...state }` leaks the log into the privacy or result view. Project explicit view fields and assert the serialized view has no `log` key and no card ids outside the played card.
- **Duplicate live announcement.** Adding `aria-live` or `role="log"` repeats every event already spoken by `App.tsx`. The log is a labelled region, not a second live region.
- **A malformed log discarding the run.** A duplicate id, unknown effect or non-increasing ordinal must drop the log to `[]`; it must not make `loadRunSave` return `discarded` and cost Continue Run.
- **Saving the log outside battle phase.** A reward or result save with a stale log resurrects entries into a screen that should not show them. Normalize to `null` whenever `run.phase !== 'battle'`.
- **Prose computing a rule.** If the renderer subtracts health, caps defense or infers a draw, it can disagree with the engine. Format the effects the derivation already recorded.
- **Boss or enemy line sets missing a trigger.** A missing set silently yields no dialogue; cover all four enemies and the boss for battle-start, low-health, victory and defeat, and the narrator for field, first-blood, big-hit and low-health.
- **The log covering End Turn at 375px.** Reserve the strip height and make only the drawer scroll; the sticky control bar must stay reachable.

---

## Validation

Run this self-check after any battle-log change:

- [ ] `npm test -- src/battle-log/derive.test.ts src/battle-log/validate.test.ts src/battle-log/text.test.ts src/content/battle-dialogue.test.ts` passes.
- [ ] `npm test -- src/state/battle-controller.test.ts src/duel/round.test.ts` passes, including rejected-intent and privacy assertions.
- [ ] `npm test -- src/persistence/run-save.test.ts src/state/run-controller.test.ts src/state/resume-run.test.ts` passes for valid, missing, malformed and 81-entry logs.
- [ ] `npm test -- src/ui/components/BattleLog.test.tsx src/App.battle-log.test.tsx` passes.
- [ ] `npm run test:e2e -- tests/e2e/battle-log.spec.ts` passes and `node scripts/check-budget.mjs` still reports within budget.
- [ ] `grep -rnE 'aria-live|role="log"' src/ui/components/BattleLog.tsx` returns nothing; `grep -rn "Math.random" src/battle-log src/content/battle-dialogue.ts` returns nothing.
- [ ] A serialized duel privacy view and result view contain no `log` key and no unplayed card id.
- [ ] `RUN_SAVE_SCHEMA_VERSION` is still `1`, no fourth localStorage key exists, and a missing `battleLog` still resumes with an empty log.

If a check fails, load `references/battle-log-contract.md` and compare the failing layer against the entry, privacy, save or presentation contract before changing another module.
