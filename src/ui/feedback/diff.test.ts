/**
 * The shared battle diff (motion-and-feedback section 2.1).
 *
 * These tests pin the shape every consumer reads: a signed net per side, status
 * *applications* only, the field move, the outcome and the turn change. The
 * folding rule is the important one — two enemy attacks in one settled
 * transition are one `-6`, not two facts — because the impact number, the log
 * entry and the announcement all read this object.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../engine/rng';
import type {
  BattleOutcome,
  BattleSide,
  BattleState,
  Element,
  Side,
  StatusCounters,
} from '../../engine/types';
import { diffBattleState } from './diff';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function statuses(overrides: Partial<StatusCounters> = {}): StatusCounters {
  return { focus: 0, weaken: 0, regen: 0, ...overrides };
}

function makeSide(
  side: Side,
  overrides: Partial<BattleSide> = {},
): BattleSide {
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
      opponent: makeSide('opponent', { health: 30, maxHealth: 30, ...options.opponent }),
    },
    enemyPlan: null,
  };
}

/* -------------------------------------------------------------------------- */

describe('diffBattleState', () => {
  it('folds every health change into one signed net per side', () => {
    const before = makeState();
    const after = makeState({
      player: { health: 34 },
      opponent: { health: 24 },
    });

    const deltas = diffBattleState(before, after);

    expect(deltas.health).toEqual({ player: -6, opponent: -6 });
    expect(deltas.defense).toEqual({ player: 0, opponent: 0 });
    expect(deltas.statuses).toEqual([]);
    expect(deltas.field).toBeNull();
    expect(deltas.outcome).toBe('ongoing');
    expect(deltas.turnChanged).toBe(false);
    expect(deltas.turn).toBe(3);
  });

  it('reports healing as a positive net and defense as its gain', () => {
    const before = makeState({ player: { health: 28, defense: 1 } });
    const after = makeState({ player: { health: 30, defense: 4 } });

    const deltas = diffBattleState(before, after);

    expect(deltas.health.player).toBe(2);
    expect(deltas.defense.player).toBe(3);
  });

  it('reports only status increases, with the resulting stack count', () => {
    const before = makeState({
      player: { statuses: statuses({ focus: 2 }) },
      opponent: { statuses: statuses({ weaken: 1 }) },
    });
    const after = makeState({
      player: { statuses: statuses({ focus: 1 }) },
      opponent: { statuses: statuses({ weaken: 3, regen: 1 }) },
    });

    const deltas = diffBattleState(before, after);

    expect(deltas.statuses).toEqual([
      { side: 'opponent', status: 'weaken', stacks: 3 },
      { side: 'opponent', status: 'regen', stacks: 1 },
    ]);
  });

  it('carries the field move and the settled outcome', () => {
    const before = makeState({ field: 'neutral' });
    const after = makeState({ field: 'frost', outcome: 'player-victory' });

    const deltas = diffBattleState(before, after);

    expect(deltas.field).toEqual({ previous: 'neutral', next: 'frost' });
    expect(deltas.outcome).toBe('player-victory');
  });

  it('flags a turn change from either the number or the active side', () => {
    const base = makeState({ turn: 3, activeSide: 'player' });

    expect(
      diffBattleState(base, makeState({ turn: 4, activeSide: 'player' }))
        .turnChanged,
    ).toBe(true);
    expect(
      diffBattleState(base, makeState({ turn: 3, activeSide: 'opponent' }))
        .turnChanged,
    ).toBe(true);
    expect(diffBattleState(base, makeState({ turn: 3 })).turnChanged).toBe(
      false,
    );
  });

  it('is zeroed for two identical states and never mutates either', () => {
    const before = makeState({ player: { statuses: statuses({ focus: 1 }) } });
    const snapshot = JSON.stringify(before);

    const deltas = diffBattleState(before, before);

    expect(deltas).toEqual({
      health: { player: 0, opponent: 0 },
      defense: { player: 0, opponent: 0 },
      statuses: [],
      field: null,
      outcome: 'ongoing',
      turnChanged: false,
      turn: 3,
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
