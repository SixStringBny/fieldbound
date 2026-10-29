/**
 * Best-run record tests (RUN-FR-07, VIS-NFR-05, VIS-NFR-06).
 *
 * The record is the only piece of persistence that outlives a run, so the
 * suite pins four things: the documented fields, the rule that only a finished
 * run updates them, the clamping/validation of stored data, and the storage
 * failure paths. Every test uses a fake adapter, except the default-store probe
 * which uses jsdom's localStorage and cleans up after itself.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  RUN_ENCOUNTER_COUNT,
  RUN_MAX_HEALTH,
  RUN_SCHEMA_VERSION,
} from '../run/run-model';
import type { RunState, RunSummary } from '../run/run-model';
import {
  EMPTY_STATS,
  STATS_MAX_ENCOUNTERS,
  STATS_SCHEMA_VERSION,
  STATS_STORAGE_KEY,
  applyRunToStats,
  createStatsStore,
  loadStats,
  normalizeStats,
  parseStoredStats,
  saveStats,
  serializeStats,
  updateStatsForRun,
} from './stats';
import type { Stats, StatsStorage } from './stats';

/* -------------------------------------------------------------------------- */
/* Storage double                                                             */
/* -------------------------------------------------------------------------- */

class MemoryStorage implements StatsStorage {
  readonly values = new Map<string, string>();
  readonly getItem = vi.fn((key: string) => this.values.get(key) ?? null);
  readonly setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value);
  });
  readonly removeItem = vi.fn((key: string) => {
    this.values.delete(key);
  });

  raw(key: string = STATS_STORAGE_KEY): string | null {
    return this.values.get(key) ?? null;
  }
}

function quotaStorage(): StatsStorage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: vi.fn(),
  };
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const BOSS_INDEX = RUN_ENCOUNTER_COUNT - 1;

function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    seed: 123_456_789,
    element: 'ember',
    health: RUN_MAX_HEALTH,
    deck: ['ember-cinder-jab'],
    encounterIndex: 0,
    turnsTotal: 0,
    cardsAdded: 0,
    damageTaken: 0,
    phase: 'overview',
    ...overrides,
  };
}

/** A completed run that cleared the boss. */
function victoryRun(turnsTotal: number): RunState {
  return makeRun({
    encounterIndex: BOSS_INDEX,
    turnsTotal,
    cardsAdded: 3,
    damageTaken: 52,
    phase: 'victory',
  });
}

/** A completed run that lost at the given one-based encounter. */
function defeatRun(reachedEncounter: number, turnsTotal = 9): RunState {
  return makeRun({
    encounterIndex: reachedEncounter - 1,
    turnsTotal,
    cardsAdded: Math.max(0, reachedEncounter - 1),
    damageTaken: 40,
    health: 0,
    phase: 'defeat',
  });
}

function summaryOf(run: RunState): RunSummary {
  return {
    outcome: run.phase === 'victory' ? 'victory' : 'defeat',
    encountersCleared:
      run.phase === 'victory' ? RUN_ENCOUNTER_COUNT : run.encounterIndex,
    encountersTotal: RUN_ENCOUNTER_COUNT,
    reachedEncounter: run.encounterIndex + 1,
    turnsTotal: run.turnsTotal,
    cardsAdded: run.cardsAdded,
    damageTaken: run.damageTaken,
  };
}

function record(overrides: Partial<Stats> = {}): Stats {
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    furthestEncounter: 0,
    bossClears: 0,
    bestCompletedTurns: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Documented record                                                          */
/* -------------------------------------------------------------------------- */

describe('best-run record shape', () => {
  it('starts empty with the documented fields and version', () => {
    expect(STATS_STORAGE_KEY).toBe('fieldbound.stats.v1');
    expect(STATS_SCHEMA_VERSION).toBe(1);
    expect(STATS_MAX_ENCOUNTERS).toBe(RUN_ENCOUNTER_COUNT);
    expect(EMPTY_STATS).toEqual({
      schemaVersion: 1,
      furthestEncounter: 0,
      bossClears: 0,
      bestCompletedTurns: null,
    });
  });

  it('serializes the canonical shape in a stable property order', () => {
    expect(
      serializeStats({
        schemaVersion: 1,
        furthestEncounter: 3,
        bossClears: 2,
        bestCompletedTurns: 18,
      }),
    ).toBe(
      '{"schemaVersion":1,"furthestEncounter":3,"bossClears":2,"bestCompletedTurns":18}',
    );

    expect(serializeStats(EMPTY_STATS)).toBe(
      '{"schemaVersion":1,"furthestEncounter":0,"bossClears":0,"bestCompletedTurns":null}',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Pure update (acceptance criteria)                                          */
/* -------------------------------------------------------------------------- */

describe('applyRunToStats', () => {
  it('records the furthest encounter of a first defeat and leaves clears at zero', () => {
    const update = applyRunToStats(EMPTY_STATS, summaryOf(defeatRun(2)));

    expect(update.stats).toEqual({
      schemaVersion: 1,
      furthestEncounter: 2,
      bossClears: 0,
      bestCompletedTurns: null,
    });
    expect(update.isNewBest).toBe(true);
  });

  it('increments boss clears and sets the best turns for an 18-turn completion', () => {
    const update = applyRunToStats(EMPTY_STATS, summaryOf(victoryRun(18)));

    expect(update.stats).toEqual({
      schemaVersion: 1,
      furthestEncounter: 4,
      bossClears: 1,
      bestCompletedTurns: 18,
    });
    expect(update.isNewBest).toBe(true);
  });

  it('keeps 18 after a 24-turn completion and replaces it with 12', () => {
    const first = applyRunToStats(EMPTY_STATS, summaryOf(victoryRun(18)));
    const slower = applyRunToStats(first.stats, summaryOf(victoryRun(24)));

    expect(slower.stats.bestCompletedTurns).toBe(18);
    expect(slower.stats.bossClears).toBe(2);
    // Another clear is still an improvement even though the turn best stands.
    expect(slower.isNewBest).toBe(true);

    const faster = applyRunToStats(slower.stats, summaryOf(victoryRun(12)));

    expect(faster.stats.bestCompletedTurns).toBe(12);
    expect(faster.stats.bossClears).toBe(3);
    expect(faster.isNewBest).toBe(true);
  });

  it('never lets a defeat claim a turn record', () => {
    const update = applyRunToStats(EMPTY_STATS, summaryOf(defeatRun(3, 4)));

    expect(update.stats.bestCompletedTurns).toBeNull();
    expect(update.stats.bossClears).toBe(0);
  });

  it('raises only the furthest encounter for a deeper defeat', () => {
    const previous = record({
      furthestEncounter: 2,
      bossClears: 1,
      bestCompletedTurns: 20,
    });
    const update = applyRunToStats(previous, summaryOf(defeatRun(3)));

    expect(update.stats).toEqual({
      schemaVersion: 1,
      furthestEncounter: 3,
      bossClears: 1,
      bestCompletedTurns: 20,
    });
    expect(update.isNewBest).toBe(true);
  });

  it('leaves the record untouched for a shallower defeat', () => {
    const previous = record({
      furthestEncounter: 3,
      bossClears: 1,
      bestCompletedTurns: 20,
    });
    const update = applyRunToStats(previous, summaryOf(defeatRun(1)));

    expect(update.stats).toEqual(previous);
    expect(update.isNewBest).toBe(false);
  });

  it('records a defeat at the boss as encounter 4 with no clear', () => {
    const update = applyRunToStats(EMPTY_STATS, summaryOf(defeatRun(4)));

    expect(update.stats.furthestEncounter).toBe(4);
    expect(update.stats.bossClears).toBe(0);
    expect(update.isNewBest).toBe(true);
  });

  it('does not mutate the record it was given', () => {
    const previous = record({ furthestEncounter: 1, bossClears: 0 });
    const snapshot = { ...previous };

    applyRunToStats(previous, summaryOf(victoryRun(15)));

    expect(previous).toEqual(snapshot);
  });

  it('clamps an impossible reported turn total to a usable count', () => {
    const zero = applyRunToStats(EMPTY_STATS, {
      ...summaryOf(victoryRun(0)),
      turnsTotal: 0,
    });

    expect(zero.stats.bestCompletedTurns).toBe(1);

    const hostile = applyRunToStats(EMPTY_STATS, {
      ...summaryOf(victoryRun(0)),
      turnsTotal: Number.NaN,
    });

    expect(hostile.stats.bestCompletedTurns).toBe(1);
  });

  it('repairs an impossible reported encounter instead of storing NaN', () => {
    const update = applyRunToStats(EMPTY_STATS, {
      ...summaryOf(defeatRun(2)),
      reachedEncounter: Number.NaN,
    });

    expect(update.stats.furthestEncounter).toBe(1);
    expect(Number.isNaN(update.stats.furthestEncounter)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Only a finished run updates                                                */
/* -------------------------------------------------------------------------- */

describe('updateStatsForRun', () => {
  it('ignores runs still in progress', () => {
    for (const phase of ['overview', 'battle', 'reward'] as const) {
      const run = makeRun({ phase, encounterIndex: 1, turnsTotal: 6 });

      expect(updateStatsForRun(EMPTY_STATS, run)).toBeNull();
      expect(updateStatsForRun(record({ furthestEncounter: 2 }), run)).toBeNull();
    }
  });

  it('applies a terminal victory or defeat', () => {
    const victory = updateStatsForRun(EMPTY_STATS, victoryRun(18));
    const defeat = updateStatsForRun(EMPTY_STATS, defeatRun(2));

    expect(victory?.stats.bossClears).toBe(1);
    expect(victory?.stats.bestCompletedTurns).toBe(18);
    expect(defeat?.stats.furthestEncounter).toBe(2);
    expect(defeat?.stats.bossClears).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Validation, clamping and discard                                           */
/* -------------------------------------------------------------------------- */

describe('stats validation', () => {
  it('accepts a canonical stored record', () => {
    expect(
      parseStoredStats(
        JSON.stringify({
          schemaVersion: 1,
          furthestEncounter: 4,
          bossClears: 3,
          bestCompletedTurns: 18,
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      furthestEncounter: 4,
      bossClears: 3,
      bestCompletedTurns: 18,
    });
  });

  it('accepts the empty record without inventing a clear', () => {
    expect(parseStoredStats(JSON.stringify(EMPTY_STATS))).toEqual(EMPTY_STATS);
  });

  it('ignores unknown extra fields on an otherwise valid payload', () => {
    expect(
      parseStoredStats(
        JSON.stringify({
          schemaVersion: 1,
          furthestEncounter: 2,
          bossClears: 0,
          bestCompletedTurns: null,
          future: 'ignored',
        }),
      ),
    ).toEqual(record({ furthestEncounter: 2 }));
  });

  it('clamps out-of-range numbers on read instead of rejecting the record', () => {
    expect(
      parseStoredStats(
        JSON.stringify({
          schemaVersion: 1,
          furthestEncounter: 9,
          bossClears: -4,
          bestCompletedTurns: 17.8,
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      furthestEncounter: 4,
      bossClears: 0,
      bestCompletedTurns: 17,
    });

    expect(
      parseStoredStats(
        JSON.stringify({
          schemaVersion: 1,
          furthestEncounter: -2.5,
          bossClears: 3.9,
          bestCompletedTurns: -5,
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      furthestEncounter: 0,
      bossClears: 3,
      // A non-positive turn count is impossible; null beats an unbeatable 0.
      bestCompletedTurns: null,
    });

    expect(
      parseStoredStats(
        JSON.stringify({
          schemaVersion: 1,
          furthestEncounter: 2.9,
          bossClears: 1,
          bestCompletedTurns: null,
        }),
      )?.furthestEncounter,
    ).toBe(2);
  });

  it('rejects anything that is not this schema', () => {
    const invalidPayloads: Array<[string, string]> = [
      ['malformed JSON', '{not json'],
      ['an empty string', ''],
      ['an array', '[1,2,3]'],
      ['null', 'null'],
      ['a string', '"stats"'],
      ['an unknown version', JSON.stringify({ ...EMPTY_STATS, schemaVersion: 2 })],
      ['version zero', JSON.stringify({ ...EMPTY_STATS, schemaVersion: 0 })],
      ['a missing version', JSON.stringify({ furthestEncounter: 1 })],
      [
        'a string encounter',
        JSON.stringify({ ...EMPTY_STATS, furthestEncounter: '2' }),
      ],
      [
        'a null boss clear count',
        JSON.stringify({ ...EMPTY_STATS, bossClears: null }),
      ],
      [
        'a missing turns field',
        JSON.stringify({
          schemaVersion: 1,
          furthestEncounter: 1,
          bossClears: 0,
        }),
      ],
      [
        'a non-numeric turns value',
        JSON.stringify({ ...EMPTY_STATS, bestCompletedTurns: '18' }),
      ],
    ];

    for (const [, payload] of invalidPayloads) {
      expect(parseStoredStats(payload)).toBeNull();
      expect(normalizeStats(payload)).toBeNull();
    }
  });

  it('removes only the stats key and falls back to the empty record', () => {
    const storage = new MemoryStorage();
    storage.values.set('fieldbound.run.v1', '{"keep":"me"}');
    storage.values.set('fieldbound.settings.v1', '{"keep":"me-too"}');
    storage.values.set(STATS_STORAGE_KEY, '{"schemaVersion":99}');

    const store = createStatsStore(storage);
    const result = store.load();

    expect(result).toEqual({ status: 'discarded', stats: EMPTY_STATS });
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).toHaveBeenCalledWith(STATS_STORAGE_KEY);
    expect(storage.raw()).toBeNull();
    expect(storage.raw('fieldbound.run.v1')).toBe('{"keep":"me"}');
    expect(storage.raw('fieldbound.settings.v1')).toBe('{"keep":"me-too"}');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('never throws on unreadable data', () => {
    const storage = new MemoryStorage();
    storage.values.set(STATS_STORAGE_KEY, 'not json');

    expect(() => createStatsStore(storage).load()).not.toThrow();
    expect(createStatsStore(storage).load().stats).toEqual(EMPTY_STATS);
  });
});

/* -------------------------------------------------------------------------- */
/* Round trip                                                                 */
/* -------------------------------------------------------------------------- */

describe('stats round trip', () => {
  it('round-trips a saved record exactly through fresh stores', () => {
    const storage = new MemoryStorage();
    const saved = record({
      furthestEncounter: 4,
      bossClears: 2,
      bestCompletedTurns: 18,
    });

    expect(createStatsStore(storage).save(saved)).toBe(true);

    const reloaded = createStatsStore(storage).load();

    expect(reloaded.status).toBe('ok');
    expect(reloaded.stats).toEqual(saved);
  });

  it('round-trips the empty record when it was explicitly written', () => {
    const storage = new MemoryStorage();

    expect(saveStats(storage, EMPTY_STATS)).toBe(true);
    expect(loadStats(storage)).toEqual({ status: 'ok', stats: EMPTY_STATS });
  });

  it('records a completed run once and reads it back as a reload would', () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);

    const result = store.recordRun(victoryRun(18));

    expect(result?.saved).toBe(true);
    expect(result?.loadStatus).toBe('empty');
    expect(result?.stats).toEqual({
      schemaVersion: 1,
      furthestEncounter: 4,
      bossClears: 1,
      bestCompletedTurns: 18,
    });
    // One settled run end means exactly one write.
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.raw()).toBe(
      '{"schemaVersion":1,"furthestEncounter":4,"bossClears":1,"bestCompletedTurns":18}',
    );

    expect(createStatsStore(storage).load()).toEqual({
      status: 'ok',
      stats: result?.stats,
    });
  });

  it('writes nothing for an abandoned run', () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);

    expect(store.recordRun(makeRun({ phase: 'battle' }))).toBeNull();
    expect(store.recordRun(makeRun({ phase: 'reward', encounterIndex: 1 }))).toBeNull();
    expect(store.recordRun(makeRun({ phase: 'overview' }))).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.raw()).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Key ownership                                                              */
/* -------------------------------------------------------------------------- */

describe('stats key ownership', () => {
  it('writes only the stats key and never touches run or settings', () => {
    const storage = new MemoryStorage();
    storage.values.set('fieldbound.run.v1', '{"keep":"me"}');
    storage.values.set('fieldbound.settings.v1', '{"keep":"me-too"}');

    const store = createStatsStore(storage);
    store.record(summaryOf(victoryRun(16)));

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      STATS_STORAGE_KEY,
      expect.any(String),
    );
    expect([...storage.values.keys()].sort()).toEqual([
      'fieldbound.run.v1',
      'fieldbound.settings.v1',
      'fieldbound.stats.v1',
    ]);
    expect(storage.raw('fieldbound.run.v1')).toBe('{"keep":"me"}');
    expect(storage.raw('fieldbound.settings.v1')).toBe('{"keep":"me-too"}');
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('does not write anything just because the app booted', () => {
    const storage = new MemoryStorage();

    expect(createStatsStore(storage).load()).toEqual({
      status: 'empty',
      stats: EMPTY_STATS,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Storage failures                                                           */
/* -------------------------------------------------------------------------- */

describe('unavailable storage', () => {
  it('reports unavailable, keeps the record in memory and never throws', () => {
    const store = createStatsStore(null);

    expect(store.isPersistent).toBe(false);
    expect(store.load()).toEqual({ status: 'unavailable', stats: EMPTY_STATS });

    const result = store.recordRun(defeatRun(2));

    expect(result?.saved).toBe(false);
    expect(result?.loadStatus).toBe('unavailable');
    expect(result?.stats.furthestEncounter).toBe(2);
    expect(result?.stats.bossClears).toBe(0);

    // The session keeps playing against the updated in-memory record.
    expect(store.load().stats).toEqual(result?.stats);
  });

  it('accumulates a second completion in memory when storage is absent', () => {
    const store = createStatsStore(null);

    store.recordRun(victoryRun(18));
    const second = store.recordRun(victoryRun(12));

    expect(second?.stats.bossClears).toBe(2);
    expect(second?.stats.bestCompletedTurns).toBe(12);
    expect(store.load().stats.bestCompletedTurns).toBe(12);
  });

  it('survives a read that throws', () => {
    const storage: StatsStorage = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const store = createStatsStore(storage);

    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual({ status: 'unavailable', stats: EMPTY_STATS });
    expect(store.isPersistent).toBe(false);
  });

  it('keeps a completed run in memory when the quota rejects the write', () => {
    const store = createStatsStore(quotaStorage());

    const result = store.recordRun(victoryRun(18));

    expect(result?.saved).toBe(false);
    expect(result?.stats.bossClears).toBe(1);
    expect(result?.stats.bestCompletedTurns).toBe(18);
    expect(store.isPersistent).toBe(false);
    expect(store.load().stats.bossClears).toBe(1);
  });

  it('does not throw when an invalid key cannot be removed', () => {
    const storage: StatsStorage = {
      getItem: () => 'not json',
      setItem: vi.fn(),
      removeItem: () => {
        throw new Error('read-only storage');
      },
    };
    const store = createStatsStore(storage);

    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual({ status: 'discarded', stats: EMPTY_STATS });
    expect(store.isPersistent).toBe(false);
  });

  it('refuses to write an invalid record', () => {
    const storage = new MemoryStorage();

    expect(
      saveStats(storage, {
        schemaVersion: 1,
        furthestEncounter: 'far',
        bossClears: 0,
        bestCompletedTurns: null,
      } as unknown as Stats),
    ).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();

    const store = createStatsStore(storage);

    expect(
      store.save({
        schemaVersion: 2,
        furthestEncounter: 1,
        bossClears: 0,
        bestCompletedTurns: null,
      } as unknown as Stats),
    ).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('handles a null adapter in the free helpers', () => {
    expect(loadStats(null)).toEqual({ status: 'unavailable', stats: EMPTY_STATS });
    expect(saveStats(null, EMPTY_STATS)).toBe(false);
  });

  it('resolves the browser storage by default and falls back when absent', () => {
    // jsdom provides localStorage, so the default store persists there.
    window.localStorage.removeItem(STATS_STORAGE_KEY);

    const store = createStatsStore();

    expect(store.isPersistent).toBe(true);
    expect(store.save(record({ furthestEncounter: 1 }))).toBe(true);

    try {
      expect(createStatsStore().load()).toEqual({
        status: 'ok',
        stats: record({ furthestEncounter: 1 }),
      });
    } finally {
      window.localStorage.removeItem(STATS_STORAGE_KEY);
    }
  });
});
