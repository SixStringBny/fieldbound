/**
 * Battle announcement prose (SHL-FR-06).
 *
 * Turns one settled engine transition into one polite sentence for the app's
 * live region. Keeping this a pure function has two benefits:
 *
 *   - the announcement is derived from a state transition, never from a render
 *     pass, so React re-renders cannot repeat it;
 *   - the wording is testable without mounting the board.
 *
 * The *change* comes from the shared `BattleDeltas` (motion-and-feedback section
 * 2.1), the same diff the log, the cue list and the visual beat read. The
 * resulting numbers a sentence has to state — remaining health, its maximum —
 * come from the settled state. Wording, order and punctuation are unchanged;
 * `src/ui/feedback/parity.test.ts` pins the sentence to the deltas.
 *
 * Only facts are stated: the health and defense deltas the engine produced, the
 * field the engine selected and the matchup facts the controller resolved. The
 * module evaluates no rule and imports no engine mutator.
 */
import type { BattleState, Element } from '../../engine/types';
import type { FieldMatchup } from '../components/FieldBanner';
import { elementLabel } from '../components/ElementCue';
import type { BattleDeltas } from '../feedback/diff';

/** The two intents whose settled results are announced. */
export type AnnouncedIntent = 'play-card' | 'end-turn';

export interface BattleUpdateInput {
  /** What the transition changed, from `diffBattleState`. */
  readonly deltas: BattleDeltas;
  /** The settled state, for the remaining and maximum values in a sentence. */
  readonly next: BattleState;
  readonly intent: AnnouncedIntent;
  /** Controller-resolved field facts for the new field; null on Neutral. */
  readonly fieldMatchup: FieldMatchup | null;
  /** Display name of the opposing enemy, for damage sentences. */
  readonly enemyName: string;
}

function healthSentence(
  actor: string,
  lost: number,
  remaining: number,
  max: number,
): string {
  const verb = actor === 'You' ? 'take' : 'takes';
  return `${actor} ${verb} ${lost} damage; ${remaining} of ${max} health.`;
}

function fieldSentence(
  previous: Element,
  next: Element,
  matchup: FieldMatchup | null,
): string {
  if (previous === next) {
    return '';
  }

  if (next === 'neutral' || matchup === null) {
    return 'Field shifts to Neutral. No element is empowered; no card is countered.';
  }

  return `Field shifts to ${elementLabel(next)}. ${elementLabel(
    matchup.empowered,
  )} is empowered; ${elementLabel(matchup.countered)} is countered.`;
}

/**
 * One message for one settled transition.
 *
 * - A player card reports its damage, defense, field shift or result.
 * - End Turn leads with the enemy turn, reports what the plan did, then hands
 *   control back with the new turn number so consecutive turns stay distinct.
 * - A settled battle always closes with "Victory." or "Defeat.".
 */
export function describeBattleUpdate({
  deltas,
  next,
  intent,
  fieldMatchup,
  enemyName,
}: BattleUpdateInput): string {
  const parts: string[] = [];

  if (intent === 'end-turn') {
    parts.push('Enemy turn.');
  }

  const playerLost = -deltas.health.player;
  if (playerLost > 0) {
    parts.push(
      healthSentence(
        'You',
        playerLost,
        next.sides.player.health,
        next.sides.player.maxHealth,
      ),
    );
  }

  const enemyLost = -deltas.health.opponent;
  if (enemyLost > 0) {
    parts.push(
      healthSentence(
        enemyName,
        enemyLost,
        next.sides.opponent.health,
        next.sides.opponent.maxHealth,
      ),
    );
  }

  if (deltas.defense.player > 0) {
    parts.push(`You gain ${deltas.defense.player} defense.`);
  }

  if (deltas.defense.opponent > 0) {
    parts.push(`${enemyName} gains ${deltas.defense.opponent} defense.`);
  }

  const field =
    deltas.field === null
      ? ''
      : fieldSentence(deltas.field.previous, deltas.field.next, fieldMatchup);
  if (field !== '') {
    parts.push(field);
  }

  if (deltas.outcome === 'player-victory') {
    parts.push('Victory.');
  } else if (deltas.outcome === 'opponent-victory') {
    parts.push('Defeat.');
  }

  if (intent === 'end-turn' && deltas.outcome === 'ongoing') {
    parts.push(`Your turn. Turn ${deltas.turn}.`);
  }

  if (parts.length === 0) {
    parts.push('Card played.');
  }

  return parts.join(' ');
}
