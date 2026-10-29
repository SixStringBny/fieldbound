/**
 * Shared duel screen copy (DUEL-FR-01, DUEL-FR-03, DUEL-FR-05).
 *
 * The three duel surfaces that name a seat, a series score or an opponent hand
 * all use the same wording. Keeping it in one place means the privacy screen,
 * the battle panels and both result screens cannot drift into calling the same
 * seat "Player 1", "P1" and "the first player" on different screens.
 *
 * Presentation only: the module imports a type, renders nothing and owns no
 * rule. Seat and score values come from the duel controllers.
 */
import type { DuelPlayer, DuelWins } from '../../duel/match';

/** Fixed seat label, used in headings and accessible names. */
export function duelPlayerName(player: DuelPlayer): string {
  return player === 'player1' ? 'Player 1' : 'Player 2';
}

/** Series score with an en dash, for example "1–0". */
export function duelScoreText(wins: DuelWins): string {
  return `${wins.player1}\u2013${wins.player2}`;
}

/** Opponent hand count; the only hand information an inactive player sees. */
export function duelHandCountText(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'} in hand`;
}
