/**
 * Player panel (SHL-FR-02, VIS-NFR-03).
 *
 * Health and defense use meters with value text, statuses keep glyph plus label,
 * and energy is shown as both a number and pips. Every value comes from the
 * engine's player `BattleSide`; no rule is evaluated here.
 */
import type { BattleSide } from '../../engine/types';
import { DEFENSE_CAP, TURN_START_ENERGY } from '../../engine/types';
import { ElementCue } from './ElementCue';
import { StatMeter } from './StatMeter';
import { StatusList } from './StatusList';

export interface PlayerPanelProps {
  readonly side: BattleSide;
}

export function PlayerPanel({ side }: PlayerPanelProps) {
  const pipCount = Math.max(TURN_START_ENERGY, side.energy);

  return (
    <section
      className="player-panel"
      data-element={side.element}
      aria-labelledby="player-panel-title"
    >
      <div className="player-panel__head">
        <h2 className="player-panel__title" id="player-panel-title">
          You
        </h2>
        <p className="player-panel__element">
          <ElementCue element={side.element} /> <span>starter element</span>
        </p>
      </div>

      <div className="player-panel__meters">
        <StatMeter
          label="Your health"
          visibleLabel="Health"
          value={side.health}
          max={side.maxHealth}
          tone="health"
        />

        <StatMeter
          label="Your defense"
          visibleLabel="Defense"
          value={side.defense}
          max={DEFENSE_CAP}
          tone="defense"
        />
      </div>

      <StatusList statuses={side.statuses} ownerLabel="You" />

      <div className="player-panel__energy">
        <p className="player-panel__energy-text">{side.energy} energy</p>
        <ol className="energy-pips" aria-hidden="true">
          {Array.from({ length: pipCount }, (_, index) => (
            <li
              className={
                index < side.energy ? 'energy-pip energy-pip--on' : 'energy-pip'
              }
              key={index}
            >
              ◆
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
