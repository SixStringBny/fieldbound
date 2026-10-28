/**
 * Card prose and primary-number presentation (SHL-FR-03).
 *
 * Turns a `CardDefinition` into face labels, alt text and full-effect sentences.
 * It reads printed card data only: it never rolls damage, consumes statuses or
 * mutates battle state. The current field interaction is a two-state display
 * decision supplied by the board (`empowered`, `countered` or `neutral`), not a
 * second rules engine.
 */
import type { CardDefinition, Element } from '../../engine/types';
import {
  CARD_TYPE_LABELS,
  ELEMENT_DISPLAY,
  elementLabel,
  statusLabel,
} from './ElementCue';

/** How the active field relates to one card's element. */
export type CardMatchup = 'empowered' | 'countered' | 'neutral';

export interface CardPrimary {
  /** The large face value: a number, or an arrow for a Shift. */
  readonly value: string;
  /** Short visible label under the value. */
  readonly label: string;
  /** Spoken form used in the card's accessible name. */
  readonly spoken: string;
}

/**
 * The number a player looks for on the face. Attacks lead with damage, Wards
 * with defense, Shifts with their destination, utilities with their first
 * printed resource.
 */
export function cardPrimary(card: CardDefinition): CardPrimary {
  if (card.damage !== undefined) {
    return {
      value: String(card.damage),
      label: 'damage',
      spoken: `${card.damage} damage`,
    };
  }

  if (card.defense !== undefined) {
    return {
      value: String(card.defense),
      label: 'defense',
      spoken: `${card.defense} defense`,
    };
  }

  if (card.shiftTo !== undefined) {
    const destination = elementLabel(card.shiftTo);
    return {
      value: '⇄',
      label: `to ${destination}`,
      spoken: `shifts the field to ${destination}`,
    };
  }

  if (card.draw !== undefined) {
    return {
      value: String(card.draw),
      label: 'draw',
      spoken: `draws ${card.draw}`,
    };
  }

  if (card.energy !== undefined) {
    return {
      value: String(card.energy),
      label: 'energy',
      spoken: `gains ${card.energy} energy`,
    };
  }

  if (card.heal !== undefined) {
    return {
      value: String(card.heal),
      label: 'heal',
      spoken: `heals ${card.heal}`,
    };
  }

  if (card.status !== undefined) {
    const target = card.status.target === 'self' ? 'you' : 'the opponent';
    return {
      value: String(card.status.stacks),
      label: `${statusLabel(card.status.kind)} to ${target}`,
      spoken: `applies ${card.status.stacks} ${statusLabel(card.status.kind)} to ${target}`,
    };
  }

  return { value: '—', label: 'no effect', spoken: 'no printed effect' };
}

/**
 * Accessible name for a hand card. The PRD requires cost, name and element;
 * this also carries the primary number and, for an unaffordable card, the
 * reason it cannot be played. Everything after the number is optional data,
 * so the name never depends on colour or a glyph.
 */
export function cardAccessibleName(
  card: CardDefinition,
  affordable: boolean,
): string {
  const primary = cardPrimary(card);
  const parts = [
    `${card.cost} energy`,
    card.name,
    `${elementLabel(card.element)} ${CARD_TYPE_LABELS[card.type]}`,
    primary.spoken,
    ...cardBadges(card),
  ];

  if (!affordable) {
    parts.push('unaffordable');
  }

  return parts.join(', ');
}

/** Descriptive alt text for card art: element and primary number included. */
export function cardAltText(card: CardDefinition): string {
  const primary = cardPrimary(card);
  const piercing = card.piercing === true ? ', pierces defense' : '';

  return `${card.name}, ${elementLabel(card.element)} ${CARD_TYPE_LABELS[card.type]}, ${primary.spoken}${piercing}`;
}

function plural(count: number, singular: string, pluralWord: string): string {
  return count === 1 ? singular : pluralWord;
}

/**
 * The full printed effect as sentences for the detail sheet. Field bonuses are
 * stated as conditional printed text; the live matchup sentence is separate.
 */
export function cardEffectLines(card: CardDefinition): readonly string[] {
  const lines: string[] = [];

  if (card.damage !== undefined) {
    lines.push(
      `Deals ${card.damage} damage${card.piercing === true ? ' and pierces defense' : ''}.`,
    );
  }

  if (card.defense !== undefined) {
    lines.push(`Grants ${card.defense} defense.`);
  }

  if (card.draw !== undefined) {
    lines.push(
      `Draws ${card.draw} ${plural(card.draw, 'card', 'cards')}.`,
    );
  }

  if (card.energy !== undefined) {
    lines.push(`Gains ${card.energy} energy.`);
  }

  if (card.heal !== undefined) {
    lines.push(`Heals ${card.heal} health.`);
  }

  if (card.status !== undefined) {
    const target = card.status.target === 'self' ? 'you' : 'the opponent';
    lines.push(
      `Applies ${card.status.stacks} ${statusLabel(card.status.kind)} to ${target}.`,
    );
  }

  if (card.shiftTo !== undefined) {
    lines.push(`Shifts the active field to ${elementLabel(card.shiftTo)}.`);
  }

  if (card.fieldBonus?.damage !== undefined) {
    lines.push(
      `+${card.fieldBonus.damage} damage while ${elementLabel(card.element)} is the active field.`,
    );
  }

  if (card.fieldBonus?.defense !== undefined) {
    lines.push(
      `+${card.fieldBonus.defense} defense while ${elementLabel(card.element)} is the active field.`,
    );
  }

  if (lines.length === 0) {
    lines.push('No printed effect.');
  }

  return lines;
}

/** Badges shown on the face and repeated in the detail sheet. */
export function cardBadges(card: CardDefinition): readonly string[] {
  const badges: string[] = [];

  if (card.piercing === true) {
    badges.push('Pierce');
  }

  if (card.fieldBonus?.damage !== undefined) {
    badges.push(`+${card.fieldBonus.damage} on ${elementLabel(card.element)} field`);
  }

  if (card.fieldBonus?.defense !== undefined) {
    badges.push(`+${card.fieldBonus.defense} on ${elementLabel(card.element)} field`);
  }

  return badges;
}

/**
 * The current-field sentence in the detail sheet, for example
 * "Empowered: +2 damage, and it pierces defense." The numbers come from the
 * frozen field rules as display copy; the engine still resolves the real hit.
 */
export function cardMatchupSentence(
  card: CardDefinition,
  field: Element,
  matchup: CardMatchup,
): string {
  if (card.element === 'neutral') {
    return 'Neutral cards gain no field bonus.';
  }

  if (field === 'neutral') {
    return 'The field is Neutral: no card gains an elemental bonus.';
  }

  if (card.type !== 'attack' && card.type !== 'ward') {
    return `${elementLabel(card.element)} ${CARD_TYPE_LABELS[card.type]} cards are not affected by the field matchup.`;
  }

  if (matchup === 'empowered') {
    if (card.type === 'attack') {
      const extra =
        card.fieldBonus?.damage === undefined
          ? ''
          : `, plus ${card.fieldBonus.damage} from this card's field bonus`;
      return `Empowered: +2 damage${extra}, and it pierces defense.`;
    }

    const extra =
      card.fieldBonus?.defense === undefined
        ? ''
        : `, plus ${card.fieldBonus.defense} from this card's field bonus`;
    return `Empowered: +2 defense${extra}.`;
  }

  if (matchup === 'countered') {
    if (card.type === 'attack') {
      return 'Countered: damage is halved, rounded up, and cannot pierce.';
    }

    return 'Countered: this Ward gains only its printed defense.';
  }

  return `No field bonus: ${ELEMENT_DISPLAY[card.element].label} is neither empowered nor countered while ${elementLabel(field)} is active.`;
}
