/**
 * Enemy panel (SHL-FR-02, VIS-NFR-03, battle-screen section 2.2).
 *
 * Shows the portrait, name, element, health and defense meters, status stacks
 * and the telegraphed next-turn plan. Every number comes straight from engine
 * state and `EnemyPlan`; the panel does not recompute damage, statuses or
 * shifts.
 *
 * The public plan is one list at every width. On phone it starts collapsed to
 * the first three steps with a 44px `Show all N steps` control, which expands
 * inline; at the table the full plan is visible and the control is hidden by
 * CSS, not unmounted. The totals and the lethal badge stay pinned above the
 * scrollable step list.
 */
import { useId, useState } from 'react';
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
  const [expanded, setExpanded] = useState(false);
  const stepsId = useId();
  const alt = `${enemy.name}, ${elementLabel(enemy.element)} enemy, ${side.health} of ${side.maxHealth} health`;
  const stepCount = plan?.steps.length ?? 0;

  return (
    <section
      className="enemy-panel"
      data-element={enemy.element}
      data-lethal={plan?.lethal === true ? 'true' : 'false'}
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
        <div className="enemy-panel__head">
          <h2 className="enemy-panel__title" id="enemy-panel-title">
            {enemy.name}
          </h2>
          <p className="enemy-panel__element">
            <ElementCue element={enemy.element} /> <span>enemy</span>
          </p>
        </div>

        <div className="enemy-panel__meters">
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
        </div>

        <StatusList statuses={side.statuses} ownerLabel={enemy.name} />
      </div>

      <div
        className="enemy-panel__intent"
        data-expanded={expanded ? 'true' : 'false'}
      >
        <div className="enemy-panel__intent-head">
          <h3 className="enemy-panel__intent-title">Intent · next turn</h3>
          {plan?.lethal === true ? (
            <p className="enemy-panel__lethal-badge">Lethal</p>
          ) : null}
          {plan !== null && stepCount > 1 ? (
            <button
              type="button"
              className="enemy-panel__expand"
              aria-expanded={expanded}
              aria-controls={stepsId}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Show fewer steps' : `Show all ${stepCount} steps`}
            </button>
          ) : null}
        </div>

        {plan === null ? (
          <p className="enemy-panel__empty">No plan yet.</p>
        ) : (
          <>
            <p className="enemy-panel__totals">
              {stepCount === 0
                ? 'No cards planned.'
                : `Incoming: ${plan.totalDamage} damage, ${plan.totalDefense} defense.`}
            </p>

            {plan.lethal ? (
              <p className="enemy-panel__lethal">
                Lethal: this plan can end the battle.
              </p>
            ) : null}

            {/*
             * Phone-only preview: the collapsed intent keeps the first three
             * steps as compact chips (README §8.7), while the full list below
             * is revealed by `Show all N steps`. The preview is display:none at
             * table widths and when expanded, so it never duplicates the plan
             * in the accessibility tree.
             */}
            {stepCount > 0 ? (
              <ol
                className="enemy-panel__preview"
                aria-label="Enemy plan preview"
              >
                {plan.steps.slice(0, 3).map((step) => {
                  const short: string[] = [];

                  if (step.damage > 0) {
                    short.push(`${step.damage} dmg`);
                  }

                  if (step.defense > 0) {
                    short.push(`${step.defense} def`);
                  }

                  if (step.shiftTo !== null) {
                    short.push(`→ ${elementLabel(step.shiftTo)}`);
                  }

                  if (short.length === 0) {
                    short.push('no effect');
                  }

                  return (
                    <li
                      className="enemy-panel__preview-step"
                      key={`preview-${step.instanceId}`}
                    >
                      <span className="enemy-panel__preview-name">
                        {cardName(cards, step.cardId)}
                      </span>
                      <span className="enemy-panel__preview-detail">
                        {short.join(' · ')}
                      </span>
                      <span className="enemy-panel__preview-cost">
                        {step.cost}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {stepCount > 0 ? (
              <ol
                className="enemy-panel__steps"
                id={stepsId}
                aria-label="Enemy plan"
              >
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
                    const target = change.target === 'self' ? 'itself' : 'you';
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
                      <span
                        className="enemy-panel__step-dot"
                        aria-hidden="true"
                      />
                      <span className="enemy-panel__step-name">
                        {cardName(cards, step.cardId)}
                      </span>

                      <span className="enemy-panel__step-detail">
                        {details.length === 0
                          ? 'no damage, defense or shift'
                          : details.join(' · ')}
                      </span>

                      <span className="enemy-panel__step-cost">
                        {step.cost}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {stepCount > 0 ? (
              <p className="enemy-panel__note">
                Recomputed from the live field and defense.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
