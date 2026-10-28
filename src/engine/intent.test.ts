// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { CardCatalog } from './battle';
import { resolveAttack } from './damage';
import {
  previewEnemyPlan,
  simulateEnemyPlan,
} from './intent';
import type {
  PlanSimulation,
  PlanSimulationResult,
} from './intent';
import { PLAYER_MAX_HEALTH } from './types';
import type {
  BattleOutcome,
  BattlePhase,
  BattleSide,
  BattleState,
  CardDefinition,
  CardInstance,
  Element,
  EnemyPlan,
  Side,
  StatusCounters,
} from './types';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const cardList: readonly CardDefinition[] = [
  { id: 'ember-strike', name: 'Ember Strike', element: 'ember', type: 'attack', cost: 1, damage: 4 },
  { id: 'frost-strike', name: 'Frost Strike', element: 'frost', type: 'attack', cost: 1, damage: 4 },
  { id: 'neutral-strike', name: 'Neutral Strike', element: 'neutral', type: 'attack', cost: 1, damage: 4 },
  { id: 'stone-strike', name: 'Stone Strike', element: 'stone', type: 'attack', cost: 1, damage: 4 },
  { id: 'heavy', name: 'Heavy', element: 'neutral', type: 'attack', cost: 4, damage: 10 },
  { id: 'ember-ward', name: 'Ash Guard', element: 'ember', type: 'ward', cost: 1, defense: 2 },
  { id: 'plain-ward', name: 'Plain Ward', element: 'neutral', type: 'ward', cost: 1, defense: 3 },
  { id: 'shift-ember', name: 'Ember Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'ember' },
  { id: 'shift-stone', name: 'Stone Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'stone' },
  { id: 'battery', name: 'Battery', element: 'neutral', type: 'utility', cost: 0, energy: 1 },
  { id: 'focus', name: 'Focus', element: 'neutral', type: 'utility', cost: 0, status: { kind: 'focus', stacks: 1, target: 'self' } },
];

const catalog: CardCatalog = Object.fromEntries(
  cardList.map((card) => [card.id, card]),
);

const EMPTY_STATUSES: StatusCounters = { focus: 0, weaken: 0, regen: 0 };

interface SideOptions {
  readonly element?: Element;
  readonly health?: number;
  readonly maxHealth?: number;
  readonly defense?: number;
  readonly energy?: number;
  readonly hand?: readonly string[];
  readonly statuses?: Partial<StatusCounters>;
}

function instances(side: Side, cardIds: readonly string[]): CardInstance[] {
  return cardIds.map((cardId, index) => ({
    instanceId: `${side}:hand:${String(index)}:${cardId}`,
    cardId,
  }));
}

function buildSide(side: Side, options: SideOptions = {}): BattleSide {
  const maxHealth = options.maxHealth ?? PLAYER_MAX_HEALTH;

  return {
    side,
    element: options.element ?? (side === 'player' ? 'ember' : 'frost'),
    health: options.health ?? maxHealth,
    maxHealth,
    defense: options.defense ?? 0,
    energy: options.energy ?? 3,
    deck: [],
    hand: instances(side, options.hand ?? []),
    discard: [],
    statuses: { ...EMPTY_STATUSES, ...options.statuses },
  };
}

interface StateOptions {
  readonly field?: Element;
  readonly player?: SideOptions;
  readonly opponent?: SideOptions;
  readonly turn?: number;
  readonly activeSide?: Side;
  readonly phase?: BattlePhase;
  readonly outcome?: BattleOutcome;
  readonly enemyPlan?: EnemyPlan | null;
}

function makeState(options: StateOptions = {}): BattleState {
  return {
    seed: 7,
    rngState: { state: 7 },
    turn: options.turn ?? 3,
    activeSide: options.activeSide ?? 'player',
    phase: options.phase ?? 'action',
    field: options.field ?? 'neutral',
    outcome: options.outcome ?? 'ongoing',
    sides: {
      player: buildSide('player', options.player),
      opponent: buildSide('opponent', options.opponent),
    },
    enemyPlan: options.enemyPlan ?? null,
  };
}

/** Plan candidates by card id; instance ids are stable and unique. */
function planned(
  cardIds: readonly string[],
  side: Side = 'opponent',
): Array<{ cardId: string; instanceId: string }> {
  return cardIds.map((cardId, index) => ({
    cardId,
    instanceId: `${side}:plan:${String(index)}:${cardId}`,
  }));
}

function simulate(
  state: BattleState,
  cardIds: readonly string[],
  side: Side = 'opponent',
): PlanSimulation {
  const result = simulateEnemyPlan({
    state,
    side,
    catalog,
    cards: planned(cardIds, side),
  });

  if (!result.ok) {
    throw new Error(`simulateEnemyPlan failed: ${result.error.code}: ${result.error.message}`);
  }

  return result.value;
}

function planFor(
  state: BattleState,
  cardIds: readonly string[],
  side: Side = 'opponent',
): EnemyPlan {
  return simulate(state, cardIds, side).plan;
}

function expectFailure(
  result: PlanSimulationResult,
  code: string,
): void {
  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}

/* -------------------------------------------------------------------------- */
/* Step contract                                                               */
/* -------------------------------------------------------------------------- */

describe('simulateEnemyPlan steps', () => {
  it('lists each planned card with recomputed cost, damage, defense and field', () => {
    const state = makeState({ field: 'neutral' });
    const simulation = simulate(state, [
      'shift-ember',
      'ember-strike',
      'ember-ward',
      'battery',
    ]);
    const { plan } = simulation;

    expect(plan.side).toBe('opponent');
    expect(plan.steps.map((step) => step.cardId)).toEqual([
      'shift-ember',
      'ember-strike',
      'ember-ward',
      'battery',
    ]);
    expect(plan.steps.map((step) => step.cost)).toEqual([1, 1, 1, 0]);
    expect(plan.steps.map((step) => step.damage)).toEqual([0, 6, 0, 0]);
    expect(plan.steps.map((step) => step.defense)).toEqual([0, 0, 4, 0]);
    expect(plan.steps.map((step) => step.shiftTo)).toEqual([
      'ember',
      null,
      null,
      null,
    ]);
    expect(plan.steps.map((step) => step.energyAfter)).toEqual([2, 1, 0, 1]);
    expect(plan.totalDamage).toBe(6);
    expect(plan.totalDefense).toBe(4);
    expect(plan.remainingEnergy).toBe(1);
    expect(plan.lethal).toBe(false);
    expect(simulation.fieldAfter).toBe('ember');
    expect(simulation.enemyDefenseAfter).toBe(4);
  });

  it('carries the card status descriptor into the plan step', () => {
    const simulation = simulate(makeState(), ['focus']);

    expect(simulation.plan.steps[0]?.statuses).toEqual([
      { kind: 'focus', stacks: 1, target: 'self' },
    ]);
  });

  it('starts the simulated turn at 3 energy regardless of live enemy energy', () => {
    const state = makeState({
      opponent: { energy: 0, hand: ['ember-strike'] },
      field: 'ember',
    });
    const simulation = simulate(state, ['ember-strike']);

    expect(simulation.plan.steps[0]?.energyAfter).toBe(2);
  });

  it('ticks Regen before the first step', () => {
    const state = makeState({
      opponent: { health: 6, maxHealth: 20, statuses: { regen: 1 } },
    });
    const simulation = simulate(state, []);

    expect(simulation.enemyHealthAtTurnStart).toBe(8);
    expect(simulation.enemyHealthAfter).toBe(8);
    expect(simulation.plan.steps).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Damage pipeline parity                                                      */
/* -------------------------------------------------------------------------- */

describe('damage numbers', () => {
  const table: ReadonlyArray<{
    readonly field: Element;
    readonly cardId: string;
    readonly defense: number;
    readonly statusModifier: number;
  }> = [
    { field: 'ember', cardId: 'ember-strike', defense: 0, statusModifier: 0 },
    { field: 'ember', cardId: 'frost-strike', defense: 0, statusModifier: 0 },
    { field: 'ember', cardId: 'frost-strike', defense: 1, statusModifier: 0 },
    { field: 'frost', cardId: 'ember-strike', defense: 3, statusModifier: 0 },
    { field: 'neutral', cardId: 'neutral-strike', defense: 2, statusModifier: 0 },
    { field: 'neutral', cardId: 'neutral-strike', defense: 0, statusModifier: 2 },
  ];

  for (const row of table) {
    it(`${row.cardId} on ${row.field} with ${String(row.defense)} defense matches resolveAttack`, () => {
      const state = makeState({
        field: row.field,
        player: { defense: row.defense },
        opponent: {
          statuses: {
            focus: row.statusModifier > 0 ? 1 : 0,
            weaken: 0,
            regen: 0,
          },
        },
      });
      const simulation = simulate(state, [row.cardId]);
      const card = catalog[row.cardId]!;

      const expected = resolveAttack({
        baseDamage: card.damage ?? 0,
        element: card.element,
        field: row.field,
        targetDefense: row.defense,
        piercing: card.piercing === true,
        statusModifier: row.statusModifier,
      });

      expect(simulation.plan.steps[0]?.damage).toBe(expected.damage);
    });
  }

  it('a shift inside the plan changes the numbers of later cards', () => {
    const state = makeState({ field: 'frost' });
    const simulation = simulate(state, ['shift-ember', 'ember-strike']);

    // Ember is neutral against a Frost field, empowered after the Shift.
    expect(simulation.plan.steps[1]?.damage).toBe(6);
  });

  it('consumes one Focus and one Weaken stack per planned attack', () => {
    const state = makeState({
      opponent: {
        statuses: { focus: 1, weaken: 1, regen: 0 },
      },
    });
    const simulation = simulate(state, ['neutral-strike', 'neutral-strike']);

    expect(simulation.plan.steps.map((step) => step.damage)).toEqual([4, 4]);
    expect(state.sides.opponent.statuses.focus).toBe(1);
    expect(state.sides.opponent.statuses.weaken).toBe(1);
  });

  it('a planned Focus utility raises the next attack', () => {
    const simulation = simulate(makeState(), ['focus', 'neutral-strike']);

    expect(simulation.plan.steps[0]?.damage).toBe(0);
    expect(simulation.plan.steps[1]?.damage).toBe(6);
  });

  it('does not cap step damage at the player remaining health', () => {
    const state = makeState({
      field: 'ember',
      player: { health: 5 },
    });
    const simulation = simulate(state, ['ember-strike', 'ember-strike']);

    expect(simulation.plan.steps.map((step) => step.damage)).toEqual([6, 6]);
    expect(simulation.plan.totalDamage).toBe(12);
    expect(simulation.playerHealthAfter).toBe(0);
    expect(simulation.plan.lethal).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Ward parity                                                                 */
/* -------------------------------------------------------------------------- */

describe('Ward numbers', () => {
  it('adds the matching +2 before clamping at 8', () => {
    const state = makeState({
      field: 'ember',
      opponent: { defense: 7 },
    });
    const simulation = simulate(state, ['ember-ward']);

    expect(simulation.plan.steps[0]?.defense).toBe(1);
    expect(simulation.enemyDefenseAfter).toBe(8);
    expect(simulation.plan.totalDefense).toBe(1);
  });

  it('reports zero gained defense at the cap', () => {
    const state = makeState({
      field: 'ember',
      opponent: { defense: 8 },
    });
    const simulation = simulate(state, ['ember-ward']);

    expect(simulation.plan.steps[0]?.defense).toBe(0);
    expect(simulation.enemyDefenseAfter).toBe(8);
  });
});

/* -------------------------------------------------------------------------- */
/* Turn numbering                                                              */
/* -------------------------------------------------------------------------- */

describe('plan turn', () => {
  it('defaults to the next turn the side acts on', () => {
    const playerTurn = simulate(
      makeState({ turn: 3, activeSide: 'player' }),
      [],
    );
    const opponentTurn = simulate(
      makeState({ turn: 3, activeSide: 'opponent' }),
      [],
    );

    expect(playerTurn.plan.turn).toBe(4);
    expect(opponentTurn.plan.turn).toBe(5);
  });

  it('accepts an explicit turn for a stored plan', () => {
    const result = simulateEnemyPlan({
      state: makeState({ turn: 8, activeSide: 'player' }),
      side: 'opponent',
      catalog,
      cards: [],
      turn: 2,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.plan.turn).toBe(2);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Rejections                                                                  */
/* -------------------------------------------------------------------------- */

describe('plan rejections', () => {
  it('rejects an unaffordable step', () => {
    expectFailure(
      simulateEnemyPlan({
        state: makeState(),
        side: 'opponent',
        catalog,
        cards: planned(['ember-strike', 'heavy']),
      }),
      'unaffordable-card',
    );
  });

  it('rejects an unknown card id', () => {
    expectFailure(
      simulateEnemyPlan({
        state: makeState(),
        side: 'opponent',
        catalog,
        cards: planned(['missing-card']),
      }),
      'unknown-card',
    );
  });

  it('rejects the same instance id twice', () => {
    expectFailure(
      simulateEnemyPlan({
        state: makeState(),
        side: 'opponent',
        catalog,
        cards: [
          { cardId: 'neutral-strike', instanceId: 'same' },
          { cardId: 'neutral-strike', instanceId: 'same' },
        ],
      }),
      'invalid-state',
    );
  });

  it('rejects a settled battle', () => {
    expectFailure(
      simulateEnemyPlan({
        state: makeState({ phase: 'ended', outcome: 'player-victory' }),
        side: 'opponent',
        catalog,
        cards: planned(['neutral-strike']),
      }),
      'invalid-state',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Stored preview                                                              */
/* -------------------------------------------------------------------------- */

describe('previewEnemyPlan', () => {
  it('returns null when the battle has no stored plan', () => {
    const result = previewEnemyPlan(makeState(), catalog);

    expect(result).toEqual({ ok: true, value: null });
  });

  it('returns null for a settled battle', () => {
    const state = makeState({
      phase: 'ended',
      outcome: 'player-victory',
      enemyPlan: planFor(makeState(), ['neutral-strike']),
    });
    const result = previewEnemyPlan(state, catalog);

    expect(result).toEqual({ ok: true, value: null });
  });

  it('changing the field changes totals but not the planned card ids', () => {
    const neutralPlan = planFor(makeState({ field: 'neutral' }), [
      'ember-strike',
    ]);
    const neutral = previewEnemyPlan(
      makeState({ field: 'neutral', enemyPlan: neutralPlan }),
      catalog,
    );
    const ember = previewEnemyPlan(
      makeState({ field: 'ember', enemyPlan: neutralPlan }),
      catalog,
    );

    expect(neutral.ok && neutral.value?.steps[0]?.damage).toBe(4);
    expect(ember.ok && ember.value?.steps[0]?.damage).toBe(6);
    expect(neutral.ok && neutral.value?.steps[0]?.cardId).toBe('ember-strike');
    expect(ember.ok && ember.value?.steps[0]?.cardId).toBe('ember-strike');
    expect(
      neutral.ok ? neutral.value?.steps.map((step) => step.instanceId) : null,
    ).toEqual(
      ember.ok ? ember.value?.steps.map((step) => step.instanceId) : null,
    );
  });

  it('changing the player defense changes totals but not the planned card ids', () => {
    const stored = planFor(makeState(), ['neutral-strike']);
    const bare = previewEnemyPlan(
      makeState({ player: { defense: 0 }, enemyPlan: stored }),
      catalog,
    );
    const armored = previewEnemyPlan(
      makeState({ player: { defense: 3 }, enemyPlan: stored }),
      catalog,
    );

    expect(bare.ok && bare.value?.totalDamage).toBe(4);
    expect(armored.ok && armored.value?.totalDamage).toBe(1);
    expect(bare.ok && bare.value?.steps[0]?.cardId).toBe('neutral-strike');
    expect(armored.ok && armored.value?.steps[0]?.cardId).toBe('neutral-strike');
  });

  it('keeps the stored turn and side', () => {
    const stored: EnemyPlan = {
      ...planFor(makeState({ turn: 6 }), ['neutral-strike']),
      turn: 11,
      side: 'opponent',
    };
    const result = previewEnemyPlan(
      makeState({ turn: 6, enemyPlan: stored }),
      catalog,
    );

    expect(result.ok && result.value?.turn).toBe(11);
    expect(result.ok && result.value?.side).toBe('opponent');
  });

  it('recomputes a shift inside the plan against the live field', () => {
    const stored = planFor(makeState({ field: 'frost' }), [
      'shift-stone',
      'stone-strike',
    ]);
    const preview = previewEnemyPlan(
      makeState({ field: 'ember', enemyPlan: stored }),
      catalog,
    );

    expect(preview.ok && preview.value?.steps[0]?.shiftTo).toBe('stone');
    expect(preview.ok && preview.value?.steps[1]?.damage).toBe(6);
  });

  it('keeps every planned step even when the preview turns lethal early', () => {
    const stored = planFor(makeState({ field: 'ember' }), [
      'ember-strike',
      'ember-strike',
    ]);
    const preview = previewEnemyPlan(
      makeState({
        field: 'ember',
        player: { health: 4 },
        enemyPlan: stored,
      }),
      catalog,
    );

    expect(preview.ok && preview.value?.lethal).toBe(true);
    expect(preview.ok && preview.value?.steps.map((step) => step.cardId)).toEqual([
      'ember-strike',
      'ember-strike',
    ]);
    expect(preview.ok && preview.value?.steps[1]?.damage).toBe(6);
  });

  it('does not mutate the state or the stored plan', () => {
    const state = makeState({
      field: 'neutral',
      player: { defense: 2 },
      enemyPlan: planFor(makeState({ field: 'neutral' }), [
        'ember-strike',
        'ember-ward',
      ]),
    });
    const before = structuredClone(state);

    previewEnemyPlan(state, catalog);

    expect(state).toEqual(before);
  });

  it('rejects a stored plan that references an unknown card', () => {
    const stored: EnemyPlan = {
      side: 'opponent',
      turn: 4,
      steps: [
        {
          cardId: 'unknown-card',
          instanceId: 'opponent:hand:0:unknown-card',
          cost: 0,
          damage: 0,
          defense: 0,
          statuses: [],
          shiftTo: null,
          energyAfter: 3,
        },
      ],
      totalDamage: 0,
      totalDefense: 0,
      lethal: false,
      remainingEnergy: 3,
    };
    const result = previewEnemyPlan(
      makeState({ enemyPlan: stored }),
      catalog,
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe('unknown-card');
    }
  });
});
