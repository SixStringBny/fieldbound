// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  canPlayCard,
  createBattle,
  drawCards,
  endTurn,
  playCard,
} from './battle';
import type { BattleSetup, CardCatalog } from './battle';
import { createRng, nextUint32 } from './rng';
import { restoreSnapshot, serializeSnapshot } from './snapshot';
import {
  BATTLE_SCHEMA_VERSION,
  DEFENSE_CAP,
  HAND_SIZE,
  PLAYER_MAX_HEALTH,
  SIDES,
} from './types';
import type {
  BattleSnapshot,
  BattleState,
  CardDefinition,
  EnemyPlan,
  Side,
  SnapshotErrorCode,
} from './types';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const cardList: readonly CardDefinition[] = [
  { id: 'strike', name: 'Strike', element: 'neutral', type: 'attack', cost: 1, damage: 3 },
  { id: 'ember-strike', name: 'Ember Strike', element: 'ember', type: 'attack', cost: 1, damage: 4 },
  { id: 'ember-ward', name: 'Ash Guard', element: 'ember', type: 'ward', cost: 1, defense: 2 },
  { id: 'shift-ember', name: 'Ember Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'ember' },
  { id: 'channel', name: 'Channel', element: 'neutral', type: 'utility', cost: 0, energy: 1 },
  { id: 'probe', name: 'Probe', element: 'neutral', type: 'utility', cost: 0, draw: 1 },
  { id: 'mend', name: 'Mend', element: 'neutral', type: 'utility', cost: 1, heal: 5 },
  { id: 'focus', name: 'Focus', element: 'neutral', type: 'utility', cost: 0, status: { kind: 'focus', stacks: 1, target: 'self' } },
  { id: 'expose', name: 'Expose', element: 'neutral', type: 'utility', cost: 1, status: { kind: 'weaken', stacks: 1, target: 'opponent' } },
  { id: 'second-wind', name: 'Second Wind', element: 'neutral', type: 'utility', cost: 2, status: { kind: 'regen', stacks: 2, target: 'self' } },
];

const catalog: CardCatalog = Object.fromEntries(
  cardList.map((card) => [card.id, card]),
);

const STARTER_DECK: readonly string[] = cardList.map((card) => card.id);

function first<T>(items: readonly T[]): T {
  const value = items[0];

  if (value === undefined) {
    throw new Error('fixture array is empty');
  }

  return value;
}

function created(): BattleState {
  const setup: BattleSetup = {
    seed: 20_261_028,
    player: {
      element: 'ember',
      cards: STARTER_DECK,
      maxHealth: PLAYER_MAX_HEALTH,
      health: PLAYER_MAX_HEALTH,
    },
    opponent: {
      element: 'frost',
      cards: STARTER_DECK,
      maxHealth: 35,
      health: 35,
    },
    catalog,
  };
  const result = createBattle(setup);

  if (!result.ok) {
    throw new Error(`createBattle failed: ${result.error.code}`);
  }

  return result.value;
}

/** Plays the first legal card; leaves the state alone when none is legal. */
function playFirstLegal(state: BattleState, side: Side): BattleState {
  const held = state.sides[side].hand.find((instance) =>
    canPlayCard(state, side, instance.instanceId, catalog),
  );

  if (held === undefined) {
    return state;
  }

  const result = playCard(
    state,
    { type: 'play-card', side, instanceId: held.instanceId },
    catalog,
  );

  if (!result.ok) {
    throw new Error(`playCard failed: ${result.error.code}`);
  }

  return result.value;
}

function finishTurn(state: BattleState, side: Side): BattleState {
  const result = endTurn(state, { type: 'end-turn', side });

  if (!result.ok) {
    throw new Error(`endTurn failed: ${result.error.code}`);
  }

  return result.value;
}

/**
 * A battle with history: one card played by each side, both hands discarded at
 * least once, a non-empty discard and a partly consumed deck. Both sides have
 * cards in hand, so every zone is exercised by the round-trip tests.
 */
function midBattle(): BattleState {
  let state = created();
  state = playFirstLegal(state, 'player');
  state = finishTurn(state, 'player');
  state = playFirstLegal(state, 'opponent');
  state = finishTurn(state, 'opponent');
  // The enemy draws its next hand at the end of its own turn, so the player's
  // turn sees a populated enemy hand and the telegraph can point at a real
  // instance. This mirrors what `ai.ts` will do after `endTurn`.
  state = drawCards(state, 'opponent', HAND_SIZE);
  return state;
}

/** Adds a telegraph that references a real opponent hand instance. */
function withPlan(state: BattleState): BattleState {
  const held = first(state.sides.opponent.hand);
  const plan: EnemyPlan = {
    side: 'opponent',
    turn: state.turn + 1,
    steps: [
      {
        cardId: held.cardId,
        instanceId: held.instanceId,
        cost: 1,
        damage: 3,
        defense: 0,
        statuses: [],
        shiftTo: null,
        energyAfter: 2,
      },
    ],
    totalDamage: 3,
    totalDefense: 0,
    lethal: false,
    remainingEnergy: 2,
  };

  return { ...state, enemyPlan: plan };
}

/**
 * A player side whose draw pile is empty and whose discard holds two cards, so
 * the next draw must reshuffle with the restored PRNG.
 */
function exhaustedDeckState(): BattleState {
  const base = created();

  return {
    ...base,
    turn: 3,
    rngState: createRng(9),
    sides: {
      player: {
        ...base.sides.player,
        defense: 2,
        energy: 1,
        deck: [],
        hand: [{ instanceId: 'player:hand:0', cardId: 'strike' }],
        discard: [
          { instanceId: 'player:discard:0', cardId: 'mend' },
          { instanceId: 'player:discard:1', cardId: 'probe' },
        ],
      },
      opponent: base.sides.opponent,
    },
  };
}

function restored(state: BattleState): BattleState {
  const result = restoreSnapshot(snapshotOf(state), catalog);

  if (!result.ok) {
    throw new Error(
      `restoreSnapshot failed: ${result.error.code}: ${result.error.message}`,
    );
  }

  return result.value;
}

/* -------------------------------------------------------------------------- */
/* Mutable mirror used to corrupt a snapshot                                   */
/* -------------------------------------------------------------------------- */

interface MutableInstance {
  instanceId: string;
  cardId: string;
}

interface MutableStatuses {
  focus: number;
  weaken: number;
  regen: number;
}

interface MutableSide {
  side: string;
  element: string;
  health: number;
  maxHealth: number;
  defense: number;
  energy: number;
  deck: MutableInstance[];
  hand: MutableInstance[];
  discard: MutableInstance[];
  statuses: MutableStatuses;
}

interface MutablePlanStatus {
  kind: string;
  stacks: number;
  target: string;
}

interface MutableStep {
  cardId: string;
  instanceId: string;
  cost: number;
  damage: number;
  defense: number;
  statuses: MutablePlanStatus[];
  shiftTo: string | null;
  energyAfter: number;
}

interface MutablePlan {
  side: string;
  turn: number;
  steps: MutableStep[];
  totalDamage: number;
  totalDefense: number;
  lethal: unknown;
  remainingEnergy: number;
}

interface MutableSnapshot {
  schemaVersion?: unknown;
  seed: number;
  rngState: unknown;
  turn: number;
  activeSide: string;
  phase: string;
  field: string;
  outcome: string;
  sides: { player: MutableSide; opponent: MutableSide };
  enemyPlan: MutablePlan | null;
}

/** JSON round-trip of the serialized snapshot, typed for controlled corruption. */
function snapshotOf(state: BattleState): MutableSnapshot {
  return JSON.parse(
    JSON.stringify(serializeSnapshot(state)),
  ) as MutableSnapshot;
}

function planOf(snapshot: MutableSnapshot): MutablePlan {
  if (snapshot.enemyPlan === null) {
    throw new Error('fixture snapshot has no enemy plan');
  }

  return snapshot.enemyPlan;
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                               */
/* -------------------------------------------------------------------------- */

function countFunctions(value: unknown): number {
  if (typeof value === 'function') {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce<number>(
      (total, item) => total + countFunctions(item),
      0,
    );
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(
      value as Readonly<Record<string, unknown>>,
    ).reduce<number>((total, item) => total + countFunctions(item), 0);
  }

  return 0;
}

describe('serializeSnapshot', () => {
  it('copies every mutable battle field plus the schema version', () => {
    const state = withPlan(midBattle());
    const snapshot = serializeSnapshot(state);

    expect(Object.keys(snapshot).sort()).toEqual([
      'activeSide',
      'enemyPlan',
      'field',
      'outcome',
      'phase',
      'rngState',
      'schemaVersion',
      'seed',
      'sides',
      'turn',
    ]);
    expect(Object.keys(snapshot.sides.player).sort()).toEqual([
      'deck',
      'defense',
      'discard',
      'element',
      'energy',
      'hand',
      'health',
      'maxHealth',
      'side',
      'statuses',
    ]);
    expect(snapshot.schemaVersion).toBe(BATTLE_SCHEMA_VERSION);
    expect(snapshot.seed).toBe(state.seed);
    expect(snapshot.rngState).toEqual(state.rngState);
    expect(snapshot.turn).toBe(state.turn);
    expect(snapshot.activeSide).toBe(state.activeSide);
    expect(snapshot.phase).toBe(state.phase);
    expect(snapshot.field).toBe(state.field);
    expect(snapshot.outcome).toBe(state.outcome);
    expect(snapshot.sides).toEqual({
      player: state.sides.player,
      opponent: state.sides.opponent,
    });
    expect(snapshot.enemyPlan).toEqual(state.enemyPlan);
  });

  it('contains no functions and survives JSON stringify and parse', () => {
    const snapshot = serializeSnapshot(withPlan(midBattle()));
    const parsed: unknown = JSON.parse(JSON.stringify(snapshot));

    expect(countFunctions(snapshot)).toBe(0);
    expect(parsed).toEqual(snapshot);
  });

  it('does not share nested references with the live battle state', () => {
    const state = withPlan(midBattle());
    const snapshot = serializeSnapshot(state);

    expect(snapshot.sides).not.toBe(state.sides);
    expect(snapshot.sides.player).not.toBe(state.sides.player);
    expect(snapshot.sides.player.hand).not.toBe(state.sides.player.hand);
    expect(snapshot.sides.player.hand[0]).not.toBe(
      state.sides.player.hand[0],
    );
    expect(snapshot.sides.player.statuses).not.toBe(
      state.sides.player.statuses,
    );
    expect(snapshot.rngState).not.toBe(state.rngState);
  });

  it('drops runtime-only properties that are not part of the contract', () => {
    const state = midBattle();
    const dirty = { ...state, debug: () => 1 } as BattleState;
    const snapshot = serializeSnapshot(dirty);

    expect('debug' in snapshot).toBe(false);
    expect(countFunctions(snapshot)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Round trip                                                                  */
/* -------------------------------------------------------------------------- */

describe('snapshot round trip', () => {
  it('restores a mid-battle state exactly', () => {
    const state = withPlan(midBattle());
    const result = restoreSnapshot(snapshotOf(state), catalog);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value).toEqual(state);
    expect('schemaVersion' in result.value).toBe(false);
  });

  it('preserves the exact next legal action set', () => {
    const state = midBattle();
    const resumed = restored(state);

    for (const side of SIDES) {
      for (const instance of state.sides[side].hand) {
        expect(
          canPlayCard(resumed, side, instance.instanceId, catalog),
        ).toBe(canPlayCard(state, side, instance.instanceId, catalog));
      }
    }

    expect(canPlayCard(resumed, 'player', 'not-an-instance', catalog)).toBe(
      canPlayCard(state, 'player', 'not-an-instance', catalog),
    );
    expect(
      canPlayCard(
        resumed,
        'opponent',
        first(state.sides.player.hand).instanceId,
        catalog,
      ),
    ).toBe(
      canPlayCard(
        state,
        'opponent',
        first(state.sides.player.hand).instanceId,
        catalog,
      ),
    );
  });

  it('resumes to the identical state when the same card is played', () => {
    const state = midBattle();
    const resumed = restored(state);
    const actor = state.activeSide;
    const playable = state.sides[actor].hand.find((instance) =>
      canPlayCard(state, actor, instance.instanceId, catalog),
    );

    expect(playable).toBeDefined();

    if (playable === undefined) {
      return;
    }

    const action = {
      type: 'play-card',
      side: actor,
      instanceId: playable.instanceId,
    } as const;
    const before = playCard(state, action, catalog);
    const after = playCard(resumed, action, catalog);

    expect(before.ok).toBe(true);
    expect(after).toEqual(before);
  });

  it('round-trips the enemy telegraph without aliasing it', () => {
    const state = withPlan(midBattle());
    const resumed = restored(state);

    expect(resumed.enemyPlan).toEqual(state.enemyPlan);
    expect(resumed.enemyPlan).not.toBe(state.enemyPlan);

    if (state.enemyPlan !== null && resumed.enemyPlan !== null) {
      expect(resumed.enemyPlan.steps[0]).not.toBe(state.enemyPlan.steps[0]);
    }
  });

  it('round-trips a settled battle', () => {
    const base = created();
    const ended: BattleState = {
      ...base,
      phase: 'ended',
      outcome: 'player-victory',
      enemyPlan: null,
      sides: {
        player: base.sides.player,
        opponent: { ...base.sides.opponent, health: 0 },
      },
    };
    const result = restoreSnapshot(snapshotOf(ended), catalog);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toEqual(ended);
    }
  });

  it('accepts the documented caps exactly', () => {
    const base = created();
    const bounded: BattleState = {
      ...base,
      sides: {
        player: {
          ...base.sides.player,
          defense: DEFENSE_CAP,
          energy: 9,
          statuses: { focus: 3, weaken: 3, regen: 2 },
        },
        opponent: {
          ...base.sides.opponent,
          defense: DEFENSE_CAP,
          statuses: { focus: 0, weaken: 0, regen: 2 },
        },
      },
    };
    const result = restoreSnapshot(serializeSnapshot(bounded), catalog);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.sides.player.defense).toBe(DEFENSE_CAP);
      expect(result.value.sides.player.energy).toBe(9);
      expect(result.value.sides.player.statuses).toEqual({
        focus: 3,
        weaken: 3,
        regen: 2,
      });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* PRNG continuity                                                             */
/* -------------------------------------------------------------------------- */

describe('snapshot PRNG state', () => {
  it('keeps the counter and continues the same draw sequence', () => {
    const state = midBattle();
    const resumed = restored(state);

    expect(resumed.rngState).toEqual(state.rngState);
    expect(nextUint32(resumed.rngState)).toEqual(nextUint32(state.rngState));
    expect(drawCards(resumed, 'player', 3)).toEqual(
      drawCards(state, 'player', 3),
    );
  });

  it('continues the same reshuffle sequence after restore', () => {
    const state = exhaustedDeckState();
    const resumed = restored(state);
    const originalDraw = drawCards(state, 'player', 2);
    const resumedDraw = drawCards(resumed, 'player', 2);

    expect(resumedDraw).toEqual(originalDraw);
    expect(resumedDraw.rngState).not.toEqual(state.rngState);
    expect(resumedDraw.sides.player.hand).toHaveLength(3);
    expect(resumedDraw.sides.player.discard).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Rejections                                                                  */
/* -------------------------------------------------------------------------- */

type RejectionCase = readonly [
  name: string,
  mutate: (snapshot: MutableSnapshot) => void,
  code: SnapshotErrorCode,
];

const rejections: readonly RejectionCase[] = [
  [
    'an unknown schema version',
    (snapshot) => {
      snapshot.schemaVersion = BATTLE_SCHEMA_VERSION + 1;
    },
    'unknown-schema-version',
  ],
  [
    'a missing schema version',
    (snapshot) => {
      delete snapshot.schemaVersion;
    },
    'unknown-schema-version',
  ],
  [
    'a string schema version',
    (snapshot) => {
      snapshot.schemaVersion = String(BATTLE_SCHEMA_VERSION);
    },
    'unknown-schema-version',
  ],
  [
    'a negative PRNG state',
    (snapshot) => {
      snapshot.rngState = { state: -1 };
    },
    'invalid-rng-state',
  ],
  [
    'a PRNG state above 32 bits',
    (snapshot) => {
      snapshot.rngState = { state: 4_294_967_296 };
    },
    'invalid-rng-state',
  ],
  [
    'a fractional PRNG state',
    (snapshot) => {
      snapshot.rngState = { state: 1.5 };
    },
    'invalid-rng-state',
  ],
  [
    'a missing PRNG state',
    (snapshot) => {
      snapshot.rngState = null;
    },
    'invalid-rng-state',
  ],
  [
    'an unknown card id in the player hand',
    (snapshot) => {
      first(snapshot.sides.player.hand).cardId = 'not-a-card';
    },
    'unknown-card',
  ],
  [
    'an unknown card id in the opponent hand',
    (snapshot) => {
      first(snapshot.sides.opponent.hand).cardId = 'not-a-card';
    },
    'unknown-card',
  ],
  [
    'an unknown card id in the player discard',
    (snapshot) => {
      first(snapshot.sides.player.discard).cardId = 'not-a-card';
    },
    'unknown-card',
  ],
  [
    'a duplicate instance id across zones',
    (snapshot) => {
      first(snapshot.sides.player.discard).instanceId =
        first(snapshot.sides.player.hand).instanceId;
    },
    'duplicate-instance-id',
  ],
  [
    'a duplicate instance id across sides',
    (snapshot) => {
      first(snapshot.sides.opponent.hand).instanceId =
        first(snapshot.sides.player.hand).instanceId;
    },
    'duplicate-instance-id',
  ],
  [
    'a defense above the cap',
    (snapshot) => {
      snapshot.sides.player.defense = DEFENSE_CAP + 1;
    },
    'impossible-count',
  ],
  [
    'a status above its cap',
    (snapshot) => {
      snapshot.sides.player.statuses.focus = 4;
    },
    'impossible-count',
  ],
  [
    'health above maximum health',
    (snapshot) => {
      snapshot.sides.player.health = snapshot.sides.player.maxHealth + 1;
    },
    'invalid-snapshot',
  ],
  [
    'negative energy',
    (snapshot) => {
      snapshot.sides.player.energy = -1;
    },
    'invalid-snapshot',
  ],
  [
    'a zero turn number',
    (snapshot) => {
      snapshot.turn = 0;
    },
    'invalid-snapshot',
  ],
  [
    'a seed above 32 bits',
    (snapshot) => {
      snapshot.seed = 4_294_967_296;
    },
    'invalid-snapshot',
  ],
  [
    'a side key that disagrees with its side field',
    (snapshot) => {
      snapshot.sides.player.side = 'opponent';
    },
    'invalid-snapshot',
  ],
  [
    'an unknown element',
    (snapshot) => {
      snapshot.sides.player.element = 'plasma';
    },
    'invalid-snapshot',
  ],
  [
    'an unknown field',
    (snapshot) => {
      snapshot.field = 'plasma';
    },
    'invalid-snapshot',
  ],
  [
    'an unknown phase',
    (snapshot) => {
      snapshot.phase = 'paused';
    },
    'invalid-snapshot',
  ],
  [
    'an unknown outcome',
    (snapshot) => {
      snapshot.outcome = 'draw';
    },
    'invalid-snapshot',
  ],
  [
    'an unknown active side',
    (snapshot) => {
      snapshot.activeSide = 'nobody';
    },
    'invalid-snapshot',
  ],
  [
    'an ongoing outcome in the ended phase',
    (snapshot) => {
      snapshot.phase = 'ended';
    },
    'invalid-snapshot',
  ],
  [
    'a victory recorded while the loser still has health',
    (snapshot) => {
      snapshot.phase = 'ended';
      snapshot.outcome = 'player-victory';
    },
    'invalid-snapshot',
  ],
  [
    'an ongoing outcome with a side at 0 health',
    (snapshot) => {
      snapshot.sides.player.health = 0;
    },
    'invalid-snapshot',
  ],
  [
    'a missing enemy plan field',
    (snapshot) => {
      Reflect.deleteProperty(snapshot, 'enemyPlan');
    },
    'invalid-snapshot',
  ],
  [
    'a missing side object',
    (snapshot) => {
      Reflect.deleteProperty(snapshot.sides, 'player');
    },
    'invalid-snapshot',
  ],
  [
    'a hand that is not an array',
    (snapshot) => {
      (snapshot.sides.player as unknown as { hand: unknown }).hand = 'five';
    },
    'invalid-snapshot',
  ],
  [
    'a card instance without a card id',
    (snapshot) => {
      Reflect.deleteProperty(first(snapshot.sides.player.hand), 'cardId');
    },
    'invalid-snapshot',
  ],
];

describe('restoreSnapshot rejections', () => {
  it.each(rejections)('rejects %s', (_name, mutate, code) => {
    const snapshot = snapshotOf(midBattle());
    mutate(snapshot);
    const result = restoreSnapshot(snapshot, catalog);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it.each([null, undefined, 'snapshot', 42, [], true])(
    'rejects a non-object snapshot (%s)',
    (value) => {
      const result = restoreSnapshot(value, catalog);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.error.code).toBe('invalid-snapshot');
      }
    },
  );

  it('rejects a hand above five cards and accepts exactly five', () => {
    const state = created();

    expect(state.sides.player.hand).toHaveLength(HAND_SIZE);

    const oversized = snapshotOf(state);
    oversized.sides.player.hand.push({
      instanceId: 'player:extra',
      cardId: 'strike',
    });
    const rejected = restoreSnapshot(oversized, catalog);

    expect(rejected.ok).toBe(false);

    if (!rejected.ok) {
      expect(rejected.error.code).toBe('impossible-count');
    }

    expect(restoreSnapshot(snapshotOf(state), catalog).ok).toBe(true);
  });

  it('rejects a catalog that is missing a referenced card id', () => {
    const result = restoreSnapshot(serializeSnapshot(created()), {});

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe('unknown-card');
    }
  });

  it('rejects a catalog that is not an object', () => {
    const result = restoreSnapshot(
      serializeSnapshot(created()),
      null as unknown as CardCatalog,
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe('invalid-snapshot');
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Plan rejections                                                             */
/* -------------------------------------------------------------------------- */

type PlanRejectionCase = readonly [
  name: string,
  mutate: (snapshot: MutableSnapshot) => void,
  code: SnapshotErrorCode,
];

const planRejections: readonly PlanRejectionCase[] = [
  [
    'a plan step with an unknown card id',
    (snapshot) => {
      first(planOf(snapshot).steps).cardId = 'not-a-card';
    },
    'unknown-card',
  ],
  [
    'a plan that names the same instance twice',
    (snapshot) => {
      planOf(snapshot).steps.push({ ...first(planOf(snapshot).steps) });
    },
    'duplicate-instance-id',
  ],
  [
    'a plan step that shifts to the neutral field',
    (snapshot) => {
      first(planOf(snapshot).steps).shiftTo = 'neutral';
    },
    'invalid-snapshot',
  ],
  [
    'a plan step with negative damage',
    (snapshot) => {
      first(planOf(snapshot).steps).damage = -1;
    },
    'invalid-snapshot',
  ],
  [
    'a non-boolean lethal flag',
    (snapshot) => {
      planOf(snapshot).lethal = 'yes';
    },
    'invalid-snapshot',
  ],
  [
    'a plan with an unknown side',
    (snapshot) => {
      planOf(snapshot).side = 'nobody';
    },
    'invalid-snapshot',
  ],
  [
    'a plan status with an unknown kind',
    (snapshot) => {
      first(planOf(snapshot).steps).statuses.push({
        kind: 'burn',
        stacks: 1,
        target: 'self',
      });
    },
    'invalid-snapshot',
  ],
  [
    'a plan without steps',
    (snapshot) => {
      Reflect.deleteProperty(planOf(snapshot), 'steps');
    },
    'invalid-snapshot',
  ],
];

describe('restoreSnapshot plan validation', () => {
  it.each(planRejections)('rejects %s', (_name, mutate, code) => {
    const snapshot = snapshotOf(withPlan(midBattle()));
    mutate(snapshot);
    const result = restoreSnapshot(snapshot, catalog);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                      */
/* -------------------------------------------------------------------------- */

describe('restoreSnapshot purity', () => {
  it('does not mutate or alias the snapshot it restores', () => {
    const snapshot = snapshotOf(midBattle());
    const serializedBefore = JSON.stringify(snapshot);
    const result = restoreSnapshot(snapshot, catalog);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(snapshot)).toBe(serializedBefore);

    if (!result.ok) {
      return;
    }

    const restoredCardId = first(result.value.sides.player.hand).cardId;

    expect(result.value.sides.player.hand[0]).not.toBe(
      snapshot.sides.player.hand[0],
    );
    first(snapshot.sides.player.hand).cardId = 'not-a-card';
    expect(first(result.value.sides.player.hand).cardId).toBe(restoredCardId);
  });

  it('validates before returning any state', () => {
    const snapshot = snapshotOf(created());
    snapshot.sides.opponent.deck = [
      { instanceId: 'opponent:deck:0', cardId: 'not-a-card' },
    ];
    const result = restoreSnapshot(snapshot, catalog);

    expect(result).toStrictEqual({
      ok: false,
      error: {
        code: 'unknown-card',
        message:
          'snapshot.sides.opponent.deck[0].cardId "not-a-card" is not in the catalog',
      },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Field coverage                                                              */
/* -------------------------------------------------------------------------- */

describe('snapshot coverage', () => {
  it('keeps decks, hands, discards, energy, health, defense, statuses, turn and field', () => {
    const base = created();
    const state: BattleState = {
      ...base,
      turn: 7,
      field: 'stone',
      sides: {
        player: {
          ...base.sides.player,
          health: 31,
          defense: 5,
          energy: 2,
          statuses: { focus: 1, weaken: 2, regen: 1 },
        },
        opponent: {
          ...base.sides.opponent,
          health: 12,
          defense: 3,
          energy: 1,
          statuses: { focus: 2, weaken: 0, regen: 0 },
        },
      },
    };
    const snapshot: BattleSnapshot = serializeSnapshot(state);
    const result = restoreSnapshot(
      JSON.parse(JSON.stringify(snapshot)) as unknown,
      catalog,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.turn).toBe(7);
    expect(result.value.field).toBe('stone');
    expect(result.value.sides.player.health).toBe(31);
    expect(result.value.sides.player.defense).toBe(5);
    expect(result.value.sides.player.energy).toBe(2);
    expect(result.value.sides.player.statuses).toEqual({
      focus: 1,
      weaken: 2,
      regen: 1,
    });
    expect(result.value.sides.opponent.health).toBe(12);
    expect(result.value.sides.player.deck).toEqual(state.sides.player.deck);
    expect(result.value.sides.player.hand).toEqual(state.sides.player.hand);
    expect(result.value.sides.player.discard).toEqual(
      state.sides.player.discard,
    );
  });
});
