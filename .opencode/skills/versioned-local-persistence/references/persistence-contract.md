# Persistence Contract

> Load when defining or changing a stored payload, the storage adapter, or the corruption and quota behavior.

## Keys

| Key | Owner | Contents | Write moment |
|-----|-------|----------|--------------|
| `fieldbound.run.v1` | Solo Run | seed, PRNG state, run state, optional battle snapshot, optional reward offer | Every settled action in a solo run |
| `fieldbound.settings.v1` | Game Shell | `schemaVersion`, `muted`, `reducedMotionOverride` (`boolean \| null`) | Immediately on each toggle |
| `fieldbound.stats.v1` | Solo Run | `schemaVersion`, furthest encounter, boss clears, fewest turns | Only when a run ends |

Duels write no key. Nothing is transmitted anywhere.

## Payload shapes

```json
{
  "schemaVersion": 1,
  "seed": 123456789,
  "rngState": { "state": 987654321 },
  "run": {
    "encounterIndex": 1,
    "element": "ember",
    "health": 28,
    "deck": ["ember-strike", "ember-ward"],
    "totalTurns": 9,
    "cardsAdded": 1,
    "damageTaken": 12,
    "phase": "battle"
  },
  "battle": { "schemaVersion": 1, "...": "BattleSnapshot" },
  "battleLog": [
    { "id": "t4-e17", "ordinal": 17, "turn": 4, "kind": "card", "actor": "player", "cardId": "ember-strike", "effects": [] }
  ],
  "reward": { "options": [{ "kind": "card", "cardId": "ember-strike" }, { "kind": "card", "cardId": "neutral-jab" }, { "kind": "heal", "amount": 12 }] }
}
```

`reward` and `battle` are both optional but never both absent while `phase` requires one of them. `settings` and `stats` are small flat objects with the same `schemaVersion` field.

## Additive optional fields

A feature may add an optional field inside an existing key without renaming the key or changing `schemaVersion`.

| Rule | Required behavior |
|------|-------------------|
| Missing field | Default it (`null` or empty) and load the rest of the payload |
| Field present but malformed | Drop only that field, keep the validated save |
| Field over its cap | Normalize to the newest N entries without renumbering |
| Field outside its phase | Normalize to `null` on serialization |
| Unknown extra fields | Ignore them; never fail the save because of a future addition |

`battleLog` follows this contract: optional, written only in the `battle` phase, capped at 80, and validated by the battle-log validator rather than by a second hand-rolled parser. A malformed log becomes `[]`; it never turns the whole run save into `discarded`.

## Validation matrix

| Key | Reject when |
|-----|-------------|
| run | `schemaVersion !== 1`; missing seed or rng state; `encounterIndex` outside 0-3; `health` outside 0-40; deck contains an unknown card id; battle snapshot fails the engine validator; reward options are not exactly three unique entries; `phase` is not a known value; `totalTurns`, `cardsAdded` or `damageTaken` is negative or non-integer |
| settings | `schemaVersion !== 1`; `muted` is not boolean; `reducedMotionOverride` is not boolean or `null` |
| stats | `schemaVersion !== 1`; furthest encounter outside 0-4; boss clears or fewest turns negative or non-integer |

Validation order: JSON parse, object shape, `schemaVersion`, field checks, cross-field checks. Nothing is returned until the whole chain passes.

An additive optional field is validated after the required fields have passed and is not allowed to fail the whole payload. The run-save validator therefore calls the battle-log validator on `battleLog` and substitutes `[]` on failure; `battleLog` is not part of the run rejection row above.

## Adapter shape

```ts
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageMode = "local" | "memory";
```

- Production adapter: wrap `window.localStorage`; on any throw during access, return `null` / no-op and flip the module to memory mode.
- Memory adapter: a `Map` with the same three methods; used by tests and as the runtime fallback.
- `setItem` failures never reject gameplay; they set the notice flag once.

## Failure matrix

| Situation | Behavior |
|-----------|----------|
| Key absent | Load defaults, no notice |
| JSON parse throws | Remove only this key, load defaults |
| Unknown `schemaVersion` | Remove only this key, load defaults |
| Field validation fails | Remove only this key, load defaults |
| `setItem` throws quota | Keep state in memory, show dismissible notice, continue |
| Storage access throws at boot | Memory mode for the session, show notice, no Continue Run |
| `removeItem` throws | Ignore the error, load defaults, never crash |

## Boot sequence

1. Create the adapter and record the mode.
2. Load settings; apply motion and mute defaults.
3. Load stats.
4. Load the run save; expose Continue Run only when it validated and mode is `local`.
5. Render the menu.

## Test checklist

- [ ] Round trip preserves seed, rng state, run state and battle snapshot byte-for-byte after JSON round trip.
- [ ] Corrupt JSON removes only the run key.
- [ ] `schemaVersion: 2` is discarded with defaults.
- [ ] A quota-throwing adapter keeps the session playable and sets the notice.
- [ ] A throwing-access adapter never throws out of `load`.
- [ ] Stats update once per run end, including a defeat.
- [ ] A battle-phase save round-trips `battleLog` in order; a missing field loads as `[]` and does not discard the save.
- [ ] A malformed `battleLog` drops to `[]` while `run`, `battle` and Continue Run survive.
- [ ] An 81-entry log reads back as the newest 80 entries with unchanged ordinals.
- [ ] `RUN_SAVE_SCHEMA_VERSION` remains `1` and no fourth localStorage key is read or written.
