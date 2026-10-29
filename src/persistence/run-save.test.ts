// @vitest-environment node
/**
 * Versioned solo-run save tests (RUN-FR-05, RUN-FR-06, RUN-FR-08, VIS-NFR-05,
 * VIS-NFR-06).
 *
 * The save is the seam between a running game and a reloaded one, so the suite
 * pins five things:
 *
 *   1. the documented payload shape, including the hoisted seed and the run
 *      PRNG state;
 *   2. an exact round trip of run, seed, PRNG state and battle snapshot,
 *      including the same next draw after restore;
 *   3. total validation of every field, with a typed rejection for corrupt
 *      JSON, unknown versions, invalid card ids, a missing battle snapshot and
 *      missing/invalid reward offers;
 *   4. the narrow discard rule: only `fieldbound.run.v1` is removed, and
 *      settings/stats survive;
 *   5. quota and unavailable storage as statuses, never exceptions, with the
 *      session continuing in memory.
 *
 * Every storage path uses an in-memory double; the module itself never touches
 * the browser store here.
 */
import { describe, expect, it, vi } from 'vitest';

import { byId as cardsById } from '../content/cards';
import { deckByElement } from '../content/decks';
import { ENEMIES } from '../content/enemies';
import { canPlayCard, createBattle, playCard } from '../engine/battle';
import { createRng, nextUint32 } from '../engine/rng';
import { serializeSnapshot } from '../engine/snapshot';
import { BATTLE_SCHEMA_VERSION } from '../engine/types';
import type { BattleState } from '../engine/types';
import { generateRewardOffers } from '../run/rewards';
import type { RewardOffer } from '../run/rewards';
import {
  RUN_MAX_HEALTH,
  RUN_SCHEMA_VERSION,
} from '../run/run-model';
import type { RunState } from '../run/run-model';
import {
  RUN_SAVE_SCHEMA_VERSION,
  RUN_SAVE_STORAGE_KEY,
  clearRunSave,
  createRunSaveStore,
  loadRunSave,
  parseStoredRunSave,
  saveRunSave,
  serializeRunSave,
  validateRunSave,
} from './run-save';
import type {
  RunSaveStorage,
  RunSaveV1,
  ValidatedRunSave,
} from './run-save';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Documented sample seed; also small enough to read in failures. */
const SEED = 987_654_321;

/** Run PRNG state used by saves that do not generate a reward. */
const RUN_RNG = createRng(0x1234_5678);

const SETTINGS_KEY = 'fieldbound.settings.v1';
const STATS_KEY = 'fieldbound.stats.v1';

const SETTINGS_RAW = '{"schemaVersion":1,"muted":true,"reducedMotion":null}';
const STATS_RAW =
  '{"schemaVersion":1,"furthestEncounter":4,"bossClears":1,"bestCompletedTurns":12}';

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];

  if (value === undefined) {
    throw new Error(`fixture is missing index ${String(index)}`);
  }

  return value;
}

function starterDeck(): readonly string[] {
  const deck = deckByElement('ember');

  if (deck === undefined) {
    throw new Error('the ember starter deck is missing');
  }

  return deck.cards;
}

/** A complete run in any phase; overrides express the case under test. */
function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    seed: SEED,
    element: 'ember',
    health: RUN_MAX_HEALTH,
    deck: [...starterDeck()],
    encounterIndex: 0,
    turnsTotal: 0,
    cardsAdded: 0,
    damageTaken: 0,
    phase: 'overview',
    ...overrides,
  };
}

/**
 * A genuine mid-battle engine state: the opening battle with one legal card
 * already played, so the hand, deck, discard, energy and PRNG state all differ
 * from a fresh setup.
 */
function makeBattle(): BattleState {
  const enemy = ENEMIES[0];

  if (enemy === undefined) {
    throw new Error('the enemy ladder is empty');
  }

  const created = createBattle({
    seed: SEED,
    player: {
      element: 'ember',
      cards: [...starterDeck()],
      maxHealth: RUN_MAX_HEALTH,
      health: RUN_MAX_HEALTH,
    },
    opponent: {
      element: enemy.element,
      cards: [...enemy.deck],
      maxHealth: enemy.maxHealth,
      health: enemy.maxHealth,
    },
    catalog: cardsById,
  });

  if (!created.ok) {
    throw new Error(`createBattle failed: ${created.error.code}`);
  }

  for (const held of created.value.sides.player.hand) {
    if (!canPlayCard(created.value, 'player', held.instanceId, cardsById)) {
      continue;
    }

    const played = playCard(
      created.value,
      { type: 'play-card', side: 'player', instanceId: held.instanceId },
      cardsById,
    );

    if (!played.ok) {
      throw new Error(`playCard failed: ${played.error.code}`);
    }

    return played.value;
  }

  return created.value;
}

/** A save in the `overview` phase with no battle or pending reward. */
function overviewSave(overrides: Partial<RunSaveV1> = {}): RunSaveV1 {
  return {
    schemaVersion: RUN_SAVE_SCHEMA_VERSION,
    seed: SEED,
    rngState: RUN_RNG,
    run: makeRun(),
    battle: null,
    pendingReward: null,
    ...overrides,
  };
}

/** A valid `battle`-phase save plus the engine state it came from. */
function battleSave(): { save: RunSaveV1; battle: BattleState } {
  const battle = makeBattle();
  const run = makeRun({ phase: 'battle', health: RUN_MAX_HEALTH });

  return {
    battle,
    save: {
      schemaVersion: RUN_SAVE_SCHEMA_VERSION,
      seed: SEED,
      rngState: RUN_RNG,
      run,
      battle: serializeSnapshot(battle),
      pendingReward: null,
    },
  };
}

/**
 * A reward-phase save whose offers came from the real seeded generator, so the
 * pending reward is exactly what the run would show. At 19 health the third
 * offer is the heal; at 20 it is a card.
 */
function rewardSave(health = 30): RunSaveV1 {
  const run = makeRun({
    phase: 'reward',
    health,
    encounterIndex: 0,
    turnsTotal: 5,
    damageTaken: 10,
  });
  const generated = generateRewardOffers(run, RUN_RNG);

  if (!generated.ok) {
    throw new Error(`generateRewardOffers failed: ${generated.error.code}`);
  }

  return {
    schemaVersion: RUN_SAVE_SCHEMA_VERSION,
    seed: SEED,
    rngState: generated.value.rngState,
    run,
    battle: null,
    pendingReward: generated.value.offers,
  };
}

/* -------------------------------------------------------------------------- */
/* Result helpers                                                             */
/* -------------------------------------------------------------------------- */

function validate(save: unknown): ValidatedRunSave {
  const result = validateRunSave(save);

  if (!result.ok) {
    throw new Error(
      `expected a valid save, received ${result.error.code}: ${result.error.message}`,
    );
  }

  return result.value;
}

function rejectedCode(input: unknown): string {
  const result = validateRunSave(input);

  if (result.ok) {
    throw new Error('expected a typed rejection, received a valid save');
  }

  return result.error.code;
}

function rawOf(save: RunSaveV1): Record<string, unknown> {
  return JSON.parse(serializeRunSave(save)) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('expected an object in the fixture');
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('expected an array in the fixture');
  }

  return value;
}

function mutated(
  save: RunSaveV1,
  mutate: (raw: Record<string, unknown>) => void,
): Record<string, unknown> {
  const raw = rawOf(save);
  mutate(raw);
  return raw;
}

/* -------------------------------------------------------------------------- */
/* Storage doubles                                                            */
/* -------------------------------------------------------------------------- */

class MemoryStorage implements RunSaveStorage {
  readonly values = new Map<string, string>();
  readonly getItem = vi.fn((key: string) => this.values.get(key) ?? null);
  readonly setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value);
  });
  readonly removeItem = vi.fn((key: string) => {
    this.values.delete(key);
  });

  raw(key: string = RUN_SAVE_STORAGE_KEY): string | null {
    return this.values.get(key) ?? null;
  }
}

function quotaStorage(): RunSaveStorage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: vi.fn(),
  };
}

function throwingReadStorage(): RunSaveStorage {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

function throwingRemoveStorage(): RunSaveStorage {
  return {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: () => {
      throw new Error('storage is blocked');
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Documented payload                                                         */
/* -------------------------------------------------------------------------- */

describe('run save contract', () => {
  it('uses the documented key and version', () => {
    expect(RUN_SAVE_STORAGE_KEY).toBe('fieldbound.run.v1');
    expect(RUN_SAVE_SCHEMA_VERSION).toBe(1);
  });

  it('hoists the seed and omits it from the nested run', () => {
    const raw = rawOf(overviewSave());

    expect(Object.keys(raw)).toEqual([
      'schemaVersion',
      'seed',
      'rngState',
      'run',
      'battle',
      'pendingReward',
    ]);
    expect(raw.seed).toBe(SEED);
    expect(raw.rngState).toEqual({ state: RUN_RNG.state });

    const run = asRecord(raw.run);

    expect(Object.keys(run)).toEqual([
      'schemaVersion',
      'element',
      'health',
      'deck',
      'encounterIndex',
      'turnsTotal',
      'cardsAdded',
      'damageTaken',
      'phase',
    ]);
    expect(run['seed']).toBeUndefined();
    expect(run['phase']).toBe('overview');
  });

  it('serializes a battle-phase payload with the engine snapshot version', () => {
    const raw = rawOf(battleSave().save);
    const battle = asRecord(raw.battle);

    expect(battle['schemaVersion']).toBe(BATTLE_SCHEMA_VERSION);
    expect(raw.pendingReward).toBeNull();
  });

  it('serializes a reward-phase payload with exactly three offers', () => {
    const raw = rawOf(rewardSave(30));

    expect(raw.battle).toBeNull();
    expect(asArray(raw.pendingReward)).toHaveLength(3);
  });

  it('writes a stable string for the same payload', () => {
    const save = battleSave().save;

    expect(serializeRunSave(save)).toBe(serializeRunSave(save));
  });

  it('accepts the bare-integer rngState from the save-contract example', () => {
    const raw = mutated(overviewSave(), (record) => {
      record['rngState'] = RUN_RNG.state;
    });

    const loaded = validate(raw);

    expect(loaded.save.rngState).toEqual({ state: RUN_RNG.state });
    expect(JSON.parse(serializeRunSave(loaded.save)).rngState).toEqual({
      state: RUN_RNG.state,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Round trip                                                                 */
/* -------------------------------------------------------------------------- */

describe('run save round trip', () => {
  it('restores the exact run, seed, PRNG state and battle', () => {
    const { save, battle } = battleSave();
    const loaded = validate(save);

    expect(loaded.save.seed).toBe(SEED);
    expect(loaded.save.rngState).toEqual(RUN_RNG);
    expect(loaded.save.run).toEqual(save.run);
    expect(loaded.battle).toEqual(battle);
    expect(loaded.battle?.rngState).toEqual(battle.rngState);
  });

  it('survives JSON text without drift', () => {
    const { save } = battleSave();
    const raw = serializeRunSave(save);
    const parsed = parseStoredRunSave(raw);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.save).toEqual(save);
    expect(serializeRunSave(parsed.value.save)).toBe(raw);
  });

  it('continues the same run PRNG sequence after a reload', () => {
    const { save } = battleSave();
    const loaded = validate(save);

    expect(nextUint32(loaded.save.rngState)).toEqual(nextUint32(RUN_RNG));
  });

  it('restores the same three reward offers', () => {
    const save = rewardSave(20);
    const loaded = validate(save);

    expect(loaded.save.pendingReward).toEqual(save.pendingReward);
    expect(loaded.battle).toBeNull();
  });

  it('keeps the heal offer at 19 health but not at 20', () => {
    const low = rewardSave(19);
    const exactlyTwenty = rewardSave(20);

    expect(at(low.pendingReward ?? [], 2)).toEqual({
      kind: 'heal',
      amount: 12,
    });
    expect(at(exactlyTwenty.pendingReward ?? [], 2).kind).toBe('card');

    expect(validate(low).save.pendingReward).toEqual(low.pendingReward);
    expect(validate(exactlyTwenty).save.pendingReward).toEqual(
      exactlyTwenty.pendingReward,
    );
  });

  const completedPhases: readonly (readonly [string, RunState])[] = [
    ['overview', makeRun()],
    [
      'victory',
      makeRun({ phase: 'victory', encounterIndex: 3, turnsTotal: 18 }),
    ],
    [
      'defeat',
      makeRun({ phase: 'defeat', encounterIndex: 1, health: 0, turnsTotal: 9 }),
    ],
  ];

  it.each(completedPhases)(
    'round-trips a %s-phase save with no battle',
    (_phase, run) => {
      const save = overviewSave({ run });
      const loaded = validate(save);

      expect(loaded.save.run).toEqual(run);
      expect(loaded.save.battle).toBeNull();
      expect(loaded.save.pendingReward).toBeNull();
      expect(loaded.battle).toBeNull();
    },
  );

  it('round-trips a completed run through storage', () => {
    const storage = new MemoryStorage();
    const save = overviewSave({
      run: makeRun({
        phase: 'victory',
        encounterIndex: 3,
        turnsTotal: 21,
        cardsAdded: 3,
        damageTaken: 44,
      }),
    });

    expect(saveRunSave(storage, save).status).toBe('saved');

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('ok');
    expect(loaded.save).toEqual(save);
    expect(loaded.battle).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

describe('run save validation', () => {
  it('rejects a non-object payload', () => {
    expect(rejectedCode(null)).toBe('invalid-save');
    expect(rejectedCode([])).toBe('invalid-save');
    expect(rejectedCode('a save')).toBe('invalid-save');
  });

  it('rejects an unknown top-level schema version', () => {
    const raw = mutated(overviewSave(), (record) => {
      record['schemaVersion'] = RUN_SAVE_SCHEMA_VERSION + 1;
    });

    expect(rejectedCode(raw)).toBe('unknown-schema-version');
  });

  it('rejects an unknown nested run schema version', () => {
    const raw = mutated(overviewSave(), (record) => {
      asRecord(record['run'])['schemaVersion'] = RUN_SCHEMA_VERSION + 1;
    });

    expect(rejectedCode(raw)).toBe('invalid-run');
  });

  it.each([-1, 1.5, 2 ** 32, '123456789'])(
    'rejects seed %s',
    (seed) => {
      const raw = mutated(overviewSave(), (record) => {
        record['seed'] = seed;
      });

      expect(rejectedCode(raw)).toBe('invalid-seed');
    },
  );

  it.each([
    -1,
    2 ** 32,
    { state: '1' },
    {},
    [RUN_RNG.state],
    '123',
  ])('rejects rngState %s', (rngState) => {
    const raw = mutated(overviewSave(), (record) => {
      record['rngState'] = rngState;
    });

    expect(rejectedCode(raw)).toBe('invalid-rng-state');
  });

  it('rejects a missing rngState', () => {
    const raw = mutated(overviewSave(), (record) => {
      delete record['rngState'];
    });

    expect(rejectedCode(raw)).toBe('invalid-rng-state');
  });

  it('rejects a run that is not an object', () => {
    const raw = mutated(overviewSave(), (record) => {
      record['run'] = null;
    });

    expect(rejectedCode(raw)).toBe('invalid-run');
  });

  it('rejects a run seed that disagrees with the saved seed', () => {
    const raw = mutated(overviewSave(), (record) => {
      asRecord(record['run'])['seed'] = SEED + 1;
    });

    expect(rejectedCode(raw)).toBe('invalid-save');
  });

  it('accepts a matching nested run seed', () => {
    const raw = mutated(overviewSave(), (record) => {
      asRecord(record['run'])['seed'] = SEED;
    });

    expect(validate(raw).save.run.seed).toBe(SEED);
  });

  it('rejects an invalid run field', () => {
    const raw = mutated(overviewSave(), (record) => {
      asRecord(record['run'])['health'] = RUN_MAX_HEALTH + 1;
    });

    expect(rejectedCode(raw)).toBe('invalid-run');
  });

  it('rejects a deck card id outside the catalog', () => {
    const raw = mutated(overviewSave(), (record) => {
      const run = asRecord(record['run']);
      const deck = asArray(run['deck']);
      deck[0] = 'not-a-card';
    });

    expect(rejectedCode(raw)).toBe('unknown-card');
  });

  it('rejects a reward-phase save with no pending reward', () => {
    const missing = mutated(rewardSave(), (record) => {
      delete record['pendingReward'];
    });
    const nullReward = mutated(rewardSave(), (record) => {
      record['pendingReward'] = null;
    });

    expect(rejectedCode(missing)).toBe('missing-pending-reward');
    expect(rejectedCode(nullReward)).toBe('missing-pending-reward');
  });

  it('rejects pending rewards that fail the reward contract', () => {
    const save = rewardSave(30);
    const offers = save.pendingReward ?? [];
    const first = at(offers, 0);
    const second = at(offers, 1);

    const wrongCount = mutated(save, (record) => {
      record['pendingReward'] = [first, second];
    });
    const duplicate = mutated(save, (record) => {
      record['pendingReward'] = [first, first, second];
    });
    const outOfPool = mutated(save, (record) => {
      record['pendingReward'] = [
        { kind: 'card', cardId: 'not-a-card' },
        second,
        first,
      ];
    });
    const healInFirstSlot = mutated(save, (record) => {
      record['pendingReward'] = [
        { kind: 'heal', amount: 12 },
        first,
        second,
      ];
    });
    const wrongHealAmount = mutated(save, (record) => {
      record['pendingReward'] = [
        first,
        second,
        { kind: 'heal', amount: 5 },
      ];
    });

    expect(rejectedCode(wrongCount)).toBe('invalid-pending-reward');
    expect(rejectedCode(duplicate)).toBe('invalid-pending-reward');
    expect(rejectedCode(outOfPool)).toBe('invalid-pending-reward');
    expect(rejectedCode(healInFirstSlot)).toBe('invalid-pending-reward');
    expect(rejectedCode(wrongHealAmount)).toBe('invalid-pending-reward');
  });

  it('ignores a redundant battle outside the battle phase', () => {
    const battle = battleSave();
    const raw = mutated(overviewSave(), (record) => {
      record['battle'] = battle.save.battle;
    });

    const loaded = validate(raw);

    expect(loaded.save.battle).toBeNull();
    expect(loaded.battle).toBeNull();
    expect(loaded.save.run.phase).toBe('overview');
  });

  it('ignores a redundant reward outside the reward phase', () => {
    const offers = rewardSave(19).pendingReward;
    const raw = mutated(overviewSave(), (record) => {
      record['pendingReward'] = offers;
    });

    const loaded = validate(raw);

    expect(loaded.save.pendingReward).toBeNull();
    expect(loaded.battle).toBeNull();
  });

  it('drops unknown extra keys instead of rejecting the save', () => {
    const raw = mutated(overviewSave(), (record) => {
      record['futureField'] = 'ignored';
      asRecord(record['run'])['futureRunField'] = true;
    });

    const loaded = validate(raw);

    expect(loaded.save.schemaVersion).toBe(RUN_SAVE_SCHEMA_VERSION);
    expect('futureField' in loaded.save).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Battle snapshot validation                                                 */
/* -------------------------------------------------------------------------- */

describe('run save battle snapshot', () => {
  it('requires the snapshot in the battle phase', () => {
    const missing = mutated(battleSave().save, (record) => {
      delete record['battle'];
    });
    const nullBattle = mutated(battleSave().save, (record) => {
      record['battle'] = null;
    });

    expect(rejectedCode(missing)).toBe('missing-battle-snapshot');
    expect(rejectedCode(nullBattle)).toBe('missing-battle-snapshot');
  });

  it('rejects a snapshot with an unknown schema version', () => {
    const raw = mutated(battleSave().save, (record) => {
      asRecord(record['battle'])['schemaVersion'] = BATTLE_SCHEMA_VERSION + 1;
    });

    expect(rejectedCode(raw)).toBe('invalid-battle-snapshot');
  });

  it('rejects a snapshot with an unknown card id', () => {
    const raw = mutated(battleSave().save, (record) => {
      const battle = asRecord(record['battle']);
      const sides = asRecord(battle['sides']);
      const player = asRecord(sides['player']);
      const deck = asArray(player['deck']);
      asRecord(deck[0])['cardId'] = 'not-a-card';
    });

    expect(rejectedCode(raw)).toBe('invalid-battle-snapshot');
  });

  it('rejects a snapshot that lost the enemy telegraph', () => {
    const raw = mutated(battleSave().save, (record) => {
      delete asRecord(record['battle'])['enemyPlan'];
    });

    expect(rejectedCode(raw)).toBe('invalid-battle-snapshot');
  });

  it('rejects a snapshot whose phase and outcome disagree', () => {
    const raw = mutated(battleSave().save, (record) => {
      asRecord(record['battle'])['outcome'] = 'player-victory';
    });

    expect(rejectedCode(raw)).toBe('invalid-battle-snapshot');
  });
});

/* -------------------------------------------------------------------------- */
/* Load and discard                                                           */
/* -------------------------------------------------------------------------- */

describe('loadRunSave', () => {
  it('returns empty when no save is stored', () => {
    const storage = new MemoryStorage();
    const loaded = loadRunSave(storage);

    expect(loaded).toEqual({
      status: 'empty',
      save: null,
      battle: null,
      error: null,
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('round-trips a battle save through the adapter', () => {
    const storage = new MemoryStorage();
    const { save, battle } = battleSave();

    storage.values.set(RUN_SAVE_STORAGE_KEY, serializeRunSave(save));

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('ok');
    expect(loaded.save).toEqual(save);
    expect(loaded.battle).toEqual(battle);
    expect(loaded.error).toBeNull();
  });

  it('discards an unknown version and removes only the run key', () => {
    const storage = new MemoryStorage();
    storage.values.set(SETTINGS_KEY, SETTINGS_RAW);
    storage.values.set(STATS_KEY, STATS_RAW);

    const raw = rawOf(overviewSave());
    raw['schemaVersion'] = 2;
    storage.values.set(RUN_SAVE_STORAGE_KEY, JSON.stringify(raw));

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('discarded');
    expect(loaded.save).toBeNull();
    expect(loaded.battle).toBeNull();
    expect(loaded.error?.code).toBe('unknown-schema-version');
    expect(storage.raw()).toBeNull();
    expect(storage.raw(SETTINGS_KEY)).toBe(SETTINGS_RAW);
    expect(storage.raw(STATS_KEY)).toBe(STATS_RAW);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).toHaveBeenCalledWith(RUN_SAVE_STORAGE_KEY);
  });

  it('discards corrupt JSON and removes only the run key', () => {
    const storage = new MemoryStorage();
    storage.values.set(SETTINGS_KEY, SETTINGS_RAW);
    storage.values.set(RUN_SAVE_STORAGE_KEY, '{not json');

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('discarded');
    expect(loaded.error?.code).toBe('invalid-json');
    expect(loaded.save).toBeNull();
    expect(storage.raw()).toBeNull();
    expect(storage.raw(SETTINGS_KEY)).toBe(SETTINGS_RAW);
  });

  it('discards a JSON payload that is not an object', () => {
    const storage = new MemoryStorage();
    storage.values.set(RUN_SAVE_STORAGE_KEY, 'null');

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('discarded');
    expect(loaded.error?.code).toBe('invalid-save');
    expect(storage.raw()).toBeNull();
  });

  it('discards a save with an invalid battle and removes only the run key', () => {
    const storage = new MemoryStorage();
    const save = battleSave().save;
    const raw = mutated(save, (record) => {
      asRecord(record['battle'])['schemaVersion'] = 99;
    });
    storage.values.set(STATS_KEY, STATS_RAW);
    storage.values.set(RUN_SAVE_STORAGE_KEY, JSON.stringify(raw));

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('discarded');
    expect(loaded.error?.code).toBe('invalid-battle-snapshot');
    expect(storage.raw()).toBeNull();
    expect(storage.raw(STATS_KEY)).toBe(STATS_RAW);
  });

  it('reports unavailable when reading throws', () => {
    const loaded = loadRunSave(throwingReadStorage());

    expect(loaded).toEqual({
      status: 'unavailable',
      save: null,
      battle: null,
      error: null,
    });
  });

  it('reports unavailable when there is no adapter', () => {
    expect(loadRunSave(null).status).toBe('unavailable');
  });

  it('still discards when the removal throws', () => {
    const storage: RunSaveStorage = {
      getItem: () => '{not json',
      setItem: vi.fn(),
      removeItem: () => {
        throw new Error('storage is blocked');
      },
    };

    const loaded = loadRunSave(storage);

    expect(loaded.status).toBe('discarded');
    expect(loaded.error?.code).toBe('invalid-json');
  });

  it('does not remove the key for a valid save', () => {
    const storage = new MemoryStorage();
    storage.values.set(RUN_SAVE_STORAGE_KEY, serializeRunSave(overviewSave()));

    expect(loadRunSave(storage).status).toBe('ok');
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

describe('saveRunSave', () => {
  it('writes the canonical payload and reports saved', () => {
    const storage = new MemoryStorage();
    const save = battleSave().save;
    const result = saveRunSave(storage, save);

    expect(result).toEqual({ status: 'saved', saved: true, error: null });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      RUN_SAVE_STORAGE_KEY,
      serializeRunSave(save),
    );
    expect(storage.raw()).toBe(serializeRunSave(save));
  });

  it('never writes invalid data over a good save', () => {
    const storage = new MemoryStorage();
    const good = serializeRunSave(overviewSave());
    storage.values.set(RUN_SAVE_STORAGE_KEY, good);

    const invalid = overviewSave({
      run: makeRun({ deck: ['not-a-card'] }),
    });
    const result = saveRunSave(storage, invalid);

    expect(result.status).toBe('invalid');
    expect(result.saved).toBe(false);
    expect(result.error?.code).toBe('unknown-card');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.raw()).toBe(good);
  });

  it('reports unavailable on a quota rejection without throwing', () => {
    const result = saveRunSave(quotaStorage(), overviewSave());

    expect(result).toEqual({
      status: 'unavailable',
      saved: false,
      error: null,
    });
  });

  it('reports unavailable when there is no adapter', () => {
    expect(saveRunSave(null, overviewSave())).toEqual({
      status: 'unavailable',
      saved: false,
      error: null,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

describe('createRunSaveStore', () => {
  it('saves, loads and clears through the adapter', () => {
    const storage = new MemoryStorage();
    const store = createRunSaveStore(storage);
    const { save, battle } = battleSave();

    expect(store.save(save).status).toBe('saved');
    expect(store.isPersistent).toBe(true);

    const loaded = store.load();

    expect(loaded.status).toBe('ok');
    expect(loaded.save).toEqual(save);
    expect(loaded.battle).toEqual(battle);

    expect(store.clear()).toBe(true);
    expect(storage.raw()).toBeNull();
    expect(store.load().status).toBe('empty');
  });

  it('keeps playing in memory after a quota error', () => {
    const store = createRunSaveStore(quotaStorage());
    const { save, battle } = battleSave();

    const write = store.save(save);

    expect(write.status).toBe('unavailable');
    expect(write.saved).toBe(false);
    expect(store.isPersistent).toBe(false);

    const loaded = store.load();

    expect(loaded.status).toBe('unavailable');
    expect(loaded.save).toEqual(save);
    expect(loaded.battle).toEqual(battle);

    // A second save still succeeds in memory and still reports unavailable.
    expect(store.save(save).status).toBe('unavailable');
    expect(store.load().save).toEqual(save);
  });

  it('reports unavailable when there is no storage at all', () => {
    const store = createRunSaveStore(null);
    const save = overviewSave();

    expect(store.isPersistent).toBe(false);
    expect(store.save(save).status).toBe('unavailable');
    expect(store.load()).toEqual({
      status: 'unavailable',
      save,
      battle: null,
      error: null,
    });
    expect(store.clear()).toBe(false);
  });

  it('does not replace the in-memory save when the next payload is invalid', () => {
    const storage = new MemoryStorage();
    const store = createRunSaveStore(storage);
    const good = overviewSave();

    expect(store.save(good).status).toBe('saved');

    const invalid = overviewSave({ seed: -1 });
    expect(store.save(invalid).status).toBe('invalid');

    const loaded = store.load();

    expect(loaded.status).toBe('ok');
    expect(loaded.save).toEqual(good);
  });

  it('reports a failed clear without throwing and keeps the durable save', () => {
    const storage = new MemoryStorage();
    storage.removeItem.mockImplementation(() => {
      throw new Error('storage is blocked');
    });

    const store = createRunSaveStore(storage);
    const save = overviewSave();

    expect(store.save(save).status).toBe('saved');
    expect(store.clear()).toBe(false);
    expect(store.isPersistent).toBe(false);

    // The removal failed, so the durable key is still there and a reload can
    // still resume it. Clearing the session copy must not invent a discard.
    const loaded = store.load();

    expect(loaded.status).toBe('ok');
    expect(loaded.save).toEqual(save);
  });

  it('reports a corrupt stored save as discarded and drops the memory copy', () => {
    const storage = new MemoryStorage();
    storage.values.set(RUN_SAVE_STORAGE_KEY, '{not json');

    const store = createRunSaveStore(storage);
    const loaded = store.load();

    expect(loaded.status).toBe('discarded');
    expect(loaded.save).toBeNull();
    expect(loaded.error?.code).toBe('invalid-json');
    expect(storage.raw()).toBeNull();
  });

  it('never touches the settings or stats keys', () => {
    const storage = new MemoryStorage();
    storage.values.set(SETTINGS_KEY, SETTINGS_RAW);
    storage.values.set(STATS_KEY, STATS_RAW);

    const store = createRunSaveStore(storage);
    const { save } = battleSave();

    store.save(save);
    store.load();
    store.clear();

    expect(storage.values.get(SETTINGS_KEY)).toBe(SETTINGS_RAW);
    expect(storage.values.get(STATS_KEY)).toBe(STATS_RAW);

    for (const call of storage.getItem.mock.calls) {
      expect(call[0]).toBe(RUN_SAVE_STORAGE_KEY);
    }

    for (const call of storage.setItem.mock.calls) {
      expect(call[0]).toBe(RUN_SAVE_STORAGE_KEY);
    }

    for (const call of storage.removeItem.mock.calls) {
      expect(call[0]).toBe(RUN_SAVE_STORAGE_KEY);
    }
  });

  it('returns unavailable from a store with the default adapter in node', () => {
    const store = createRunSaveStore();

    expect(store.isPersistent).toBe(false);
    expect(store.load().status).toBe('unavailable');
  });
});

/* -------------------------------------------------------------------------- */
/* Clear                                                                      */
/* -------------------------------------------------------------------------- */

describe('clearRunSave', () => {
  it('removes only the run key', () => {
    const storage = new MemoryStorage();
    storage.values.set(SETTINGS_KEY, SETTINGS_RAW);
    storage.values.set(STATS_KEY, STATS_RAW);
    storage.values.set(RUN_SAVE_STORAGE_KEY, serializeRunSave(overviewSave()));

    expect(clearRunSave(storage)).toBe(true);
    expect(storage.raw()).toBeNull();
    expect(storage.raw(SETTINGS_KEY)).toBe(SETTINGS_RAW);
    expect(storage.raw(STATS_KEY)).toBe(STATS_RAW);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).toHaveBeenCalledWith(RUN_SAVE_STORAGE_KEY);
  });

  it('returns false without storage', () => {
    expect(clearRunSave(null)).toBe(false);
  });

  it('returns false when removal throws and never crashes', () => {
    expect(clearRunSave(throwingRemoveStorage())).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Reward offers are part of the saved state                                  */
/* -------------------------------------------------------------------------- */

describe('pending reward persistence', () => {
  it('restores a heal option exactly', () => {
    const save = rewardSave(10);
    const loaded = validate(save);
    const offers: readonly RewardOffer[] = loaded.save.pendingReward ?? [];

    expect(offers).toHaveLength(3);
    expect(offers[2]).toEqual({ kind: 'heal', amount: 12 });
  });

  it('keeps the reward PRNG state identical across a JSON round trip', () => {
    const save = rewardSave(30);
    const parsed = parseStoredRunSave(serializeRunSave(save));

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.save.rngState).toEqual(save.rngState);
    expect(nextUint32(parsed.value.save.rngState)).toEqual(
      nextUint32(save.rngState),
    );
  });
});
