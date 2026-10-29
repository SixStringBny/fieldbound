// @vitest-environment node
/**
 * Solo run model tests (RUN-FR-01, RUN-FR-02, RUN-FR-04, VIS-CON-08).
 *
 * Everything here is a pure state transition: no storage, no React and no
 * engine call. The suite pins the documented ladder and numbers, then walks
 * the lifecycle from creation through a normal victory, a reward, the boss and
 * a defeat. Fixture runs are plain `RunState` objects so boundary health values
 * (34, 20, 19, 10) can be tested without simulating a battle.
 */
import { describe, expect, it } from 'vitest';

import { deckByElement } from '../content/decks';
import { ENEMIES, ENEMY_IDS } from '../content/enemies';
import { FIELD_ELEMENTS, PLAYER_MAX_HEALTH } from '../engine/types';
import type { FieldElement } from '../engine/types';
import {
  RUN_ENCOUNTER_COUNT,
  RUN_HEAL,
  RUN_LADDER,
  RUN_MAX_HEALTH,
  RUN_PHASES,
  RUN_SCHEMA_VERSION,
  applyBattleResult,
  createRun,
  currentEnemy,
  encountersCleared,
  isBossEncounter,
  isRunOver,
  reachedEncounter,
  resolveReward,
  runSummary,
  startEncounter,
  validateRunState,
} from './run-model';
import type {
  RunBattleResult,
  RunResult,
  RunRewardChoice,
  RunState,
} from './run-model';

/* -------------------------------------------------------------------------- */
/* Helpers and fixtures                                                        */
/* -------------------------------------------------------------------------- */

/** Documented ladder names in order. */
const LADDER_NAMES = [
  'Cinder Warden',
  'Rime Sentinel',
  'Storm Herald',
  'The Hollow Field',
] as const;

/** Documented ladder health in order. */
const LADDER_HEALTH = [30, 35, 40, 60] as const;

const BOSS_INDEX = RUN_ENCOUNTER_COUNT - 1;

function starterDeck(element: FieldElement): readonly string[] {
  const deck = deckByElement(element);

  if (deck === undefined) {
    throw new Error(`no starter deck for ${element}`);
  }

  return deck.cards;
}

/** Unwraps a successful transition; a failure fails the test with its code. */
function ok<T>(result: RunResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `expected success, received ${result.error.code}: ${result.error.message}`,
    );
  }

  return result.value;
}

/** Returns the typed code of a rejected transition. */
function rejected<T>(result: RunResult<T>): string {
  if (result.ok) {
    throw new Error('expected a typed failure, received success');
  }

  return result.error.code;
}

/** A complete run in any phase; overrides express the case under test. */
function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    seed: 123_456_789,
    element: 'ember',
    health: RUN_MAX_HEALTH,
    deck: [...starterDeck('ember')],
    encounterIndex: 0,
    turnsTotal: 0,
    cardsAdded: 0,
    damageTaken: 0,
    phase: 'overview',
    ...overrides,
  };
}

function battleRun(overrides: Partial<RunState> = {}): RunState {
  return makeRun({ phase: 'battle', ...overrides });
}

function victory(
  overrides: Partial<RunBattleResult> = {},
): RunBattleResult {
  return {
    outcome: 'player-victory',
    turns: 5,
    damageTaken: 10,
    health: 30,
    ...overrides,
  };
}

function defeat(overrides: Partial<RunBattleResult> = {}): RunBattleResult {
  return {
    outcome: 'opponent-victory',
    turns: 7,
    damageTaken: 25,
    health: 0,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                   */
/* -------------------------------------------------------------------------- */

describe('createRun', () => {
  it('pins the documented ladder order and health', () => {
    expect(RUN_LADDER.map((enemy) => enemy.name)).toEqual([
      ...LADDER_NAMES,
    ]);
    expect(RUN_LADDER.map((enemy) => enemy.maxHealth)).toEqual([
      ...LADDER_HEALTH,
    ]);
    expect(RUN_LADDER.map((enemy) => enemy.id)).toEqual([...ENEMY_IDS]);
    expect(RUN_LADDER).toEqual(ENEMIES);
    expect(RUN_ENCOUNTER_COUNT).toBe(4);
  });

  it('pins the frozen run numbers', () => {
    expect(RUN_MAX_HEALTH).toBe(40);
    expect(RUN_MAX_HEALTH).toBe(PLAYER_MAX_HEALTH);
    expect(RUN_HEAL).toBe(12);
    expect(RUN_SCHEMA_VERSION).toBe(1);
    expect(RUN_PHASES).toEqual([
      'overview',
      'battle',
      'reward',
      'victory',
      'defeat',
    ]);
  });

  it.each([...FIELD_ELEMENTS])(
    'starts a %s run at 40 health with the matching 10-card deck',
    (element) => {
      const run = ok(createRun(element, 424_242));

      expect(run.schemaVersion).toBe(RUN_SCHEMA_VERSION);
      expect(run.seed).toBe(424_242);
      expect(run.element).toBe(element);
      expect(run.health).toBe(40);
      expect(run.deck).toEqual([...starterDeck(element)]);
      expect(run.deck).toHaveLength(10);
      expect(run.encounterIndex).toBe(0);
      expect(run.turnsTotal).toBe(0);
      expect(run.cardsAdded).toBe(0);
      expect(run.damageTaken).toBe(0);
      expect(run.phase).toBe('overview');
      expect(currentEnemy(run)?.id).toBe(ENEMY_IDS[0]);
    },
  );

  it('copies the starter deck rather than aliasing content', () => {
    const first = ok(createRun('ember', 1));
    const second = ok(createRun('ember', 2));

    expect(first.deck).not.toBe(second.deck);
    expect(first.deck).not.toBe(starterDeck('ember'));
    expect(first.deck).toEqual(second.deck);
  });

  it('accepts both ends of the unsigned 32-bit seed range', () => {
    expect(ok(createRun('frost', 0)).seed).toBe(0);
    expect(ok(createRun('frost', 0xffff_ffff)).seed).toBe(0xffff_ffff);
  });

  it('rejects an element with no starter deck', () => {
    const result = createRun('arcane' as FieldElement, 1);

    expect(rejected(result)).toBe('invalid-element');
    expect(result.ok).toBe(false);
  });

  it.each([-1, 1.5, 0x1_0000_0000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid seed %s',
    (seed) => {
      const result = createRun('ember', seed);

      expect(rejected(result)).toBe('invalid-seed');
      expect(result.ok).toBe(false);
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Encounter start                                                            */
/* -------------------------------------------------------------------------- */

describe('startEncounter', () => {
  it('moves from overview into battle without changing carry state', () => {
    const run = makeRun({ health: 31, turnsTotal: 4, damageTaken: 9 });
    const next = ok(startEncounter(run));

    expect(next.phase).toBe('battle');
    expect(next.health).toBe(31);
    expect(next.deck).toEqual(run.deck);
    expect(next.encounterIndex).toBe(0);
    expect(next.turnsTotal).toBe(4);
    expect(next.damageTaken).toBe(9);
    expect(next.cardsAdded).toBe(0);
  });

  it.each(['battle', 'reward', 'victory', 'defeat'] as const)(
    'rejects starting an encounter during the %s phase',
    (phase) => {
      expect(rejected(startEncounter(makeRun({ phase })))).toBe(
        'invalid-phase',
      );
    },
  );

  it('rejects an encounter index outside the ladder', () => {
    expect(rejected(startEncounter(makeRun({ encounterIndex: 99 })))).toBe(
      'invalid-encounter',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Battle results                                                             */
/* -------------------------------------------------------------------------- */

describe('applyBattleResult', () => {
  it('heals 12 after a normal victory and waits for the reward', () => {
    const run = battleRun({ health: 40, encounterIndex: 0 });
    const next = ok(
      applyBattleResult(
        run,
        victory({ turns: 6, damageTaken: 6, health: 34 }),
      ),
    );

    expect(next.phase).toBe('reward');
    expect(next.health).toBe(40);
    expect(next.encounterIndex).toBe(0);
    expect(next.turnsTotal).toBe(6);
    expect(next.damageTaken).toBe(6);
  });

  it.each([
    [20, 32],
    [19, 31],
    [10, 22],
    [1, 13],
    [40, 40],
  ])(
    'heals 12 at %i health capped at 40 (expected %i)',
    (health, expected) => {
      const run = battleRun({ health: 40 });
      const next = ok(
        applyBattleResult(
          run,
          victory({ health, damageTaken: 40 - health, turns: 4 }),
        ),
      );

      expect(next.health).toBe(expected);
      expect(next.health).toBeLessThanOrEqual(RUN_MAX_HEALTH);
      expect(next.phase).toBe('reward');
    },
  );

  it('carries the reported battle health instead of recomputing from damage', () => {
    // 20 damage was taken but 12 was healed in battle: the player ends at 32,
    // not at 40 - 20 = 20. The carried value must be the engine's 32.
    const run = battleRun({ health: 40 });
    const next = ok(
      applyBattleResult(
        run,
        victory({ health: 32, damageTaken: 20, turns: 5 }),
      ),
    );

    expect(next.health).toBe(40);
    expect(next.health).not.toBe(32);
  });

  it('ends the run on a boss victory without healing or a reward', () => {
    const run = battleRun({ health: 40, encounterIndex: BOSS_INDEX });
    const next = ok(
      applyBattleResult(
        run,
        victory({ turns: 9, damageTaken: 10, health: 30 }),
      ),
    );

    expect(next.phase).toBe('victory');
    expect(next.health).toBe(30);
    expect(next.encounterIndex).toBe(BOSS_INDEX);
    expect(next.turnsTotal).toBe(9);
    expect(next.damageTaken).toBe(10);
    expect(isRunOver(next)).toBe(true);
    expect(isBossEncounter(next)).toBe(true);
  });

  it('ends the run on a defeat and preserves the encounter and totals', () => {
    const run = battleRun({
      encounterIndex: 2,
      health: 25,
      turnsTotal: 20,
      cardsAdded: 2,
      damageTaken: 30,
    });
    const next = ok(
      applyBattleResult(
        run,
        defeat({ turns: 7, damageTaken: 25, health: 0 }),
      ),
    );

    expect(next.phase).toBe('defeat');
    expect(next.encounterIndex).toBe(2);
    expect(next.health).toBe(0);
    expect(next.turnsTotal).toBe(27);
    expect(next.cardsAdded).toBe(2);
    expect(next.damageTaken).toBe(55);
    expect(reachedEncounter(next)).toBe(3);
    expect(encountersCleared(next)).toBe(2);
  });

  it('rejects a defeat that does not report the player at 0 health', () => {
    const result = applyBattleResult(
      battleRun({ health: 25 }),
      defeat({ health: 10, damageTaken: 15 }),
    );

    expect(rejected(result)).toBe('invalid-battle-result');
  });

  it('carries in-battle healing on a boss victory without healing again', () => {
    const run = battleRun({ health: 40, encounterIndex: BOSS_INDEX });
    const next = ok(
      applyBattleResult(
        run,
        victory({ health: 32, damageTaken: 20, turns: 8 }),
      ),
    );

    expect(next.phase).toBe('victory');
    expect(next.health).toBe(32);
    expect(next.turnsTotal).toBe(8);
    expect(next.damageTaken).toBe(20);
  });

  it('accumulates turns and damage exactly once across two battles', () => {
    let run = ok(createRun('gale', 7));
    run = ok(startEncounter(run));
    run = ok(
      applyBattleResult(
        run,
        victory({ turns: 5, damageTaken: 10, health: 30 }),
      ),
    );

    expect(run.phase).toBe('reward');
    expect(run.turnsTotal).toBe(5);
    expect(run.damageTaken).toBe(10);

    run = ok(resolveReward(run, { kind: 'card', cardId: 'neutral-probe' }));
    expect(run.encounterIndex).toBe(1);
    expect(run.phase).toBe('overview');

    run = ok(startEncounter(run));
    run = ok(
      applyBattleResult(
        run,
        victory({ turns: 8, damageTaken: 15, health: 25 }),
      ),
    );

    expect(run.phase).toBe('reward');
    expect(run.turnsTotal).toBe(13);
    expect(run.damageTaken).toBe(25);
    expect(run.cardsAdded).toBe(1);
    expect(run.deck).toHaveLength(11);
  });

  it('rejects a repeated result so totals cannot double-count', () => {
    const run = battleRun();
    const result = victory({ turns: 6, damageTaken: 10, health: 30 });
    const first = ok(applyBattleResult(run, result));

    const second = applyBattleResult(first, result);

    expect(rejected(second)).toBe('invalid-phase');
    expect(first.turnsTotal).toBe(6);
    expect(first.damageTaken).toBe(10);
  });

  it.each(['overview', 'reward', 'victory', 'defeat'] as const)(
    'rejects a battle result during the %s phase',
    (phase) => {
      const result = applyBattleResult(makeRun({ phase }), victory());

      expect(rejected(result)).toBe('invalid-phase');
    },
  );

  it('rejects an encounter index outside the ladder', () => {
    expect(
      rejected(applyBattleResult(battleRun({ encounterIndex: 99 }), victory())),
    ).toBe('invalid-encounter');
  });

  it('rejects an unsettled outcome', () => {
    const unsettled = {
      outcome: 'ongoing',
      turns: 1,
      damageTaken: 0,
      health: 40,
    } as unknown as RunBattleResult;

    expect(rejected(applyBattleResult(battleRun(), unsettled))).toBe(
      'invalid-battle-result',
    );
  });

  it.each([
    ['negative turns', { turns: -1 }],
    ['fractional turns', { turns: 1.5 }],
    ['negative damage', { damageTaken: -1 }],
    ['negative health', { health: -1 }],
    ['health above the maximum', { health: RUN_MAX_HEALTH + 1 }],
    ['fractional health', { health: 12.5 }],
  ])('rejects %s', (_label, overrides) => {
    const result = applyBattleResult(
      battleRun(),
      victory(overrides as Partial<RunBattleResult>),
    );

    expect(rejected(result)).toBe('invalid-battle-result');
  });

  it('rejects damage below the health actually lost', () => {
    const result = applyBattleResult(
      battleRun({ health: 40 }),
      victory({ health: 30, damageTaken: 5 }),
    );

    expect(rejected(result)).toBe('invalid-battle-result');
  });

  it('rejects a result that is not an object', () => {
    const result = applyBattleResult(
      battleRun(),
      null as unknown as RunBattleResult,
    );

    expect(rejected(result)).toBe('invalid-battle-result');
  });
});

/* -------------------------------------------------------------------------- */
/* Rewards                                                                    */
/* -------------------------------------------------------------------------- */

describe('resolveReward', () => {
  it('appends exactly one card, counts it and advances the ladder', () => {
    const run = makeRun({ phase: 'reward', health: 27, encounterIndex: 0 });
    const next = ok(
      resolveReward(run, { kind: 'card', cardId: 'neutral-probe' }),
    );

    expect(next.deck).toEqual([...run.deck, 'neutral-probe']);
    expect(next.deck).toHaveLength(11);
    expect(next.cardsAdded).toBe(1);
    expect(next.health).toBe(27);
    expect(next.encounterIndex).toBe(1);
    expect(next.phase).toBe('overview');
  });

  it.each([
    [19, 31],
    [34, 40],
    [40, 40],
  ])(
    'restores 12 health at %i capped at 40 (expected %i) without a card',
    (health, expected) => {
      const run = makeRun({
        phase: 'reward',
        health,
        cardsAdded: 1,
        encounterIndex: 1,
      });
      const next = ok(resolveReward(run, { kind: 'heal' }));

      expect(next.health).toBe(expected);
      expect(next.health).toBeLessThanOrEqual(RUN_MAX_HEALTH);
      expect(next.deck).toEqual(run.deck);
      expect(next.cardsAdded).toBe(1);
      expect(next.encounterIndex).toBe(2);
      expect(next.phase).toBe('overview');
    },
  );

  it('rejects a second choice against the same offer', () => {
    const run = makeRun({ phase: 'reward' });
    const first = ok(
      resolveReward(run, { kind: 'card', cardId: 'neutral-probe' }),
    );

    const second = resolveReward(first, { kind: 'heal' });

    expect(rejected(second)).toBe('invalid-phase');
    expect(first.deck).toHaveLength(11);
    expect(first.health).toBe(RUN_MAX_HEALTH);
    expect(first.encounterIndex).toBe(1);
  });

  it.each(['overview', 'battle', 'victory', 'defeat'] as const)(
    'rejects a reward choice during the %s phase',
    (phase) => {
      const result = resolveReward(makeRun({ phase }), { kind: 'heal' });

      expect(rejected(result)).toBe('invalid-phase');
    },
  );

  it('rejects the boss encounter as a reward phase', () => {
    const run = makeRun({
      phase: 'reward',
      encounterIndex: BOSS_INDEX,
    });

    expect(rejected(resolveReward(run, { kind: 'heal' }))).toBe(
      'invalid-encounter',
    );
  });

  it.each(['', '   ', ' neutral-probe '])(
    'rejects inexact card id %j',
    (cardId) => {
      const result = resolveReward(makeRun({ phase: 'reward' }), {
        kind: 'card',
        cardId,
      });

      expect(rejected(result)).toBe('invalid-reward');
    },
  );

  it('rejects an unknown reward kind', () => {
    const result = resolveReward(
      makeRun({ phase: 'reward' }),
      { kind: 'skip' } as unknown as RunRewardChoice,
    );

    expect(rejected(result)).toBe('invalid-reward');
  });

  it('keeps all unrelated fields intact', () => {
    const run = makeRun({
      phase: 'reward',
      seed: 77,
      element: 'stone',
      health: 18,
      encounterIndex: 2,
      turnsTotal: 30,
      cardsAdded: 2,
      damageTaken: 44,
    });
    const next = ok(
      resolveReward(run, { kind: 'card', cardId: 'neutral-channel' }),
    );

    expect(next.seed).toBe(77);
    expect(next.element).toBe('stone');
    expect(next.turnsTotal).toBe(30);
    expect(next.damageTaken).toBe(44);
    expect(next.cardsAdded).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Derived state and result summary                                           */
/* -------------------------------------------------------------------------- */

describe('derived run state', () => {
  it('maps every ladder index to its content enemy', () => {
    expect(
      RUN_LADDER.map((_enemy, index) => currentEnemy(makeRun({ encounterIndex: index }))?.name),
    ).toEqual([...LADDER_NAMES]);
  });

  it('marks only the final index as the boss', () => {
    expect(
      RUN_LADDER.map((_enemy, index) =>
        isBossEncounter(makeRun({ encounterIndex: index })),
      ),
    ).toEqual([false, false, false, true]);
  });

  it.each([
    ['overview', 0, 0],
    ['battle', 0, 0],
    ['reward', 0, 1],
    ['overview', 1, 1],
    ['battle', 1, 1],
    ['reward', 2, 3],
    ['defeat', 2, 2],
    ['victory', BOSS_INDEX, 4],
  ] as const)(
    'counts cleared encounters for %s at index %i as %i',
    (phase, encounterIndex, cleared) => {
      expect(
        encountersCleared(makeRun({ phase, encounterIndex })),
      ).toBe(cleared);
      expect(reachedEncounter(makeRun({ phase, encounterIndex }))).toBe(
        Math.min(4, encounterIndex + 1),
      );
    },
  );

  it('reports a run over only after victory or defeat', () => {
    expect(RUN_PHASES.map((phase) => isRunOver(makeRun({ phase })))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('has no summary while the run is in progress', () => {
    expect(runSummary(makeRun({ phase: 'overview' }))).toBeNull();
    expect(runSummary(makeRun({ phase: 'battle' }))).toBeNull();
    expect(runSummary(makeRun({ phase: 'reward' }))).toBeNull();
  });

  it('summarizes a completed victory', () => {
    let run = ok(createRun('ember', 5));
    run = ok(startEncounter(run));
    run = ok(
      applyBattleResult(run, victory({ turns: 4, damageTaken: 3, health: 37 })),
    );
    run = ok(resolveReward(run, { kind: 'card', cardId: 'neutral-probe' }));
    run = ok(startEncounter(run));
    run = ok(
      applyBattleResult(run, victory({ turns: 6, damageTaken: 9, health: 31 })),
    );
    run = ok(resolveReward(run, { kind: 'heal' }));
    run = ok(startEncounter(run));
    run = ok(
      applyBattleResult(run, victory({ turns: 5, damageTaken: 12, health: 28 })),
    );
    run = ok(resolveReward(run, { kind: 'card', cardId: 'neutral-channel' }));
    run = ok(startEncounter(run));
    run = ok(
      applyBattleResult(
        run,
        victory({ turns: 11, damageTaken: 38, health: 22 }),
      ),
    );

    expect(run.phase).toBe('victory');
    expect(runSummary(run)).toEqual({
      outcome: 'victory',
      encountersCleared: 4,
      encountersTotal: 4,
      reachedEncounter: 4,
      turnsTotal: 26,
      cardsAdded: 2,
      damageTaken: 62,
    });
  });

  it('summarizes a completed defeat with the reached step', () => {
    const run = ok(
      applyBattleResult(
        battleRun({ encounterIndex: 2, health: 25 }),
        defeat({ turns: 7, damageTaken: 25, health: 0 }),
      ),
    );

    expect(runSummary(run)).toEqual({
      outcome: 'defeat',
      encountersCleared: 2,
      encountersTotal: 4,
      reachedEncounter: 3,
      turnsTotal: 7,
      cardsAdded: 0,
      damageTaken: 25,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

describe('validateRunState', () => {
  it('round-trips a valid run through JSON', () => {
    const run = ok(createRun('gale', 99));
    const restored = ok(
      validateRunState(JSON.parse(JSON.stringify(run))),
    );

    expect(restored).toEqual(run);
    expect(restored.deck).not.toBe(run.deck);
  });

  it('drops unknown keys and rebuilds a canonical object', () => {
    const parsed = JSON.parse(JSON.stringify(makeRun())) as Record<
      string,
      unknown
    >;
    parsed.extra = 'ignored';

    const restored = ok(validateRunState(parsed));

    expect(restored).toEqual(makeRun());
    expect('extra' in restored).toBe(false);
  });

  it.each([null, undefined, 'run', 42, []])(
    'rejects non-object input %j',
    (input) => {
      expect(rejected(validateRunState(input))).toBe('invalid-state');
      expect(() => validateRunState(input)).not.toThrow();
    },
  );

  it('rejects an unknown schema version', () => {
    expect(
      rejected(validateRunState({ ...makeRun(), schemaVersion: 2 })),
    ).toBe('invalid-state');
  });

  it.each([-1, 1.5, 0x1_0000_0000])('rejects seed %s', (seed) => {
    expect(rejected(validateRunState({ ...makeRun(), seed }))).toBe(
      'invalid-seed',
    );
  });

  it('rejects an unknown element', () => {
    expect(
      rejected(validateRunState({ ...makeRun(), element: 'arcane' })),
    ).toBe('invalid-element');
  });

  it.each([-1, RUN_MAX_HEALTH + 1, 1.5])(
    'rejects health %s',
    (health) => {
      expect(rejected(validateRunState({ ...makeRun(), health }))).toBe(
        'invalid-state',
      );
    },
  );

  it.each([
    ['not an array', 'cards'],
    ['empty', []],
    ['a non-string id', [1]],
    ['a blank id', ['']],
  ])('rejects a deck that is %s', (_label, deck) => {
    expect(rejected(validateRunState({ ...makeRun(), deck }))).toBe(
      'invalid-state',
    );
  });

  it.each([-1, RUN_ENCOUNTER_COUNT, 1.5])(
    'rejects encounterIndex %s',
    (encounterIndex) => {
      expect(
        rejected(validateRunState({ ...makeRun(), encounterIndex })),
      ).toBe('invalid-encounter');
    },
  );

  it.each(['turnsTotal', 'cardsAdded', 'damageTaken'] as const)(
    'rejects a negative %s',
    (field) => {
      expect(
        rejected(validateRunState({ ...makeRun(), [field]: -1 })),
      ).toBe('invalid-state');
    },
  );

  it('rejects an unknown phase', () => {
    expect(
      rejected(validateRunState({ ...makeRun(), phase: 'setup' })),
    ).toBe('invalid-phase');
  });

  it('rejects a victory before the boss', () => {
    expect(
      rejected(
        validateRunState({
          ...makeRun({ phase: 'victory', encounterIndex: 0 }),
        }),
      ),
    ).toBe('invalid-state');
  });

  it('rejects a reward on the boss', () => {
    expect(
      rejected(
        validateRunState({
          ...makeRun({ phase: 'reward', encounterIndex: BOSS_INDEX }),
        }),
      ),
    ).toBe('invalid-state');
  });

  it('accepts a defeat on the boss', () => {
    const restored = ok(
      validateRunState({
        ...makeRun({ phase: 'defeat', encounterIndex: BOSS_INDEX, health: 0 }),
      }),
    );

    expect(restored.phase).toBe('defeat');
    expect(restored.encounterIndex).toBe(BOSS_INDEX);
    expect(reachedEncounter(restored)).toBe(4);
    expect(encountersCleared(restored)).toBe(3);
  });
});
