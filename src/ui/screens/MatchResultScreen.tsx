/**
 * Match result for a local duel (reading-screens section 6.2; DUEL-FR-05,
 * VIS-US-03).
 *
 * The same verdict plaque as the round result: the eyebrow, the winner heading,
 * the final score, the three-pip series strip (each pip named by its round) and
 * the three documented actions. Rematch keeps both locked decks, resets to 0-0
 * and reopens the privacy handoff for round 1 with Player 1 first; Change decks
 * returns to a fresh two-step setup; Menu discards the match. There is no
 * confirmation dialog and no per-round history.
 *
 * The screen is presentational: it reports three typed intents and imports no
 * engine, duel controller or storage module.
 */
import type { DuelPlayer, DuelWins } from '../../duel/match';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import '../../styles/result.css';
import { SeriesStrip } from '../components/SeriesStrip';
import { duelPlayerName, duelScoreText } from './duel-copy';

export interface MatchResultScreenProps {
  readonly winner: DuelPlayer;
  /** Final series score, for example 2-0 or 2-1. */
  readonly wins: DuelWins;
  /** Round winners in played order, for the series strip. */
  readonly roundWinners: readonly DuelPlayer[];
  readonly onRematch: () => void;
  readonly onChangeDecks: () => void;
  readonly onMenu: () => void;
}

export function MatchResultScreen({
  winner,
  wins,
  roundWinners,
  onRematch,
  onChangeDecks,
  onMenu,
}: MatchResultScreenProps) {
  const winnerName = duelPlayerName(winner);

  return (
    <section
      className="duel-result result"
      data-duel-result="match"
      aria-labelledby="duel-match-result-title"
    >
      <p className="result__eyebrow">Local Duel · Best of three</p>
      <h1 className="result__title" id="duel-match-result-title">
        {winnerName} wins the match
      </h1>
      <p className="duel-result__score">Final score {duelScoreText(wins)}</p>
      <SeriesStrip roundWinners={roundWinners} />

      <ul className="result__actions">
        <li className="result__action">
          <button
            type="button"
            className="shell__button result__primary"
            onClick={onRematch}
          >
            Rematch
          </button>
        </li>
        <li className="result__action">
          <button
            type="button"
            className="shell__back result__secondary"
            onClick={onChangeDecks}
          >
            Change decks
          </button>
        </li>
        <li className="result__action">
          <button
            type="button"
            className="shell__back result__secondary"
            onClick={onMenu}
          >
            Menu
          </button>
        </li>
      </ul>
    </section>
  );
}
