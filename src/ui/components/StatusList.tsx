/**
 * Status pills (SHL-FR-02, VIS-NFR-03).
 *
 * Each active status shows a glyph, its written name and its stack count, so
 * the meaning survives monochrome and screen readers. Zero-stack statuses are
 * omitted rather than rendered as empty colour chips.
 */
import { STATUS_KINDS } from '../../engine/types';
import type { StatusCounters } from '../../engine/types';
import { STATUS_DISPLAY } from './ElementCue';

export interface StatusListProps {
  readonly statuses: StatusCounters;
  /** Owner used in the accessible group name, for example "You". */
  readonly ownerLabel: string;
}

export function StatusList({ statuses, ownerLabel }: StatusListProps) {
  const active = STATUS_KINDS.filter((kind) => statuses[kind] > 0);

  if (active.length === 0) {
    return (
      <p className="status-list status-list--empty">
        {ownerLabel}: no active statuses.
      </p>
    );
  }

  return (
    <ul className="status-list" aria-label={`${ownerLabel} statuses`}>
      {active.map((kind) => {
        const display = STATUS_DISPLAY[kind];

        return (
          <li className="status-list__item" key={kind} data-status={kind}>
            <span className="status-list__glyph" aria-hidden="true">
              {display.glyph}
            </span>
            <span className="status-list__label">{display.label}</span>
            <span className="status-list__stacks">{statuses[kind]}</span>
          </li>
        );
      })}
    </ul>
  );
}
