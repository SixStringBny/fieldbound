# PRNG Contract and Replay Recipe

> Load when defining the PRNG state shape, adding a random consumer, or debugging a seeded replay that diverges.

## State shape

The PRNG is a small serializable 32-bit generator. Freeze one algorithm for v1 and version any later change.

```ts
export interface RngState {
  /** Unsigned 32-bit internal state; always stored with >>> 0. */
  state: number;
}

export interface Rng {
  nextUint32(): number;
  shuffle<T>(items: readonly T[]): T[];
  serialize(): RngState;
}

export function createRng(seed: number): Rng;
export function restoreRng(state: RngState): Rng;
```

Rules:

- No runtime dependency for randomness; no `Math.random` anywhere under `src/engine`.
- `shuffle` is a Fisher-Yates permutation over the supplied array and consumes exactly `n - 1` draws.
- `serialize()` returns a plain object that survives JSON. It contains no functions.
- Changing the algorithm invalidates saved sequences, so a change requires a snapshot schema version bump and a PRD change, not an in-place edit.

## Consumption order

Consumers run in this fixed order. The count is per event, not per successful outcome.

| # | Event | Draws | When |
|---|-------|-------|------|
| 1 | Battle setup shuffle, player side | `deck.length - 1` | Battle or round creation |
| 2 | Battle setup shuffle, opponent side | `deck.length - 1` | Immediately after the player side |
| 3 | Discard reshuffle | `discard.length - 1` | At draw time, only when the draw pile is empty |
| 4 | Reward offer | 3 unique card ids, retried on duplicates | Reward generation after a normal-encounter win |
| 5 | AI tie-break | 1 per true tie | Only when priority, damage-per-energy and card id ordering leave a tie |
| 6 | Round seed derivation | 1 per round | Duel round creation, keyed by round index |
| 7 | Rematch seed | 1 | Rematch action only |

Ordering rules:

- A new consumer is appended after #7 and documented here; inserting earlier shifts every recorded seed.
- Draw counts stay constant per event. If the third reward slot becomes `Heal 12` at health below 20, the three draws still happen and the third result is discarded.
- Ties are broken by card id before any draw. The draw only resolves identical priority and value.
- UI code never draws. It receives state that already contains the result.

## Presentation hash (outside the PRNG)

Battle-log dialogue is deterministic but is not a PRNG consumer. Use a pure 32-bit hash of exactly three values:

| Input | Source | Rule |
|-------|--------|------|
| `seed` | `battle.seed` | Unsigned 32-bit integer fixed at battle or round creation |
| `ordinal` | `BattleLogEntry.ordinal` | Assigned when the entry is created; survives truncation |
| `triggerTag` | Trigger table | Stable ASCII tag such as `"field-shift"` or `"big-hit"` |

Rules:

- The picker returns a line from the trigger's authored set; it returns no state and advances nothing.
- Never pass `battle.rngState` as an input. Reading it is harmless; mutating or consuming it is not, and a helper that accepts the state invites both.
- Never add this hash to the consumption table above. Its draw count is zero for every event.
- The hash must be locally implemented in `src/content/battle-dialogue.ts`; importing `nextUint32` or `createRng` is a review failure even if the returned state is discarded.
- Hashing the ordinal, not the array index, keeps a truncated log's surviving lines unchanged.
- If the authored set is empty, return `null` and render no dialogue line rather than a fallback chosen at runtime.

A minimal, frozen shape:

```ts
export function selectDialogueLine(
  seed: number,
  ordinal: number,
  triggerTag: string,
): string | null {
  const lines = DIALOGUE[triggerTag] ?? [];
  if (lines.length === 0) return null;

  let hash = seed >>> 0;
  hash = (hash ^ (ordinal >>> 0)) >>> 0;
  for (let i = 0; i < triggerTag.length; i += 1) {
    hash = Math.imul(hash ^ triggerTag.charCodeAt(i), 0x0100_0193) >>> 0;
  }
  return lines[hash % lines.length] ?? null;
}
```

The exact constants are a project choice; the invariants are not. Freeze the picker for v1, because changing it rewrites every recorded log's dialogue without changing a single battle rule.

## Seed rules

| Input | Result |
|-------|--------|
| `?seed=0` | valid, seed 0 |
| `?seed=4294967295` | valid |
| `?seed=4294967296` | rejected, generated seed |
| `?seed=-1`, `?seed=1.5`, `?seed=12abc`, `?seed=` | rejected, generated seed |

- Read the parameter only at run or match creation.
- Generated seeds come from `crypto.getRandomValues(new Uint32Array(1))[0]`.
- Store the seed in `RunSaveV1.seed` and in `DuelMatch`; store the live state in `rngState`.
- Rematch deliberately creates a new seed while keeping both locked decks.

## Snapshot and save fields

`BattleSnapshot` must include `schemaVersion`, every mutable battle field and `rngState`. Restore rejects:

- unknown `schemaVersion`
- card ids missing from the supplied catalog
- duplicate card instance ids
- counts above the deck or hand limits
- a missing or non-numeric `rngState`

Validation happens before any state is returned. The module never touches browser storage.

## Replay diff recipe

1. Record the seed and the ordered action log (`play-card(cardId)`, `end-turn`, `choose-reward(id)`).
2. Run the log twice from the same seed and compare snapshots after each action.
3. The first divergent action points at the consumer: a draw happened in one path and not the other, or the order table was not followed.
4. Inspect the PRNG state in the divergent snapshot. An equal state with different cards means a stale hand/deck ordering, not an RNG bug.
5. If restore is involved, confirm restore assigns `rngState` and never calls `createRng`.
6. Re-run `npm test -- src/engine/self-play.test.ts` after the fix; a single repaired path frequently shifts another consumer.
