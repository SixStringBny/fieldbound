/**
 * Health and defense meter (SHL-FR-02, VIS-NFR-03).
 *
 * `role="meter"` plus both visible text and `aria-valuetext` means the value is
 * never carried by the coloured bar alone. The component is presentational and
 * owns no clamping or damage rule: callers pass the engine's current values.
 */

export type StatMeterTone = 'health' | 'defense';

export interface StatMeterProps {
  /** Accessible name, for example "Cinder Warden health". */
  readonly label: string;
  /** Short visible label, also the unit in the spoken value. */
  readonly visibleLabel: string;
  readonly value: number;
  readonly max: number;
  readonly tone: StatMeterTone;
  /**
   * False where the value already states the fact and a second label is noise
   * (the battle board's HP/DEF meters). The accessible meter name and the
   * spoken value keep the word either way.
   */
  readonly showLabel?: boolean;
}

export function StatMeter({
  label,
  visibleLabel,
  value,
  max,
  tone,
  showLabel = true,
}: StatMeterProps) {
  const safeMax = max > 0 ? max : 1;
  const percentage = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div
      className={`stat-meter stat-meter--${tone}`}
      data-show-label={showLabel ? 'true' : 'false'}
    >
      <div className="stat-meter__head">
        {showLabel ? (
          <span className="stat-meter__label">{visibleLabel}</span>
        ) : null}
        <span className="stat-meter__value">
          {value} / {max}
        </span>
      </div>
      <div
        className="stat-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${max} ${visibleLabel.toLowerCase()}`}
      >
        <span
          className="stat-meter__fill"
          style={{ width: `${percentage}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
