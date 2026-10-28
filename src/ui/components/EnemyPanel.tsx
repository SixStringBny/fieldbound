/**
 * Enemy panel (SHL-FR-02, VIS-NFR-03).
 *
 * Shows the portrait, name, element, health and defense meters, status stacks
 * and the telegraphed next-turn plan as an ordered list. Every number comes
 * straight from engine state and `EnemyPlan`; the panel does not recompute
 * damage, statuses or shifts.
 */
import type {
  BattleSide,
  EnemyDefinition,
  EnemyPlan,
} from '../../engine/types';
import { DEFENSE_CAP } from '../../engine/types';
import { AssetImage } from './AssetImage';
import { ElementCue, elementLabel, statusLabel } from './ElementCue';
import { StatMeter } from './StatMeter';
import { StatusList } from './StatusList';
import type { CardCatalogView } from './view-types';

export interface EnemyPanelProps {
  readonly enemy: EnemyDefinition;
  readonly side: BattleSide;
  readonly plan: EnemyPlan | null;
  readonly cards: CardCatalogView;
  readonly baseUrl: string;
}

function cardName(cards: CardCatalogView, cardId: string): string {
  return cards[cardId]?.name ?? cardId;
}

export function EnemyPanel({
  enemy,
  side,
  plan,
  cards,
  baseUrl,
}: EnemyPanelProps) {
  const alt = `${enemy.name}, ${elementLabel(enemy.element)} enemy, ${side.health} of ${side.maxHealth} health`;

  return (
    <section
      className="enemy-panel"
      data-element={enemy.element}
      aria-labelledby="enemy-panel-title"
    >
      <span className="enemy-panel__portrait">
        <AssetImage
          assetId={`enemy:${enemy.id}`}
          baseUrl={baseUrl}
          alt={alt}
          kind="enemy"
        />
      </span>

      <div className="enemy-panel__body">
        <h2 className="enemy-panel__title" id="enemy-panel-title">
          {enemy.name}
        </h2>

        <p className="enemy-panel__element">
          <ElementCue element={enemy.element} /> <span>enemy</span>
        </p>

        <StatMeter
          label={`${enemy.name} health`}
          visibleLabel="Health"
          value={side.health}
          max={side.maxHealth}
          tone="health"
        />

        <StatMeter
          label={`${enemy.name} defense`}
          visibleLabel="Defense"
          value={side.defense}
          max={DEFENSE_CAP}
          tone="defense"
        />

        <StatusList statuses={side.statuses} ownerLabel={enemy.name} />

        <div className="enemy-panel__intent">
          <h3 className="enemy-panel__intent-title">Enemy intent</h3>

          {plan === null ? (
            <p className="enemy-panel__empty">No plan yet.</p>
          ) : (
            <>
              <p className="enemy-panel__totals">
                {plan.steps.length === 0
                  ? 'No cards planned.'
                  : `Incoming: ${plan.totalDamage} damage, ${plan.totalDefense} defense.`}
              </p>

              {plan.lethal ? (
                <p className="enemy-panel__lethal">
                  Lethal: this plan can end the battle.
                </p>
              ) : null}

              {plan.steps.length > 0 ? (
                <ol className="enemy-panel__steps" aria-label="Enemy plan">
                  {plan.steps.map((step) => {
                    const details: string[] = [];

                    if (step.damage > 0) {
                      details.push(`${step.damage} damage`);
                    }

                    if (step.defense > 0) {
                      details.push(`${step.defense} defense`);
                    }

                    if (step.shiftTo !== null) {
                      details.push(`shifts to ${elementLabel(step.shiftTo)}`);
                    }

                    for (const change of step.statuses) {
                      const target =
                        change.target === 'self' ? 'itself' : 'you';
                      details.push(
                        `${change.stacks} ${statusLabel(change.kind)} to ${target}`,
                      );
                    }

                    return (
                      <li
                        className="enemy-panel__step"
                        key={step.instanceId}
                        data-card-id={step.cardId}
                      >
                        <span className="enemy-panel__step-name">
                          {cardName(cards, step.cardId)}
                        </span>

                        <span className="enemy-panel__step-detail">
                          {details.length === 0
                            ? 'no damage, defense or shift'
                            : details.join(' · ')}
                        </span>

                        <span className="enemy-panel__step-detail">
                          costs {step.cost} energy
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
