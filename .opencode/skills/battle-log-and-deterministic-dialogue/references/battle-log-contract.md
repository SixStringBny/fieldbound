# Battle Log Contract

> Load when defining entry fields, wiring the 80-entry cap, adding a dialogue trigger, or deciding what a duel view may expose.

## Entry shape

```ts
export type BattleLogEntryKind = 'battle-start' | 'card' | 'turn';
export type BattleLogActor = 'player' | 'opponent' | 'system';

export type BattleLogEffect =
  | { kind: 'start'; opposingMaxHealth: number; field: Element }
  | { kind: 'damage'; target: 'player' | 'opponent'; amount: number; remaining: number; max: number }
  | { kind: 'heal'; target: 'player' | 'opponent'; amount: number; remaining: number; max: number }
  | { kind: 'defense'; target: 'player' | 'opponent'; amount: number; total: number }
  | { kind: 'status'; target: 'player' | 'opponent'; status: StatusName; stacks: number }
  | { kind: 'field'; previous: Element; next: Element }
  | { kind: 'outcome'; outcome: BattleOutcome };

export interface BattleLogEntry {
  readonly id: string;
  readonly ordinal: number;
  readonly turn: number;
  readonly kind: BattleLogEntryKind;
  readonly actor: BattleLogActor;
  readonly cardId?: string;
  readonly effects: readonly BattleLogEffect[];
}

export const BATTLE_LOG_LIMIT = 80;
```

Invariants:

- `ordinal` starts at 0 and increases by one per appended entry, including across a resume.
- `id` is stable and unique inside one battle (`t{turn}-e{ordinal}` is enough).
- A `card` entry always has a `cardId`; a `battle-start` or `turn` entry never does.
- Effects are emitted in the order the engine applied them.
- Zero-value damage, heal or defense is omitted; a status at zero stacks is omitted; an unchanged field is omitted.
- No effect stores a hidden hand, deck order, intent or card the actor did not play.

## Derivation matrix

Compare before/after `BattleState`:

| Change | Effect |
|--------|--------|
| Health decreased | `damage` with `amount`, `remaining`, `max` |
| Health increased | `heal` with `amount`, `remaining`, `max` |
| Defense increased | `defense` with `amount`, `total` |
| Status stacks increased | `status` with status name and new stack count |
| `field` changed | `field` with previous and next |
| `outcome` changed from `ongoing` | `outcome` |
| Setup transition | `start` with opposing max health and opening field |

Anything else produces no effect. Derivation may import engine types and frozen constants; it may not import React, DOM, storage, content prose or a controller.

## Cap and truncation

```ts
export function appendBattleLog(
  entries: readonly BattleLogEntry[],
  entry: BattleLogEntry,
): readonly BattleLogEntry[] {
  const next = [...entries, entry];
  return next.length <= BATTLE_LOG_LIMIT
    ? next
    : next.slice(next.length - BATTLE_LOG_LIMIT);
}
```

- Append then slice; never renumber.
- A validator normalizes an untrusted over-long array with the same slice.
- Tests must assert that an 81st entry removes `ordinal 0` and leaves `1..80` intact.
- Dialogue is keyed by `ordinal`, so the text of surviving entries is stable across truncation.

## Dialogue triggers

| Trigger tag | Applies to | Speaker | Cap |
|-------------|------------|---------|-----|
| `battle-start` | First entry | Enemy (solo), narrator (duel) | Once |
| `field-shift` | Entry with a `field` effect | Narrator | Once per entry |
| `first-blood` | First damage to the opponent | Narrator | Once per battle |
| `big-hit` | Damage of 6 or more to either side | Narrator | Once per entry |
| `low-health-player` | Player at 25% health or less | Narrator | Once per battle |
| `low-health-enemy` | Enemy at 25% health or less | Enemy | Once per battle |
| `victory` | Winning entry | Enemy or narrator | Once |
| `defeat` | Losing entry | Enemy or narrator | Once |

Every enemy id, including the boss, needs battle-start, low-health, victory and defeat sets. The narrator needs every non-enemy trigger. At most one dialogue line is rendered per entry.

## Dialogue picker

```ts
export function selectDialogueLine(
  seed: number,
  ordinal: number,
  triggerTag: string,
): string | null;
```

Rules:

- Pure function of exactly three inputs; same inputs, same line.
- Local 32-bit hash. No `Math.random`, no `nextUint32`, no `createRng`.
- `battle.seed` is the seed; `entry.ordinal` is the ordinal; the trigger table supplies the tag.
- Never read or write `battle.rngState`, and never add a row to the PRNG consumption table.
- Empty set returns `null`; no runtime fallback line.
- Lines are bundled English and at most 140 characters.

## Duel exposure

| View | `log` present | Allowed content |
|------|---------------|-----------------|
| `DuelPrivacyView` | No | Viewer, round, entering wins only |
| `DuelBattleView` | Yes | Played card ids, public damage/heal/defense/status/field/turn/outcome |
| `DuelRoundResultView` | No | Winner, round, entering wins only |

Rules:

- Project explicit view fields; never spread `DuelRoundState`.
- Each round starts a fresh log with `ordinal` 0.
- Never persist a duel log.
- A privacy or result view must contain no card id that was not played in public.

## Solo save

```json
{
  "schemaVersion": 1,
  "seed": 123456789,
  "rngState": { "state": 987654321 },
  "run": { "schemaVersion": 1, "phase": "battle" },
  "battle": { "schemaVersion": 1 },
  "battleLog": [
    { "id": "t4-e17", "ordinal": 17, "turn": 4, "kind": "card", "actor": "player", "cardId": "ember-strike", "effects": [] }
  ],
  "pendingReward": null
}
```

- `battleLog` is optional, written only in `battle` phase, and `null` in every other phase.
- `RUN_SAVE_SCHEMA_VERSION` stays `1`; no new localStorage key.
- Missing field -> `[]`. Malformed field -> `[]` while run and battle still load.
- More than 80 entries -> newest 80 with original ordinals.
- Resume passes the validated entries to the controller as `initialLog`; it does not re-derive them.

## Presentation contract

- One labelled region (for example `<section aria-label="Battle log">`) and one `<ol>`.
- One visible latest-entry strip with a stable accessible name.
- Toggle is a native `<button>` with `aria-expanded`/`aria-controls`, a visible text label and a 44x44 target.
- Escape closes the drawer and returns focus to the toggle.
- At 1024px and wider the history is a right-hand column; below 1024px it is a drawer.
- No `aria-live` and no `role="log"` in the log surface. The single polite announcement in `App.tsx` remains the only announcement.
- Reduced motion: entries appear instantly, with no transform or height animation.

## Verification checklist

- [ ] A fresh controller has one battle-start entry at ordinal 0.
- [ ] A player card and each enemy plan step append exactly one card entry; the handoff appends one turn entry.
- [ ] A rejected intent appends nothing and leaves sequence, report and cues unchanged.
- [ ] 81 entries leave the last 80 with original ordinals.
- [ ] Same seed and actions render identical text, and `rngState` is unchanged before and after rendering.
- [ ] Privacy and result views serialize with no log and no unplayed card id.
- [ ] A missing `battleLog` resumes with `[]`; a malformed one drops only the log.
- [ ] The log region has no live semantics, the toggle is 44px, Escape restores focus and the 1024px column is visible.
- [ ] The Playwright journey reloads mid-battle, resumes and sees the same history; the budget check passes.
