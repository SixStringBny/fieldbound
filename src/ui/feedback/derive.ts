/**
 * The feedback beat (motion-and-feedback sections 2.2, 4 and 11).
 *
 * A beat is *everything the screen shows in response to one settled transition*
 * and nothing else. It is derived from the shared `BattleDeltas`, so the visual
 * response can never disagree with the log entry, the announcement or the cue
 * list about what the transition did.
 *
 * Rules this module owns:
 *
 *   - one beat per settled transition, never one per effect and never one per
 *     card in an enemy plan (health is already folded into a net per side);
 *   - a refusal or a transition with no observable delta produces `null`, so
 *     the refusal sentence in the live region is the only feedback;
 *   - the opening deal is not a draw: `key === 0` never animates the hand;
 *   - `revealIntent` is true only when a *new* plan appears with a player turn;
 *   - the vocabulary is exactly draw, impact flash, impact number, defense chip,
 *     field shift, intent reveal and turn handoff. Play is an impact, not a
 *     departure, so a played card is never itself animated.
 */
import { diffBattleState } from './diff';
import type { BattleDeltas } from './diff';
import type { BattleState, Element, EnemyPlan, Side } from '../../engine/types';
import type { DuelBattleView } from '../../duel/round';

/** One signed net health change, as the number the beat shows. */
export interface ImpactNumber {
  readonly side: Side;
  /** Negative nets are `damage`, positive nets are `heal`. */
  readonly kind: 'damage' | 'heal';
  /** Signed net amount: `-6` or `+2`; never zero. */
  readonly amount: number;
}

/** One `+N DEF` chip: the gain, plus the resulting total for the meter edge. */
export interface DefenseChip {
  readonly side: Side;
  /** Defense gained by this transition; always positive. */
  readonly amount: number;
  /** Defense after the transition, so the chip can sit at the meter's edge. */
  readonly total: number;
}

/** One panel overlay colour: the health change wins over a defense gain. */
export interface FlashTarget {
  readonly side: Side;
  readonly kind: 'damage' | 'heal' | 'defense';
}

/** The field the transition left and the field it settled on. */
export interface FieldShift {
  readonly previous: Element;
  readonly next: Element;
}

/** Everything one settled transition shows, or `null` when it shows nothing. */
export interface FeedbackBeat {
  /** The settled sequence; also the React remount token. */
  readonly key: number;
  /** New cards entered the active hand. Never true on the opening deal. */
  readonly draw: boolean;
  /**
   * The instances that entered the hand with this transition, so only those
   * cards replay the draw beat; a card already on the table is never animated
   * again by a later draw.
   */
  readonly drawn: readonly string[];
  /** At most one per target, signed, net. */
  readonly impacts: readonly ImpactNumber[];
  /** At most one per side, and only when defense rose. */
  readonly defense: readonly DefenseChip[];
  readonly field: FieldShift | null;
  /** The plan first appeared with this player turn. */
  readonly revealIntent: boolean;
  /** The turn number or the active side changed. */
  readonly handoff: boolean;
  /** At most one overlay per side. */
  readonly flash: readonly FlashTarget[];
}

/** The defense totals a chip reports, per side. */
type DefenseTotals = Readonly<Record<Side, number>>;

/** What a beat needs from the two states beyond the shared deltas. */
interface BeatFacts {
  readonly drawn: readonly string[];
  readonly revealIntent: boolean;
  readonly defenseTotals: DefenseTotals;
}

const SIDE_ORDER: readonly Side[] = ['player', 'opponent'];

/** A plan's identity: the turn it executes on and the cards it will play. */
function planSignature(plan: EnemyPlan | null): string {
  if (plan === null) {
    return '';
  }

  return `${String(plan.turn)}:${plan.steps
    .map((step) => step.instanceId)
    .join(',')}`;
}

/**
 * The flash colour for one side: a health change wins, because the number and
 * the overlay have to agree; a defense-only gain is the brass case.
 */
function flashFor(side: Side, deltas: BattleDeltas): FlashTarget | null {
  const health = deltas.health[side];

  if (health < 0) {
    return { side, kind: 'damage' };
  }

  if (health > 0) {
    return { side, kind: 'heal' };
  }

  if (deltas.defense[side] > 0) {
    return { side, kind: 'defense' };
  }

  return null;
}

/**
 * Builds the beat, or `null` when the transition produced nothing a beat could
 * show. A status application alone is not a beat: it has no element in the
 * vocabulary, and the log entry plus the announcement are its channels.
 */
function beatFrom(
  deltas: BattleDeltas,
  key: number,
  facts: BeatFacts,
): FeedbackBeat | null {
  const impacts: ImpactNumber[] = [];
  const defense: DefenseChip[] = [];
  const flash: FlashTarget[] = [];

  for (const side of SIDE_ORDER) {
    const health = deltas.health[side];

    if (health !== 0) {
      impacts.push({
        side,
        kind: health < 0 ? 'damage' : 'heal',
        amount: health,
      });
    }

    if (deltas.defense[side] > 0) {
      defense.push({
        side,
        amount: deltas.defense[side],
        total: facts.defenseTotals[side],
      });
    }

    const target = flashFor(side, deltas);

    if (target !== null) {
      flash.push(target);
    }
  }

  const observable =
    impacts.length > 0 ||
    defense.length > 0 ||
    deltas.field !== null ||
    facts.drawn.length > 0 ||
    facts.revealIntent ||
    deltas.turnChanged;

  if (!observable) {
    return null;
  }

  return {
    key,
    draw: key > 0 && facts.drawn.length > 0,
    drawn: facts.drawn,
    impacts,
    defense,
    field:
      deltas.field === null
        ? null
        : { previous: deltas.field.previous, next: deltas.field.next },
    revealIntent: facts.revealIntent,
    handoff: deltas.turnChanged,
    flash,
  };
}

/**
 * One beat for one settled battle transition.
 *
 * `key` is the settled sequence: it is the React key of every overlay, so an
 * identical repeated delta replays its animation and a newer beat replaces the
 * running one.
 */
export function deriveFeedbackBeat(
  before: BattleState,
  after: BattleState,
  key: number,
): FeedbackBeat | null {
  const deltas = diffBattleState(before, after);
  const handBefore = new Set(
    before.sides.player.hand.map((instance) => instance.instanceId),
  );
  const drawn = after.sides.player.hand
    .filter((instance) => !handBefore.has(instance.instanceId))
    .map((instance) => instance.instanceId);
  const revealIntent =
    deltas.turnChanged &&
    after.activeSide === 'player' &&
    after.enemyPlan !== null &&
    planSignature(after.enemyPlan) !== planSignature(before.enemyPlan);

  return beatFrom(deltas, key, {
    drawn,
    revealIntent,
    defenseTotals: {
      player: after.sides.player.defense,
      opponent: after.sides.opponent.defense,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Duel                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The public numbers a duel view exposes, keyed by the engine side they belong
 * to. The redacted view never carries a hand, a plan or an opponent card id, so
 * a duel beat is derived from exactly the values both humans can see.
 */
function publicSides(view: DuelBattleView): {
  readonly health: Record<Side, number>;
  readonly defense: Record<Side, number>;
} {
  const self = view.self.side;
  const other: Side = self === 'player' ? 'opponent' : 'player';

  return {
    health: {
      [self]: view.self.health,
      [other]: view.opponent.health,
    } as Record<Side, number>,
    defense: {
      [self]: view.self.defense,
      [other]: view.opponent.defense,
    } as Record<Side, number>,
  };
}

/**
 * One beat for one settled duel transition, over public deltas only.
 *
 * A duel has no intent block, so `revealIntent` is always false. The privacy
 * handoff unmounts the board, so a transition into or out of privacy renders no
 * beat at all: the component that would draw it is not mounted.
 */
export function deriveDuelFeedbackBeat(
  before: DuelBattleView,
  after: DuelBattleView,
  key: number,
): FeedbackBeat | null {
  const was = publicSides(before);
  const now = publicSides(after);
  const handBefore = new Set(
    before.hand.map((instance) => instance.instanceId),
  );
  const drawn = after.hand
    .filter((instance) => !handBefore.has(instance.instanceId))
    .map((instance) => instance.instanceId);

  return beatFrom(
    {
      health: {
        player: now.health.player - was.health.player,
        opponent: now.health.opponent - was.health.opponent,
      },
      defense: {
        player: now.defense.player - was.defense.player,
        opponent: now.defense.opponent - was.defense.opponent,
      },
      statuses: [],
      field:
        before.field === after.field
          ? null
          : { previous: before.field, next: after.field },
      outcome: 'ongoing',
      turnChanged: before.turn !== after.turn,
      turn: after.turn,
    },
    key,
    { drawn, revealIntent: false, defenseTotals: now.defense },
  );
}
