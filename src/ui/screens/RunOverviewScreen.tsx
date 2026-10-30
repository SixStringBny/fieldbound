/**
 * Solo run overview (RUN-FR-01, RUN-US-01).
 *
 * The ladder from `docs/design-system/solo-flow.md` section 4: an `ol` of four
 * parchment steps joined by a brass connector, each carrying the enemy portrait,
 * name, `Cleared`/`Current`/`Upcoming` in words, the element cue and the enemy's
 * maximum health. The current step is the only `aria-current="step"` and the
 * only one with the 2px brass ring. Beside it sit the run status panel (the
 * **Run health** meter, `Deck N cards`, `Turns N`) and the next/current enemy
 * panel, then the primary action and **Menu**.
 *
 * The ladder is a status map, not a switcher: nothing inside it is interactive.
 * `Next Battle` starts the shown encounter between battles and `Back to battle`
 * returns to a live fight; `Menu` leaves and relies on the autosave that already
 * ran.
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
  /**
   * The four ladder enemies in the same order as `progress`, for the portrait
   * and the maximum health. Supplied by the composition root from the frozen
   * catalog so the screen keeps importing no content module.
   */
  readonly ladder: readonly EnemyDefinition[];
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

/** One glyph per step state, so the status is never carried by colour alone. */
const STATUS_GLYPHS: Readonly<Record<RunProgressStep['status'], string>> = {
  cleared: '✓',
  current: '▸',
  upcoming: '·',
};

export function RunOverviewScreen({
  progress,
  ladder,
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

      <div className="run-overview__body">
        <ol className="run-progress" aria-label="Run progress">
          {progress.map((step, index) => {
            const current = step.status === 'current';
            const enemy = ladder[index];

            return (
              <li
                className={`run-progress__step run-progress__step--${step.status}`}
                key={`${String(index)}:${step.name}`}
                {...(current ? { 'aria-current': 'step' as const } : {})}
              >
                <span className="run-progress__number" aria-hidden="true">
                  {index + 1}
                </span>

                {enemy === undefined ? null : (
                  <span className="run-progress__portrait">
                    <AssetImage
                      assetId={`enemy:${enemy.id}`}
                      baseUrl={baseUrl}
                      alt={`${step.name}, ${elementLabel(step.element)} enemy`}
                      kind="enemy"
                    />
                  </span>
                )}

                <span className="run-progress__body">
                  <span className="run-progress__name">{step.name}</span>

                  <span className="run-progress__meta">
                    <ElementCue element={step.element} />
                    <span aria-hidden="true"> · </span>
                    <span className="run-progress__health">
                      {enemy === undefined
                        ? 'Health unknown'
                        : `${enemy.maxHealth} health`}
                    </span>
                  </span>

                  <span className="run-progress__status">
                    <span
                      className="run-progress__status-glyph"
                      aria-hidden="true"
                    >
                      {STATUS_GLYPHS[step.status]}
                    </span>{' '}
                    {STATUS_LABELS[step.status]}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="run-overview__side">
          <div className="shell__panel run-overview__panel">
            <h2 className="run-overview__panel-title">Run status</h2>

            <StatMeter
              label="Run health"
              visibleLabel="Health"
              value={health}
              max={maxHealth}
              tone="health"
            />

            <ul className="run-overview__stats">
              <li className="run-overview__stat">
                <span className="run-overview__stat-label">Deck</span>
                <span className="run-overview__stat-value">
                  {deckSize} cards
                </span>
              </li>
              <li className="run-overview__stat">
                <span className="run-overview__stat-label">Turns</span>
                <span className="run-overview__stat-value">{turnsTotal}</span>
              </li>
            </ul>
          </div>

          {nextEnemy === undefined ? null : (
            <div className="shell__panel run-overview__panel">
              <h2 className="run-overview__panel-title">
                {mode === 'battle' ? 'Current enemy' : 'Next enemy'}
              </h2>
              <div className="run-overview__enemy">
                <span className="run-overview__enemy-portrait">
                  <AssetImage
                    assetId={`enemy:${nextEnemy.id}`}
                    baseUrl={baseUrl}
                    alt={`${nextEnemy.name}, ${elementLabel(nextEnemy.element)} enemy`}
                    kind="enemy"
                  />
                </span>
                <span className="run-overview__enemy-body">
                  <span className="run-overview__enemy-name">
                    {nextEnemy.name}
                  </span>
                  <span className="run-overview__enemy-meta">
                    <ElementCue element={nextEnemy.element} />
                    <span aria-hidden="true"> · </span>
                    <span>{nextEnemy.maxHealth} health</span>
                  </span>
                </span>
              </div>
            </div>
          )}

          <div className="run-overview__actions">
            <button
              type="button"
              className="shell__button"
              onClick={onNextBattle}
              disabled={nextEnemy === undefined}
            >
              {mode === 'battle' ? 'Back to battle' : 'Next Battle'}
            </button>
            <button type="button" className="shell__back" onClick={onMenu}>
              Menu
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
