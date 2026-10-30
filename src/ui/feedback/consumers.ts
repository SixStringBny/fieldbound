/**
 * The three text/cue consumers of the shared diff (motion-and-feedback section
 * 2.1).
 *
 * Each function here is the *only* place its consumer maps deltas to output, so
 * the log, the announcement and the cue list cannot drift from the visual beat:
 * they all read the same `BattleDeltas`. The mapping is output-identical to the
 * per-consumer implementations it replaced, which is what the parity tests in
 * `src/ui/feedback/parity.test.ts` pin down.
 *
 * `after` is passed alongside the deltas wherever a *resulting* value is part of
 * the output (the remaining health a log entry records, a meter total). The
 * deltas say what moved and by how much; the settled state says where it
 * landed. No function here reads a hand, a deck, the enemy plan or the PRNG.
 */
import type { BattleLogEffect } from '../../battle-log/types';
import type { BattleState, Side } from '../../engine/types';
import type { CueName } from '../events';
import { diffBattleState, otherSide } from './diff';
import type { BattleDeltas } from './diff';

/**
 * The cues one resolved card contributes, in playback order, without the
 * leading `card-play`. A zero-damage hit, a Ward at the cap and a shift to the
 * current field each stay silent for their own cue.
 */
export function cuesFromDeltas(deltas: BattleDeltas): CueName[] {
  const cues: CueName[] = [];

  if (deltas.health.player < 0 || deltas.health.opponent < 0) {
    cues.push('damage');
  }

  if (deltas.defense.player > 0 || deltas.defense.opponent > 0) {
    cues.push('ward');
  }

  if (deltas.field !== null) {
    cues.push('shift');
  }

  if (deltas.outcome === 'player-victory') {
    cues.push('victory');
  } else if (deltas.outcome === 'opponent-victory') {
    cues.push('defeat');
  }

  return cues;
}

/**
 * The full cue list for one resolved card: `card-play` always leads, then the
 * deltas in their fixed order. A rejected play never reaches this function.
 */
export function cuesForCardPlay(
  before: BattleState,
  after: BattleState,
): readonly CueName[] {
  return ['card-play', ...cuesFromDeltas(diffBattleState(before, after))];
}

/** Facts a log entry needs that are not a delta of the transition itself. */
export interface LogEffectOptions {
  /** The side that acted, which fixes the order effects are recorded in. */
  readonly actor: Side;
  /**
   * Whether this transition settled the battle. The engine rejects every later
   * action, so this is `before.outcome === 'ongoing' && after.outcome !==
   * 'ongoing'`; it is passed explicitly because a settled state compared with
   * itself is not a settlement.
   */
  readonly settled: boolean;
}

/**
 * The log's effect list, in the order the engine applies effects: field shift,
 * Ward defense, heal, damage, status application, then the settled outcome.
 *
 * Zero and negative deltas are omitted, so a transition that changed nothing
 * produces an empty list rather than a synthetic `+0` fact, and a spent status
 * stack is never recorded as an application.
 */
export function logEffectsFromDeltas(
  deltas: BattleDeltas,
  after: BattleState,
  options: LogEffectOptions,
): BattleLogEffect[] {
  const effects: BattleLogEffect[] = [];
  const order: readonly Side[] = [options.actor, otherSide(options.actor)];

  if (deltas.field !== null) {
    effects.push({
      kind: 'field',
      previous: deltas.field.previous,
      next: deltas.field.next,
    });
  }

  for (const side of order) {
    const amount = deltas.defense[side];

    if (amount > 0) {
      effects.push({
        kind: 'defense',
        target: side,
        amount,
        total: after.sides[side].defense,
      });
    }
  }

  for (const side of order) {
    const amount = deltas.health[side];

    if (amount > 0) {
      effects.push({
        kind: 'heal',
        target: side,
        amount,
        remaining: after.sides[side].health,
        max: after.sides[side].maxHealth,
      });
    }
  }

  for (const side of order) {
    const amount = deltas.health[side];

    if (amount < 0) {
      effects.push({
        kind: 'damage',
        target: side,
        amount: -amount,
        remaining: after.sides[side].health,
        max: after.sides[side].maxHealth,
      });
    }
  }

  for (const side of order) {
    for (const status of deltas.statuses) {
      if (status.side === side) {
        effects.push({
          kind: 'status',
          target: side,
          status: status.status,
          stacks: status.stacks,
        });
      }
    }
  }

  if (options.settled) {
    effects.push({ kind: 'outcome', outcome: deltas.outcome });
  }

  return effects;
}
