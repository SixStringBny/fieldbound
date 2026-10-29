/**
 * Round result for a local duel (DUEL-FR-05, VIS-US-03).
 *
 * Appears after every round that does not end the match. It names the round
 * winner, states the series score and offers the single `Next Round` intent.
 * No hand, deck, health, defense or field value is rendered, so the result
 * surface cannot leak hidden information between rounds.
 *
 * The screen is presentational: it reports `onNextRound` and imports no engine
 * or controller mutator.
 */
import type { DuelPlayer, DuelRound, DuelWins } from '../../duel/match';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import { duelPlayerName, duelScoreText } from './duel-copy';

export interface RoundResultScreenProps {
  /** The round that just settled. */
  readonly round: DuelRound;
  readonly winner: DuelPlayer;
  /** Series score including this round. */
  readonly wins: DuelWins;
  readonly onNextRound: () => void;
}

export function RoundResultScreen({
  round,
  winner,
  wins,
  onNextRound,
}: RoundResultScreenProps) {
  const winnerName = duelPlayerName(winner);

  return (
    <section
      className="duel-result"
      data-duel-result="round"
      aria-labelledby="duel-round-result-title"
    >
      <p className="shell__eyebrow">Local Duel · Round {round}</p>
      <h1 className="shell__page-title" id="duel-round-result-title">
        {winnerName} wins round {round}
      </h1>
      <p className="duel-result__score">Series {duelScoreText(wins)}</p>
      <p className="shell__copy">
        Rounds reset health, defense, statuses, hands and the field. The next
        round shuffles from its own seed.
      </p>

      <p className="duel-result__next">
        <button type="button" className="shell__button" onClick={onNextRound}>
          Next Round
        </button>
      </p>
    </section>
  );
}
