// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  counteringElement,
  planEnemyTurn,
  prepareEnemyTurn,
} from './ai';
import type { CardCatalog } from './battle';
import { playCard } from './battle';
import { previewEnemyPlan } from './intent';
import { restoreSnapshot, serializeSnapshot } from './snapshot';
import { HAND_SIZE, PLAYER_MAX_HEALTH } from './types';
import type {
  BattleOutcome,
  BattlePhase,
  BattleSide,
  BattleState,
  CardDefinition,
  CardInstance,
  Element,
  Side,
  StatusCounters,
} from './types';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const cardList: readonly CardDefinition[] = [
  { id: 'ember-strike', name: 'Ember Strike', element: 'ember', type: 'attack', cost: 1, damage: 4 },
  { id: 'neutral-strike', name: 'Neutral Strike', element: 'neutral', type: 'attack', cost: 1, damage: 3 },
  { id: 'frost-strike', name: 'Frost Strike', element: 'frost', type: 'attack', cost: 1, damage: 4 },
  { id: 'stone-strike', name: 'Stone Strike', element: 'stone', type: 'attack', cost: 1, damage: 4 },
  { id: 'gale-strike', name: 'Gale Strike', element: 'gale', type: 'attack', cost: 1, damage: 4 },
  { id: 'a-blast', name: 'A Blast', element: 'neutral', type: 'attack', cost: 3, damage: 6 },
  { id: 'b-blast', name: 'B Blast', element: 'neutral', type: 'attack', cost: 3, damage: 6 },
  { id: 'heavy', name: 'Heavy', element: 'neutral', type: 'attack', cost: 4, damage: 12 },
  { id: 'ember-ward', name: 'Ash Guard', element: 'ember', type: 'ward', cost: 1, defense: 2 },
  { id: 'plain-ward', name: 'Plain Ward', element: 'neutral', type: 'ward', cost: 1, defense: 3 },
  { id: 'shift-ember', name: 'Ember Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'ember' },
  { id: 'shift-frost', name: 'Frost Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'frost' },
  { id: 'shift-gale', name: 'Gale Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'gale' },
  { id: 'shift-stone', name: 'Stone Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'stone' },
  { id: 'battery', name: 'Battery', element: 'neutral', type: 'utility', cost: 0, energy: 1 },
  { id: 'probe', name: 'Probe', element: 'neutral', type: 'utility', cost: 0, draw: 1 },
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
  readonly deck?: readonly string[];
  readonly discard?: readonly string[];
  readonly statuses?: Partial<StatusCounters>;
}

function instances(
  side: Side,
  zone: string,
  cardIds: readonly string[],
): CardInstance[] {
  return cardIds.map((cardId, index) => ({
    instanceId: `${side}:${zone}:${String(index)}:${cardId}`,
    cardId,
  }));
}

function buildSide(side: Side, options: SideOptions = {}): BattleSide {
  const maxHealth = options.maxHealth ?? PLAYER_MAX_HEALTH;

  return {
    side,
    element: options.element ?? 'ember',
    health: options.health ?? maxHealth,
    maxHealth,
    defense: options.defense ?? 0,
    energy: options.energy ?? 3,
    deck: instances(side, 'deck', options.deck ?? []),
    hand: instances(side, 'hand', options.hand ?? []),
    discard: instances(side, 'discard', options.discard ?? []),
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
}

function makeState(options: StateOptions = {}): BattleState {
  return {
    seed: 20_261_028,
    rngState: { state: 20_261_028 },
    turn: options.turn ?? 3,
    activeSide: options.activeSide ?? 'player',
    phase: options.phase ?? 'action',
    field: options.field ?? 'neutral',
    outcome: options.outcome ?? 'ongoing',
    sides: {
      player: buildSide('player', options.player),
      opponent: buildSide('opponent', options.opponent),
    },
    enemyPlan: null,
  };
}

/** Plan against a 40-health, defense-0 player unless a test says otherwise. */
function plan(
  opponent: SideOptions,
  state: StateOptions = {},
  boss = false,
): ReturnType<typeof planEnemyTurn> {
  return planEnemyTurn(
    makeState({ ...state, opponent }),
    catalog,
    boss ? { counterElementBias: true } : null,
  );
}

function stepIds(planValue: NonNullable<ReturnType<typeof planEnemyTurn>>): string[] {
  return planValue.steps.map((step) => step.cardId);
}

/* -------------------------------------------------------------------------- */
/* Counter-element table                                                       */
/* -------------------------------------------------------------------------- */

describe('counteringElement', () => {
  const table: ReadonlyArray<readonly [Element, string | null]> = [
    ['ember', 'stone'],
    ['frost', 'ember'],
    ['gale', 'frost'],
    ['stone', 'gale'],
    ['neutral', null],
  ];

  for (const [element, expected] of table) {
    it(`counteringElement(${element}) is ${String(expected)}`, () => {
      expect(counteringElement(element)).toBe(expected);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Determinism and gating                                                      */
/* -------------------------------------------------------------------------- */

describe('planEnemyTurn determinism', () => {
  it('returns no plan for a settled battle', () => {
    const state = makeState({
      phase: 'ended',
      outcome: 'player-victory',
      opponent: { hand: ['ember-strike'] },
    });

    expect(planEnemyTurn(state, catalog)).toBeNull();
  });

  it('returns no plan outside the action phase', () => {
    const state = makeState({
      phase: 'setup',
      opponent: { hand: ['ember-strike'] },
    });

    expect(planEnemyTurn(state, catalog)).toBeNull();
  });

  it('repeated planning returns the same plan and never touches state', () => {
    const state = makeState({
      field: 'neutral',
      opponent: {
        element: 'ember',
        health: 12,
        maxHealth: 20,
        hand: ['shift-ember', 'ember-strike', 'neutral-strike', 'battery'],
      },
    });
    const before = structuredClone(state);

    const first = planEnemyTurn(state, catalog);
    const second = planEnemyTurn(state, catalog);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(state).toEqual(before);
    expect(state.rngState).toEqual(before.rngState);
  });

  it('plans only cards the enemy actually holds', () => {
    const state = makeState({
      field: 'ember',
      opponent: { hand: ['ember-strike', 'neutral-strike'] },
    });
    const handIds = new Set(
      state.sides.opponent.hand.map((card) => card.instanceId),
    );
    const result = planEnemyTurn(state, catalog);

    expect(result).not.toBeNull();
    expect(result?.steps.length).toBeGreaterThan(0);

    for (const step of result?.steps ?? []) {
      expect(handIds.has(step.instanceId)).toBe(true);
    }
  });

  it('returns an empty plan when no card is playable', () => {
    const result = plan({ hand: ['heavy'] });

    expect(result).not.toBeNull();
    expect(result?.steps).toEqual([]);
    expect(result?.remainingEnergy).toBe(3);
    expect(result?.lethal).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 1. Lethal                                                                   */
/* -------------------------------------------------------------------------- */

describe('lethal priority', () => {
  it('takes a lethal sequence even when a Ward is available at low health', () => {
    const result = plan(
      {
        element: 'ember',
        health: 12,
        maxHealth: 20,
        hand: ['ember-ward', 'ember-strike', 'ember-strike'],
      },
      { field: 'ember', player: { health: 10 } },
    );

    expect(result).not.toBeNull();
    expect(stepIds(result!)).toEqual(['ember-strike', 'ember-strike']);
    expect(result?.totalDamage).toBe(12);
    expect(result?.lethal).toBe(true);
    expect(result?.steps.some((step) => step.defense > 0)).toBe(false);
  });

  it('finds a lethal sequence that needs an energy utility first', () => {
    const result = plan(
      { hand: ['battery', 'heavy'] },
      { player: { health: 12 } },
    );

    expect(stepIds(result!)).toEqual(['battery', 'heavy']);
    expect(result?.lethal).toBe(true);
    expect(result?.totalDamage).toBeGreaterThanOrEqual(12);
  });

  it('does not claim lethal when the best sequence falls short', () => {
    const result = plan(
      { hand: ['ember-strike', 'neutral-strike'] },
      { field: 'ember', player: { health: 20 } },
    );

    expect(result?.lethal).toBe(false);
    expect(result?.totalDamage).toBeLessThan(20);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Ward at 12 health                                                        */
/* -------------------------------------------------------------------------- */

describe('defensive Ward', () => {
  it('prefers a Ward before non-lethal attacks at 12 health', () => {
    const result = plan(
      {
        health: 12,
        maxHealth: 20,
        hand: ['ember-strike', 'neutral-strike', 'ember-ward'],
      },
      { field: 'neutral' },
    );

    expect(result?.steps[0]?.cardId).toBe('ember-ward');
    expect(result?.steps[0]?.defense).toBe(2);
    expect(result?.totalDefense).toBe(2);
  });

  it('does not prefer a Ward at 13 health', () => {
    const result = plan(
      {
        health: 13,
        maxHealth: 20,
        hand: ['ember-strike', 'neutral-strike', 'ember-ward'],
      },
      { field: 'neutral' },
    );

    expect(result?.steps[0]?.cardId).not.toBe('ember-ward');
    expect(stepIds(result!).at(-1)).toBe('ember-ward');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Field-enabling Shift                                                     */
/* -------------------------------------------------------------------------- */

describe('field-enabling Shift', () => {
  it('shifts to the enemy element before an unmatched attack', () => {
    const result = plan(
      { element: 'ember', hand: ['shift-ember', 'ember-strike', 'neutral-strike'] },
      { field: 'frost' },
    );

    expect(stepIds(result!)).toEqual([
      'shift-ember',
      'ember-strike',
      'neutral-strike',
    ]);
    expect(result?.steps[0]?.shiftTo).toBe('ember');
    expect(result?.steps[1]?.damage).toBe(6);
  });

  it('does not shift when no matching attack is affordable', () => {
    const result = plan(
      { element: 'ember', hand: ['shift-stone', 'neutral-strike'] },
      { field: 'neutral' },
    );

    expect(stepIds(result!)).toEqual(['neutral-strike']);
    expect(result?.steps[0]?.shiftTo).toBeNull();
  });

  it('prefers its own-element Shift over an unmatched attack', () => {
    const result = plan(
      { element: 'ember', hand: ['shift-ember', 'neutral-strike'] },
      { field: 'frost' },
    );

    expect(stepIds(result!)).toEqual(['shift-ember', 'neutral-strike']);
    expect(result?.steps[0]?.shiftTo).toBe('ember');
  });

  it('never shifts to the field that is already active', () => {
    const result = plan(
      { element: 'ember', hand: ['shift-ember', 'ember-strike'] },
      { field: 'ember' },
    );

    expect(stepIds(result!)).toEqual(['ember-strike']);
    expect(result?.steps[0]?.shiftTo).toBeNull();
  });

  it('the boss prefers the shift that counters the player starter element', () => {
    const bossState = makeState({
      field: 'neutral',
      player: { element: 'frost' },
      opponent: {
        element: 'stone',
        health: 20,
        maxHealth: 20,
        hand: ['shift-ember', 'shift-stone', 'ember-strike', 'stone-strike'],
      },
    });

    const boss = planEnemyTurn(bossState, catalog, { counterElementBias: true });
    const normal = planEnemyTurn(bossState, catalog, null);

    expect(stepIds(boss!)[0]).toBe('shift-ember');
    expect(stepIds(normal!)[0]).toBe('shift-stone');
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Attacks and affordability                                                */
/* -------------------------------------------------------------------------- */

describe('attack ordering and affordability', () => {
  it('orders attacks by field match, then damage per energy', () => {
    const result = plan(
      { element: 'ember', hand: ['neutral-strike', 'ember-strike', 'ember-strike'] },
      { field: 'ember' },
    );

    // Ember attacks are empowered (6) and come before the neutral 3.
    expect(stepIds(result!)).toEqual([
      'ember-strike',
      'ember-strike',
      'neutral-strike',
    ]);
  });

  it('breaks equal attack candidates by card id', () => {
    const result = plan({ hand: ['b-blast', 'a-blast'] });

    expect(stepIds(result!)).toEqual(['a-blast']);
    expect(result?.remainingEnergy).toBe(0);
  });

  it('never plans a card the simulated energy cannot pay for', () => {
    const result = plan(
      { hand: ['heavy', 'ember-strike'] },
      { field: 'ember' },
    );

    expect(stepIds(result!)).toEqual(['ember-strike']);

    let energy = 3;

    for (const step of result?.steps ?? []) {
      expect(step.cost).toBeLessThanOrEqual(energy);
      energy = step.energyAfter;
    }

    expect(result?.remainingEnergy).toBe(energy);
  });

  it('plans utility only after attacks and stops when energy is gone', () => {
    const result = plan(
      { hand: ['battery', 'ember-strike', 'probe'] },
      { field: 'neutral' },
    );

    // Ember Strike (4) first, then the utility cards by card id.
    expect(stepIds(result!)).toEqual(['ember-strike', 'battery', 'probe']);
    expect(result?.remainingEnergy).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Housekeeping: draw, then plan                                               */
/* -------------------------------------------------------------------------- */

describe('plan execution parity', () => {
  it('the reducer resolves exactly the damage and defense the plan previews', () => {
    const state = makeState({
      field: 'neutral',
      activeSide: 'opponent',
      player: { health: 40, defense: 0 },
      opponent: {
        element: 'ember',
        hand: ['shift-ember', 'ember-strike', 'ember-ward', 'battery'],
      },
    });
    const result = planEnemyTurn(state, catalog);

    expect(result).not.toBeNull();

    let current = state;
    let damage = 0;
    const healthBefore = current.sides.player.health;

    for (const step of result?.steps ?? []) {
      const played = playCard(
        current,
        { type: 'play-card', side: 'opponent', instanceId: step.instanceId },
        catalog,
      );

      expect(played.ok).toBe(true);

      if (!played.ok) {
        throw new Error(played.error.message);
      }

      current = played.value;
      damage = healthBefore - current.sides.player.health;
    }

    expect(damage).toBe(result?.totalDamage);
    expect(current.sides.opponent.defense).toBe(result?.totalDefense);
    expect(current.sides.opponent.energy).toBe(result?.remainingEnergy);
    expect(current.field).toBe('ember');
  });
});

describe('prepareEnemyTurn', () => {
  it('draws the next enemy hand before planning and stores the telegraph', () => {
    const state = makeState({
      field: 'ember',
      turn: 3,
      activeSide: 'player',
      player: { hand: ['ember-strike'] },
      opponent: {
        element: 'ember',
        hand: [],
        deck: [
          'ember-strike',
          'ember-strike',
          'neutral-strike',
          'ember-ward',
          'battery',
          'probe',
        ],
      },
    });

    const next = prepareEnemyTurn(state, catalog);

    expect(next.sides.opponent.hand).toHaveLength(HAND_SIZE);
    expect(next.enemyPlan).not.toBeNull();
    expect(next.enemyPlan?.turn).toBe(4);
    expect(next.enemyPlan?.side).toBe('opponent');

    const handIds = new Set(
      next.sides.opponent.hand.map((card) => card.instanceId),
    );

    for (const step of next.enemyPlan?.steps ?? []) {
      expect(handIds.has(step.instanceId)).toBe(true);
    }

    // The input state is untouched.
    expect(state.sides.opponent.hand).toHaveLength(0);
    expect(state.enemyPlan).toBeNull();
  });

  it('is deterministic for the same pre-housekeeping state', () => {
    const state = makeState({
      field: 'neutral',
      opponent: {
        deck: ['ember-strike', 'neutral-strike', 'ember-ward', 'battery', 'probe'],
      },
    });

    const first = prepareEnemyTurn(state, catalog);
    const second = prepareEnemyTurn(state, catalog);

    expect(first).toEqual(second);
    expect(first.rngState).toEqual(second.rngState);
  });

  it('the stored telegraph survives a snapshot round-trip', () => {
    const state = prepareEnemyTurn(
      makeState({
        field: 'neutral',
        opponent: {
          deck: [
            'ember-strike',
            'neutral-strike',
            'ember-ward',
            'battery',
            'probe',
          ],
        },
      }),
      catalog,
    );

    expect(state.enemyPlan).not.toBeNull();

    const serialized = JSON.parse(
      JSON.stringify(serializeSnapshot(state)),
    ) as unknown;
    const restored = restoreSnapshot(serialized, catalog);

    expect(restored.ok).toBe(true);

    if (!restored.ok) {
      throw new Error(restored.error.message);
    }

    expect(restored.value.enemyPlan).toEqual(state.enemyPlan);

    const preview = previewEnemyPlan(restored.value, catalog);

    expect(preview.ok && preview.value).toEqual(state.enemyPlan);
  });

  it('leaves a settled battle unchanged', () => {
    const state = makeState({
      phase: 'ended',
      outcome: 'opponent-victory',
      opponent: { hand: [], deck: ['ember-strike'] },
    });

    const next = prepareEnemyTurn(state, catalog);

    expect(next).toBe(state);
    expect(next.enemyPlan).toBeNull();
  });
});
