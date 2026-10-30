/**
 * The beat cursors (motion-and-feedback sections 3.2, 3.3 and 11).
 *
 * The hooks own the rules a pure derivation cannot: no beat on mount or resume,
 * no beat for a refusal, the `dealt` gate for the opening hand, and "newest beat
 * wins" — a later transition replaces the beat instead of stacking one.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../engine/rng';
import type {
  BattleSide,
  BattleState,
  Side,
  StatusCounters,
} from '../../engine/types';
import type { BattleControllerState } from '../../state/battle-controller';
import type { DuelBattleView } from '../../duel/round';
import { useBattleFeedback, useDuelFeedback } from './useFeedbackBeat';

function statuses(): StatusCounters {
  return { focus: 0, weaken: 0, regen: 0 };
}

function makeSide(side: Side, health: number): BattleSide {
  return {
    side,
    element: 'ember',
    health,
    maxHealth: 40,
    defense: 0,
    energy: 3,
    deck: [],
    hand: [],
    discard: [],
    statuses: statuses(),
  };
}

function makeBattle(health: number, turn = 3): BattleState {
  return {
    seed: 7,
    rngState: createRng(7),
    turn,
    activeSide: 'player',
    phase: 'action',
    field: 'neutral',
    outcome: 'ongoing',
    sides: {
      player: makeSide('player', 40),
      opponent: makeSide('opponent', health),
    },
    enemyPlan: null,
  };
}

function controllerState(
  sequence: number,
  battle: BattleState,
  ok = true,
): BattleControllerState {
  return {
    battle,
    enemy: {
      id: 'enemy-cinder-warden',
      name: 'Cinder Warden',
      element: 'ember',
      maxHealth: 30,
      deck: [],
    },
    cards: {},
    fieldMatchup: null,
    log: [],
    sequence,
    report:
      sequence === 0
        ? null
        : {
            intent: 'play-card',
            ok,
            error: ok ? null : { code: 'unaffordable-card', message: 'no' },
            cues: ok ? ['card-play', 'damage'] : [],
          },
  };
}

describe('useBattleFeedback', () => {
  it('shows no beat on the opening render and never animates the deal', () => {
    const { result } = renderHook(() => useBattleFeedback(controllerState(0, makeBattle(30))));

    expect(result.current.beat).toBeNull();
    expect(result.current.dealt).toBe(false);
  });

  it('shows one beat for the first settled transition and marks the hand dealt', () => {
    const initial = controllerState(0, makeBattle(30));
    const { result, rerender } = renderHook(
      ({ state }: { state: BattleControllerState }) => useBattleFeedback(state),
      { initialProps: { state: initial } },
    );

    rerender({ state: controllerState(1, makeBattle(27)) });

    expect(result.current.beat?.key).toBe(1);
    expect(result.current.beat?.impacts).toEqual([
      { side: 'opponent', kind: 'damage', amount: -3 },
    ]);
    expect(result.current.dealt).toBe(true);
  });

  it('shows no beat for a refusal but keeps the hand dealt', () => {
    const initial = controllerState(0, makeBattle(30));
    const { result, rerender } = renderHook(
      ({ state }: { state: BattleControllerState }) => useBattleFeedback(state),
      { initialProps: { state: initial } },
    );

    rerender({ state: controllerState(1, makeBattle(27)) });
    rerender({ state: controllerState(2, makeBattle(27), false) });

    expect(result.current.beat).toBeNull();
    expect(result.current.dealt).toBe(true);
  });

  it('replaces the running beat instead of stacking a second one', () => {
    const initial = controllerState(0, makeBattle(30));
    const { result, rerender } = renderHook(
      ({ state }: { state: BattleControllerState }) => useBattleFeedback(state),
      { initialProps: { state: initial } },
    );

    rerender({ state: controllerState(1, makeBattle(27)) });
    rerender({ state: controllerState(2, makeBattle(24)) });

    expect(result.current.beat?.key).toBe(2);
    expect(result.current.beat?.impacts).toHaveLength(1);
    expect(result.current.beat?.impacts[0]?.amount).toBe(-3);
  });

  it('is stable across a re-render that commits no new transition', () => {
    const initial = controllerState(0, makeBattle(30));
    const { result, rerender } = renderHook(
      ({ state }: { state: BattleControllerState }) => useBattleFeedback(state),
      { initialProps: { state: initial } },
    );

    rerender({ state: controllerState(1, makeBattle(27)) });
    const first = result.current.beat;

    rerender({ state: controllerState(1, makeBattle(27)) });

    expect(result.current.beat).toBe(first);
  });

  it('starts over without a beat when a different battle mounts on the hook', () => {
    const initial = controllerState(6, makeBattle(30));
    const { result, rerender } = renderHook(
      ({ state }: { state: BattleControllerState }) => useBattleFeedback(state),
      { initialProps: { state: initial } },
    );

    rerender({ state: controllerState(1, makeBattle(20)) });

    expect(result.current.beat).toBeNull();
    expect(result.current.dealt).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

function duelView(health: number, logLength: number): DuelBattleView {
  return {
    kind: 'battle',
    viewer: 'player1',
    round: 1,
    wins: { player1: 0, player2: 0 },
    field: 'neutral',
    turn: 3,
    self: {
      player: 'player1',
      side: 'player',
      element: 'ember',
      health: 40,
      maxHealth: 40,
      defense: 0,
      energy: 3,
      statuses: statuses(),
      handCount: 1,
      deckCount: 9,
      discardCount: 0,
    },
    opponent: {
      player: 'player2',
      side: 'opponent',
      element: 'frost',
      health,
      maxHealth: 40,
      defense: 0,
      statuses: statuses(),
      handCount: 5,
      deckCount: 9,
      discardCount: 0,
    },
    hand: [{ instanceId: 'd:0:jab', cardId: 'ember-cinder-jab' }],
    log: Array.from({ length: logLength }, (_unused, index) => ({
      id: `t1-e${String(index)}`,
      ordinal: index,
      turn: 1,
      kind: 'turn' as const,
      actor: 'player' as const,
      effects: [],
    })),
  };
}

describe('useDuelFeedback', () => {
  it('shows no beat on the first visible turn and one per settled transition', () => {
    const { result, rerender } = renderHook(
      ({ view }: { view: DuelBattleView }) => useDuelFeedback(view),
      { initialProps: { view: duelView(40, 1) } },
    );

    expect(result.current).toBeNull();

    rerender({ view: duelView(34, 2) });

    expect(result.current?.key).toBe(2);
    expect(result.current?.impacts?.[0]).toEqual({
      side: 'opponent',
      kind: 'damage',
      amount: -6,
    });
    expect(result.current?.revealIntent).toBe(false);
  });

  it('is stable while the redacted view object changes but the log does not', () => {
    const { result, rerender } = renderHook(
      ({ view }: { view: DuelBattleView }) => useDuelFeedback(view),
      { initialProps: { view: duelView(34, 2) } },
    );

    const first = result.current;

    // A fresh object with the same public facts, as the composition root builds
    // on every render.
    rerender({ view: duelView(34, 2) });

    expect(result.current).toBe(first);
  });
});
