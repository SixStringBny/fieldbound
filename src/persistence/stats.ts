/**
 * Persisted best-run record (RUN-FR-07, VIS-NFR-05, VIS-NFR-06).
 *
 * One local record lives under `fieldbound.stats.v1` and remembers how far the
 * player has reached:
 *
 *   - `furthestEncounter`  highest ladder step reached, 0 when no run has
 *                          ended yet and 1..4 once one has;
 *   - `bossClears`         completed (boss-clearing) runs;
 *   - `bestCompletedTurns` fewest total turns across completed runs, or null.
 *
 * The record is a summary, never a save. It changes exactly once, when a run
 * ends in victory or defeat, and an abandoned run can therefore never inflate
 * it. `applyRunToStats` is the pure update; `updateStatsForRun` refuses a run
 * that has not ended, and the store only writes at that same point.
 *
 * `bestCompletedTurns` tracks completed runs only: a defeat contributes its
 * furthest encounter but cannot claim a turn record, because it never cleared
 * the ladder.
 *
 * Storage rules:
 *
 *   - this module is the only code allowed to touch the stats key;
 *   - `fieldbound.run.v1` and `fieldbound.settings.v1` are never read or
 *     written here;
 *   - a payload is validated against `schemaVersion` before use; corrupt JSON,
 *     a foreign shape or an unknown version discards only this key and falls
 *     back to the empty record, without throwing;
 *   - numbers that are valid JSON but outside the documented range are clamped
 *     on read rather than rejected, and nothing is written until the next run
 *     ends;
 *   - when storage is missing, throws or rejects a write, the store keeps the
 *     record in memory for the session and reports that it did not persist.
 *
 * The store takes an injectable adapter, so tests exercise every failure path
 * without touching the real browser store. No React, screen or engine import
 * is allowed here; the run model is imported read-only for its summary.
 */
import { RUN_ENCOUNTER_COUNT, runSummary } from '../run/run-model';
import type { RunState, RunSummary } from '../run/run-model';

/* -------------------------------------------------------------------------- */
/* Frozen record shape                                                         */
/* -------------------------------------------------------------------------- */

/** The one localStorage key this module owns. */
export const STATS_STORAGE_KEY = 'fieldbound.stats.v1';

/** Current schema version. A mismatch is treated as foreign data. */
export const STATS_SCHEMA_VERSION = 1 as const;

/** Furthest encounter can never exceed the documented four-step ladder. */
export const STATS_MAX_ENCOUNTERS = RUN_ENCOUNTER_COUNT;

/**
 * A completed run always used at least one turn. A reported total below this
 * is impossible and is repaired to the minimum instead of storing a best that
 * no later run could ever beat.
 */
export const STATS_MIN_COMPLETED_TURNS = 1;

/** One local best-run record. */
export interface StatsV1 {
  readonly schemaVersion: typeof STATS_SCHEMA_VERSION;
  /** 0 = no run recorded yet, otherwise 1..`STATS_MAX_ENCOUNTERS`. */
  readonly furthestEncounter: number;
  /** Number of completed (boss-clearing) runs. */
  readonly bossClears: number;
  /** Fewest turns across completed runs, or null before the first clear. */
  readonly bestCompletedTurns: number | null;
}

export type Stats = StatsV1;

/**
 * The record before any run has ended. It is intentionally not written to
 * storage just because the app booted; the key only appears once a run ends.
 */
export const EMPTY_STATS: Stats = Object.freeze({
  schemaVersion: STATS_SCHEMA_VERSION,
  furthestEncounter: 0,
  bossClears: 0,
  bestCompletedTurns: null,
});

/** The minimum storage surface this module needs; `Storage` satisfies it. */
export interface StatsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Why a read produced the record it did. */
export type StatsLoadStatus = 'ok' | 'empty' | 'discarded' | 'unavailable';

/**
 * Discriminated load result. Every branch carries a usable record, so callers
 * can render the record without re-checking; the status only explains why the
 * value is what it is.
 *
 *   - `ok`          a valid record was read
 *   - `empty`       no key was stored (or it was never written)
 *   - `discarded`   the stored value was corrupt/foreign and only this key
 *                   was removed
 *   - `unavailable` storage is missing or throws; the in-memory value is used
 */
export interface StatsLoadResult {
  readonly status: StatsLoadStatus;
  readonly stats: Stats;
}

/** Result of folding one finished run into the record. */
export interface StatsUpdate {
  readonly stats: Stats;
  /**
   * True when this run improved any field: a deeper encounter, another boss
   * clear, or a faster completion. A defeat that matches or trails the record
   * is false.
   */
  readonly isNewBest: boolean;
}

/** Result of recording a finished run through the store. */
export interface StatsRecordResult extends StatsUpdate {
  /** False when the write only reached the in-memory fallback. */
  readonly saved: boolean;
  /** Status of the read that seeded this update. */
  readonly loadStatus: StatsLoadStatus;
}

/* -------------------------------------------------------------------------- */
/* Validation and clamping                                                     */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Floor an in-range integer, clamping out-of-range values to the bounds. */
function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Repair one completed-turn count. A non-positive value is impossible for a
 * run that finished a battle, so it becomes null (no valid best) rather than
 * zero, which would be permanently unbeatable by any later run.
 */
function clampCompletedTurns(value: number): number | null {
  if (value < STATS_MIN_COMPLETED_TURNS) {
    return null;
  }

  return clampInteger(value, STATS_MIN_COMPLETED_TURNS, Number.MAX_SAFE_INTEGER);
}

/** Turns reported by a terminal run, defensively repaired to a usable count. */
function reportedCompletedTurns(value: number): number {
  if (!Number.isFinite(value)) {
    return STATS_MIN_COMPLETED_TURNS;
  }

  return clampInteger(value, STATS_MIN_COMPLETED_TURNS, Number.MAX_SAFE_INTEGER);
}

/** Encounter reported by a terminal run, always one of the four ladder steps. */
function reportedEncounter(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return clampInteger(value, 1, STATS_MAX_ENCOUNTERS);
}

/**
 * Validate untrusted record data and reconstruct a canonical `Stats`.
 *
 * Returns null when the value is not this schema (unknown version, wrong
 * field type, missing field), so the caller can discard it. In-range numbers
 * are canonicalised; out-of-range numbers are clamped. The function is total:
 * it never throws and never returns a partially reconstructed record.
 */
export function normalizeStats(input: unknown): Stats | null {
  if (!isRecord(input)) {
    return null;
  }

  if (input.schemaVersion !== STATS_SCHEMA_VERSION) {
    return null;
  }

  const { furthestEncounter, bossClears, bestCompletedTurns } = input;

  if (!isFiniteNumber(furthestEncounter) || !isFiniteNumber(bossClears)) {
    return null;
  }

  if (bestCompletedTurns !== null && !isFiniteNumber(bestCompletedTurns)) {
    return null;
  }

  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    furthestEncounter: clampInteger(furthestEncounter, 0, STATS_MAX_ENCOUNTERS),
    bossClears: clampInteger(bossClears, 0, Number.MAX_SAFE_INTEGER),
    bestCompletedTurns:
      bestCompletedTurns === null
        ? null
        : clampCompletedTurns(bestCompletedTurns),
  };
}

/**
 * Parse a raw stored string. Returns null for anything this module did not
 * write (corrupt JSON, a foreign shape, an unknown version) so the caller can
 * discard only this key. Unknown extra keys are ignored, which keeps a future
 * additive field from invalidating today's payload.
 */
export function parseStoredStats(raw: string): Stats | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return normalizeStats(parsed);
}

/** Serialize the canonical shape. Property order is part of the contract. */
export function serializeStats(stats: Stats): string {
  const safe = normalizeStats(stats) ?? EMPTY_STATS;

  return JSON.stringify({
    schemaVersion: STATS_SCHEMA_VERSION,
    furthestEncounter: safe.furthestEncounter,
    bossClears: safe.bossClears,
    bestCompletedTurns: safe.bestCompletedTurns,
  });
}

/* -------------------------------------------------------------------------- */
/* Pure update                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fold one finished run into the record. Pure: the input record is not
 * mutated and the returned record is a fresh object.
 *
 * A defeat contributes only its furthest encounter. A victory contributes its
 * encounter (always the boss), one boss clear, and its total turns when that
 * total beats the stored best. Applying the same run twice therefore counts
 * it twice by design: the caller records a run exactly once, when it ends, and
 * a restored result screen is never re-recorded (RUN-FR-07).
 */
export function applyRunToStats(stats: Stats, summary: RunSummary): StatsUpdate {
  const base = normalizeStats(stats) ?? EMPTY_STATS;
  const reached = reportedEncounter(summary.reachedEncounter);

  const isVictory = summary.outcome === 'victory';
  const bossClears = isVictory
    ? clampInteger(base.bossClears + 1, 0, Number.MAX_SAFE_INTEGER)
    : base.bossClears;

  const bestCompletedTurns = isVictory
    ? Math.min(
        base.bestCompletedTurns ?? Number.MAX_SAFE_INTEGER,
        reportedCompletedTurns(summary.turnsTotal),
      )
    : base.bestCompletedTurns;

  const next: Stats = {
    schemaVersion: STATS_SCHEMA_VERSION,
    furthestEncounter: Math.max(base.furthestEncounter, reached),
    bossClears,
    bestCompletedTurns,
  };

  const isNewBest =
    next.furthestEncounter > base.furthestEncounter ||
    next.bossClears > base.bossClears ||
    (next.bestCompletedTurns !== null &&
      (base.bestCompletedTurns === null ||
        next.bestCompletedTurns < base.bestCompletedTurns));

  return { stats: next, isNewBest };
}

/**
 * Record a run only if it has ended. Returns null while the run is still in
 * the overview, battle or reward phase, so an abandoned run can never update
 * the record. The check reads the run model's terminal summary rather than
 * duplicating phase knowledge here.
 */
export function updateStatsForRun(
  stats: Stats,
  run: RunState,
): StatsUpdate | null {
  const summary = runSummary(run);

  return summary === null ? null : applyRunToStats(stats, summary);
}

/* -------------------------------------------------------------------------- */
/* Load and save helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Resolve `window.localStorage`; private-mode accessors can throw. */
function resolveDefaultStorage(): StatsStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the record from an adapter. A corrupt or foreign payload removes only
 * the stats key and yields the empty record; a missing adapter or a throwing
 * read yields `unavailable` with the empty record. Never throws.
 */
export function loadStats(storage: StatsStorage | null): StatsLoadResult {
  if (storage === null) {
    return { status: 'unavailable', stats: EMPTY_STATS };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(STATS_STORAGE_KEY);
  } catch {
    return { status: 'unavailable', stats: EMPTY_STATS };
  }

  if (raw === null) {
    return { status: 'empty', stats: EMPTY_STATS };
  }

  const parsed = parseStoredStats(raw);

  if (parsed === null) {
    try {
      storage.removeItem(STATS_STORAGE_KEY);
    } catch {
      // A storage that cannot remove is also a storage that cannot persist;
      // the empty record still applies for this session.
    }

    return { status: 'discarded', stats: EMPTY_STATS };
  }

  return { status: 'ok', stats: parsed };
}

/**
 * Write the record through an adapter. Returns false when there is no usable
 * storage or the write is rejected (quota, read-only); the caller keeps playing
 * with the in-memory value. An invalid input record is never written.
 */
export function saveStats(storage: StatsStorage | null, stats: Stats): boolean {
  const safe = normalizeStats(stats);

  if (storage === null || safe === null) {
    return false;
  }

  try {
    storage.setItem(STATS_STORAGE_KEY, serializeStats(safe));
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

export interface StatsStore {
  /** Read once; the result explains missing, corrupt and unavailable data. */
  load(): StatsLoadResult;
  /** Persist immediately. False means the value only reached memory. */
  save(stats: Stats): boolean;
  /** Load, fold in one finished run and save, in that order. */
  record(summary: RunSummary): StatsRecordResult;
  /**
   * Record a run only if it has ended. Returns null and writes nothing for an
   * in-progress run, which is what keeps abandoned runs out of the record.
   */
  recordRun(run: RunState): StatsRecordResult | null;
  /** True while writes reach the browser's Storage. */
  readonly isPersistent: boolean;
}

/**
 * Create a stats store. Pass an adapter in tests, or `null` to simulate a
 * browser with no usable storage; omit it for production.
 */
export function createStatsStore(
  storage?: StatsStorage | null,
): StatsStore {
  const resolvedStorage =
    storage === undefined ? resolveDefaultStorage() : storage;

  let persistent = resolvedStorage !== null;
  /** Last value read or written, so an unavailable store still works. */
  let memory: Stats | null = null;

  function load(): StatsLoadResult {
    if (resolvedStorage === null) {
      persistent = false;
      return { status: 'unavailable', stats: memory ?? EMPTY_STATS };
    }

    let raw: string | null;

    try {
      raw = resolvedStorage.getItem(STATS_STORAGE_KEY);
    } catch {
      persistent = false;
      return { status: 'unavailable', stats: memory ?? EMPTY_STATS };
    }

    if (raw === null) {
      return { status: 'empty', stats: memory ?? EMPTY_STATS };
    }

    const parsed = parseStoredStats(raw);

    if (parsed === null) {
      memory = EMPTY_STATS;

      try {
        resolvedStorage.removeItem(STATS_STORAGE_KEY);
      } catch {
        persistent = false;
      }

      return { status: 'discarded', stats: EMPTY_STATS };
    }

    memory = parsed;
    return { status: 'ok', stats: parsed };
  }

  function save(stats: Stats): boolean {
    const safe = normalizeStats(stats);

    if (safe === null) {
      return false;
    }

    memory = safe;

    if (resolvedStorage === null) {
      persistent = false;
      return false;
    }

    try {
      resolvedStorage.setItem(STATS_STORAGE_KEY, serializeStats(safe));
      return true;
    } catch {
      persistent = false;
      return false;
    }
  }

  function record(summary: RunSummary): StatsRecordResult {
    const loaded = load();
    const update = applyRunToStats(loaded.stats, summary);
    const saved = save(update.stats);

    return {
      stats: update.stats,
      isNewBest: update.isNewBest,
      saved,
      loadStatus: loaded.status,
    };
  }

  function recordRun(run: RunState): StatsRecordResult | null {
    const summary = runSummary(run);

    return summary === null ? null : record(summary);
  }

  return {
    load,
    save,
    record,
    recordRun,
    get isPersistent() {
      return persistent;
    },
  };
}
