/**
 * Battle-log derivation (LOG-FR-01, LOG-NF-01).
 *
 * One entry per settled transition. `deriveBattleLogEntry` compares the
 * `BattleState` before and after an engine transition and copies only the
 * observable deltas: field, Ward defense, healing, damage, status applications
 * and the settled outcome. The played card id comes from the supplied context,
 * never from prose and never from a hand lookup.
 *
 * What this module deliberately does not do:
 *
 *   - no damage, draw, status, affordability or victory math: the engine already
 *     ran it and its numbers are read back as deltas;
 *   - no read of a hidden hand, deck order or the enemy plan, so a duel entry
 *     cannot leak private information;
 *   - no PRNG use of any kind: derivation is a pure function of the two states
 *     and the context, so logging cannot change a shuffle or an enemy plan;
 *   - no prose, dialogue or UI strings.
 *
 * Effect order is the order the engine applies effects in `playCard`:
 * field shift, Ward defense, heal, damage, status application, then outcome.
 * Zero-value deltas are omitted, so a transition that changed nothing produces
 * an empty effects list rather than a synthetic "+0" fact.
 *
 * The deltas themselves come from the shared `diffBattleState` (motion-and-
 * feedback section 2.1), which the announcement, the cue list and the visual
 * feedback beat also read. This module now only maps deltas to log effects, so
 * the four consumers cannot disagree about what changed; its output is
 * unchanged, and `derive.test.ts` plus `ui/feedback/parity.test.ts` are the
 * proof.
 */
import type { BattleState } from '../engine/types';
import { diffBattleState } from '../ui/feedback/diff';
import { logEffectsFromDeltas } from '../ui/feedback/consumers';
import { BATTLE_LOG_LIMIT } from './types';
import type { BattleLogEffect, BattleLogEntry } from './types';

/** Context for the once-per-battle setup entry. */
export interface BattleLogStartContext {
  readonly kind: 'battle-start';
  /** Ordinal assigned by the caller, normally 0. */
  readonly ordinal: number;
}

/** Context for a played card. `cardId` is required and taken from the instance. */
export interface BattleLogCardContext {
  readonly kind: 'card';
  /** Ordinal assigned by the caller. */
  readonly ordinal: number;
  /** Card id of the played instance; never inferred from state or prose. */
  readonly cardId: string;
}

/** Context for the handoff between sides. */
export interface BattleLogTurnContext {
  readonly kind: 'turn';
  /** Ordinal assigned by the caller. */
  readonly ordinal: number;
}

export type BattleLogContext =
  | BattleLogStartContext
  | BattleLogCardContext
  | BattleLogTurnContext;

/** Stable id derived from the settled turn and the never-reused ordinal. */
function entryId(turn: number, ordinal: number): string {
  return `t${String(turn)}-e${String(ordinal)}`;
}

/**
 * Copies every observable delta, in engine application order, from the shared
 * diff. Only increases in a status count are recorded: a stack spent by an
 * attack is not an application, and a battle-end clear is not one either.
 */
function deriveEffects(before: BattleState, after: BattleState): BattleLogEffect[] {
  return logEffectsFromDeltas(diffBattleState(before, after), after, {
    actor: before.activeSide,
    settled: before.outcome === 'ongoing' && after.outcome !== 'ongoing',
  });
}

/**
 * Derives exactly one entry from one settled transition.
 *
 * `before` is the state the engine action received and `after` is the state it
 * returned; the caller only calls this after a typed success, so rejected
 * actions never reach it. For `battle-start`, `before` is ignored because the
 * opening state has no predecessor; use `deriveBattleStartEntry` at setup.
 */
export function deriveBattleLogEntry(
  before: BattleState,
  after: BattleState,
  context: BattleLogContext,
): BattleLogEntry {
  if (context.kind === 'battle-start') {
    return {
      id: entryId(after.turn, context.ordinal),
      ordinal: context.ordinal,
      turn: after.turn,
      kind: 'battle-start',
      actor: 'system',
      effects: [
        {
          kind: 'start',
          opposingMaxHealth: after.sides.opponent.maxHealth,
          field: after.field,
        },
      ],
    };
  }

  const base = {
    id: entryId(after.turn, context.ordinal),
    ordinal: context.ordinal,
    turn: after.turn,
    kind: context.kind,
    actor: before.activeSide,
    effects: deriveEffects(before, after),
  } as const;

  // A card entry must name the played card. The type requires it; the runtime
  // check keeps a JavaScript caller from inventing a nameless card entry. The
  // validator rejects such an entry, so nothing invalid can be stored.
  if (
    context.kind === 'card' &&
    typeof context.cardId === 'string' &&
    context.cardId.length > 0
  ) {
    return { ...base, cardId: context.cardId };
  }

  return base;
}

/**
 * Convenience for setup: the opening entry, ordinal 0 by convention. Reads the
 * opening opposing maximum health and field from the created battle.
 */
export function deriveBattleStartEntry(
  state: BattleState,
  ordinal: number,
): BattleLogEntry {
  return deriveBattleLogEntry(state, state, {
    kind: 'battle-start',
    ordinal,
  });
}

/**
 * Appends one entry and keeps the newest `BATTLE_LOG_LIMIT` entries in
 * chronological order. Surviving entries are returned as-is, never renumbered,
 * so dialogue keyed on `ordinal` is stable across truncation. A new array is
 * always returned and the supplied entries are never mutated.
 */
export function appendBattleLog(
  entries: readonly BattleLogEntry[],
  entry: BattleLogEntry,
): BattleLogEntry[] {
  const next = [...entries, entry];

  return next.length <= BATTLE_LOG_LIMIT
    ? next
    : next.slice(next.length - BATTLE_LOG_LIMIT);
}
