// @vitest-environment node
/**
 * Card catalog contract tests (CNT-FR-01, CNT-FR-02, VIS-CON-07, VIS-CON-08).
 *
 * Three layers, in order of strength:
 *
 *   1. the frozen table: `CARDS` must equal the documented 32 cards verbatim,
 *      including omitted-when-unused effect fields;
 *   2. structural acceptance: counts, unique ids and names, cost bounds,
 *      supported effect keys and valid status descriptors;
 *   3. per-element role coverage: attack, Ward, piercing attack and a
 *      field-payoff card in every element.
 *
 * The audit is a pure function over a card array so fixtures can prove it
 * fails loudly when a card is removed, duplicated or corrupted. Nothing here
 * restates engine arithmetic: values are read from data, and
 * `cardExecutionProblem` (owned by the engine) confirms each card is
 * executable.
 */
import { describe, expect, it } from 'vitest';
import { cardExecutionProblem } from '../engine/battle';
import {
  CARD_TYPES,
  ELEMENTS,
  FIELD_ELEMENTS,
  STATUS_KINDS,
  STATUS_TARGETS,
} from '../engine/types';
import type { CardDefinition, CardType } from '../engine/types';
import { CARDS, CARD_IDS, byId, cardById } from './cards';

/* -------------------------------------------------------------------------- */
/* Documented shape                                                            */
/* -------------------------------------------------------------------------- */

const CARD_COUNT = 32;
const ELEMENT_CARD_COUNT = 5;
const ELEMENT_CARD_TOTAL = 20;
const NEUTRAL_CARD_COUNT = 8;
const SHIFT_CARD_COUNT = 4;
const MIN_COST = 0;
const MAX_COST = 3;

/** Derived from the documented table; each card type keeps its own count. */
const EXPECTED_TYPE_COUNTS: Readonly<Record<CardType, number>> = {
  attack: 15,
  ward: 5,
  utility: 8,
  shift: 4,
};

const SUPPORTED_EFFECT_KEYS = [
  'damage',
  'defense',
  'piercing',
  'fieldBonus',
  'draw',
  'energy',
  'status',
  'shiftTo',
  'heal',
] as const;

const IDENTITY_KEYS = ['id', 'name', 'element', 'type', 'cost'] as const;

const SUPPORTED_CARD_KEYS: ReadonlySet<string> = new Set([
  ...IDENTITY_KEYS,
  ...SUPPORTED_EFFECT_KEYS,
]);

const SUPPORTED_FIELD_BONUS_KEYS: ReadonlySet<string> = new Set([
  'damage',
  'defense',
]);

const SUPPORTED_STATUS_KEYS: ReadonlySet<string> = new Set([
  'kind',
  'stacks',
  'target',
]);

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* -------------------------------------------------------------------------- */
/* The frozen v1 table (docs/features/card-content.md section 4.1)             */
/* -------------------------------------------------------------------------- */

const EXPECTED_CARDS: readonly CardDefinition[] = [
  { id: 'ember-cinder-jab', name: 'Cinder Jab', element: 'ember', type: 'attack', cost: 1, damage: 3 },
  { id: 'ember-ember-lance', name: 'Ember Lance', element: 'ember', type: 'attack', cost: 2, damage: 4, piercing: true },
  { id: 'ember-ash-guard', name: 'Ash Guard', element: 'ember', type: 'ward', cost: 1, defense: 2 },
  { id: 'ember-kindled-fury', name: 'Kindled Fury', element: 'ember', type: 'attack', cost: 2, damage: 3, fieldBonus: { damage: 2 } },
  { id: 'ember-inferno', name: 'Inferno', element: 'ember', type: 'attack', cost: 3, damage: 7 },
  { id: 'frost-frost-shard', name: 'Frost Shard', element: 'frost', type: 'attack', cost: 1, damage: 3 },
  { id: 'frost-ice-needle', name: 'Ice Needle', element: 'frost', type: 'attack', cost: 2, damage: 4, piercing: true },
  { id: 'frost-rime-ward', name: 'Rime Ward', element: 'frost', type: 'ward', cost: 1, defense: 2 },
  { id: 'frost-shatter', name: 'Shatter', element: 'frost', type: 'attack', cost: 2, damage: 2, fieldBonus: { damage: 4 } },
  { id: 'frost-deep-freeze', name: 'Deep Freeze', element: 'frost', type: 'utility', cost: 2, draw: 1, status: { kind: 'weaken', stacks: 1, target: 'opponent' } },
  { id: 'gale-gust', name: 'Gust', element: 'gale', type: 'attack', cost: 1, damage: 3 },
  { id: 'gale-wind-needle', name: 'Wind Needle', element: 'gale', type: 'attack', cost: 1, damage: 2, piercing: true },
  { id: 'gale-tailwind', name: 'Tailwind', element: 'gale', type: 'ward', cost: 1, defense: 2, draw: 1 },
  { id: 'gale-cyclone', name: 'Cyclone', element: 'gale', type: 'attack', cost: 2, damage: 4, fieldBonus: { damage: 2 } },
  { id: 'gale-updraft', name: 'Updraft', element: 'gale', type: 'utility', cost: 0, draw: 1 },
  { id: 'stone-stone-fist', name: 'Stone Fist', element: 'stone', type: 'attack', cost: 1, damage: 4 },
  { id: 'stone-stone-spike', name: 'Stone Spike', element: 'stone', type: 'attack', cost: 2, damage: 4, piercing: true },
  { id: 'stone-bulwark', name: 'Bulwark', element: 'stone', type: 'ward', cost: 2, defense: 3 },
  { id: 'stone-avalanche', name: 'Avalanche', element: 'stone', type: 'attack', cost: 3, damage: 6, fieldBonus: { damage: 2 } },
  { id: 'stone-resonance', name: 'Resonance', element: 'stone', type: 'ward', cost: 1, defense: 1, fieldBonus: { defense: 2 } },
  { id: 'neutral-plain-strike', name: 'Plain Strike', element: 'neutral', type: 'attack', cost: 1, damage: 3 },
  { id: 'neutral-elemental-blow', name: 'Elemental Blow', element: 'neutral', type: 'attack', cost: 2, damage: 5 },
  { id: 'neutral-probe', name: 'Probe', element: 'neutral', type: 'utility', cost: 0, draw: 1 },
  { id: 'neutral-sift', name: 'Sift', element: 'neutral', type: 'utility', cost: 1, draw: 2 },
  { id: 'neutral-channel', name: 'Channel', element: 'neutral', type: 'utility', cost: 0, energy: 1 },
  { id: 'neutral-surge', name: 'Surge', element: 'neutral', type: 'utility', cost: 1, energy: 2 },
  { id: 'neutral-expose', name: 'Expose', element: 'neutral', type: 'utility', cost: 1, status: { kind: 'weaken', stacks: 1, target: 'opponent' } },
  { id: 'neutral-second-wind', name: 'Second Wind', element: 'neutral', type: 'utility', cost: 2, status: { kind: 'regen', stacks: 2, target: 'self' } },
  { id: 'shift-ember', name: 'Ember Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'ember' },
  { id: 'shift-frost', name: 'Frost Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'frost' },
  { id: 'shift-gale', name: 'Gale Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'gale' },
  { id: 'shift-stone', name: 'Stone Shift', element: 'neutral', type: 'shift', cost: 1, shiftTo: 'stone' },
];

/* -------------------------------------------------------------------------- */
/* Pure audit                                                                  */
/* -------------------------------------------------------------------------- */

function rawKeys(card: CardDefinition): readonly string[] {
  return Object.keys(card as unknown as Record<string, unknown>);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Unsupported keys, invalid numbers, bad statuses and missing role effects. */
function auditCard(card: CardDefinition): string[] {
  const issues: string[] = [];
  const raw = card as unknown as Record<string, unknown>;

  if (!KEBAB_CASE.test(card.id)) {
    issues.push(`card id "${card.id}" is not kebab-case`);
  }

  if (!(ELEMENTS as readonly string[]).includes(card.element)) {
    issues.push(`card "${card.id}" has unsupported element "${String(card.element)}"`);
  }

  if (!(CARD_TYPES as readonly string[]).includes(card.type)) {
    issues.push(`card "${card.id}" has unsupported type "${String(card.type)}"`);
  }

  if (!Number.isInteger(card.cost) || card.cost < MIN_COST || card.cost > MAX_COST) {
    issues.push(
      `card "${card.id}" has cost ${String(card.cost)}, expected an integer in ${MIN_COST}..${MAX_COST}`,
    );
  }

  for (const key of rawKeys(card)) {
    if (!SUPPORTED_CARD_KEYS.has(key)) {
      issues.push(`card "${card.id}" has unsupported effect field "${key}"`);
    }
  }

  // A present numeric effect is a real effect: positive, integral, never a
  // zero-valued placeholder (absence is expressed by omitting the key).
  for (const key of ['damage', 'defense', 'draw', 'energy', 'heal'] as const) {
    const value = raw[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      issues.push(
        `card "${card.id}" has ${key} ${String(value)}, expected a positive integer or no key`,
      );
    }
  }

  if (raw['piercing'] !== undefined && raw['piercing'] !== true) {
    issues.push(`card "${card.id}" declares piercing that is not true`);
  }

  const fieldBonus = raw['fieldBonus'];

  if (fieldBonus !== undefined) {
    if (!isRecord(fieldBonus)) {
      issues.push(`card "${card.id}" has a fieldBonus that is not an object`);
    } else {
      const hasBonus = Object.keys(fieldBonus).length > 0;

      for (const [key, value] of Object.entries(fieldBonus)) {
        if (!SUPPORTED_FIELD_BONUS_KEYS.has(key)) {
          issues.push(`card "${card.id}" has unsupported fieldBonus field "${key}"`);
        } else if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
          issues.push(
            `card "${card.id}" has fieldBonus.${key} ${String(value)}, expected a positive integer`,
          );
        }
      }

      if (!hasBonus) {
        issues.push(`card "${card.id}" has an empty fieldBonus`);
      }
    }
  }

  const status = raw['status'];

  if (status !== undefined) {
    if (!isRecord(status)) {
      issues.push(`card "${card.id}" has a status that is not an object`);
    } else {
      const keys = Object.keys(status);

      for (const key of keys) {
        if (!SUPPORTED_STATUS_KEYS.has(key)) {
          issues.push(`card "${card.id}" has unsupported status field "${key}"`);
        }
      }

      const kind = status['kind'];
      const target = status['target'];
      const stacks = status['stacks'];

      if (typeof kind !== 'string' || !(STATUS_KINDS as readonly string[]).includes(kind)) {
        issues.push(
          `card "${card.id}" applies unsupported status kind "${String(kind)}"`,
        );
      }

      if (
        typeof target !== 'string' ||
        !(STATUS_TARGETS as readonly string[]).includes(target)
      ) {
        issues.push(
          `card "${card.id}" applies a status to unsupported target "${String(target)}"`,
        );
      }

      if (typeof stacks !== 'number' || !Number.isInteger(stacks) || stacks <= 0) {
        issues.push(
          `card "${card.id}" applies ${String(stacks)} status stacks, expected a positive integer`,
        );
      }

      // The documented table only ever weakens the opponent or regenerates the
      // owner; mirroring a mismatch here catches a swapped target early.
      if (kind === 'weaken' && target !== 'opponent') {
        issues.push(`card "${card.id}" applies weaken to "${String(target)}"`);
      }

      if (kind === 'regen' && target !== 'self') {
        issues.push(`card "${card.id}" applies regen to "${String(target)}"`);
      }
    }
  }

  const shiftTo = raw['shiftTo'];

  if (
    shiftTo !== undefined &&
    (typeof shiftTo !== 'string' ||
      !(FIELD_ELEMENTS as readonly string[]).includes(shiftTo))
  ) {
    issues.push(`card "${card.id}" shifts to unsupported field "${String(shiftTo)}"`);
  }

  if (card.type === 'attack' && card.damage === undefined) {
    issues.push(`attack card "${card.id}" has no damage`);
  }

  if (card.type === 'ward' && card.defense === undefined) {
    issues.push(`ward card "${card.id}" has no defense`);
  }

  if (card.type === 'shift' && card.shiftTo === undefined) {
    issues.push(`shift card "${card.id}" has no shiftTo target`);
  }

  if (
    card.type === 'utility' &&
    card.draw === undefined &&
    card.energy === undefined &&
    card.status === undefined &&
    card.heal === undefined
  ) {
    issues.push(`utility card "${card.id}" has no effect`);
  }

  return issues;
}

function countBy(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

/**
 * Every catalog invariant in one place. Returns an empty array for a legal
 * catalog; otherwise one message per violation, ordered deterministically so a
 * fixture test can assert exact strings.
 */
export function auditCatalog(cards: readonly CardDefinition[]): string[] {
  const issues: string[] = [];

  if (cards.length !== CARD_COUNT) {
    issues.push(`catalog has ${cards.length} cards, expected ${CARD_COUNT}`);
  }

  for (const [id, count] of countBy(cards.map((card) => card.id))) {
    if (count > 1) {
      issues.push(`duplicate card id "${id}" appears ${count} times`);
    }
  }

  for (const [name, count] of countBy(cards.map((card) => card.name))) {
    if (count > 1) {
      issues.push(`duplicate card name "${name}" appears ${count} times`);
    }
  }

  for (const card of cards) {
    issues.push(...auditCard(card));
  }

  const elementCards = cards.filter((card) => card.element !== 'neutral');
  const neutralCards = cards.filter(
    (card) => card.element === 'neutral' && card.type !== 'shift',
  );
  const shiftCards = cards.filter((card) => card.type === 'shift');

  if (elementCards.length !== ELEMENT_CARD_TOTAL) {
    issues.push(
      `catalog has ${elementCards.length} element cards, expected ${ELEMENT_CARD_TOTAL}`,
    );
  }

  if (neutralCards.length !== NEUTRAL_CARD_COUNT) {
    issues.push(
      `catalog has ${neutralCards.length} Neutral cards, expected ${NEUTRAL_CARD_COUNT}`,
    );
  }

  if (shiftCards.length !== SHIFT_CARD_COUNT) {
    issues.push(
      `catalog has ${shiftCards.length} Shift cards, expected ${SHIFT_CARD_COUNT}`,
    );
  }

  for (const type of CARD_TYPES) {
    const count = cards.filter((card) => card.type === type).length;
    const expected = EXPECTED_TYPE_COUNTS[type];

    if (count !== expected) {
      issues.push(`type "${type}" has ${count} cards, expected ${expected}`);
    }
  }

  for (const element of FIELD_ELEMENTS) {
    const owned = cards.filter((card) => card.element === element);

    if (owned.length !== ELEMENT_CARD_COUNT) {
      issues.push(
        `element "${element}" has ${owned.length} cards, expected ${ELEMENT_CARD_COUNT}`,
      );
    }

    if (!owned.some((card) => card.type === 'attack')) {
      issues.push(`element "${element}" has no attack card`);
    }

    if (!owned.some((card) => card.type === 'ward')) {
      issues.push(`element "${element}" has no ward card`);
    }

    if (!owned.some((card) => card.type === 'attack' && card.piercing === true)) {
      issues.push(`element "${element}" has no piercing attack`);
    }

    if (
      !owned.some(
        (card) => card.element === element && card.fieldBonus !== undefined,
      )
    ) {
      issues.push(`element "${element}" has no field-payoff card`);
    }
  }

  for (const card of shiftCards) {
    if (card.element !== 'neutral') {
      issues.push(
        `shift card "${card.id}" must be Neutral, found "${card.element}"`,
      );
    }

    if (card.cost !== 1) {
      issues.push(`shift card "${card.id}" must cost 1, found ${card.cost}`);
    }
  }

  return issues;
}

function requireCard(cards: readonly CardDefinition[], id: string): CardDefinition {
  const card = cards.find((candidate) => candidate.id === id);

  if (card === undefined) {
    throw new Error(`fixture card "${id}" is missing from the catalog`);
  }

  return card;
}

/* -------------------------------------------------------------------------- */
/* The shipped catalog                                                         */
/* -------------------------------------------------------------------------- */

describe('card catalog', () => {
  it('matches the documented 32-card table verbatim', () => {
    expect(CARDS).toStrictEqual(EXPECTED_CARDS);
  });

  it('exposes ids in documented order without duplicates', () => {
    expect(CARD_IDS).toStrictEqual(EXPECTED_CARDS.map((card) => card.id));
    expect(new Set(CARD_IDS).size).toBe(CARD_COUNT);
  });

  it('satisfies every catalog invariant', () => {
    expect(auditCatalog(CARDS)).toStrictEqual([]);
  });

  it('is executable by the engine', () => {
    for (const card of CARDS) {
      expect(cardExecutionProblem(card), card.id).toBeNull();
    }
  });

  it('uses only supported effect fields', () => {
    for (const card of CARDS) {
      for (const key of rawKeys(card)) {
        expect(SUPPORTED_CARD_KEYS.has(key), `${card.id}.${key}`).toBe(true);
      }
    }
  });

  it('uses only supported status kinds and targets', () => {
    const kinds = new Set<string>();
    const targets = new Set<string>();

    for (const card of CARDS) {
      if (card.status === undefined) {
        continue;
      }

      kinds.add(card.status.kind);
      targets.add(card.status.target);
    }

    expect([...kinds].every((kind) => (STATUS_KINDS as readonly string[]).includes(kind))).toBe(true);
    expect([...targets].every((target) => (STATUS_TARGETS as readonly string[]).includes(target))).toBe(true);
    expect(kinds.size).toBeGreaterThan(0);
  });

  it('covers every cost from 0 to 3 within bounds', () => {
    const costs = CARDS.map((card) => card.cost);

    for (const cost of costs) {
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThanOrEqual(MIN_COST);
      expect(cost).toBeLessThanOrEqual(MAX_COST);
    }

    expect(new Set(costs)).toStrictEqual(new Set([0, 1, 2, 3]));
  });

  it('keeps the documented element distribution', () => {
    const elementCounts = FIELD_ELEMENTS.map(
      (element) => CARDS.filter((card) => card.element === element).length,
    );

    expect(elementCounts).toStrictEqual([5, 5, 5, 5]);
    expect(
      CARDS.filter((card) => card.element === 'neutral' && card.type !== 'shift'),
    ).toHaveLength(NEUTRAL_CARD_COUNT);
    expect(CARDS.filter((card) => card.type === 'shift')).toHaveLength(
      SHIFT_CARD_COUNT,
    );
  });

  it('gives every element an attack, a Ward, a piercing attack and a field payoff', () => {
    for (const element of FIELD_ELEMENTS) {
      const owned = CARDS.filter((card) => card.element === element);
      const label = `element ${element}`;

      expect(
        owned.some((card) => card.type === 'attack'),
        `${label} attack`,
      ).toBe(true);
      expect(
        owned.some((card) => card.type === 'ward'),
        `${label} ward`,
      ).toBe(true);
      expect(
        owned.some((card) => card.type === 'attack' && card.piercing === true),
        `${label} piercing attack`,
      ).toBe(true);
      expect(
        owned.some(
          (card) => card.element === element && card.fieldBonus !== undefined,
        ),
        `${label} field payoff`,
      ).toBe(true);
    }
  });

  it('names the documented role cards', () => {
    const roles: readonly (readonly [string, string, string])[] = [
      ['ember', 'attack', 'ember-kindled-fury'],
      ['frost', 'attack', 'frost-shatter'],
      ['gale', 'attack', 'gale-cyclone'],
      ['stone', 'attack', 'stone-avalanche'],
      ['stone', 'ward', 'stone-resonance'],
    ];

    for (const [element, type, id] of roles) {
      const card = requireCard(CARDS, id);

      expect(card.element, id).toBe(element);
      expect(card.type, id).toBe(type);
      expect(card.fieldBonus, id).toBeDefined();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The typed export                                                            */
/* -------------------------------------------------------------------------- */

describe('card lookups', () => {
  it('resolves every catalog id to its own definition', () => {
    for (const card of CARDS) {
      expect(byId[card.id], card.id).toBe(card);
      expect(cardById(card.id), card.id).toBe(card);
    }

    expect(Object.keys(byId)).toHaveLength(CARD_COUNT);
  });

  it('returns undefined for unknown ids instead of throwing', () => {
    expect(byId['card:ember-cinder-jab']).toBeUndefined();
    expect(byId['ember-cinder-jabb']).toBeUndefined();
    expect(byId['EMBER-CINDER-JAB']).toBeUndefined();
    expect(byId['']).toBeUndefined();
    expect(cardById('unknown-card')).toBeUndefined();
    expect(cardById('field:frost')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Auditing fixtures                                                           */
/* -------------------------------------------------------------------------- */

describe('catalog audit fixtures', () => {
  it('reports the exact counts when a card is removed', () => {
    const issues = auditCatalog(
      CARDS.filter((card) => card.id !== 'ember-cinder-jab'),
    );

    expect(issues).toContain('catalog has 31 cards, expected 32');
    expect(issues).toContain('element "ember" has 4 cards, expected 5');
    expect(issues).toContain('type "attack" has 14 cards, expected 15');
  });

  it('reports a duplicated card id and name', () => {
    const issues = auditCatalog([
      ...CARDS,
      requireCard(CARDS, 'ember-cinder-jab'),
    ]);

    expect(issues).toContain('catalog has 33 cards, expected 32');
    expect(issues).toContain(
      'duplicate card id "ember-cinder-jab" appears 2 times',
    );
    expect(issues).toContain('duplicate card name "Cinder Jab" appears 2 times');
  });

  it('fails the element role check when its only Ward is removed', () => {
    const issues = auditCatalog(
      CARDS.filter((card) => card.id !== 'ember-ash-guard'),
    );

    expect(issues).toContain('element "ember" has no ward card');
  });

  it('rejects a zero-valued placeholder effect', () => {
    const issues = auditCatalog([
      ...CARDS.filter((card) => card.id !== 'ember-cinder-jab'),
      { ...requireCard(CARDS, 'ember-cinder-jab'), damage: 0 },
    ]);

    expect(issues).toContain(
      'card "ember-cinder-jab" has damage 0, expected a positive integer or no key',
    );
  });

  it('rejects an unsupported status kind and a formula field', () => {
    const corrupted = {
      ...requireCard(CARDS, 'neutral-expose'),
      formula: 'damage * 2',
      status: { kind: 'burn', stacks: 1, target: 'opponent' },
    } as unknown as CardDefinition;

    const issues = auditCatalog([
      ...CARDS.filter((card) => card.id !== 'neutral-expose'),
      corrupted,
    ]);

    expect(issues).toContain(
      'card "neutral-expose" has unsupported effect field "formula"',
    );
    expect(issues).toContain(
      'card "neutral-expose" applies unsupported status kind "burn"',
    );
  });

  it('rejects a shift card that is not a one-cost Neutral card', () => {
    const issues = auditCatalog([
      ...CARDS.filter((card) => card.id !== 'shift-gale'),
      {
        ...requireCard(CARDS, 'shift-gale'),
        element: 'gale',
        cost: 2,
      },
    ]);

    expect(issues).toContain(
      'shift card "shift-gale" must be Neutral, found "gale"',
    );
    expect(issues).toContain('shift card "shift-gale" must cost 1, found 2');
  });
});
