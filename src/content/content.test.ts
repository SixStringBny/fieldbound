// @vitest-environment node
/**
 * Starter deck and enemy contract tests (CNT-FR-03, CNT-FR-04, VIS-CON-07,
 * VIS-CON-08).
 *
 * The shipped data is checked three ways:
 *
 *   1. the frozen tables: `STARTER_DECKS` and `ENEMIES` must equal the
 *      documented lists verbatim, including order and repeated enemy copies;
 *   2. structural acceptance: ten distinct cards per starter deck split
 *      5 element / 3 Neutral / 2 Shift, the directional Shift pair, the health
 *      ladder and the 12-card boss deck with all four Shifts;
 *   3. resolution: every referenced card id exists in the catalog and lookups
 *      return `undefined` for unknown ids.
 *
 * The audits are pure functions over the arrays so fixtures can prove they
 * fail loudly when a deck repeats its Shift, the boss drops a Shift or an enemy
 * breaks the ladder. Nothing here restates engine arithmetic: content only
 * declares lists and numbers.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_BEATS } from '../engine/damage';
import { ELEMENTS, FIELD_ELEMENTS } from '../engine/types';
import type {
  CardDefinition,
  DeckDefinition,
  EnemyDefinition,
  FieldElement,
} from '../engine/types';
import { cardById } from './cards';
import {
  DECK_IDS,
  STARTER_DECKS,
  byId as decksById,
  deckById,
  deckByElement,
} from './decks';
import {
  ENEMIES,
  ENEMY_IDS,
  byId as enemiesById,
  enemyById,
} from './enemies';

/* -------------------------------------------------------------------------- */
/* Documented shape                                                            */
/* -------------------------------------------------------------------------- */

const DECK_COUNT = 4;
const DECK_SIZE = 10;
const DECK_ELEMENT_CARDS = 5;
const DECK_NEUTRAL_CARDS = 3;
const DECK_SHIFT_CARDS = 2;

const ENEMY_COUNT = 4;
const ENEMY_DECK_SIZE = 10;
const BOSS_DECK_SIZE = 12;
const BOSS_ID = 'enemy-hollow-field';
const HEALTH_LADDER = [30, 35, 40, 60] as const;

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* -------------------------------------------------------------------------- */
/* The frozen v1 tables (docs/features/card-content.md sections 4.3 and 4.4)   */
/* -------------------------------------------------------------------------- */

const EXPECTED_DECKS: readonly DeckDefinition[] = [
  {
    id: 'deck-ember',
    name: 'Ember',
    element: 'ember',
    cards: [
      'ember-cinder-jab',
      'ember-ember-lance',
      'ember-ash-guard',
      'ember-kindled-fury',
      'ember-inferno',
      'neutral-plain-strike',
      'neutral-probe',
      'neutral-channel',
      'shift-ember',
      'shift-frost',
    ],
  },
  {
    id: 'deck-frost',
    name: 'Frost',
    element: 'frost',
    cards: [
      'frost-frost-shard',
      'frost-ice-needle',
      'frost-rime-ward',
      'frost-shatter',
      'frost-deep-freeze',
      'neutral-plain-strike',
      'neutral-probe',
      'neutral-channel',
      'shift-frost',
      'shift-gale',
    ],
  },
  {
    id: 'deck-gale',
    name: 'Gale',
    element: 'gale',
    cards: [
      'gale-gust',
      'gale-wind-needle',
      'gale-tailwind',
      'gale-cyclone',
      'gale-updraft',
      'neutral-plain-strike',
      'neutral-probe',
      'neutral-channel',
      'shift-gale',
      'shift-stone',
    ],
  },
  {
    id: 'deck-stone',
    name: 'Stone',
    element: 'stone',
    cards: [
      'stone-stone-fist',
      'stone-stone-spike',
      'stone-bulwark',
      'stone-avalanche',
      'stone-resonance',
      'neutral-plain-strike',
      'neutral-probe',
      'neutral-channel',
      'shift-stone',
      'shift-ember',
    ],
  },
];

const EXPECTED_ENEMIES: readonly EnemyDefinition[] = [
  {
    id: 'enemy-cinder-warden',
    name: 'Cinder Warden',
    element: 'ember',
    maxHealth: 30,
    deck: [
      'ember-cinder-jab',
      'ember-cinder-jab',
      'ember-ember-lance',
      'ember-ash-guard',
      'ember-kindled-fury',
      'ember-inferno',
      'neutral-plain-strike',
      'neutral-channel',
      'shift-ember',
      'shift-frost',
    ],
  },
  {
    id: 'enemy-rime-sentinel',
    name: 'Rime Sentinel',
    element: 'frost',
    maxHealth: 35,
    deck: [
      'frost-frost-shard',
      'frost-frost-shard',
      'frost-ice-needle',
      'frost-rime-ward',
      'frost-shatter',
      'frost-deep-freeze',
      'neutral-plain-strike',
      'neutral-channel',
      'shift-frost',
      'shift-gale',
    ],
  },
  {
    id: 'enemy-storm-herald',
    name: 'Storm Herald',
    element: 'gale',
    maxHealth: 40,
    deck: [
      'gale-gust',
      'gale-gust',
      'gale-wind-needle',
      'gale-tailwind',
      'gale-cyclone',
      'gale-updraft',
      'neutral-plain-strike',
      'neutral-channel',
      'shift-gale',
      'shift-stone',
    ],
  },
  {
    id: 'enemy-hollow-field',
    name: 'The Hollow Field',
    element: 'neutral',
    maxHealth: 60,
    deck: [
      'neutral-plain-strike',
      'neutral-plain-strike',
      'neutral-elemental-blow',
      'neutral-elemental-blow',
      'neutral-expose',
      'neutral-expose',
      'neutral-second-wind',
      'neutral-sift',
      'shift-ember',
      'shift-frost',
      'shift-gale',
      'shift-stone',
    ],
    counterElementBias: true,
  },
];

/* -------------------------------------------------------------------------- */
/* Pure audits                                                                 */
/* -------------------------------------------------------------------------- */

function countBy(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function isFieldElement(value: string): value is FieldElement {
  return (FIELD_ELEMENTS as readonly string[]).includes(value);
}

/**
 * Every starter deck invariant in one place. Returns an empty array for a legal
 * deck; otherwise one message per violation, ordered deterministically so a
 * fixture test can assert exact strings. Unknown card ids are reported and then
 * excluded from the composition counts.
 */
export function auditDeck(deck: DeckDefinition): string[] {
  const issues: string[] = [];
  const label = `deck "${deck.id}"`;
  const validElement = isFieldElement(deck.element);

  if (!KEBAB_CASE.test(deck.id)) {
    issues.push(`deck id "${deck.id}" is not kebab-case`);
  }

  if (!validElement) {
    issues.push(`${label} has unsupported element "${String(deck.element)}"`);
  }

  if (deck.cards.length !== DECK_SIZE) {
    issues.push(`${label} has ${deck.cards.length} cards, expected ${DECK_SIZE}`);
  }

  for (const [cardId, count] of countBy(deck.cards)) {
    if (count > 1) {
      issues.push(`${label} repeats card id "${cardId}" ${count} times`);
    }
  }

  const resolved: CardDefinition[] = [];

  for (const cardId of deck.cards) {
    const card = cardById(cardId);

    if (card === undefined) {
      issues.push(`${label} references unknown card id "${cardId}"`);
    } else {
      resolved.push(card);
    }
  }

  const elementCards = resolved.filter(
    (card) => card.element === deck.element && card.type !== 'shift',
  );
  const neutralCards = resolved.filter(
    (card) => card.element === 'neutral' && card.type !== 'shift',
  );
  const shiftCards = resolved.filter((card) => card.type === 'shift');

  if (elementCards.length !== DECK_ELEMENT_CARDS) {
    issues.push(
      `${label} has ${elementCards.length} ${String(deck.element)} cards, expected ${DECK_ELEMENT_CARDS}`,
    );
  }

  if (neutralCards.length !== DECK_NEUTRAL_CARDS) {
    issues.push(
      `${label} has ${neutralCards.length} Neutral cards, expected ${DECK_NEUTRAL_CARDS}`,
    );
  }

  if (shiftCards.length !== DECK_SHIFT_CARDS) {
    issues.push(
      `${label} has ${shiftCards.length} Shift cards, expected ${DECK_SHIFT_CARDS}`,
    );
  }

  for (const card of resolved) {
    if (card.element !== deck.element && card.element !== 'neutral') {
      issues.push(
        `${label} includes card "${card.id}" of foreign element "${card.element}"`,
      );
    }
  }

  if (validElement) {
    const ownShift = `shift-${deck.element}`;
    const beatenShift = `shift-${FIELD_BEATS[deck.element]}`;

    if (!deck.cards.includes(ownShift)) {
      issues.push(`${label} is missing shift card "${ownShift}"`);
    }

    if (!deck.cards.includes(beatenShift)) {
      issues.push(`${label} is missing shift card "${beatenShift}"`);
    }
  }

  return issues;
}

/**
 * Every enemy invariant in one place. The Neutral enemy is the boss, so it must
 * carry the 12-card deck, all four Shifts and the counter-element bias flag;
 * every other enemy carries a 10-card deck and no behaviour flag.
 */
export function auditEnemy(enemy: EnemyDefinition): string[] {
  const issues: string[] = [];
  const label = `enemy "${enemy.id}"`;
  const isBoss = enemy.element === 'neutral';
  const expectedSize = isBoss ? BOSS_DECK_SIZE : ENEMY_DECK_SIZE;

  if (!KEBAB_CASE.test(enemy.id)) {
    issues.push(`enemy id "${enemy.id}" is not kebab-case`);
  }

  if (!(ELEMENTS as readonly string[]).includes(enemy.element)) {
    issues.push(`${label} has unsupported element "${String(enemy.element)}"`);
  }

  if (!Number.isInteger(enemy.maxHealth) || enemy.maxHealth <= 0) {
    issues.push(
      `${label} has health ${String(enemy.maxHealth)}, expected a positive integer`,
    );
  }

  if (enemy.deck.length !== expectedSize) {
    issues.push(
      `${label} has ${enemy.deck.length} cards, expected ${expectedSize}`,
    );
  }

  for (const cardId of enemy.deck) {
    if (cardById(cardId) === undefined) {
      issues.push(`${label} references unknown card id "${cardId}"`);
    }
  }

  if (isBoss) {
    if (enemy.counterElementBias !== true) {
      issues.push(`boss "${enemy.id}" must declare counterElementBias`);
    }

    for (const element of FIELD_ELEMENTS) {
      const shiftId = `shift-${element}`;

      if (!enemy.deck.includes(shiftId)) {
        issues.push(`boss deck "${enemy.id}" is missing shift card "${shiftId}"`);
      }
    }
  } else if (enemy.counterElementBias !== undefined) {
    issues.push(
      `enemy "${enemy.id}" declares counterElementBias but is not the Neutral boss`,
    );
  }

  return issues;
}

/** Catalog-level checks: count, unique ids, per-enemy legality, health ladder. */
export function auditEnemies(enemies: readonly EnemyDefinition[]): string[] {
  const issues: string[] = [];

  if (enemies.length !== ENEMY_COUNT) {
    issues.push(`enemy catalog has ${enemies.length} entries, expected ${ENEMY_COUNT}`);
  }

  for (const [id, count] of countBy(enemies.map((enemy) => enemy.id))) {
    if (count > 1) {
      issues.push(`enemy id "${id}" appears ${count} times`);
    }
  }

  for (const enemy of enemies) {
    issues.push(...auditEnemy(enemy));
  }

  const healths = enemies.map((enemy) => enemy.maxHealth);

  if (healths.join(', ') !== HEALTH_LADDER.join(', ')) {
    issues.push(
      `enemy health ladder is ${healths.join(', ')}, expected ${HEALTH_LADDER.join(', ')}`,
    );
  }

  const bosses = enemies.filter((enemy) => enemy.element === 'neutral');

  if (bosses.length !== 1) {
    issues.push(`enemy catalog has ${bosses.length} Neutral bosses, expected 1`);
  }

  return issues;
}

function requireDeck(decks: readonly DeckDefinition[], id: string): DeckDefinition {
  const deck = decks.find((candidate) => candidate.id === id);

  if (deck === undefined) {
    throw new Error(`fixture deck "${id}" is missing from the catalog`);
  }

  return deck;
}

function requireEnemy(enemies: readonly EnemyDefinition[], id: string): EnemyDefinition {
  const enemy = enemies.find((candidate) => candidate.id === id);

  if (enemy === undefined) {
    throw new Error(`fixture enemy "${id}" is missing from the catalog`);
  }

  return enemy;
}

function resolveDeckCards(deck: DeckDefinition): readonly CardDefinition[] {
  return deck.cards.map((id) => {
    const card = cardById(id);

    if (card === undefined) {
      throw new Error(`deck "${deck.id}" references unknown card "${id}"`);
    }

    return card;
  });
}

/* -------------------------------------------------------------------------- */
/* The shipped starter decks                                                   */
/* -------------------------------------------------------------------------- */

describe('starter decks', () => {
  it('matches the documented deck table verbatim', () => {
    expect(STARTER_DECKS).toStrictEqual(EXPECTED_DECKS);
  });

  it('lists four unique deck ids in documented starter order', () => {
    expect(DECK_IDS).toStrictEqual(EXPECTED_DECKS.map((deck) => deck.id));
    expect(new Set(DECK_IDS).size).toBe(DECK_COUNT);
  });

  it('satisfies every deck invariant', () => {
    for (const deck of STARTER_DECKS) {
      expect(auditDeck(deck), deck.id).toStrictEqual([]);
    }
  });

  it('composes each deck from five element, three Neutral and two Shift cards', () => {
    for (const deck of STARTER_DECKS) {
      const cards = resolveDeckCards(deck);

      expect(deck.cards, deck.id).toHaveLength(DECK_SIZE);
      expect(new Set(deck.cards).size, `${deck.id} distinct`).toBe(DECK_SIZE);
      expect(
        cards.filter((card) => card.element === deck.element && card.type !== 'shift'),
        `${deck.id} element cards`,
      ).toHaveLength(DECK_ELEMENT_CARDS);
      expect(
        cards.filter((card) => card.element === 'neutral' && card.type !== 'shift'),
        `${deck.id} Neutral cards`,
      ).toHaveLength(DECK_NEUTRAL_CARDS);
      expect(
        cards.filter((card) => card.type === 'shift'),
        `${deck.id} Shift cards`,
      ).toHaveLength(DECK_SHIFT_CARDS);
    }
  });

  it('carries its own Shift and the Shift of the element it beats', () => {
    const pairs: readonly (readonly [FieldElement, FieldElement])[] = [
      ['ember', 'frost'],
      ['frost', 'gale'],
      ['gale', 'stone'],
      ['stone', 'ember'],
    ];

    for (const [element, beaten] of pairs) {
      const deck = deckByElement(element);

      expect(deck, element).toBeDefined();
      expect(FIELD_BEATS[element], `${element} beats`).toBe(beaten);
      expect(deck?.cards, `${element} own shift`).toContain(`shift-${element}`);
      expect(deck?.cards, `${element} beaten shift`).toContain(`shift-${beaten}`);
    }
  });

  it('resolves every deck card id against the catalog', () => {
    for (const deck of STARTER_DECKS) {
      for (const cardId of deck.cards) {
        expect(cardById(cardId), cardId).toBeDefined();
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The shipped enemies                                                         */
/* -------------------------------------------------------------------------- */

describe('enemies', () => {
  it('matches the documented enemy table verbatim', () => {
    expect(ENEMIES).toStrictEqual(EXPECTED_ENEMIES);
  });

  it('lists four unique enemy ids in ladder order', () => {
    expect(ENEMY_IDS).toStrictEqual(EXPECTED_ENEMIES.map((enemy) => enemy.id));
    expect(new Set(ENEMY_IDS).size).toBe(ENEMY_COUNT);
  });

  it('satisfies every enemy invariant', () => {
    expect(auditEnemies(ENEMIES)).toStrictEqual([]);
  });

  it('keeps the frozen health ladder 30, 35, 40, 60', () => {
    expect(ENEMIES.map((enemy) => enemy.maxHealth)).toStrictEqual([30, 35, 40, 60]);
  });

  it('gives the boss a 12-card deck with all four Shifts', () => {
    const boss = requireEnemy(ENEMIES, BOSS_ID);

    expect(boss.element).toBe('neutral');
    expect(boss.maxHealth).toBe(60);
    expect(boss.counterElementBias).toBe(true);
    expect(boss.deck).toHaveLength(BOSS_DECK_SIZE);

    for (const element of FIELD_ELEMENTS) {
      expect(boss.deck, `boss ${element} shift`).toContain(`shift-${element}`);
    }
  });

  it('gives every normal enemy a 10-card deck and no behaviour flag', () => {
    for (const enemy of ENEMIES) {
      if (enemy.element === 'neutral') {
        continue;
      }

      expect(enemy.deck, enemy.id).toHaveLength(ENEMY_DECK_SIZE);
      expect(enemy.counterElementBias, enemy.id).toBeUndefined();
    }
  });

  it('resolves every enemy deck card id against the catalog', () => {
    for (const enemy of ENEMIES) {
      for (const cardId of enemy.deck) {
        expect(cardById(cardId), `${enemy.id}: ${cardId}`).toBeDefined();
      }
    }
  });

  it('resolves every card id referenced anywhere in content', () => {
    const referenced = [
      ...STARTER_DECKS.flatMap((deck) => deck.cards),
      ...ENEMIES.flatMap((enemy) => enemy.deck),
    ];

    for (const cardId of referenced) {
      expect(cardById(cardId), cardId).toBeDefined();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The typed exports                                                           */
/* -------------------------------------------------------------------------- */

describe('deck and enemy lookups', () => {
  it('resolves every deck id to its own definition', () => {
    for (const deck of STARTER_DECKS) {
      expect(decksById[deck.id], deck.id).toBe(deck);
      expect(deckById(deck.id), deck.id).toBe(deck);
    }

    expect(Object.keys(decksById)).toHaveLength(DECK_COUNT);
  });

  it('resolves each starter element to its deck', () => {
    for (const deck of STARTER_DECKS) {
      expect(deckByElement(deck.element), deck.element).toBe(deck);
    }
  });

  it('returns undefined for unknown deck ids', () => {
    expect(decksById['deck-neutral']).toBeUndefined();
    expect(decksById['ember']).toBeUndefined();
    expect(deckById('unknown-deck')).toBeUndefined();
    expect(deckById('')).toBeUndefined();
  });

  it('resolves every enemy id to its own definition', () => {
    for (const enemy of ENEMIES) {
      expect(enemiesById[enemy.id], enemy.id).toBe(enemy);
      expect(enemyById(enemy.id), enemy.id).toBe(enemy);
    }

    expect(Object.keys(enemiesById)).toHaveLength(ENEMY_COUNT);
  });

  it('returns undefined for unknown enemy ids', () => {
    expect(enemiesById['enemy-unknown']).toBeUndefined();
    expect(enemiesById['cinder-warden']).toBeUndefined();
    expect(enemyById('unknown-enemy')).toBeUndefined();
    expect(enemyById('')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Auditing fixtures                                                           */
/* -------------------------------------------------------------------------- */

describe('deck audit fixtures', () => {
  it('fails the Ember deck when Frost Shift is replaced by a second Ember Shift', () => {
    const ember = requireDeck(STARTER_DECKS, 'deck-ember');
    const corrupted: DeckDefinition = {
      ...ember,
      cards: ember.cards.map((cardId) =>
        cardId === 'shift-frost' ? 'shift-ember' : cardId,
      ),
    };

    const issues = auditDeck(corrupted);

    expect(issues).toContain('deck "deck-ember" repeats card id "shift-ember" 2 times');
    expect(issues).toContain('deck "deck-ember" is missing shift card "shift-frost"');
  });

  it('reports the composition when an element card is swapped for Neutral', () => {
    const gale = requireDeck(STARTER_DECKS, 'deck-gale');
    const corrupted: DeckDefinition = {
      ...gale,
      cards: gale.cards.map((cardId) =>
        cardId === 'gale-updraft' ? 'neutral-sift' : cardId,
      ),
    };

    const issues = auditDeck(corrupted);

    expect(issues).toContain('deck "deck-gale" has 4 gale cards, expected 5');
    expect(issues).toContain('deck "deck-gale" has 4 Neutral cards, expected 3');
  });

  it('rejects an unknown card id in a deck', () => {
    const ember = requireDeck(STARTER_DECKS, 'deck-ember');
    const corrupted: DeckDefinition = {
      ...ember,
      cards: [...ember.cards.slice(0, DECK_SIZE - 1), 'shift-unknown'],
    };

    const issues = auditDeck(corrupted);

    expect(issues).toContain(
      'deck "deck-ember" references unknown card id "shift-unknown"',
    );
  });

  it('rejects a deck shorter than ten cards', () => {
    const stone = requireDeck(STARTER_DECKS, 'deck-stone');
    const issues = auditDeck({ ...stone, cards: stone.cards.slice(0, 9) });

    expect(issues).toContain('deck "deck-stone" has 9 cards, expected 10');
  });
});

describe('enemy audit fixtures', () => {
  it('fails the boss when one Shift is dropped', () => {
    const boss = requireEnemy(ENEMIES, BOSS_ID);
    const corrupted: EnemyDefinition = {
      ...boss,
      deck: boss.deck.filter((cardId) => cardId !== 'shift-stone'),
    };

    const issues = auditEnemy(corrupted);

    expect(issues).toContain('enemy "enemy-hollow-field" has 11 cards, expected 12');
    expect(issues).toContain(
      'boss deck "enemy-hollow-field" is missing shift card "shift-stone"',
    );
  });

  it('rejects a boss without the counter-element bias flag', () => {
    const boss = requireEnemy(ENEMIES, BOSS_ID);
    const withoutBias: EnemyDefinition = {
      id: boss.id,
      name: boss.name,
      element: boss.element,
      maxHealth: boss.maxHealth,
      deck: boss.deck,
    };

    const issues = auditEnemy(withoutBias);

    expect(issues).toContain(
      'boss "enemy-hollow-field" must declare counterElementBias',
    );
  });

  it('reports a broken health ladder', () => {
    const corrupted = ENEMIES.map((enemy) =>
      enemy.id === 'enemy-cinder-warden' ? { ...enemy, maxHealth: 31 } : enemy,
    );

    expect(auditEnemies(corrupted)).toContain(
      'enemy health ladder is 31, 35, 40, 60, expected 30, 35, 40, 60',
    );
  });

  it('reports a duplicated enemy id', () => {
    const issues = auditEnemies([...ENEMIES, requireEnemy(ENEMIES, BOSS_ID)]);

    expect(issues).toContain('enemy id "enemy-hollow-field" appears 2 times');
  });

  it('rejects an unknown card id in an enemy deck', () => {
    const herald = requireEnemy(ENEMIES, 'enemy-storm-herald');
    const corrupted: EnemyDefinition = {
      ...herald,
      deck: herald.deck.map((cardId) =>
        cardId === 'gale-updraft' ? 'gale-unknown' : cardId,
      ),
    };

    expect(auditEnemy(corrupted)).toContain(
      'enemy "enemy-storm-herald" references unknown card id "gale-unknown"',
    );
  });
});
