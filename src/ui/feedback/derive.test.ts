/**
 * The feedback derivation (motion-and-feedback sections 2.2, 4 and 11).
 *
 * One beat per settled transition: draw, signed net impacts, defense chips,
 * field shift, intent reveal, handoff and flash targets. A transition with
 * nothing to show produces `null`; the opening deal never animates the hand; a
 * duel beat carries no intent reveal because a duel has no intent block.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../engine/rng';
import type {
  BattleOutcome,
  BattleSide,
  BattleState,
  CardInstance,
  Element,
  EnemyPlan,
  Side,
  StatusCounters,
} from '../../engine/types';
import type { DuelBattleView } from '../../duel/round';
import { deriveDuelFeedbackBeat, deriveFeedbackBeat } from './derive';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function statuses(overrides: Partial<StatusCounters> = {}): StatusCounters {
  return { focus: 0, weaken: 0, regen: 0, ...overrides };
}

function hand(...ids: readonly string[]): CardInstance[] {
  return ids.map((instanceId) => ({
    instanceId,
    cardId: instanceId.split(':').at(-1) ?? 'unknown',
  }));
}

function makeSide(side: Side, overrides: Partial<BattleSide> = {}): BattleSide {
  return {
    side,
    element: 'ember',
    health: 40,
    maxHealth: 40,
    defense: 0,
    energy: 3,
    deck: [],
    hand: [],
    discard: [],
    statuses: statuses(),
    ...overrides,
  };
}

interface StateOptions {
  readonly turn?: number;
  readonly activeSide?: Side;
  readonly field?: Element;
  readonly outcome?: BattleOutcome;
  readonly player?: Partial<BattleSide>;
  readonly opponent?: Partial<BattleSide>;
  readonly plan?: EnemyPlan | null;
}

function makeState(options: StateOptions = {}): BattleState {
  return {
    seed: 7,
    rngState: createRng(7),
    turn: options.turn ?? 3,
    activeSide: options.activeSide ?? 'player',
    phase: 'action',
    field: options.field ?? 'neutral',
    outcome: options.outcome ?? 'ongoing',
    sides: {
      player: makeSide('player', options.player ?? {}),
      opponent: makeSide('opponent', {
        health: 30,
        maxHealth: 30,
        ...options.opponent,
      }),
    },
    enemyPlan: options.plan === undefined ? null : options.plan,
  };
}

function plan(turn: number, ids: readonly string[]): EnemyPlan {
  return {
    side: 'opponent',
    turn,
    steps: ids.map((instanceId, index) => ({
      cardId: instanceId.split(':').at(-1) ?? 'unknown',
      instanceId,
      cost: 1,
      damage: 3,
      defense: 0,
      statuses: [],
      shiftTo: null,
      energyAfter: 2 - index,
    })),
    totalDamage: 3 * ids.length,
    totalDefense: 0,
    lethal: false,
    remainingEnergy: 2,
  };
}

/* -------------------------------------------------------------------------- */

describe('deriveFeedbackBeat', () => {
  it('shows one signed net number and one damage flash per target', () => {
    const before = makeState();
    const after = makeState({
      player: { health: 34 },
      opponent: { health: 24 },
    });

    const beat = deriveFeedbackBeat(before, after, 4);

    expect(beat).not.toBeNull();
    expect(beat?.key).toBe(4);
    expect(beat?.impacts).toEqual([
      { side: 'player', kind: 'damage', amount: -6 },
      { side: 'opponent', kind: 'damage', amount: -6 },
    ]);
    expect(beat?.flash).toEqual([
      { side: 'player', kind: 'damage' },
      { side: 'opponent', kind: 'damage' },
    ]);
    expect(beat?.defense).toEqual([]);
    expect(beat?.draw).toBe(false);
    expect(beat?.handoff).toBe(false);
  });

  it('folds a multi-step enemy plan into one net per target', () => {
    const before = makeState({ activeSide: 'opponent', turn: 2 });
    const after = makeState({
      activeSide: 'player',
      turn: 3,
      player: { health: 31 },
      opponent: { health: 26 },
    });

    const beat = deriveFeedbackBeat(before, after, 12);

    // Three attacks on the player, one counter-hit: two numbers, not four.
    expect(beat?.impacts.map((impact) => impact.amount)).toEqual([-9, -4]);
    expect(beat?.impacts).toHaveLength(2);
    expect(beat?.handoff).toBe(true);
  });

  it('reports a heal as a positive number and a heal flash', () => {
    const before = makeState({ player: { health: 30 } });
    const after = makeState({ player: { health: 32 } });

    const beat = deriveFeedbackBeat(before, after, 5);

    expect(beat?.impacts).toEqual([
      { side: 'player', kind: 'heal', amount: 2 },
    ]);
    expect(beat?.flash).toEqual([{ side: 'player', kind: 'heal' }]);
  });

  it('shows a defense chip instead of a number when only defense rose', () => {
    const before = makeState({ player: { defense: 1 } });
    const after = makeState({ player: { defense: 4 } });

    const beat = deriveFeedbackBeat(before, after, 6);

    expect(beat?.impacts).toEqual([]);
    expect(beat?.defense).toEqual([{ side: 'player', amount: 3, total: 4 }]);
    expect(beat?.flash).toEqual([{ side: 'player', kind: 'defense' }]);
  });

  it('lets a health change win the flash when defense also rose', () => {
    const before = makeState({ opponent: { health: 30, defense: 0 } });
    const after = makeState({ opponent: { health: 25, defense: 2 } });

    const beat = deriveFeedbackBeat(before, after, 7);

    expect(beat?.flash).toEqual([{ side: 'opponent', kind: 'damage' }]);
    expect(beat?.defense).toEqual([
      { side: 'opponent', amount: 2, total: 2 },
    ]);
  });

  it('carries the field shift with its old and new field', () => {
    const before = makeState();
    const after = makeState({ field: 'ember' });

    const beat = deriveFeedbackBeat(before, after, 8);

    expect(beat?.field).toEqual({ previous: 'neutral', next: 'ember' });
    expect(beat?.impacts).toEqual([]);
    expect(beat?.defense).toEqual([]);
    expect(beat?.flash).toEqual([]);
  });

  it('produces no beat at all for a zero-delta action', () => {
    const before = makeState();
    const after = makeState();

    expect(deriveFeedbackBeat(before, after, 9)).toBeNull();
  });

  it('produces no beat for a status-only application', () => {
    const before = makeState();
    const after = makeState({
      opponent: { statuses: statuses({ weaken: 2 }) },
    });

    expect(deriveFeedbackBeat(before, after, 10)).toBeNull();
  });

  it('never animates the hand on the opening deal (sequence 0)', () => {
    const before = makeState({ player: { hand: [] } });
    const after = makeState({ player: { hand: hand('p:0:jab', 'p:1:guard') } });

    const opening = deriveFeedbackBeat(before, after, 0);

    expect(opening?.draw).toBe(false);
    expect(opening?.drawn).toEqual(['p:0:jab', 'p:1:guard']);
    expect(deriveFeedbackBeat(before, after, 1)?.draw).toBe(true);
  });

  it('draws only when an instance that was not held entered the hand', () => {
    const before = makeState({ player: { hand: hand('p:0:jab', 'p:1:guard') } });
    const after = makeState({
      player: { hand: hand('p:1:guard', 'p:2:lance') },
    });

    const drawn = deriveFeedbackBeat(before, after, 11);

    expect(drawn?.draw).toBe(true);
    expect(drawn?.drawn).toEqual(['p:2:lance']);

    // The same two instances in a different order are not a draw; the health
    // change keeps the beat alive so the flag itself is what is being read.
    const rearranged = makeState({
      player: { hand: hand('p:1:guard', 'p:0:jab'), health: 36 },
    });

    const quiet = deriveFeedbackBeat(before, rearranged, 11);

    expect(quiet?.draw).toBe(false);
    expect(quiet?.drawn).toEqual([]);
  });

  it('reveals the intent only when a new plan arrives with a player turn', () => {
    const enemyPlan = plan(2, ['o:0:jab']);
    const nextPlan = plan(3, ['o:1:guard']);

    const endTurn = deriveFeedbackBeat(
      makeState({ activeSide: 'opponent', turn: 2, plan: null }),
      makeState({ activeSide: 'player', turn: 3, plan: nextPlan }),
      13,
    );
    expect(endTurn?.revealIntent).toBe(true);
    expect(endTurn?.handoff).toBe(true);

    // Re-previewing the same plan after a card is not a reveal.
    const rePreviewed = deriveFeedbackBeat(
      makeState({ plan: enemyPlan }),
      makeState({
        opponent: { health: 26 },
        plan: {
          ...enemyPlan,
          steps: enemyPlan.steps.map((step) => ({ ...step, damage: 1 })),
        },
      }),
      14,
    );
    expect(rePreviewed?.revealIntent).toBe(false);
    expect(rePreviewed?.impacts).toHaveLength(1);

    // Control passing to the enemy is a handoff, not a reveal.
    const handedToEnemy = deriveFeedbackBeat(
      makeState({ activeSide: 'player', turn: 2, plan: enemyPlan }),
      makeState({ activeSide: 'opponent', turn: 3, plan: null }),
      15,
    );
    expect(handedToEnemy?.revealIntent).toBe(false);
    expect(handedToEnemy?.handoff).toBe(true);
  });

  it('flags the handoff when the turn number or the active side moved', () => {
    const before = makeState({ turn: 3, activeSide: 'player' });
    const after = makeState({ turn: 5, activeSide: 'player' });

    expect(deriveFeedbackBeat(before, after, 16)?.handoff).toBe(true);
    expect(deriveFeedbackBeat(before, makeState(), 17)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Duel                                                                       */
/* -------------------------------------------------------------------------- */

function duelView(overrides: {
  readonly selfHealth?: number;
  readonly selfDefense?: number;
  readonly opponentHealth?: number;
  readonly opponentDefense?: number;
  readonly field?: Element;
  readonly turn?: number;
  readonly hand?: readonly string[];
  readonly selfSide?: Side;
  readonly logLength?: number;
}): DuelBattleView {
  const selfSide = overrides.selfSide ?? 'player';
  const opponentSide: Side = selfSide === 'player' ? 'opponent' : 'player';
  const ids = overrides.hand ?? ['d:0:jab'];

  return {
    kind: 'battle',
    viewer: 'player1',
    round: 1,
    wins: { player1: 0, player2: 0 },
    field: overrides.field ?? 'neutral',
    turn: overrides.turn ?? 3,
    self: {
      player: 'player1',
      side: selfSide,
      element: 'ember',
      health: overrides.selfHealth ?? 40,
      maxHealth: 40,
      defense: overrides.selfDefense ?? 0,
      energy: 3,
      statuses: statuses(),
      handCount: ids.length,
      deckCount: 10,
      discardCount: 0,
    },
    opponent: {
      player: 'player2',
      side: opponentSide,
      element: 'frost',
      health: overrides.opponentHealth ?? 40,
      maxHealth: 40,
      defense: overrides.opponentDefense ?? 0,
      statuses: statuses(),
      handCount: 5,
      deckCount: 9,
      discardCount: 1,
    },
    hand: ids.map((instanceId) => ({
      instanceId,
      cardId: instanceId.split(':').at(-1) ?? 'unknown',
    })),
    log: Array.from({ length: overrides.logLength ?? 1 }, (_unused, index) => ({
      id: `t1-e${String(index)}`,
      ordinal: index,
      turn: 1,
      kind: 'turn' as const,
      actor: 'player' as const,
      effects: [],
    })),
  };
}

describe('deriveDuelFeedbackBeat', () => {
  it('uses the same vocabulary over public health deltas', () => {
    const beat = deriveDuelFeedbackBeat(
      duelView({}),
      duelView({ opponentHealth: 34 }),
      2,
    );

    expect(beat?.impacts).toEqual([
      { side: 'opponent', kind: 'damage', amount: -6 },
    ]);
    expect(beat?.flash).toEqual([{ side: 'opponent', kind: 'damage' }]);
    expect(beat?.handoff).toBe(false);
  });

  it('maps the viewer-relative panels back to the engine sides', () => {
    const before = duelView({ selfSide: 'opponent', selfHealth: 40 });
    const after = duelView({ selfSide: 'opponent', selfHealth: 33 });

    const beat = deriveDuelFeedbackBeat(before, after, 3);

    expect(beat?.impacts).toEqual([
      { side: 'opponent', kind: 'damage', amount: -7 },
    ]);
  });

  it('reports a defense chip with the resulting total', () => {
    const beat = deriveDuelFeedbackBeat(
      duelView({ selfDefense: 0 }),
      duelView({ selfDefense: 3 }),
      4,
    );

    expect(beat?.defense).toEqual([{ side: 'player', amount: 3, total: 3 }]);
    expect(beat?.impacts).toEqual([]);
  });

  it('never reveals an intent and only draws on a genuinely new hand', () => {
    const beat = deriveDuelFeedbackBeat(
      duelView({ turn: 3 }),
      duelView({ turn: 4, hand: ['d:1:guard'], selfHealth: 38 }),
      5,
    );

    expect(beat?.revealIntent).toBe(false);
    expect(beat?.handoff).toBe(true);
    expect(beat?.draw).toBe(true);

    const sameHand = deriveDuelFeedbackBeat(
      duelView({ turn: 3 }),
      duelView({ turn: 4, selfHealth: 38 }),
      6,
    );

    expect(sameHand?.draw).toBe(false);
  });

  it('carries the shared field move', () => {
    const beat = deriveDuelFeedbackBeat(
      duelView({ field: 'neutral' }),
      duelView({ field: 'stone' }),
      7,
    );

    expect(beat?.field).toEqual({ previous: 'neutral', next: 'stone' });
  });

  it('produces no beat when nothing public changed', () => {
    expect(deriveDuelFeedbackBeat(duelView({}), duelView({}), 8)).toBeNull();
  });
});
