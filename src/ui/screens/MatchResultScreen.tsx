/**
 * Match result for a local duel (DUEL-FR-05, VIS-US-03).
 *
 * Shows the series winner and final score and offers the three documented
 * actions: Rematch (same locked decks, new seed, 0-0), Change decks (back to a
 * fresh two-step setup) and Menu (clear the match). A duel exists only in
 * memory, so this screen is also the only place a finished series is visible.
 *
 * The screen is presentational: it reports three typed intents and imports no
 * engine, duel controller or storage module.
 */
import type { DuelPlayer, DuelWins } from '../../duel/match';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import { duelPlayerName, duelScoreText } from './duel-copy';

export interface MatchResultScreenProps {
  readonly winner: DuelPlayer;
  /** Final series score, for example 2-0 or 2-1. */
  readonly wins: DuelWins;
  readonly onRematch: () => void;
  readonly onChangeDecks: () => void;
  readonly onMenu: () => void;
}

export function MatchResultScreen({
  winner,
  wins,
  onRematch,
  onChangeDecks,
  onMenu,
}: MatchResultScreenProps) {
  const winnerName = duelPlayerName(winner);

  return (
    <section
      className="duel-result"
      data-duel-result="match"
      aria-labelledby="duel-match-result-title"
    >
      <p className="shell__eyebrow">Local Duel · Best of three</p>
      <h1 className="shell__page-title" id="duel-match-result-title">
        {winnerName} wins the match
      </h1>
      <p className="duel-result__score">Final score {duelScoreText(wins)}</p>

      <ul className="duel-result__actions">
        <li>
          <button type="button" className="shell__button" onClick={onRematch}>
            Rematch
          </button>
        </li>
        <li>
          <button
            type="button"
            className="shell__button"
            onClick={onChangeDecks}
          >
            Change decks
          </button>
        </li>
        <li>
          <button type="button" className="shell__button" onClick={onMenu}>
            Menu
          </button>
        </li>
      </ul>
    </section>
  );
}
