---
name: seeded-determinism-and-replay
description: "Apply the single 32-bit seeded PRNG, its serialized state and the fixed consumption order for shuffles, reward offers, enemy plans and round seeds so seeded runs, saves and browser journeys replay identically, while battle-log dialogue uses a separate pure hash that never touches the engine PRNG."
---

# Skill: Seeded Determinism and Replay

Use this skill whenever a Fieldbound change touches a random decision: deck setup, reshuffle, reward offers, AI tie-breaks, duel round seeds, the `?seed=` entry point or the PRNG state inside a save. It keeps one serializable PRNG as the only randomness source and preserves the consumption order that makes seeded runs reproducible in Vitest, Playwright and manual bug reports.

Load `references/rng-contract.md` when you are defining the state shape, adding a new consumer, or debugging a replay that diverges.

---

## Process

### Step 1: Confirm the single random source

`src/engine/rng.ts` owns `nextUint32`, `shuffle` and `serialize`/`restore`. If a second generator exists anywhere else, collapse it before adding features.

- If a consumer lives outside `src/engine` (a controller or screen), pass the seed or the drawn value in as an argument. Do not import the PRNG into React.
- If a choice has exactly one legal outcome, do not draw a value for it.

**Output:** one PRNG module, exported types, no second randomness source.

### Step 2: Acquire the seed at creation only

`src/persistence/seed.ts` reads `?seed=` for both modes:

- Accept only `/^\d+$/` values that fit an unsigned 32-bit integer.
- On absence or rejection, draw one value from `crypto.getRandomValues(new Uint32Array(1))`.
- Read the parameter once when a run or match is created. Resume, re-render and mid-run URL edits must not re-read it.

**Output:** `createSeed(search)` plus tests for accepted, rejected and missing values.

### Step 3: Consume the PRNG in the documented order

The order is: battle setup shuffle per side (player side first, then opponent), reshuffle when a draw pile empties at draw time, reward offer draws, AI tie-break draws, duel round-seed derivation, rematch seed. Load `references/rng-contract.md` for the exact table and the draw-count rules.

Decision rule for a new consumer: append it to the end of the table and update the reference plus affected expectations. Never insert a consumer ahead of an existing one, because every later seeded journey shifts.

**Output:** updated `rng.ts` call sites, updated order table, updated tests.

### Step 4: Persist and restore state, never re-derive it

- `RunSaveV1` and `BattleSnapshot` carry `seed` and `rngState`.
- Restore assigns the saved state directly; it must not call `createRng(seed)` or reseed from time or crypto.
- `DuelMatch` stores each round seed; rounds reset decks from the stored round seed.

**Output:** round-trip test proving a restored state continues the same sequence.

### Step 5: Prove replay end to end

```bash
npm test -- src/engine/rng.test.ts src/engine/snapshot.test.ts src/engine/self-play.test.ts
grep -rn "Math.random" src/engine
```

The grep must return no matches. If a replay test fails, then capture the seed and action log and diff the first divergent snapshot field. If that doesn't work, replay the recorded log action by action and compare the PRNG state after each action.

### Step 6: Keep presentation determinism off the engine PRNG

Battle-log dialogue is deterministic for the same seed and transitions, but it is not a PRNG consumer. Select a line with a pure hash of `(battle.seed, entry.ordinal, triggerTag)`:

- Pass the seed as a number; never read `battle.rngState`, never call `nextUint32`, `shuffle` or `createRng`.
- Keep the hash total and pure: same three inputs, same line; no `Math.random`, `Date.now`, locale or render-order input.
- Do not add a "dialogue" row to the consumption table. Doing so shifts every later seeded draw and breaks existing replay fixtures.
- Make dialogue stable per entry ordinal, not per surviving array index, so dropping an entry at the 80-entry cap never changes the text of the entries that remain.
- Carry the resulting text through the log renderer; the engine state and its `rngState` must be byte-identical before and after rendering.

**Output:** `selectDialogueLine(seed, ordinal, trigger)` plus a test that freezes `rngState` and asserts both repeatability and state immutability.

---

## Gotchas

- **Hidden `Date.now()` or `crypto` call in a shuffle.** Only the seed-creation path may use `crypto`; anything else makes the same seed produce different games and only fails under replay tests.
- **Conditional draws.** Drawing only for affordable cards, or drawing inside a React handler, makes the sequence depend on player choices. Draw a fixed count per documented event and discard the unused values.
- **Restore that reseeds.** Calling `createRng(seed)` on resume restarts the shuffle sequence, so the next hand after a reload silently differs from the uninterrupted run.
- **Duel round seeds that equal the match seed.** Derive each round seed from the match seed and a stable round index; round seeds must differ from the match seed and from each other.
- **`?seed=` applied mid-run.** A URL edit during a run must do nothing. Playwright and manual debugging depend on the seed staying fixed for the life of the run.
- **`parseInt` acceptance of `12abc`.** `parseInt` truncates and `Number("12abc")` is `NaN`; reject anything that fails the full-string pattern and the 32-bit bound.
- **Signed values leaking out of `nextUint32`.** Apply `>>> 0` before storing, serializing or comparing, or restored state stops matching after a JSON round trip.
- **Dialogue that "borrows" the engine PRNG.** Calling `nextUint32(battle.rngState)` to pick a line advances the sequence, so the next shuffle, reward or enemy plan changes even though the player did nothing but read the log. Hash local inputs instead and leave `rngState` untouched.
- **Dialogue keyed by array index.** Selecting with the entry's position in a capped log changes every line after the oldest entry is dropped; key on the immutable `ordinal`.
- **Hash input that includes time or render state.** A timestamp or component instance counter makes the same seed produce different lines across reloads and Playwright runs; restrict the input to seed, ordinal and trigger tag.

---

## Validation

Run this self-check after any change that touches randomness:

- [ ] `npm test -- src/engine/rng.test.ts src/engine/snapshot.test.ts` passes, and one seed produces the same 100-value sequence on repeat runs.
- [ ] `grep -rn "Math.random" src/engine` returns nothing.
- [ ] `npm test -- src/engine/self-play.test.ts` finishes 200 seeded AI-versus-AI battles within 100 turns.
- [ ] A save restored mid-battle draws the same next card as the uninterrupted run.
- [ ] Duel rounds 1-3 use three distinct seeds derived from the match seed.
- [ ] `?seed=12345` gives the same first hand twice; `?seed=abc` is ignored and a generated seed is used.
- [ ] Rendering the battle log twice with the same seed and entries returns identical text, and `BattleState.rngState` is unchanged.
- [ ] `grep -rnE "nextUint32|createRng|Math\\.random" src/battle-log src/content/battle-dialogue.ts` finds no dialogue path that consumes engine randomness.
- [ ] A 81-entry log truncated to 80 keeps the surviving entries' original ordinals and therefore their original dialogue lines.

If a check fails, load `references/rng-contract.md` for the replay-diff recipe before changing the generator.
