/**
 * Focus, Weaken and Regen stacks (ENG-FR-03, VIS-CON-08).
 *
 * This is the only place in Fieldbound that knows how status stacks are
 * applied, capped, spent or cleared. The battle reducer calls these helpers
 * before resolving a card; the enemy planner and the intent preview call the
 * same helpers while simulating a turn, so a previewed number can never drift
 * from the number the battle later resolves.
 *
 * Rules frozen by the status table in `docs/features/battle-engine.md`:
 *
 *   Focus   +2 to the next attack card, one stack per attack card, cap 3
 *   Weaken  -2 to the next attack card, one stack per attack card, cap 3
 *   Regen   heal 2 at the owner's turn start, one stack per turn start, cap 2
 *
 * Focus and Weaken are consumed together when both are present: the net
 * modifier is 0 and both counters drop by one. Consumption is a property of
 * playing an attack card, not of the final damage, so an attack that defense
 * reduces to 0 still spends the stack (`consumeAttackStatuses` has already
 * happened before `resolveAttack` is called).
 *
 * Everything here is pure. Inputs are read and never mutated; every function
 * returns new counters. Corrupt counters (negative, fractional or non-finite)
 * are normalised to a legal `0..cap` integer rather than leaking into state.
 */
import { REGEN_HEAL, STATUS_CAPS } from './types';
import type {
  BattleSides,
  Side,
  StatusApplication,
  StatusCounters,
  StatusKind,
  StatusTarget,
} from './types';

/* -------------------------------------------------------------------------- */
/* Frozen status numbers                                                       */
/* -------------------------------------------------------------------------- */

/** Damage added by one consumed Focus stack. */
export const FOCUS_DAMAGE_BONUS = 2;

/** Damage removed by one consumed Weaken stack. */
export const WEAKEN_DAMAGE_PENALTY = 2;

/** Counters for a side with no statuses. Frozen; safe to share. */
export const EMPTY_STATUSES: StatusCounters = Object.freeze({
  focus: 0,
  weaken: 0,
  regen: 0,
});

/** Fresh zeroed counters. Returned by value so callers cannot alias shared state. */
export function emptyStatuses(): StatusCounters {
  return {
    focus: 0,
    weaken: 0,
    regen: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading and normalising counters                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bounds one stack count for its status kind. Caps are 3/3/2; negative,
 * fractional and non-finite values become a legal lower value. Applying above
 * the cap keeps the cap, which is what makes repeated applications idempotent
 * at the cap.
 */
export function clampStatusStacks(kind: StatusKind, stacks: number): number {
  const cap = STATUS_CAPS[kind];
  const amount = Number.isFinite(stacks) ? Math.trunc(stacks) : 0;

  if (amount <= 0) {
    return 0;
  }

  return amount >= cap ? cap : amount;
}

/**
 * Normalises a complete counter set, filling missing kinds with zero. Snapshot
 * validation and battle setup can pass a partial object; the result is always a
 * legal `StatusCounters`.
 */
export function normalizeStatusCounters(
  counters: Readonly<Partial<Record<StatusKind, number>>>,
): StatusCounters {
  return {
    focus: clampStatusStacks('focus', counters.focus ?? 0),
    weaken: clampStatusStacks('weaken', counters.weaken ?? 0),
    regen: clampStatusStacks('regen', counters.regen ?? 0),
  };
}

/** Stacks of one status, read through the same clamp as application. */
export function getStacks(
  statuses: StatusCounters,
  kind: StatusKind,
): number {
  return clampStatusStacks(kind, statuses[kind]);
}

/** True when at least one stack of the status is present. */
export function hasStatus(
  statuses: StatusCounters,
  kind: StatusKind,
): boolean {
  return getStacks(statuses, kind) > 0;
}

/* -------------------------------------------------------------------------- */
/* Application                                                                 */
/* -------------------------------------------------------------------------- */

/** Replaces one counter on a normalised set, keeping the other kinds intact. */
function replaceStacks(
  statuses: StatusCounters,
  kind: StatusKind,
  stacks: number,
): StatusCounters {
  switch (kind) {
    case 'focus':
      return { focus: stacks, weaken: statuses.weaken, regen: statuses.regen };
    case 'weaken':
      return { focus: statuses.focus, weaken: stacks, regen: statuses.regen };
    case 'regen':
      return { focus: statuses.focus, weaken: statuses.weaken, regen: stacks };
  }
}

/**
 * Adds stacks of one status to a counter set. The result never exceeds the
 * kind's cap; adding 0 or a negative amount is a no-op (there is no cleanse
 * effect in v1). The input object is never mutated.
 */
export function applyStatus(
  statuses: StatusCounters,
  kind: StatusKind,
  stacks: number,
): StatusCounters {
  const current = normalizeStatusCounters(statuses);
  const added = clampStatusStacks(kind, stacks);
  const next = clampStatusStacks(kind, current[kind] + added);

  return replaceStacks(current, kind, next);
}

/**
 * Applies the statuses a card declares, in order. `target` is not interpreted
 * here: the caller resolves which side owns the counters with
 * `resolveStatusTarget`, so a single helper serves self-buffs, debuffs and the
 * planner's simulated steps.
 */
export function applyStatusApplications(
  statuses: StatusCounters,
  applications: readonly StatusApplication[],
): StatusCounters {
  let result = normalizeStatusCounters(statuses);

  for (const application of applications) {
    result = applyStatus(result, application.kind, application.stacks);
  }

  return result;
}

/**
 * Maps a card's status target onto a concrete battle side. Focus and Weaken can
 * target either side; Regen targets its owner by data, and this helper keeps
 * that choice out of the reducer and the planner.
 */
export function resolveStatusTarget(
  actingSide: Side,
  target: StatusTarget,
): Side {
  if (target === 'self') {
    return actingSide;
  }

  return actingSide === 'player' ? 'opponent' : 'player';
}

/* -------------------------------------------------------------------------- */
/* Attack consumption                                                          */
/* -------------------------------------------------------------------------- */

/** Outcome of spending stacks for one attack card. */
export interface AttackStatusSpend {
  /** Counters after one Focus and/or Weaken stack was spent. */
  readonly statuses: StatusCounters;
  readonly focusConsumed: number;
  readonly weakenConsumed: number;
  /**
   * Net damage modifier for the attack: `+2` per Focus stack spent and `-2` per
   * Weaken stack spent. Pass this to `resolveAttack` as `statusModifier`.
   */
  readonly modifier: number;
}

/**
 * Spends one Focus and one Weaken stack for a single attack card play. Both are
 * spent when both are present, which nets to zero damage change. A status at
 * zero consumes nothing. The caller spends before resolving damage, so the
 * stacks are gone even when the attack ends up dealing 0.
 */
export function consumeAttackStatuses(
  statuses: StatusCounters,
): AttackStatusSpend {
  const current = normalizeStatusCounters(statuses);
  const focusConsumed = current.focus > 0 ? 1 : 0;
  const weakenConsumed = current.weaken > 0 ? 1 : 0;

  return {
    statuses: {
      focus: current.focus - focusConsumed,
      weaken: current.weaken - weakenConsumed,
      regen: current.regen,
    },
    focusConsumed,
    weakenConsumed,
    modifier:
      focusConsumed * FOCUS_DAMAGE_BONUS -
      weakenConsumed * WEAKEN_DAMAGE_PENALTY,
  };
}

/**
 * Net modifier the next attack card would receive, without spending anything.
 * Reads the same rules as `consumeAttackStatuses`, so a preview can show the
 * upcoming number before the attack is committed.
 */
export function attackStatusModifier(statuses: StatusCounters): number {
  const focus = getStacks(statuses, 'focus') > 0 ? FOCUS_DAMAGE_BONUS : 0;
  const weaken = getStacks(statuses, 'weaken') > 0 ? WEAKEN_DAMAGE_PENALTY : 0;

  return focus - weaken;
}

/* -------------------------------------------------------------------------- */
/* Regen turn-start tick                                                       */
/* -------------------------------------------------------------------------- */

/** Outcome of the turn-start Regen tick for one side. */
export interface RegenTick {
  /** Counters after one Regen stack was spent (if any). */
  readonly statuses: StatusCounters;
  /** Health after healing, never above the maximum. */
  readonly health: number;
  /** Health actually restored by this tick (0 when already at maximum). */
  readonly healed: number;
  readonly regenConsumed: number;
}

/**
 * Ticks Regen at the owner's turn start: heals `REGEN_HEAL` capped at maximum
 * health and spends one stack. The consumption is per turn start, so a stack is
 * spent even when the side is already at full health; there is no way to bank
 * Regen for a later turn. With no stacks nothing changes.
 */
export function tickRegen(
  statuses: StatusCounters,
  health: number,
  maxHealth: number,
): RegenTick {
  const current = normalizeStatusCounters(statuses);
  const regenConsumed = current.regen > 0 ? 1 : 0;
  const safeHealth = toNonNegativeInteger(health);
  const ceiling = toNonNegativeInteger(maxHealth);
  const healed =
    regenConsumed === 0
      ? 0
      : Math.min(REGEN_HEAL, Math.max(0, ceiling - safeHealth));

  return {
    statuses: {
      focus: current.focus,
      weaken: current.weaken,
      regen: current.regen - regenConsumed,
    },
    health: safeHealth + healed,
    healed,
    regenConsumed,
  };
}

/* -------------------------------------------------------------------------- */
/* Battle-end clearing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Battle-end clearing for one side: every counter returns to zero. Statuses
 * never survive a battle or a duel round, so the reducer calls this for both
 * sides when it sets the outcome. The previous counters are accepted for a
 * readable call site and are not read.
 */
export function clearStatuses(_statuses: StatusCounters): StatusCounters {
  return emptyStatuses();
}

/**
 * Battle-end clearing for both symmetric sides. Returns new side objects with
 * zeroed statuses and every other field copied unchanged, so `battle.ts` can
 * clear the board in one call without restating the status rule.
 */
export function clearBattleStatuses(sides: BattleSides): BattleSides {
  return {
    player: { ...sides.player, statuses: emptyStatuses() },
    opponent: { ...sides.opponent, statuses: emptyStatuses() },
  };
}

/* -------------------------------------------------------------------------- */
/* Integer inputs                                                              */
/* -------------------------------------------------------------------------- */

/** Truncates to a non-negative integer; a corrupt value becomes 0. */
function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const integer = Math.trunc(value);

  return integer > 0 ? integer : 0;
}
