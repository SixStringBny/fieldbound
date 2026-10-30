/**
 * Round result for a local duel (reading-screens section 6.1; DUEL-FR-05,
 * VIS-US-03).
 *
 * A verdict plaque on the slate, not a document: the eyebrow, the winner
 * heading, the score line, the three-pip series strip, the deterministic next
 * opener and the unchanged reset sentence. There is no paper, no ledger, no
 * hand, health, defense, field, log, deck or card name anywhere on the route, so
 * the result cannot leak hidden information between rounds.
 *
 * `nextPlayer` is the public first player of the next round from the match
 * model's alternating opener; it is rendered as text, never inferred from a pip.
 *
 * The screen is presentational: it reports `onNextRound` and imports no engine
 * or controller mutator.
 */
import type { DuelPlayer, DuelRound, DuelWins } from '../../duel/match';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import '../../styles/result.css';
import { SeriesStrip } from '../components/SeriesStrip';
import { duelPlayerName, duelScoreText } from './duel-copy';

export interface RoundResultScreenProps {
  /** The round that just settled. */
  readonly round: DuelRound;
  readonly winner: DuelPlayer;
  /** Series score including this round. */
  readonly wins: DuelWins;
  /** Round winners in played order, for the series strip. */
  readonly roundWinners: readonly DuelPlayer[];
  /** The public first player of the next round. */
  readonly nextPlayer: DuelPlayer;
  readonly onNextRound: () => void;
}

export function RoundResultScreen({
  round,
  winner,
  wins,
  roundWinners,
  nextPlayer,
  onNextRound,
}: RoundResultScreenProps) {
  const winnerName = duelPlayerName(winner);

  return (
    <section
      className="duel-result result"
      data-duel-result="round"
      aria-labelledby="duel-round-result-title"
    >
      <p className="result__eyebrow">Local Duel · Round {round}</p>
      <h1 className="result__title" id="duel-round-result-title">
        {winnerName} wins round {round}
      </h1>
      <p className="duel-result__score">Series {duelScoreText(wins)}</p>
      <SeriesStrip roundWinners={roundWinners} />
      <p className="duel-result__next-player">
        Next round: {duelPlayerName(nextPlayer)} opens.
      </p>
      <p className="duel-result__copy">
        Rounds reset health, defense, statuses, hands and the field. The next
        round shuffles from its own seed.
      </p>

      <p className="result__actions result__actions--single">
        <button
          type="button"
          className="shell__button result__primary"
          onClick={onNextRound}
        >
          Next Round
        </button>
      </p>
    </section>
  );
}
