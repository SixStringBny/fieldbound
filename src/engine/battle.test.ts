// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  canPlayCard,
  createBattle,
  drawCards,
  endTurn,
  otherSide,
  playCard,
} from './battle';
import type { BattleSetup, BattleSideSetup, CardCatalog } from './battle';
import { createRng } from './rng';
import type { RngState } from './rng';
import { HAND_SIZE, PLAYER_MAX_HEALTH, TURN_START_ENERGY } from './types';
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
  { id: 'strike', name: 'Strike', element: 'neutral', type: 'attack', cost: 1, damage: 3 },
  { id: 'plain', name: 'Plain Strike', element: 'neutral', type: 'attack', cost: 1, damage: 3 },
  { id: 'chip', name: 'Chip', element: 'neutral', type: 'attack', cost: 0, damage: 0 },
  { id: 'heavy', name: 'Heavy', element: 'neutral', type: 'attack', cost: 3, damage: 10 },
  { id: 'ember-strike', name: 'Ember Strike', element: 'ember', type: 'attack', cost: 1, damage: 4 },
  { id: 'ember-pierce', name: 'Ember Lance', element: 'ember', type: 'attack', cost: 2, damage: 4, piercing: true },
  { id: 'kindled', name: 'Kindled', element: 'ember', type: 'attack', cost: 2, damage: 3, fieldBonus: { damage: 2 } },
  { id: 'shift-strike', name: 'Shift Strike', element: 'ember', type: 'attack', cost: 1, damage: 3, shiftTo: 'ember' },
  { id: 'drain', name: 'Drain', element: 'neutral', type: 'attack', cost: 1, damage: 4, draw: 1 },
  { id: 'ember-ward', name: 'Ash Guard', element: 'ember', type: 'ward', cost: 1, defense: 2 },
  { id: 'plain-ward', name: 'Plain Ward', element: 'neutral', type: 'ward', cost: 1, defense: 2 },
  { id: 'resonance', name: 'Resonance', element: 'ember', type: 'ward', cost: 1, defense: 1, fieldBonus: { defense: 2 } },
  { id: 'seed-ward', name: 'Seed Ward', element: 'ember', type: 'ward', cost: 1, defense: 0, fieldBonus: { defense: 2 } },
  { id: 'shift-ember', name: 'Ember Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'ember' },
  { id: 'shift-stone', name: 'Stone Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'stone' },
  { id: 'channel', name: 'Channel', element: 'neutral', type: 'utility', cost: 0, energy: 1 },
  { id: 'surge', name: 'Surge', element: 'neutral', type: 'utility', cost: 1, energy: 2 },
  { id: 'probe', name: 'Probe', element: 'neutral', type: 'utility', cost: 0, draw: 1 },
  { id: 'sift', name: 'Sift', element: 'neutral', type: 'utility', cost: 1, draw: 2 },
  { id: 'mend', name: 'Mend', element: 'neutral', type: 'utility', cost: 1, heal: 5 },
  { id: 'focus', name: 'Focus', element: 'neutral', type: 'utility', cost: 0, status: { kind: 'focus', stacks: 1, target: 'self' } },
  { id: 'expose', name: 'Expose', element: 'neutral', type: 'utility', cost: 1, status: { kind: 'weaken', stacks: 1, target: 'opponent' } },
  { id: 'second-wind', name: 'Second Wind', element: 'neutral', type: 'utility', cost: 2, status: { kind: 'regen', stacks: 2, target: 'self' } },
  // A definition the engine cannot execute: a shift to the Neutral field.
  {
    id: 'bad-shift',
    name: 'Bad Shift',
    element: 'neutral',
    type: 'shift',
    cost: 1,
    shiftTo: 'neutral',
  } as unknown as CardDefinition,
];

const catalog: CardCatalog = Object.fromEntries(
  cardList.map((card) => [card.id, card]),
);

/** Ten distinct catalog cards, used for both setup decks. */
const STARTER_DECK: readonly string[] = [
  'strike',
  'plain',
  'ember-strike',
  'ember-pierce',
  'ember-ward',
  'shift-ember',
  'channel',
  'probe',
  'mend',
  'expose',
];

const EMPTY_STATUSES: StatusCounters = { focus: 0, weaken: 0, regen: 0 };

function sideSetup(overrides: Partial<BattleSideSetup> = {}): BattleSideSetup {
  return { element: 'ember', cards: STARTER_DECK, ...overrides };
}

function setup(overrides: Partial<BattleSetup> = {}): BattleSetup {
  return {
    seed: 20_261_028,
    player: sideSetup({ health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH }),
    opponent: sideSetup({
      element: 'frost',
      health: 35,
      maxHealth: 35,
    }),
    catalog,
    ...overrides,
  };
}

function created(overrides: Partial<BattleSetup> = {}): BattleState {
  const result = createBattle(setup(overrides));

  if (!result.ok) {
    throw new Error(`createBattle failed: ${result.error.code}: ${result.error.message}`);
  }

  return result.value;
}

/* -------------------------------------------------------------------------- */
/* Hand-built states                                                           */
/* -------------------------------------------------------------------------- */

interface SideOptions {
  readonly hand?: readonly string[];
  readonly deck?: readonly string[];
  readonly discard?: readonly string[];
  readonly health?: number;
  readonly maxHealth?: number;
  readonly defense?: number;
  readonly energy?: number;
  readonly statuses?: Partial<StatusCounters>;
  readonly element?: Element;
}

function buildSide(side: Side, options: SideOptions = {}): BattleSide {
  let counter = 0;
  const make = (cardId: string): CardInstance => {
    counter += 1;
    return { instanceId: `${side}:${String(counter)}:${cardId}`, cardId };
  };
  const maxHealth = options.maxHealth ?? PLAYER_MAX_HEALTH;

  return {
    side,
    element: options.element ?? (side === 'player' ? 'ember' : 'frost'),
    health: options.health ?? maxHealth,
    maxHealth,
    defense: options.defense ?? 0,
    energy: options.energy ?? TURN_START_ENERGY,
    deck: (options.deck ?? []).map(make),
    hand: (options.hand ?? []).map(make),
    discard: (options.discard ?? []).map(make),
    statuses: { ...EMPTY_STATUSES, ...options.statuses },
  };
}

interface StateOptions {
  readonly player?: SideOptions;
  readonly opponent?: SideOptions;
  readonly field?: Element;
  readonly activeSide?: Side;
  readonly phase?: BattlePhase;
  readonly outcome?: BattleOutcome;
  readonly turn?: number;
  readonly seed?: number;
  readonly rngState?: RngState;
  readonly enemyPlan?: EnemyPlan | null;
}

function makeState(options: StateOptions = {}): BattleState {
  return {
    seed: options.seed ?? 1,
    rngState: options.rngState ?? createRng(1),
    turn: options.turn ?? 1,
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

const dummyPlan: EnemyPlan = {
  side: 'opponent',
  turn: 2,
  steps: [],
  totalDamage: 0,
  totalDefense: 0,
  lethal: false,
  remainingEnergy: TURN_START_ENERGY,
};

function findInHand(
  state: BattleState,
  side: Side,
  cardId: string,
): CardInstance {
  const card = state.sides[side].hand.find((held) => held.cardId === cardId);

  if (card === undefined) {
    throw new Error(`no "${cardId}" in the ${side} hand`);
  }

  return card;
}

function play(state: BattleState, side: Side, cardId: string): BattleState {
  const instance = findInHand(state, side, cardId);
  const result = playCard(
    state,
    { type: 'play-card', side, instanceId: instance.instanceId },
    catalog,
  );

  if (!result.ok) {
    throw new Error(`playCard failed: ${result.error.code}: ${result.error.message}`);
  }

  return result.value;
}

function playInstance(
  state: BattleState,
  side: Side,
  instanceId: string,
): ReturnType<typeof playCard> {
  return playCard(state, { type: 'play-card', side, instanceId }, catalog);
}

function end(state: BattleState, side: Side): BattleState {
  const result = endTurn(state, { type: 'end-turn', side });

  if (!result.ok) {
    throw new Error(`endTurn failed: ${result.error.code}: ${result.error.message}`);
  }

  return result.value;
}

function reject(
  result: ReturnType<typeof playCard> | ReturnType<typeof endTurn>,
  code: string,
): void {
  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }

    Object.freeze(value);
  }

  return value;
}

/** Every card instance the battle owns, across both sides and all zones. */
function allInstances(state: BattleState): CardInstance[] {
  return [
    ...state.sides.player.deck,
    ...state.sides.player.hand,
    ...state.sides.player.discard,
    ...state.sides.opponent.deck,
    ...state.sides.opponent.hand,
    ...state.sides.opponent.discard,
  ];
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                       */
/* -------------------------------------------------------------------------- */

describe('battle setup', () => {
  it('deals five cards and exactly three energy to both sides on a neutral field', () => {
    const state = created();

    expect(state.field).toBe('neutral');
    expect(state.phase).toBe('action');
    expect(state.outcome).toBe('ongoing');
    expect(state.turn).toBe(1);
    expect(state.activeSide).toBe('player');
    expect(state.enemyPlan).toBeNull();
    expect(state.seed).toBe(20_261_028);

    for (const side of ['player', 'opponent'] as const) {
      const built = state.sides[side];

      expect(built.defense).toBe(0);
      expect(built.energy).toBe(TURN_START_ENERGY);
      expect(built.hand).toHaveLength(HAND_SIZE);
      expect(built.deck).toHaveLength(STARTER_DECK.length - HAND_SIZE);
      expect(built.discard).toHaveLength(0);
      expect(built.statuses).toEqual(EMPTY_STATUSES);
    }
  });

  it('uses forty player health and the enemy configured health', () => {
    const state = created();

    expect(state.sides.player.health).toBe(PLAYER_MAX_HEALTH);
    expect(state.sides.player.maxHealth).toBe(PLAYER_MAX_HEALTH);
    expect(state.sides.opponent.health).toBe(35);
    expect(state.sides.opponent.maxHealth).toBe(35);
  });

  it('defaults both sides to the frozen player maximum health', () => {
    const state = created({
      player: sideSetup(),
      opponent: sideSetup({ element: 'frost' }),
    });

    expect(state.sides.player.maxHealth).toBe(PLAYER_MAX_HEALTH);
    expect(state.sides.player.health).toBe(PLAYER_MAX_HEALTH);
    expect(state.sides.opponent.health).toBe(PLAYER_MAX_HEALTH);
  });

  it('gives every physical copy a battle-unique instance id', () => {
    const state = created();
    const instances = allInstances(state);
    const ids = new Set(instances.map((card) => card.instanceId));

    expect(instances).toHaveLength(STARTER_DECK.length * 2);
    expect(ids.size).toBe(instances.length);

    for (const instance of state.sides.player.hand) {
      expect(STARTER_DECK).toContain(instance.cardId);
    }

    for (const instance of state.sides.opponent.deck) {
      expect(STARTER_DECK).toContain(instance.cardId);
    }
  });

  it('reproduces the same deal and PRNG state for the same seed', () => {
    const left = created();
    const right = created();

    expect(left).toEqual(right);
    expect(right).not.toBe(left);
    expect(drawCards(left, 'player', 2)).toEqual(drawCards(right, 'player', 2));
  });

  it('deals a different hand order for a different seed', () => {
    const left = created({ seed: 1 });
    const right = created({ seed: 2 });

    expect(left.sides.player.hand.map((card) => card.cardId)).not.toEqual(
      right.sides.player.hand.map((card) => card.cardId),
    );
  });

  it('starts the opening turn for the configured side', () => {
    const state = created({ startingSide: 'opponent' });

    expect(state.activeSide).toBe('opponent');
    expect(state.sides.player.hand).toHaveLength(HAND_SIZE);
    expect(state.sides.opponent.hand).toHaveLength(HAND_SIZE);
  });

  it('rejects an unknown card id with a typed error', () => {
    const result = createBattle(
      setup({ player: sideSetup({ cards: ['strike', 'ghost'] }) }),
    );

    reject(result, 'unknown-card');
  });

  it('rejects an out-of-range or fractional seed before building state', () => {
    for (const seed of [-1, 4_294_967_296, 1.5, Number.NaN]) {
      reject(createBattle(setup({ seed })), 'invalid-state');
    }
  });

  it('rejects health above the maximum or at zero', () => {
    reject(
      createBattle(
        setup({ player: sideSetup({ health: 41, maxHealth: 40 }) }),
      ),
      'invalid-state',
    );
    reject(
      createBattle(setup({ player: sideSetup({ health: 0 }) })),
      'invalid-state',
    );
  });

  it('rejects a non-positive maximum health', () => {
    reject(
      createBattle(
        setup({ opponent: sideSetup({ maxHealth: 0, health: 0 }) }),
      ),
      'invalid-state',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Turn loop                                                                   */
/* -------------------------------------------------------------------------- */

describe('turn loop', () => {
  it('discards the entire hand when the turn ends', () => {
    const state = makeState({
      player: { hand: ['strike', 'plain', 'probe'], discard: ['mend'] },
    });
    const next = end(state, 'player');

    expect(next.sides.player.hand).toHaveLength(0);
    expect(next.sides.player.discard.map((card) => card.cardId)).toEqual([
      'mend',
      'strike',
      'plain',
      'probe',
    ]);
  });

  it('passes control and starts the next turn at three energy', () => {
    const state = makeState({ player: { energy: 0 } });
    const next = end(state, 'player');

    expect(next.activeSide).toBe('opponent');
    expect(next.turn).toBe(2);
    expect(next.sides.opponent.energy).toBe(TURN_START_ENERGY);
    expect(next.sides.player.energy).toBe(0);
  });

  it('does not carry unspent energy into the player next turn', () => {
    const state = makeState({ player: { hand: ['strike', 'plain'] } });
    const spent = play(state, 'player', 'strike');

    expect(spent.sides.player.energy).toBe(2);

    const afterOpponent = end(end(spent, 'player'), 'opponent');

    expect(afterOpponent.activeSide).toBe('player');
    expect(afterOpponent.sides.player.energy).toBe(TURN_START_ENERGY);
  });

  it('refills the hand to five at the start of a turn', () => {
    const state = makeState({
      player: { hand: ['strike'], deck: ['plain', 'ember-strike', 'ember-pierce', 'probe'] },
      opponent: { deck: ['strike', 'plain', 'probe', 'mend', 'channel'] },
    });
    const afterPlayer = end(state, 'player');

    expect(afterPlayer.sides.opponent.hand).toHaveLength(HAND_SIZE);
    expect(afterPlayer.sides.player.hand).toHaveLength(0);

    const afterOpponent = end(afterPlayer, 'opponent');

    expect(afterOpponent.sides.player.hand).toHaveLength(HAND_SIZE);
  });

  it('draws the refilled hand from the reshuffled discard when the deck is empty', () => {
    const state = makeState({
      player: {
        hand: ['strike', 'plain', 'probe', 'mend', 'channel'],
        deck: [],
      },
      opponent: { hand: [], deck: [] },
    });
    const afterPlay = play(state, 'player', 'strike');

    const afterOpponent = end(end(afterPlay, 'player'), 'opponent');

    expect(afterOpponent.sides.player.hand).toHaveLength(HAND_SIZE);
    expect(afterOpponent.sides.player.deck).toHaveLength(0);
    expect(afterOpponent.sides.player.discard).toHaveLength(0);
  });

  it('ticks the new active side Regen at turn start and spends one stack', () => {
    const state = makeState({
      player: {
        health: 30,
        statuses: { regen: 2 },
        deck: ['strike', 'plain', 'probe', 'mend', 'channel'],
      },
      activeSide: 'opponent',
    });
    const next = end(state, 'opponent');

    expect(next.sides.player.health).toBe(32);
    expect(next.sides.player.statuses.regen).toBe(1);
  });

  it('spends a Regen stack even when the side is at full health', () => {
    const state = makeState({
      player: { health: 40, statuses: { regen: 1 } },
      activeSide: 'opponent',
    });
    const next = end(state, 'opponent');

    expect(next.sides.player.health).toBe(40);
    expect(next.sides.player.statuses.regen).toBe(0);
  });

  it('keeps persistent defense and the field across a turn boundary', () => {
    const state = makeState({
      player: { defense: 5 },
      field: 'ember',
    });
    const next = end(state, 'player');

    expect(next.field).toBe('ember');
    expect(next.sides.player.defense).toBe(5);
    expect(next.sides.opponent.defense).toBe(0);
  });

  it('clears the consumed enemy plan when the turn passes', () => {
    const state = makeState({ enemyPlan: dummyPlan });
    const next = end(state, 'player');

    expect(next.enemyPlan).toBeNull();
  });

  it('rejects an end turn from the side that is not active without changing state', () => {
    const state = deepFreeze(makeState());
    const result = endTurn(state, { type: 'end-turn', side: 'opponent' });

    reject(result, 'not-active-side');
    expect(state.sides.player.hand).toHaveLength(0);
  });

  it('rejects an end turn after the battle has ended', () => {
    const state = makeState({
      phase: 'ended',
      outcome: 'player-victory',
      activeSide: 'player',
    });

    reject(endTurn(state, { type: 'end-turn', side: 'player' }), 'battle-ended');
  });

  it('rejects an end turn outside the action phase', () => {
    const state = makeState({ phase: 'setup' });

    reject(endTurn(state, { type: 'end-turn', side: 'player' }), 'invalid-phase');
  });

  it('does not mutate the input state', () => {
    const state = deepFreeze(makeState({ player: { hand: ['strike'] } }));
    const next = end(state, 'player');

    expect(next).not.toBe(state);
    expect(state.sides.player.hand).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Drawing, burning and reshuffling                                            */
/* -------------------------------------------------------------------------- */

describe('drawing', () => {
  it('reshuffles the discard pile when the draw pile is empty', () => {
    const state = makeState({
      player: { hand: [], deck: [], discard: ['strike', 'plain', 'probe'] },
    });
    const next = drawCards(state, 'player', 3);

    expect(next.sides.player.hand.map((card) => card.cardId).sort()).toEqual([
      'plain',
      'probe',
      'strike',
    ]);
    expect(next.sides.player.deck).toHaveLength(0);
    expect(next.sides.player.discard).toHaveLength(0);
    expect(next.rngState).not.toEqual(state.rngState);
  });

  it('stops drawing when the draw pile and the discard pile are both empty', () => {
    const state = makeState({
      player: { hand: [], deck: [], discard: ['strike'] },
    });
    const emptied = drawCards(state, 'player', 1);
    const next = drawCards(emptied, 'player', 3);

    expect(next.sides.player.hand).toHaveLength(1);
    expect(next.rngState).toEqual(emptied.rngState);
  });

  it('burns cards drawn past a full hand instead of discarding them', () => {
    const hand = ['strike', 'plain', 'probe', 'mend', 'channel'];
    const state = makeState({
      player: { hand, deck: ['strike', 'plain'] },
    });
    const next = drawCards(state, 'player', 2);

    expect(next.sides.player.hand.map((card) => card.cardId)).toEqual(hand);
    expect(next.sides.player.hand).toHaveLength(HAND_SIZE);
    expect(next.sides.player.deck).toHaveLength(0);
    expect(next.sides.player.discard).toHaveLength(0);
    // Drawing itself consumes no randomness; only a reshuffle does.
    expect(next.rngState).toEqual(state.rngState);
  });

  it('lets a draw card use the slot its own card frees before overdraw', () => {
    const state = makeState({
      player: {
        hand: ['sift', 'strike', 'plain', 'probe', 'mend'],
        deck: ['strike', 'plain'],
      },
    });
    const next = play(state, 'player', 'sift');

    expect(next.sides.player.hand).toHaveLength(HAND_SIZE);
    expect(next.sides.player.deck).toHaveLength(0);
    expect(next.sides.player.discard.map((card) => card.cardId)).toEqual(['sift']);
    // Initial 7 cards; one was burned by overdraw.
    expect(
      next.sides.player.hand.length +
        next.sides.player.deck.length +
        next.sides.player.discard.length,
    ).toBe(6);
  });

  it('reshuffles deterministically from the same state', () => {
    const make = (): BattleState =>
      makeState({
        player: {
          hand: [],
          deck: [],
          discard: ['strike', 'plain', 'probe', 'mend', 'channel'],
        },
      });

    const left = drawCards(make(), 'player', 5);
    const right = drawCards(make(), 'player', 5);

    expect(left.sides.player.hand).toEqual(right.sides.player.hand);
    expect(left.rngState).toEqual(right.rngState);
  });

  it('never mutates the state passed to drawCards', () => {
    const state = deepFreeze(
      makeState({ player: { hand: [], deck: ['strike', 'plain'] } }),
    );
    const next = drawCards(state, 'player', 2);

    expect(next).not.toBe(state);
    expect(state.sides.player.hand).toHaveLength(0);
  });

  it('cannot change a settled battle', () => {
    const state = makeState({
      phase: 'ended',
      outcome: 'player-victory',
      player: { hand: [], deck: ['strike', 'plain'] },
    });

    expect(drawCards(state, 'player', 2)).toBe(state);
  });
});

/* -------------------------------------------------------------------------- */
/* Play validation                                                             */
/* -------------------------------------------------------------------------- */

describe('card play validation', () => {
  it('rejects an unaffordable card without changing state', () => {
    const state = deepFreeze(
      makeState({ player: { hand: ['heavy'], energy: 2 } }),
    );
    const instance = findInHand(state, 'player', 'heavy');
    const before = JSON.stringify(state);

    reject(playInstance(state, 'player', instance.instanceId), 'unaffordable-card');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects a play from the side that is not active', () => {
    const state = makeState({ opponent: { hand: ['strike'] } });
    const instance = findInHand(state, 'opponent', 'strike');

    reject(playInstance(state, 'opponent', instance.instanceId), 'not-active-side');
  });

  it('rejects any play after the battle ends', () => {
    const state = makeState({
      player: { hand: ['strike'] },
      phase: 'ended',
      outcome: 'opponent-victory',
    });
    const instance = findInHand(state, 'player', 'strike');

    reject(playInstance(state, 'player', instance.instanceId), 'battle-ended');
  });

  it('rejects an instance id that is not in the hand', () => {
    const state = makeState({ player: { hand: ['strike'] } });

    reject(playInstance(state, 'player', 'missing'), 'card-not-in-hand');
  });

  it('rejects a card definition the engine cannot execute', () => {
    const state = makeState({ player: { hand: ['bad-shift'] } });
    const instance = findInHand(state, 'player', 'bad-shift');

    reject(playInstance(state, 'player', instance.instanceId), 'unsupported-card');
  });

  it('rejects a card missing from the catalog at play time', () => {
    const state = makeState({ player: { hand: ['ghost'] } });
    const instance = findInHand(state, 'player', 'ghost');

    reject(playInstance(state, 'player', instance.instanceId), 'unknown-card');
  });

  it('accepts a card whose cost exactly equals the remaining energy', () => {
    const state = makeState({ player: { hand: ['heavy'], energy: 3 } });
    const next = play(state, 'player', 'heavy');

    expect(next.sides.player.energy).toBe(0);
    expect(next.sides.opponent.health).toBe(30);
  });

  it('canPlayCard agrees with playCard for every rejection and acceptance', () => {
    const state = makeState({
      player: { hand: ['strike', 'heavy'], energy: 2 },
    });
    const strike = findInHand(state, 'player', 'strike');
    const heavy = findInHand(state, 'player', 'heavy');

    expect(canPlayCard(state, 'player', strike.instanceId, catalog)).toBe(true);
    expect(canPlayCard(state, 'player', heavy.instanceId, catalog)).toBe(false);
    expect(canPlayCard(state, 'opponent', strike.instanceId, catalog)).toBe(false);
    expect(canPlayCard(state, 'player', 'missing', catalog)).toBe(false);
    expect(playInstance(state, 'player', heavy.instanceId).ok).toBe(false);
  });

  it('reports battle end before out-of-turn for a settled battle', () => {
    const state = makeState({
      phase: 'ended',
      outcome: 'player-victory',
      opponent: { hand: ['strike'] },
    });
    const instance = findInHand(state, 'opponent', 'strike');

    // The battle-ended check wins over the side check, so a settled battle has
    // exactly one rejection reason.
    reject(playInstance(state, 'opponent', instance.instanceId), 'battle-ended');
  });
});

/* -------------------------------------------------------------------------- */
/* Attacks                                                                     */
/* -------------------------------------------------------------------------- */

describe('attack effects', () => {
  it('deals the printed damage on a neutral field', () => {
    const state = makeState({ player: { hand: ['strike'] } });
    const next = play(state, 'player', 'strike');

    expect(next.sides.opponent.health).toBe(37);
    expect(next.sides.player.energy).toBe(2);
  });

  it('adds two damage per Focus stack and spends one stack', () => {
    const state = makeState({
      player: { hand: ['strike'], statuses: { focus: 2 } },
    });
    const next = play(state, 'player', 'strike');

    expect(next.sides.opponent.health).toBe(35);
    expect(next.sides.player.statuses.focus).toBe(1);
  });

  it('removes two damage per Weaken stack and spends one stack', () => {
    const state = makeState({
      player: { hand: ['strike'], statuses: { weaken: 1 } },
    });
    const next = play(state, 'player', 'strike');

    expect(next.sides.opponent.health).toBe(39);
    expect(next.sides.player.statuses.weaken).toBe(0);
  });

  it('nets Focus and Weaken to zero and spends one of each', () => {
    const state = makeState({
      player: { hand: ['strike'], statuses: { focus: 1, weaken: 1 } },
    });
    const next = play(state, 'player', 'strike');

    expect(next.sides.opponent.health).toBe(37);
    expect(next.sides.player.statuses.focus).toBe(0);
    expect(next.sides.player.statuses.weaken).toBe(0);
  });

  it('spends status stacks even when the attack deals zero damage', () => {
    const state = makeState({
      player: { hand: ['chip'], statuses: { weaken: 1 } },
    });
    const next = play(state, 'player', 'chip');

    expect(next.sides.opponent.health).toBe(40);
    expect(next.sides.player.statuses.weaken).toBe(0);
  });

  it('a matching attack gains two damage and pierces defense', () => {
    const state = makeState({
      player: { hand: ['ember-strike'] },
      opponent: { defense: 8 },
      field: 'ember',
    });
    const next = play(state, 'player', 'ember-strike');

    // 4 base + 2 field; piercing ignores the 8 defense.
    expect(next.sides.opponent.health).toBe(34);
    expect(next.sides.opponent.defense).toBe(8);
  });

  it('a countered attack halves with ceiling rounding before defense', () => {
    const cases: Array<[number, number]> = [
      [0, 38],
      [1, 39],
      [8, 40],
    ];

    for (const [defense, expectedHealth] of cases) {
      const state = makeState({
        player: { hand: ['ember-strike'] },
        opponent: { defense, health: 40 },
        field: 'stone',
      });
      const next = play(state, 'player', 'ember-strike');

      // 4 countered -> ceil(4 / 2) = 2, then defense.
      expect(next.sides.opponent.health).toBe(expectedHealth);
    }
  });

  it('a countered piercing attack cannot pierce', () => {
    const state = makeState({
      player: { hand: ['ember-pierce'] },
      opponent: { defense: 2 },
      field: 'stone',
    });
    const next = play(state, 'player', 'ember-pierce');

    // 4 countered -> 2 raw, then 2 defense -> 0.
    expect(next.sides.opponent.health).toBe(40);
    expect(next.sides.opponent.defense).toBe(2);
  });

  it('applies a card field bonus only while its element is the field', () => {
    const neutral = play(
      makeState({ player: { hand: ['kindled'] } }),
      'player',
      'kindled',
    );
    const matching = play(
      makeState({ player: { hand: ['kindled'] }, field: 'ember' }),
      'player',
      'kindled',
    );

    expect(neutral.sides.opponent.health).toBe(37);
    expect(matching.sides.opponent.health).toBe(33);
  });

  it('resolves a field shift before the card own attack', () => {
    const state = makeState({ player: { hand: ['shift-strike'] } });
    const next = play(state, 'player', 'shift-strike');

    expect(next.field).toBe('ember');
    // Shift to Ember first, then the Ember attack matches: 3 + 2 = 5.
    expect(next.sides.opponent.health).toBe(35);
  });

  it('never takes health below zero', () => {
    const state = makeState({
      player: { hand: ['heavy'] },
      opponent: { health: 2 },
    });
    const next = play(state, 'player', 'heavy');

    expect(next.sides.opponent.health).toBe(0);
    expect(next.outcome).toBe('player-victory');
  });
});

/* -------------------------------------------------------------------------- */
/* Wards and defense                                                           */
/* -------------------------------------------------------------------------- */

describe('Wards and defense', () => {
  it('a Ward adds its printed defense', () => {
    const state = makeState({ player: { hand: ['plain-ward'] } });
    const next = play(state, 'player', 'plain-ward');

    expect(next.sides.player.defense).toBe(2);
    expect(next.sides.opponent.defense).toBe(0);
  });

  it('a matching Ward adds two before the cap', () => {
    const state = makeState({
      player: { hand: ['ember-ward'], defense: 7 },
      field: 'ember',
    });
    const next = play(state, 'player', 'ember-ward');

    // 7 + 2 base + 2 matching = 11, capped at 8 rather than 9.
    expect(next.sides.player.defense).toBe(8);
  });

  it('applies a ward field bonus before the cap', () => {
    const capped = play(
      makeState({
        player: { hand: ['resonance'], defense: 7 },
        field: 'ember',
      }),
      'player',
      'resonance',
    );
    const fresh = play(
      makeState({ player: { hand: ['resonance'] }, field: 'ember' }),
      'player',
      'resonance',
    );

    // 7 + 1 base + 2 matching + 2 field = 12, capped at 8.
    expect(capped.sides.player.defense).toBe(8);
    // 0 + 1 + 2 + 2 = 5.
    expect(fresh.sides.player.defense).toBe(5);
  });

  it('applies a field bonus even when the card prints zero base defense', () => {
    const state = makeState({
      player: { hand: ['seed-ward'] },
      field: 'ember',
    });
    const next = play(state, 'player', 'seed-ward');

    // 0 base + 2 matching + 2 field = 4.
    expect(next.sides.player.defense).toBe(4);
  });

  it('keeps defense across turns so it reduces later attacks', () => {
    const state = makeState({
      player: { hand: ['plain-ward'] },
      opponent: { hand: ['ember-strike'] },
    });
    const warded = play(state, 'player', 'plain-ward');
    const enemyTurn = end(warded, 'player');
    const next = play(enemyTurn, 'opponent', 'ember-strike');

    // 4 damage - 2 persistent defense = 2.
    expect(next.sides.player.health).toBe(38);
    expect(next.sides.player.defense).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Energy, healing and statuses                                                */
/* -------------------------------------------------------------------------- */

describe('energy, healing and statuses', () => {
  it('lets card-granted energy exceed three for the current turn', () => {
    const state = makeState({ player: { hand: ['channel'] } });
    const next = play(state, 'player', 'channel');

    expect(next.sides.player.energy).toBe(4);
  });

  it('pays the card cost before granting energy', () => {
    const state = makeState({ player: { hand: ['surge'] } });
    const next = play(state, 'player', 'surge');

    // 3 - 1 cost + 2 gain = 4.
    expect(next.sides.player.energy).toBe(4);
  });

  it('resets card-granted energy at the next own turn', () => {
    const state = makeState({
      player: { hand: ['channel'] },
      opponent: { hand: [] },
    });
    const boosted = play(state, 'player', 'channel');

    expect(boosted.sides.player.energy).toBe(4);

    const backToPlayer = end(end(boosted, 'player'), 'opponent');

    expect(backToPlayer.sides.player.energy).toBe(TURN_START_ENERGY);
  });

  it('heals but never above maximum health', () => {
    const state = makeState({
      player: { hand: ['mend'], health: 38, maxHealth: 40 },
    });
    const next = play(state, 'player', 'mend');

    expect(next.sides.player.health).toBe(40);
  });

  it('applies a status to the side named by the card', () => {
    const exposed = play(
      makeState({ player: { hand: ['expose'] } }),
      'player',
      'expose',
    );
    const regen = play(
      makeState({ player: { hand: ['second-wind'] } }),
      'player',
      'second-wind',
    );

    expect(exposed.sides.opponent.statuses.weaken).toBe(1);
    expect(exposed.sides.player.statuses.weaken).toBe(0);
    expect(regen.sides.player.statuses.regen).toBe(2);
    expect(regen.sides.opponent.statuses.regen).toBe(0);
  });

  it('keeps status caps when a card applies above them', () => {
    const state = makeState({
      player: { hand: ['focus'], statuses: { focus: 3 } },
      opponent: { statuses: { weaken: 3 } },
    });
    const focused = play(state, 'player', 'focus');
    const exposed = play(
      makeState({
        player: { hand: ['expose'] },
        opponent: { statuses: { weaken: 3 } },
      }),
      'player',
      'expose',
    );

    expect(focused.sides.player.statuses.focus).toBe(3);
    expect(exposed.sides.opponent.statuses.weaken).toBe(3);
  });

  it('moves the played card to the discard pile', () => {
    const state = makeState({ player: { hand: ['strike', 'plain'] } });
    const instance = findInHand(state, 'player', 'strike');
    const next = play(state, 'player', 'strike');

    expect(next.sides.player.hand.map((card) => card.instanceId)).not.toContain(
      instance.instanceId,
    );
    expect(next.sides.player.discard.map((card) => card.instanceId)).toContain(
      instance.instanceId,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Symmetry                                                                    */
/* -------------------------------------------------------------------------- */

describe('symmetric sides', () => {
  it('play-card accepts the opponent as the acting side', () => {
    const state = makeState({
      activeSide: 'opponent',
      player: { health: 40 },
      opponent: { hand: ['ember-strike'] },
    });
    const next = play(state, 'opponent', 'ember-strike');

    expect(next.sides.player.health).toBe(36);
    expect(next.sides.opponent.energy).toBe(2);
    expect(next.sides.player.energy).toBe(TURN_START_ENERGY);
  });

  it('keeps every side resource independent', () => {
    const state = makeState({
      player: { hand: ['strike'] },
      opponent: { hand: ['plain'], energy: 1, defense: 4 },
    });
    const next = play(state, 'player', 'strike');

    expect(next.sides.opponent.hand).toHaveLength(1);
    expect(next.sides.opponent.energy).toBe(1);
    expect(next.sides.opponent.defense).toBe(4);
    expect(next.sides.opponent.statuses).toEqual(EMPTY_STATUSES);
  });

  it('lets the opponent reach victory', () => {
    const state = makeState({
      activeSide: 'opponent',
      player: { health: 3 },
      opponent: { hand: ['ember-strike'] },
    });
    const next = play(state, 'opponent', 'ember-strike');

    expect(next.sides.player.health).toBe(0);
    expect(next.outcome).toBe('opponent-victory');
    expect(next.phase).toBe('ended');
  });

  it('maps each side to its opponent', () => {
    expect(otherSide('player')).toBe('opponent');
    expect(otherSide('opponent')).toBe('player');
  });
});

/* -------------------------------------------------------------------------- */
/* Victory and defeat                                                          */
/* -------------------------------------------------------------------------- */

describe('victory and defeat', () => {
  it('ends the battle immediately when the opponent reaches zero health', () => {
    const state = makeState({
      player: { hand: ['ember-strike'] },
      opponent: { health: 4, statuses: { weaken: 1 } },
      enemyPlan: dummyPlan,
    });
    const next = play(state, 'player', 'ember-strike');

    expect(next.outcome).toBe('player-victory');
    expect(next.phase).toBe('ended');
    expect(next.enemyPlan).toBeNull();
  });

  it('ends the battle immediately when the player reaches zero health', () => {
    const state = makeState({
      activeSide: 'opponent',
      player: { health: 4 },
      opponent: { hand: ['ember-strike'] },
    });
    const next = play(state, 'opponent', 'ember-strike');

    expect(next.outcome).toBe('opponent-victory');
    expect(next.phase).toBe('ended');
  });

  it('clears every status on both sides when the battle ends', () => {
    const state = makeState({
      player: { hand: ['ember-strike'], statuses: { focus: 2 } },
      opponent: { health: 4, statuses: { weaken: 1, regen: 1 } },
    });
    const next = play(state, 'player', 'ember-strike');

    expect(next.sides.player.statuses).toEqual(EMPTY_STATUSES);
    expect(next.sides.opponent.statuses).toEqual(EMPTY_STATUSES);
  });

  it('rejects every action after victory without changing state', () => {
    const won = play(
      makeState({
        player: { hand: ['ember-strike'] },
        opponent: { health: 4 },
      }),
      'player',
      'ember-strike',
    );
    const before = JSON.stringify(won);

    reject(playInstance(won, 'player', 'player:1:ember-strike'), 'battle-ended');
    reject(endTurn(won, { type: 'end-turn', side: 'player' }), 'battle-ended');
    expect(JSON.stringify(won)).toBe(before);
  });

  it('still resolves the killing card other effects', () => {
    const state = makeState({
      player: { hand: ['drain', 'strike', 'plain', 'probe', 'mend'], deck: ['channel'] },
      opponent: { health: 3 },
    });
    const next = play(state, 'player', 'drain');

    expect(next.outcome).toBe('player-victory');
    // Drain draws before the battle settles, so the drawn Channel is in hand.
    expect(next.sides.player.hand.map((card) => card.cardId)).toContain('channel');
    expect(next.sides.player.discard.map((card) => card.cardId)).toContain('drain');
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism and purity                                                      */
/* -------------------------------------------------------------------------- */

describe('determinism and purity', () => {
  it('replays the same seed and actions to an identical state', () => {
    const runOnce = (): BattleState => {
      const state = created();
      const first = state.sides.player.hand[0];

      if (first === undefined) {
        throw new Error('the opening hand was empty');
      }

      const played = playCard(
        state,
        { type: 'play-card', side: 'player', instanceId: first.instanceId },
        catalog,
      );

      if (!played.ok) {
        throw new Error(played.error.message);
      }

      return end(played.value, 'player');
    };

    expect(runOnce()).toEqual(runOnce());
  });

  it('returns a new state object from every successful mutator', () => {
    const state = makeState({
      player: { hand: ['strike', 'plain'], deck: ['probe'] },
    });
    const played = play(state, 'player', 'strike');
    const drawn = drawCards(played, 'player', 1);
    const ended = end(drawn, 'player');

    expect(played).not.toBe(state);
    expect(drawn).not.toBe(played);
    expect(ended).not.toBe(drawn);
  });

  it('never mutates the input to playCard', () => {
    const state = deepFreeze(
      makeState({ player: { hand: ['strike'], deck: ['probe', 'plain'] } }),
    );
    const next = play(state, 'player', 'strike');

    expect(next).not.toBe(state);
    expect(state.sides.opponent.health).toBe(40);
  });
});
