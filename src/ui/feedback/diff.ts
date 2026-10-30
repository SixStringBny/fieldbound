/**
 * The shared battle diff (motion-and-feedback section 2.1).
 *
 * One pure function turns two settled engine states into the observable deltas
 * the presentation layer is allowed to show. Four consumers read this shape
 * instead of each re-deriving the same facts:
 *
 *   - `src/battle-log/derive.ts`      — the durable log entry's effects;
 *   - `src/ui/a11y/announcements.ts`  — the one polite sentence;
 *   - `src/state/battle-controller.ts` — the cue list for a played card;
 *   - `src/ui/feedback/derive.ts`     — the visual feedback beat.
 *
 * What this module deliberately does not do:
 *
 *   - no engine mutator, reducer, planner or controller import: the diff reads
 *     the two states it is given and nothing else, so it can never change a
 *     rule, a shuffle or an enemy plan;
 *   - no prose, cue name, class name or DOM: consumers map the deltas to their
 *     own vocabulary;
 *   - no per-effect list. Health and defense are a **signed net per side**: two
 *     enemy attacks fold into one `-6`, a Ward and a hit fold into one net
 *     health change. The engine moves one side's health in at most one
 *     direction per resolved action (a play heals its actor and damages its
 *     target; a handoff only ticks Regen), so the net sign always equals the
 *     direction the log records.
 *
 * Status deltas keep only *applications*: a stack spent by an attack or cleared
 * at battle end is a decrease and is not reported, which is the same rule the
 * log has always used.
 */
import { SIDES, STATUS_KINDS } from '../../engine/types';
import type {
  BattleOutcome,
  BattleState,
  Element,
  Side,
  StatusKind,
} from '../../engine/types';

/** One signed net value per side. */
export interface SideNumbers {
  readonly player: number;
  readonly opponent: number;
}

/** One status application: the side, the kind and the resulting stack count. */
export interface StatusDelta {
  readonly side: Side;
  readonly status: StatusKind;
  readonly stacks: number;
}

/** The field the transition left and the field it settled on. */
export interface FieldDelta {
  readonly previous: Element;
  readonly next: Element;
}

/** Everything one settled transition observably changed. */
export interface BattleDeltas {
  /** Signed net health change per side: negative lost, positive restored. */
  readonly health: SideNumbers;
  /** Signed net defense change per side: negative is never produced today. */
  readonly defense: SideNumbers;
  /** Status applications, side-major then in `STATUS_KINDS` order. */
  readonly statuses: readonly StatusDelta[];
  /** `null` when the field did not move. */
  readonly field: FieldDelta | null;
  /** The outcome the transition settled on; `ongoing` while the fight runs. */
  readonly outcome: BattleOutcome;
  /** True when the turn number or the active side changed. */
  readonly turnChanged: boolean;
  /** The turn number after the transition. */
  readonly turn: number;
}

function net(before: number, after: number): number {
  return after - before;
}

/**
 * Compares the state an engine action received with the state it returned.
 *
 * Both arguments are read-only; the returned object is fresh and owns every
 * array it exposes. Two identical states produce a zeroed diff, which is what
 * lets a consumer treat "no observable delta" as "no feedback" instead of
 * inventing a `+0` fact.
 */
export function diffBattleState(
  before: BattleState,
  after: BattleState,
): BattleDeltas {
  const statuses: StatusDelta[] = [];

  for (const side of SIDES) {
    const was = before.sides[side].statuses;
    const now = after.sides[side].statuses;

    for (const status of STATUS_KINDS) {
      if (now[status] > was[status]) {
        statuses.push({ side, status, stacks: now[status] });
      }
    }
  }

  return {
    health: {
      player: net(before.sides.player.health, after.sides.player.health),
      opponent: net(before.sides.opponent.health, after.sides.opponent.health),
    },
    defense: {
      player: net(before.sides.player.defense, after.sides.player.defense),
      opponent: net(before.sides.opponent.defense, after.sides.opponent.defense),
    },
    statuses,
    field:
      before.field === after.field
        ? null
        : { previous: before.field, next: after.field },
    outcome: after.outcome,
    turnChanged:
      before.turn !== after.turn || before.activeSide !== after.activeSide,
    turn: after.turn,
  };
}

/** The other side without importing the battle reducer. */
export function otherSide(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player';
}
