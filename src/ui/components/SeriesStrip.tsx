/**
 * The best-of-three series strip (duel-flow section 4.9).
 *
 * The same public record on the round result and the match result. It is an
 * `ol` named `Series score`: every pip carries `data-series-pip` and is named by
 * its round and winner (`Round 1: Player 1`, `Round 3: not played`), while the
 * painted pip is decorative. The strip therefore never depends on colour alone,
 * and it holds no hidden battle information - only the round winners the match
 * already publishes.
 *
 * Presentation only: it renders the `roundWinners` it is handed and owns no
 * scoring rule.
 */
import type { DuelPlayer } from '../../duel/match';
import { duelPlayerName } from '../screens/duel-copy';
import '../../styles/duel.css';

export interface SeriesStripProps {
  /** Round winners in played order, one per completed round. */
  readonly roundWinners: readonly DuelPlayer[];
}

const ROUNDS = [1, 2, 3] as const;

export function SeriesStrip({ roundWinners }: SeriesStripProps) {
  return (
    <ol className="series-strip" aria-label="Series score" data-series-score="true">
      {ROUNDS.map((round) => {
        const winner = roundWinners[round - 1];
        const played = winner !== undefined;

        return (
          <li
            className="series-strip__pip"
            key={round}
            data-series-pip=""
            data-round={round}
            data-round-winner={winner ?? 'none'}
          >
            <span className="series-strip__label">
              {`Round ${round}: ${played ? duelPlayerName(winner) : 'not played'}`}
            </span>
            <span
              className="series-strip__mark"
              data-played={played ? 'true' : 'false'}
              aria-hidden="true"
            />
          </li>
        );
      })}
    </ol>
  );
}
