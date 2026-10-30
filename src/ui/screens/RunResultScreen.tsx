/**
 * The end of a solo run (reading-screens section 5; RUN-FR-04, RUN-FR-07).
 *
 * The idiom is a verdict, not a form: the outcome block sits on the slate table
 * (wax seal, eyebrow, h1, outcome line) and the numbers live in parchment
 * ledgers below it. Victory shows the full clear (4 of 4), defeat shows how far
 * the run reached. Both show the same totals - turns, cards added and damage
 * taken - plus the best-run record written when the run ended, including whether
 * this run set a new best.
 *
 * `stats === null` omits the best-run sheet entirely: a run with no record has
 * no record section, not an empty one. The save-failure line is static text
 * inside that sheet; the route adds no live line, because its focused heading
 * and outcome line already say what happened.
 *
 * Presentational only: the summary and record arrive already computed. The
 * screen imports no engine mutator, controller or storage module.
 */
import type { RunSummary } from '../../run/run-model';
import type { StatsRecordResult } from '../../persistence/stats';
import '../../styles/result.css';

export interface RunResultScreenProps {
  /** Terminal summary derived from the run state. */
  readonly summary: RunSummary;
  /** The record written when the run ended, or null when unavailable. */
  readonly stats: StatsRecordResult | null;
  readonly onNewRun: () => void;
  readonly onMenu: () => void;
}

export function RunResultScreen({
  summary,
  stats,
  onNewRun,
  onMenu,
}: RunResultScreenProps) {
  const victory = summary.outcome === 'victory';

  return (
    <section
      className="run-result result"
      data-result="run"
      aria-labelledby="run-result-title"
    >
      <div className="result__outcome">
        <p className="result__seal" aria-hidden="true">
          {victory ? 'Victory' : 'Defeat'}
        </p>
        <p className="result__eyebrow">Solo Run · Result</p>
        <h1 className="result__title" id="run-result-title">
          {victory ? 'Run complete' : 'Run over'}
        </h1>
        <p className="run-result__outcome">
          {victory
            ? `You cleared all ${summary.encountersTotal} encounters.`
            : `You reached encounter ${summary.reachedEncounter} of ${summary.encountersTotal}.`}
        </p>
      </div>

      <div className="result__ledger result__ledger--totals">
        <h2 className="result__ledger-title">Run totals</h2>
        <dl className="run-result__stats run-result__stats--totals">
          <div className="run-result__stat">
            <dt>Encounters cleared</dt>
            <dd>
              {summary.encountersCleared} of {summary.encountersTotal}
            </dd>
          </div>
          <div className="run-result__stat">
            <dt>Turns</dt>
            <dd>{summary.turnsTotal}</dd>
          </div>
          <div className="run-result__stat">
            <dt>Cards added</dt>
            <dd>{summary.cardsAdded}</dd>
          </div>
          <div className="run-result__stat">
            <dt>Damage taken</dt>
            <dd>{summary.damageTaken}</dd>
          </div>
        </dl>
      </div>

      {stats === null ? null : (
        <div className="result__ledger result__ledger--best run-result__record">
          <div className="result__ledger-head">
            <h2 className="result__ledger-title">Best run</h2>
            {stats.isNewBest ? (
              <p className="run-result__best">New best</p>
            ) : null}
          </div>
          <dl className="run-result__stats run-result__stats--best">
            <div className="run-result__stat">
              <dt>Furthest encounter</dt>
              <dd>
                {stats.stats.furthestEncounter} of{' '}
                {summary.encountersTotal}
              </dd>
            </div>
            <div className="run-result__stat">
              <dt>Boss clears</dt>
              <dd>{stats.stats.bossClears}</dd>
            </div>
            <div className="run-result__stat">
              <dt>Fewest completed turns</dt>
              <dd>{stats.stats.bestCompletedTurns ?? '—'}</dd>
            </div>
          </dl>

          {stats.saved ? null : (
            <p className="run-result__notice">
              This record could not be saved; it applies to this session only.
            </p>
          )}
        </div>
      )}

      <div className="result__actions">
        <button
          type="button"
          className="shell__button result__primary"
          onClick={onNewRun}
        >
          New Run
        </button>
        <button
          type="button"
          className="shell__back result__secondary"
          onClick={onMenu}
        >
          Menu
        </button>
      </div>
    </section>
  );
}
