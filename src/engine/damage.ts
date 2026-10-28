/**
 * Field matchup, attack damage and Ward defense (ENG-FR-02, VIS-CON-08).
 *
 * This is the only place in Fieldbound that knows the elemental cycle, the +2
 * field bonus, the countered floor and the defense cap. Battle flow, the intent
 * preview and the enemy planner call these functions instead of restating any
 * of those numbers, and no card id is special-cased: a card's conditional
 * field bonus arrives as data (`CardDefinition.fieldBonus`).
 *
 * The v1 pipeline is frozen and its order matters:
 *
 *   raw = base + card field bonus (only while the card's element is the field)
 *   raw = raw + statusModifier            (net Focus/Weaken, floor at 0)
 *   if empowered:  raw += 2, pierce = true
 *   if countered:  raw = max(1, ceil(raw / 2)), pierce = false
 *   otherwise:     pierce = card.piercing
 *   if not pierce: damage = max(0, raw - defense)
 *
 * Focus and Weaken stack consumption belongs to `status.ts`; the caller passes
 * the net modifier in. Damage never reads, consumes or mutates status counters.
 */
import { DEFENSE_CAP } from './types';
import type { Element, FieldElement } from './types';

/* -------------------------------------------------------------------------- */
/* Matchup                                                                     */
/* -------------------------------------------------------------------------- */

/** How the active field relates to an attack or Ward element. */
export type MatchupKind = 'empowered' | 'countered' | 'neutral';

/** Damage and Ward defense granted by a matching element. */
export const FIELD_ATTACK_BONUS = 2;
export const FIELD_WARD_BONUS = 2;

/** A countered attack never resolves below this value before defense. */
export const COUNTERED_DAMAGE_MINIMUM = 1;

/**
 * The frozen v1 cycle: each field beats exactly one attack element. Ember beats
 * Frost, Frost beats Gale, Gale beats Stone and Stone beats Ember. Neutral sits
 * outside the cycle and is never a key here.
 */
export const FIELD_BEATS: Readonly<Record<FieldElement, FieldElement>> = {
  ember: 'frost',
  frost: 'gale',
  gale: 'stone',
  stone: 'ember',
};

/**
 * Resolves all 25 field/element pairs, Neutral included. A matching element is
 * empowered, the element the field beats is countered, and everything else -
 * including every pair involving Neutral - is neutral.
 */
export function resolveMatchup(field: Element, element: Element): MatchupKind {
  if (field === 'neutral' || element === 'neutral') {
    return 'neutral';
  }

  if (field === element) {
    return 'empowered';
  }

  return FIELD_BEATS[field] === element ? 'countered' : 'neutral';
}

/* -------------------------------------------------------------------------- */
/* Attack damage                                                               */
/* -------------------------------------------------------------------------- */

/** Everything an attack resolution needs; no state and no card lookup. */
export interface AttackInput {
  /** Card damage before any modifier. */
  readonly baseDamage: number;
  /** Element of the attacking card. */
  readonly element: Element;
  /** Active field at the moment the attack resolves. */
  readonly field: Element;
  /** Persistent defense of the target side. */
  readonly targetDefense: number;
  /** The card's printed piercing keyword, if any. */
  readonly piercing?: boolean;
  /**
   * Net Focus/Weaken modifier for this attack (+2 per consumed Focus, -2 per
   * consumed Weaken), already computed by `status.ts`.
   */
  readonly statusModifier?: number;
  /**
   * `CardDefinition.fieldBonus.damage`: extra damage that applies only while
   * the card's element matches the field. Ignored on any other matchup.
   */
  readonly fieldBonusDamage?: number;
}

/** Damage plus the intermediate values the preview and the UI explain with. */
export interface AttackResolution {
  /** Sanitized base damage, before any bonus or modifier. */
  readonly baseDamage: number;
  /** Card field bonus actually applied (0 unless the attack is empowered). */
  readonly cardBonus: number;
  /** Net Focus/Weaken modifier that was applied. */
  readonly statusModifier: number;
  readonly matchup: MatchupKind;
  /** Automatic +2 field bonus, or 0. */
  readonly matchBonus: number;
  /** Damage after statuses and the field step, before persistent defense. */
  readonly rawDamage: number;
  /** Effective piercing after the field override. */
  readonly piercing: boolean;
  /** Defense actually absorbed (0 when the attack pierces). */
  readonly defenseApplied: number;
  /** Final health reduction, never negative. */
  readonly damage: number;
}

/**
 * Resolves one attack through the full pipeline. Pure: the input is only read,
 * the result is a new object, and repeated calls with the same input agree.
 */
export function resolveAttack(input: AttackInput): AttackResolution {
  const matchup = resolveMatchup(input.field, input.element);
  const baseDamage = toNonNegativeInteger(input.baseDamage);
  const cardBonus =
    matchup === 'empowered' ? toNonNegativeInteger(input.fieldBonusDamage ?? 0) : 0;
  const statusModifier = toInteger(input.statusModifier ?? 0);
  const afterStatuses = Math.max(0, baseDamage + cardBonus + statusModifier);

  const matchBonus = matchup === 'empowered' ? FIELD_ATTACK_BONUS : 0;
  let rawDamage = afterStatuses;
  let piercing = input.piercing === true;

  if (matchup === 'empowered') {
    rawDamage = afterStatuses + matchBonus;
    // A matching attack always pierces, whether or not the card declares it.
    piercing = true;
  } else if (matchup === 'countered') {
    // The floor is applied before defense, so armor can still reduce it to 0.
    rawDamage = Math.max(
      COUNTERED_DAMAGE_MINIMUM,
      Math.ceil(afterStatuses / 2),
    );
    // A countered attack never pierces, even when the card declares it.
    piercing = false;
  }

  const defense = clampDefense(input.targetDefense);
  const defenseApplied = piercing ? 0 : Math.min(defense, rawDamage);

  return {
    baseDamage,
    cardBonus,
    statusModifier,
    matchup,
    matchBonus,
    rawDamage,
    piercing,
    defenseApplied,
    damage: rawDamage - defenseApplied,
  };
}

/* -------------------------------------------------------------------------- */
/* Defense and Wards                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Bounds any defense value to the persistent-defense contract: an integer in
 * `[0, DEFENSE_CAP]`. Used by battle state changes, Ward resolution and
 * snapshot validation so the cap lives in exactly one place.
 */
export function clampDefense(value: number): number {
  const amount = toInteger(value);

  if (amount <= 0) {
    return 0;
  }

  return amount >= DEFENSE_CAP ? DEFENSE_CAP : amount;
}

/** A Ward application against the target's current defense. */
export interface WardInput {
  /** Defense the side already has. */
  readonly currentDefense: number;
  /** `CardDefinition.defense` for the Ward. */
  readonly baseDefense: number;
  /** Element of the Ward card. */
  readonly element: Element;
  /** Active field when the Ward resolves. */
  readonly field: Element;
  /**
   * `CardDefinition.fieldBonus.defense`: extra defense that applies only while
   * the Ward's element matches the field.
   */
  readonly fieldBonusDefense?: number;
}

/** Result of a Ward: the new capped defense and how much it gained. */
export interface WardResolution {
  readonly matchup: MatchupKind;
  /** Automatic +2 for a matching Ward, or 0. */
  readonly matchBonus: number;
  /** Card field bonus actually applied, or 0. */
  readonly cardBonus: number;
  /** Defense actually added after the cap. */
  readonly gained: number;
  /** Defense after the Ward, never above `DEFENSE_CAP`. */
  readonly defense: number;
}

/**
 * Applies a Ward: base defense, then the +2 matching bonus and the card's
 * conditional field bonus when empowered, all before the cap. A Ward that does
 * not match the field gains only its base defense.
 */
export function resolveWard(input: WardInput): WardResolution {
  const current = clampDefense(input.currentDefense);
  const matchup = resolveMatchup(input.field, input.element);
  const empowered = matchup === 'empowered';
  const matchBonus = empowered ? FIELD_WARD_BONUS : 0;
  const cardBonus = empowered
    ? toNonNegativeInteger(input.fieldBonusDefense ?? 0)
    : 0;
  const defense = clampDefense(
    current + toNonNegativeInteger(input.baseDefense) + matchBonus + cardBonus,
  );

  return {
    matchup,
    matchBonus,
    cardBonus,
    gained: defense - current,
    defense,
  };
}

/* -------------------------------------------------------------------------- */
/* Integer inputs                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Truncates to an integer and rejects non-finite input. Content is expected to
 * hold integers, but a corrupt value must never leak NaN into battle state.
 */
function toInteger(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

/** Integer at or above zero, used for every value that only adds. */
function toNonNegativeInteger(value: number): number {
  const integer = toInteger(value);
  return integer > 0 ? integer : 0;
}
