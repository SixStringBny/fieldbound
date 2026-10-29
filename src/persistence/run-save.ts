/**
 * Versioned solo-run save (RUN-FR-05, RUN-FR-06, RUN-FR-08, VIS-NFR-05,
 * VIS-NFR-06).
 *
 * One JSON payload lives under `fieldbound.run.v1` and is the only way a run
 * survives a reload:
 *
 *   {
 *     "schemaVersion": 1,
 *     "seed": 123456789,
 *     "rngState": { "state": 987654321 },
 *     "run": { "schemaVersion": 1, "element": "ember", "health": 28, ... },
 *     "battle": { "schemaVersion": 1, ... } | null,
 *     "pendingReward": [ ...three offers... ] | null
 *   }
 *
 * The seed is hoisted beside the PRNG state, exactly as the save contract
 * documents, so the nested run carries no second copy. The run PRNG state (not
 * just the seed) travels with the save: restoring only the seed would restart
 * the sequence and change the next reward draw (RUN-FR-08).
 *
 * What belongs in the payload
 * ---------------------------
 *
 *   - `battle` is required exactly when `run.phase` is `battle`; outside a fight
 *     it is null in the canonical payload. A battle-phase save without a
 *     snapshot is rejected rather than resumed as a fresh battle, because that
 *     would silently discard the player's hand, energy and enemy telegraph.
 *   - `pendingReward` is required exactly when `run.phase` is `reward`: without
 *     the three offers the reward screen cannot be restored, and the run cannot
 *     advance because a choice is mandatory.
 *   - an extra battle snapshot or offer list in another phase is ignored and
 *     normalized to null. The run phase is authoritative outside those two
 *     phases, and discarding an otherwise valid run for a redundant field would
 *     cost the player Continue Run for no safety gain.
 *
 * Validation order
 * ----------------
 *
 * JSON, object shape, top-level `schemaVersion`, seed, PRNG state, run state,
 * deck card ids, phase-specific battle/reward, and finally cross-field checks.
 * Nothing is reconstructed until the whole chain passes. The battle snapshot is
 * validated by the engine's own `restoreSnapshot` and the offers by the reward
 * module's `validateRewardOffers`; this module never re-implements either
 * parser (VIS-CON-08).
 *
 * Failure policy
 * --------------
 *
 *   - a corrupt, foreign or unknown-version payload removes only
 *     `fieldbound.run.v1` and yields no save; settings and stats are untouched;
 *   - missing or throwing storage is an `unavailable` status, never a crash;
 *   - a rejected write (quota, read-only) keeps the save in memory for the
 *     session and reports `unavailable`, so play continues and Continue Run is
 *     simply not offered after a reload.
 *
 * Storage arrives through an injectable adapter, so tests never touch the real
 * browser store. No React, screen or controller is imported here.
 */
import { byId as cardsById } from '../content/cards';
import type { CardCatalog } from '../engine/battle';
import { isValidRngState, serializeRng } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { restoreSnapshot, serializeSnapshot } from '../engine/snapshot';
import type { BattleSnapshot, BattleState } from '../engine/types';
import { validateRewardOffers } from '../run/rewards';
import type { RewardOffer } from '../run/rewards';
import { RUN_SCHEMA_VERSION, validateRunState } from '../run/run-model';
import type { RunState } from '../run/run-model';

/* -------------------------------------------------------------------------- */
/* Frozen key and version                                                      */
/* -------------------------------------------------------------------------- */

/** The one localStorage key this module owns. */
export const RUN_SAVE_STORAGE_KEY = 'fieldbound.run.v1';

/** Current save schema version. Any other value is foreign data. */
export const RUN_SAVE_SCHEMA_VERSION = 1 as const;

const UINT32_MAX = 0xffff_ffff;

/* -------------------------------------------------------------------------- */
/* Save shape                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The canonical in-memory and on-disk save.
 *
 * `run` is a full `RunState` (its `seed` repeats `seed` for the controller);
 * serialization writes the run without that nested copy, matching the save
 * contract. `battle` is the engine's versioned snapshot, never a live
 * `BattleState`, so the payload is plain JSON and contains no functions.
 */
export interface RunSaveV1 {
  readonly schemaVersion: typeof RUN_SAVE_SCHEMA_VERSION;
  /** Unsigned 32-bit seed fixed when the run was created. */
  readonly seed: number;
  /** Run PRNG state after the last consumed draw. */
  readonly rngState: RngState;
  readonly run: RunState;
  /** Required for a `battle`-phase run, null otherwise. */
  readonly battle: BattleSnapshot | null;
  /** Required for a `reward`-phase run, null otherwise. */
  readonly pendingReward: readonly RewardOffer[] | null;
}

export type RunSave = RunSaveV1;

/** The minimum storage surface this module needs; `Storage` satisfies it. */
export interface RunSaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Typed reasons a stored save can be rejected. Every value names the validation
 * step that failed, so a discarded save is diagnosable without exposing a raw
 * exception to the player.
 */
export type RunSaveErrorCode =
  | 'invalid-json'
  | 'invalid-save'
  | 'unknown-schema-version'
  | 'invalid-seed'
  | 'invalid-rng-state'
  | 'invalid-run'
  | 'unknown-card'
  | 'missing-battle-snapshot'
  | 'invalid-battle-snapshot'
  | 'missing-pending-reward'
  | 'invalid-pending-reward';

export interface RunSaveError {
  readonly code: RunSaveErrorCode;
  readonly message: string;
}

/**
 * A fully validated payload plus the engine battle it describes.
 *
 * `battle` is the restored `BattleState` for a `battle`-phase save and null for
 * every other phase; it is what Continue Run hands to the battle screen. The
 * restored state is produced by `restoreSnapshot`, not by a parallel parser.
 */
export interface ValidatedRunSave {
  readonly save: RunSaveV1;
  readonly battle: BattleState | null;
}

export interface RunSaveValid {
  readonly ok: true;
  readonly value: ValidatedRunSave;
}

export interface RunSaveInvalid {
  readonly ok: false;
  readonly error: RunSaveError;
}

/** Discriminated result for validation and parsing. */
export type RunSaveValidationResult = RunSaveValid | RunSaveInvalid;

/** Why a load produced the result it did. */
export type RunSaveLoadStatus = 'ok' | 'empty' | 'discarded' | 'unavailable';

/**
 * Discriminated load result.
 *
 *   - `ok`          a valid save was read; `save` and `battle` are usable
 *   - `empty`       no key was stored
 *   - `discarded`   the payload was corrupt/foreign and only the run key was
 *                   removed; `error` explains why
 *   - `unavailable` storage is missing or throws; a session save may still be
 *                   present from a failed write, but it is not durable and the
 *                   menu must not offer Continue Run
 *
 * Only `ok` may unlock Continue Run. Every other status still lets the player
 * start a new run.
 */
export interface RunSaveLoadResult {
  readonly status: RunSaveLoadStatus;
  /** Canonical save, or null when nothing resumable is available. */
  readonly save: RunSaveV1 | null;
  /** Restored battle for a `battle`-phase save, otherwise null. */
  readonly battle: BattleState | null;
  /** Set only when `status` is `discarded`. */
  readonly error: RunSaveError | null;
}

/** Why a write did or did not persist. */
export type RunSaveWriteStatus = 'saved' | 'unavailable' | 'invalid';

/**
 * Result of a save call. `saved` is exactly `status === 'saved'`; it is carried
 * separately so a controller can branch without widening the status type.
 * `unavailable` means the value is held in memory only (or was never built).
 */
export interface RunSaveWriteResult {
  readonly status: RunSaveWriteStatus;
  readonly saved: boolean;
  /** Set only when `status` is `invalid`. */
  readonly error: RunSaveError | null;
}

/* -------------------------------------------------------------------------- */
/* Validation primitives                                                       */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUint32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= UINT32_MAX
  );
}

/** True when the catalog owns the key, not merely the object prototype. */
function hasCard(catalog: CardCatalog, cardId: string): boolean {
  return Object.hasOwn(catalog, cardId);
}

function invalid(code: RunSaveErrorCode, message: string): RunSaveInvalid {
  return { ok: false, error: { code, message } };
}

/**
 * Reads the serialized PRNG state.
 *
 * The canonical form is the engine's `RngState` object (`{ "state": n }`).
 * The save-contract example writes the bare integer; accepting it and
 * canonicalizing to `{ state }` keeps that documented sample loadable without
 * introducing a second runtime shape. Anything else is a typed rejection.
 */
function readRngState(value: unknown): RngState | null {
  if (isValidRngState(value)) {
    return serializeRng(value);
  }

  if (isUint32(value)) {
    return { state: value };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Validates an untrusted save value and returns a canonical payload plus the
 * restored battle state.
 *
 * Total: every failure is a typed `RunSaveError`, no exception escapes, and no
 * partially reconstructed save is returned. Unknown extra keys inside objects
 * are ignored, so a future additive field cannot invalidate today's payload.
 *
 * The battle snapshot is validated against the supplied catalog (the bundled
 * card catalog by default), which is also what catches a deck card id that no
 * longer exists. `run` is validated by the run model after the hoisted seed is
 * injected, because the serialized run intentionally has no seed of its own.
 */
export function validateRunSave(
  input: unknown,
  catalog: CardCatalog = cardsById,
): RunSaveValidationResult {
  if (!isRecord(catalog)) {
    return invalid(
      'invalid-save',
      'the card catalog must be an object keyed by card id',
    );
  }

  if (!isRecord(input)) {
    return invalid('invalid-save', 'the run save must be a plain object');
  }

  if (input['schemaVersion'] !== RUN_SAVE_SCHEMA_VERSION) {
    return invalid(
      'unknown-schema-version',
      `run save schemaVersion must be ${String(RUN_SAVE_SCHEMA_VERSION)}, received ${String(input['schemaVersion'])}`,
    );
  }

  const seed = input['seed'];

  if (!isUint32(seed)) {
    return invalid(
      'invalid-seed',
      `seed must be an unsigned 32-bit integer, received ${String(seed)}`,
    );
  }

  const rngState = readRngState(input['rngState']);

  if (rngState === null) {
    return invalid(
      'invalid-rng-state',
      'rngState must hold an unsigned 32-bit integer in `state`',
    );
  }

  const rawRun = input['run'];

  if (!isRecord(rawRun)) {
    return invalid('invalid-run', 'run must be a plain object');
  }

  // The in-memory save repeats the hoisted seed on the run. A disagreement can
  // only come from a hand-built payload, so it is rejected rather than silently
  // choosing one of the two seeds. The wire form omits the nested seed.
  if ('seed' in rawRun && rawRun['seed'] !== seed) {
    return invalid(
      'invalid-save',
      `run.seed ${String(rawRun['seed'])} conflicts with the saved seed ${String(seed)}`,
    );
  }

  const runResult = validateRunState({ ...rawRun, seed });

  if (!runResult.ok) {
    return invalid(
      'invalid-run',
      `run.${runResult.error.code}: ${runResult.error.message}`,
    );
  }

  const run = runResult.value;

  for (const cardId of run.deck) {
    if (!hasCard(catalog, cardId)) {
      return invalid(
        'unknown-card',
        `run.deck references card id "${cardId}", which is not in the catalog`,
      );
    }
  }

  let battleState: BattleState | null = null;
  let battleSnapshot: BattleSnapshot | null = null;

  if (run.phase === 'battle') {
    const rawBattle = input['battle'];

    if (rawBattle === undefined || rawBattle === null) {
      return invalid(
        'missing-battle-snapshot',
        'a battle-phase run save must include the battle snapshot',
      );
    }

    const restored = restoreSnapshot(rawBattle, catalog);

    if (!restored.ok) {
      return invalid(
        'invalid-battle-snapshot',
        `battle.${restored.error.code}: ${restored.error.message}`,
      );
    }

    battleState = restored.value;
    battleSnapshot = serializeSnapshot(restored.value);
  }

  let pendingReward: readonly RewardOffer[] | null = null;

  if (run.phase === 'reward') {
    const rawReward = input['pendingReward'];

    if (rawReward === undefined || rawReward === null) {
      return invalid(
        'missing-pending-reward',
        'a reward-phase run save must include the three pending offers',
      );
    }

    const offers = validateRewardOffers(rawReward, run.element);

    if (!offers.ok) {
      return invalid(
        'invalid-pending-reward',
        `pendingReward.${offers.error.code}: ${offers.error.message}`,
      );
    }

    pendingReward = offers.value;
  }

  return {
    ok: true,
    value: {
      save: {
        schemaVersion: RUN_SAVE_SCHEMA_VERSION,
        seed,
        rngState,
        run,
        battle: battleSnapshot,
        pendingReward,
      },
      battle: battleState,
    },
  };
}

/**
 * Parses a raw stored string and validates it. `invalid-json` is distinguished
 * from a shape/version failure so a discard is diagnosable; both remove only
 * the run key at the load boundary.
 */
export function parseStoredRunSave(
  raw: string,
  catalog: CardCatalog = cardsById,
): RunSaveValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid('invalid-json', 'the stored run save is not valid JSON');
  }

  return validateRunSave(parsed, catalog);
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Writes the canonical payload. Property order is part of the contract: it
 * follows docs/features/solo-run.md section 4.3.
 *
 * This function expects a validated save (as returned by `validateRunSave`);
 * `saveRunSave` and the store validate first, so a write never serializes
 * untrusted input. The nested run omits `seed` because it is hoisted at the top
 * level, and the battle snapshot is re-serialized through the engine so its
 * shape is exactly `BattleSnapshot`.
 */
export function serializeRunSave(save: RunSaveV1): string {
  return JSON.stringify({
    schemaVersion: RUN_SAVE_SCHEMA_VERSION,
    seed: save.seed,
    rngState: serializeRng(save.rngState),
    run: {
      schemaVersion: RUN_SCHEMA_VERSION,
      element: save.run.element,
      health: save.run.health,
      deck: [...save.run.deck],
      encounterIndex: save.run.encounterIndex,
      turnsTotal: save.run.turnsTotal,
      cardsAdded: save.run.cardsAdded,
      damageTaken: save.run.damageTaken,
      phase: save.run.phase,
    },
    battle: save.battle === null ? null : serializeSnapshot(save.battle),
    pendingReward:
      save.pendingReward === null
        ? null
        : save.pendingReward.map((offer) =>
            offer.kind === 'heal'
              ? { kind: 'heal', amount: offer.amount }
              : { kind: 'card', cardId: offer.cardId },
          ),
  });
}

/* -------------------------------------------------------------------------- */
/* Load, save and clear helpers                                                */
/* -------------------------------------------------------------------------- */

function loadResult(
  status: RunSaveLoadStatus,
  save: RunSaveV1 | null,
  battle: BattleState | null,
  error: RunSaveError | null,
): RunSaveLoadResult {
  return { status, save, battle, error };
}

function writeResult(
  status: RunSaveWriteStatus,
  error: RunSaveError | null = null,
): RunSaveWriteResult {
  return { status, saved: status === 'saved', error };
}

/**
 * Read the save from an adapter.
 *
 * A corrupt or foreign payload removes only `fieldbound.run.v1` and returns
 * `discarded` with no save; a missing adapter or a throwing read returns
 * `unavailable`. Never throws, and never touches the settings or stats keys.
 */
export function loadRunSave(
  storage: RunSaveStorage | null,
  catalog: CardCatalog = cardsById,
): RunSaveLoadResult {
  if (storage === null) {
    return loadResult('unavailable', null, null, null);
  }

  let raw: string | null;

  try {
    raw = storage.getItem(RUN_SAVE_STORAGE_KEY);
  } catch {
    return loadResult('unavailable', null, null, null);
  }

  if (raw === null) {
    return loadResult('empty', null, null, null);
  }

  const parsed = parseStoredRunSave(raw, catalog);

  if (!parsed.ok) {
    try {
      storage.removeItem(RUN_SAVE_STORAGE_KEY);
    } catch {
      // A storage that cannot remove is also a storage that cannot persist;
      // the save is still unusable, so the caller keeps the discard result.
    }

    return loadResult('discarded', null, null, parsed.error);
  }

  return loadResult(
    'ok',
    parsed.value.save,
    parsed.value.battle,
    null,
  );
}

/**
 * Validate and write the save through an adapter.
 *
 * Validation happens first, so invalid data can never overwrite a good save.
 * A missing adapter or a rejected write (quota, read-only) returns
 * `unavailable`; the caller should keep playing with the in-memory run rather
 * than treating it as fatal.
 */
export function saveRunSave(
  storage: RunSaveStorage | null,
  save: RunSaveV1,
  catalog: CardCatalog = cardsById,
): RunSaveWriteResult {
  const validated = validateRunSave(save, catalog);

  if (!validated.ok) {
    return writeResult('invalid', validated.error);
  }

  if (storage === null) {
    return writeResult('unavailable');
  }

  try {
    storage.setItem(
      RUN_SAVE_STORAGE_KEY,
      serializeRunSave(validated.value.save),
    );
    return writeResult('saved');
  } catch {
    return writeResult('unavailable');
  }
}

/**
 * Remove the run key. Returns false when there is no usable storage or the
 * removal throws; the caller's in-memory run is unaffected either way. Only the
 * run key is touched.
 */
export function clearRunSave(storage: RunSaveStorage | null): boolean {
  if (storage === null) {
    return false;
  }

  try {
    storage.removeItem(RUN_SAVE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

/** Resolve `window.localStorage`; private-mode accessors can throw. */
function resolveDefaultStorage(): RunSaveStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface RunSaveStore {
  /** Read the durable save, falling back to a session value when necessary. */
  load(): RunSaveLoadResult;
  /** Validate and persist. A failed write keeps the value in memory. */
  save(save: RunSaveV1): RunSaveWriteResult;
  /** Remove the stored save and the session copy. */
  clear(): boolean;
  /** True while writes reach the browser's Storage. */
  readonly isPersistent: boolean;
}

/**
 * Create a run-save store. Pass an adapter in tests, or `null` to simulate a
 * browser with no usable storage; omit it for production.
 *
 * The store keeps the last validated value in memory. That is what makes a
 * quota failure survivable: `save` reports `unavailable`, `isPersistent`
 * becomes false, and the session continues with the in-memory run. `load`
 * reports `unavailable` alongside that value so no caller mistakes it for a
 * durable save and offers Continue Run after a reload.
 */
export function createRunSaveStore(
  storage?: RunSaveStorage | null,
  catalog: CardCatalog = cardsById,
): RunSaveStore {
  const resolvedStorage =
    storage === undefined ? resolveDefaultStorage() : storage;

  let persistent = resolvedStorage !== null;
  /** Last validated value, so a failed write still leaves the session usable. */
  let memory: ValidatedRunSave | null = null;

  function fromMemory(status: RunSaveLoadStatus): RunSaveLoadResult {
    if (memory === null) {
      return loadResult(status, null, null, null);
    }

    return loadResult(status, memory.save, memory.battle, null);
  }

  function load(): RunSaveLoadResult {
    if (resolvedStorage === null) {
      persistent = false;
      return fromMemory('unavailable');
    }

    let raw: string | null;

    try {
      raw = resolvedStorage.getItem(RUN_SAVE_STORAGE_KEY);
    } catch {
      persistent = false;
      return fromMemory('unavailable');
    }

    if (raw === null) {
      // A value written to memory after a quota failure is still resumable in
      // this session, but a reload would lose it, so it is not `ok`.
      return memory === null
        ? loadResult('empty', null, null, null)
        : fromMemory('unavailable');
    }

    const parsed = parseStoredRunSave(raw, catalog);

    if (!parsed.ok) {
      memory = null;

      try {
        resolvedStorage.removeItem(RUN_SAVE_STORAGE_KEY);
      } catch {
        persistent = false;
      }

      return loadResult('discarded', null, null, parsed.error);
    }

    memory = parsed.value;
    return loadResult(
      'ok',
      parsed.value.save,
      parsed.value.battle,
      null,
    );
  }

  function save(save: RunSaveV1): RunSaveWriteResult {
    const validated = validateRunSave(save, catalog);

    if (!validated.ok) {
      return writeResult('invalid', validated.error);
    }

    memory = validated.value;

    if (resolvedStorage === null) {
      persistent = false;
      return writeResult('unavailable');
    }

    try {
      resolvedStorage.setItem(
        RUN_SAVE_STORAGE_KEY,
        serializeRunSave(validated.value.save),
      );
      return writeResult('saved');
    } catch {
      persistent = false;
      return writeResult('unavailable');
    }
  }

  function clear(): boolean {
    memory = null;

    if (resolvedStorage === null) {
      persistent = false;
      return false;
    }

    try {
      resolvedStorage.removeItem(RUN_SAVE_STORAGE_KEY);
      return true;
    } catch {
      persistent = false;
      return false;
    }
  }

  return {
    load,
    save,
    clear,
    get isPersistent() {
      return persistent;
    },
  };
}
