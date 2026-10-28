---
name: versioned-local-persistence
description: "Implement the three versioned Fieldbound localStorage keys with validate-before-use, discard-only-the-affected-key, injectable storage adapters and in-memory fallback when storage is full or unavailable."
---

# Skill: Versioned Local Persistence

Use this skill when reading or writing any Fieldbound browser state: `fieldbound.run.v1`, `fieldbound.settings.v1` or `fieldbound.stats.v1`. It fixes the validation order, the narrow discard rule, the adapter seam for tests and the degradation path when storage is full, blocked or absent.

Load `references/persistence-contract.md` when defining or changing a payload shape, the storage adapter, or the corruption and quota behavior.

---

## Process

### Step 1: Define the storage adapter seam

Create one adapter with `getItem`, `setItem` and `removeItem`, typed as returning `string | null`. Production wraps `window.localStorage` in `try/catch`; tests inject an in-memory map.

- If storage access throws at boot, switch to a module-level `Map` fallback and set a flag the UI can read.
- Expose the active mode (`"local" | "memory"`) so the app can show the non-blocking storage notice.

**Output:** `src/persistence/storage.ts` plus adapter tests covering throw-on-access and throw-on-write.

### Step 2: Parse, then validate, then use

Every key follows the same sequence:

1. `getItem(key)`; `null` means defaults.
2. `JSON.parse` inside `try/catch`; a throw means discard.
3. Reject a non-object, an unknown `schemaVersion`, or a payload that fails its field checks.
4. Only then return a typed value.

Payload checks are specific, not `typeof x === "object"`: run encounter in 0-3, health 0-40, deck holds known card ids, battle snapshot passes the engine validator, reward offer holds exactly three unique ids, stats counters are non-negative integers. Load `references/persistence-contract.md` for the full field matrix.

**Output:** one module per key with `load`, `save` and `clear`, each returning a typed result.

### Step 3: Apply the failure policy per key

- Corrupt, foreign or unknown-version data: `removeItem` only that key, return defaults, render no error dialog.
- Storage unavailable or quota exceeded on write: keep the session in memory, keep playing, show one dismissible notice.
- Never throw from a persistence call into a controller or screen.

Decide by failure type: if a payload fails validation, then remove only that key and load defaults; if the write throws, then keep the session in memory and set the notice. A failed write must not roll back gameplay state, and a failed read must not clear the other two keys.

**Output:** failure-path tests for corrupt JSON, unknown version, quota and unavailable storage.

### Step 4: Write at settled boundaries only

| Key | Write moment |
|-----|--------------|
| `fieldbound.run.v1` | After each settled action: card play, end turn, reward choice, encounter start, run end |
| `fieldbound.settings.v1` | Immediately on each toggle |
| `fieldbound.stats.v1` | Only when a run ends, never per action |

Replace the whole snapshot on each run write. Do not append, and do not write inside a render or an effect that can run twice.

**Output:** a save call at each boundary and no save call anywhere else.

### Step 5: Order the boot reads and gate Continue Run

Read settings first, then stats, then the run save. Offer Continue Run only when the run key validated and storage is in `local` mode. If the run key was discarded, the menu renders without Continue Run and without an error dialog.

**Output:** boot sequence plus an App-level test for valid, corrupt and absent saves.

### Step 6: Verify the narrow discard rule by hand

Corrupt exactly one key in DevTools, reload, and confirm the other two keys survive with their values intact. Repeat with storage blocked in a private window and confirm play continues with the notice. If a browser refuses to block storage this way, inject the throwing adapter in a unit test instead.

---

## Gotchas

- **Clearing the whole store on one bad key.** `localStorage.clear()` deletes settings and stats as well; remove only the failing key and keep the other two.
- **Quota failures only surface on write.** `localStorage.getItem` succeeds in private windows while `setItem` throws `QuotaExceededError` (code 22, Firefox `NS_ERROR_DOM_QUOTA_REACHED`). Wrap the write, not just the read.
- **`JSON.parse(null)` returns `null`, it does not throw.** Guard the `null` from `getItem` before parsing and reject the parsed `null` value explicitly.
- **The `.v1` key suffix is not validation.** A key named `.v1` can still hold `schemaVersion: 2` or no version at all; compare the payload field and discard on mismatch.
- **React StrictMode double effects.** A stats update or save inside an effect that runs twice inflates counters or rewrites the same snapshot. Make the write idempotent and derive it from settled state.
- **JSON silently drops `undefined`, functions and `Date`.** Serialize plain data only; a `Date` becomes a string and a missing field becomes absent, which the validator must catch.
- **Offering Continue Run from memory fallback.** The in-memory session survives navigation but not reload, so the menu must not promise a resume it cannot deliver.
- **jsdom tests sharing one store.** Tests that do not clear or inject a fresh adapter leak saves into each other and pass in isolation only.

---

## Validation

Run this self-check after any persistence change:

- [ ] `npm test -- src/persistence` passes, including corrupt JSON, unknown version, quota and unavailable-storage cases.
- [ ] Corrupting `fieldbound.run.v1` by hand removes only that key; settings and stats still load.
- [ ] Toggling Sound and Reduce motion survives a remount, and the app root keeps the persisted motion value.
- [ ] A mid-battle reload restores the exact hand, energy, health, field and enemy plan.
- [ ] `fieldbound.stats.v1` changes only when a run ends, and repeats of the same run do not double-count.
- [ ] With storage blocked, play continues, one notice appears and nothing throws.

If a check fails, load `references/persistence-contract.md` and compare the payload against the field matrix before adjusting the validator.
