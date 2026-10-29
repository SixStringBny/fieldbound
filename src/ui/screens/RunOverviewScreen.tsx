/**
 * Solo run overview (RUN-FR-01, RUN-US-01).
 *
 * The between-battle status surface: the four ladder steps with their state,
 * the run's current health out of 40, the deck size and the accumulated turn
 * total, plus the next enemy's portrait and element. `Next Battle` starts the
 * encounter; `Menu` leaves and relies on the autosave that already ran.
 *
 * During a battle the same screen is reachable from the board as a status
 * check. Its primary action then returns to the live fight instead of starting
 * one, because the run is still in its battle phase.
 *
 * Presentational only: every number arrives already derived, and the screen
 * imports no engine mutator, controller or storage module.
 */
import type { EnemyDefinition } from '../../engine/types';
import { AssetImage } from '../components/AssetImage';
import { ElementCue, elementLabel } from '../components/ElementCue';
import { StatMeter } from '../components/StatMeter';
import type { RunProgressStep } from '../../state/run-controller';

export type RunOverviewMode = 'between' | 'battle';

export interface RunOverviewScreenProps {
  /** Four ladder steps, in order, each already marked cleared/current/upcoming. */
  readonly progress: readonly RunProgressStep[];
  readonly encounterNumber: number;
  readonly encounterTotal: number;
  /** Live health: the battle value during a fight, otherwise the carried value. */
  readonly health: number;
  readonly maxHealth: number;
  readonly deckSize: number;
  readonly turnsTotal: number;
  readonly nextEnemy: EnemyDefinition | undefined;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  readonly mode: RunOverviewMode;
  readonly onNextBattle: () => void;
  readonly onMenu: () => void;
}

const STATUS_LABELS: Readonly<Record<RunProgressStep['status'], string>> = {
  cleared: 'Cleared',
  current: 'Current',
  upcoming: 'Upcoming',
};

export function RunOverviewScreen({
  progress,
  encounterNumber,
  encounterTotal,
  health,
  maxHealth,
  deckSize,
  turnsTotal,
  nextEnemy,
  baseUrl,
  mode,
  onNextBattle,
  onMenu,
}: RunOverviewScreenProps) {
  return (
    <section className="run-overview" aria-labelledby="run-overview-title">
      <header className="run-overview__head">
        <p className="shell__eyebrow">Solo Run</p>
        <h1 className="shell__page-title" id="run-overview-title">
          Run overview
        </h1>
        <p className="run-overview__progress">
          {encounterNumber} of {encounterTotal}
        </p>
      </header>

      <ol className="run-progress" aria-label="Run progress">
        {progress.map((step, index) => {
          const current = step.status === 'current';

          return (
            <li
              className={`run-progress__step run-progress__step--${step.status}`}
              key={`${String(index)}:${step.name}`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="run-progress__number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="run-progress__name">{step.name}</span>
              <span className="run-progress__status">
                {STATUS_LABELS[step.status]}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="shell__panel run-overview__panel">
        <h2 className="shell__panel-title">Run status</h2>

        <StatMeter
          label="Run health"
          visibleLabel="Health"
          value={health}
          max={maxHealth}
          tone="health"
        />

        <dl className="run-overview__stats">
          <div className="run-overview__stat">
            <dt>Deck</dt>
            <dd>{deckSize} cards</dd>
          </div>
          <div className="run-overview__stat">
            <dt>Turns</dt>
            <dd>{turnsTotal}</dd>
          </div>
        </dl>
      </div>

      {nextEnemy === undefined ? null : (
        <div className="shell__panel run-overview__enemy">
          <h2 className="shell__panel-title">
            {mode === 'battle' ? 'Current enemy' : 'Next enemy'}
          </h2>
          <div className="run-overview__enemy-body">
            <AssetImage
              assetId={`enemy:${nextEnemy.id}`}
              baseUrl={baseUrl}
              alt={`${nextEnemy.name}, ${elementLabel(nextEnemy.element)} enemy`}
              kind="enemy"
            />
            <div>
              <p className="run-overview__enemy-name">{nextEnemy.name}</p>
              <p className="run-overview__enemy-meta">
                <ElementCue element={nextEnemy.element} />{' '}
                <span>{nextEnemy.maxHealth} health</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="run-overview__actions">
        <button type="button" className="shell__button" onClick={onNextBattle}>
          {mode === 'battle' ? 'Back to battle' : 'Next Battle'}
        </button>
        <button type="button" className="shell__back" onClick={onMenu}>
          Menu
        </button>
      </div>
    </section>
  );
}
