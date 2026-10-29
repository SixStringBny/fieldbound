/**
 * The end of a solo run (RUN-FR-04, RUN-FR-07).
 *
 * Victory shows the full clear (4 of 4), defeat shows how far the run reached.
 * Both show the same totals - turns, cards added and damage taken - and the
 * best-run record written when the run ended, including whether this run set a
 * new best. `New Run` returns to setup and `Menu` leaves.
 *
 * Presentational only: the summary and record arrive already computed. The
 * screen imports no engine mutator, controller or storage module.
 */
import type { RunSummary } from '../../run/run-model';
import type { StatsRecordResult } from '../../persistence/stats';

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
    <section className="run-result" aria-labelledby="run-result-title">
      <header className="run-result__head">
        <p className="shell__eyebrow">Solo Run · Result</p>
        <h1 className="shell__page-title" id="run-result-title">
          {victory ? 'Run complete' : 'Run over'}
        </h1>
        <p className="run-result__outcome">
          {victory
            ? `You cleared all ${summary.encountersTotal} encounters.`
            : `You reached encounter ${summary.reachedEncounter} of ${summary.encountersTotal}.`}
        </p>
      </header>

      <div className="shell__panel">
        <h2 className="shell__panel-title">Run totals</h2>
        <dl className="run-result__stats">
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
        <div className="shell__panel run-result__record">
          <h2 className="shell__panel-title">Best run</h2>
          <dl className="run-result__stats">
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

          {stats.isNewBest ? (
            <p className="run-result__best">New best</p>
          ) : null}
          {stats.saved ? null : (
            <p className="run-result__notice">
              This record could not be saved; it applies to this session only.
            </p>
          )}
        </div>
      )}

      <div className="run-result__actions">
        <button type="button" className="shell__button" onClick={onNewRun}>
          New Run
        </button>
        <button type="button" className="shell__back" onClick={onMenu}>
          Menu
        </button>
      </div>
    </section>
  );
}
