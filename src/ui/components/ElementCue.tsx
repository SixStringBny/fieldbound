/**
 * Element and status presentation (SHL-FR-02, SHL-FR-03, VIS-NFR-03).
 *
 * Every element shown anywhere on the board renders through `ElementCue`, which
 * emits a geometric glyph plus the element's written label. Colour is decorative
 * on top of that pair, never the only cue. These tables are presentation data
 * only: the rules engine remains the sole owner of matchup and damage maths.
 */
import type { CardType, Element, StatusKind } from '../../engine/types';

export interface ElementDisplay {
  readonly label: string;
  readonly glyph: string;
}

/** Glyphs chosen to stay distinct in monochrome and at large zoom. */
export const ELEMENT_DISPLAY: Readonly<Record<Element, ElementDisplay>> = {
  ember: { label: 'Ember', glyph: '▲' },
  frost: { label: 'Frost', glyph: '❄' },
  gale: { label: 'Gale', glyph: '≋' },
  stone: { label: 'Stone', glyph: '◆' },
  neutral: { label: 'Neutral', glyph: '○' },
};

export interface StatusDisplay {
  readonly label: string;
  readonly glyph: string;
}

export const STATUS_DISPLAY: Readonly<Record<StatusKind, StatusDisplay>> = {
  focus: { label: 'Focus', glyph: '✦' },
  weaken: { label: 'Weaken', glyph: '✧' },
  regen: { label: 'Regen', glyph: '✚' },
};

export const CARD_TYPE_LABELS: Readonly<Record<CardType, string>> = {
  attack: 'attack',
  ward: 'ward',
  utility: 'utility',
  shift: 'shift',
};

/** Text label for an element, used in accessible names and prose. */
export function elementLabel(element: Element): string {
  return ELEMENT_DISPLAY[element].label;
}

/** Text label for a status, used in prose and status pills. */
export function statusLabel(status: StatusKind): string {
  return STATUS_DISPLAY[status].label;
}

export interface ElementCueProps {
  readonly element: Element;
}

/**
 * A glyph and a word for one element. The glyph is hidden from assistive
 * technology because the adjacent label is the meaningful cue; both remain
 * visible on screen.
 */
export function ElementCue({ element }: ElementCueProps) {
  const display = ELEMENT_DISPLAY[element];

  return (
    <span className="element-cue" data-element={element}>
      <span className="element-cue__glyph" aria-hidden="true">
        {display.glyph}
      </span>
      <span className="element-cue__label">{display.label}</span>
    </span>
  );
}
