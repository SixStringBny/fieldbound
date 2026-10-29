// @vitest-environment node
/**
 * Solo reward tests (RUN-FR-03).
 *
 * Two layers are exercised here:
 *
 *   1. Generation: the pool is the chosen element plus every Neutral card, the
 *      three offers are unique and reproducible for a PRNG state, and the third
 *      slot becomes `Heal 12` strictly below 20 health.
 *   2. Application: exactly one offer can be applied, a card grows the deck by
 *      one copy, a heal restores 12 capped at 40, and every second or unknown
 *      choice is a typed rejection.
 *
 * Fixture runs are plain `RunState` objects so boundary health values (19, 20,
 * 34, 40) never require simulating a battle; one integration test drives the
 * run model so the "heal before the reward" order is proven end to end.
 */
import { describe, expect, it, vi } from 'vitest';

import { CARDS, CARD_IDS } from '../content/cards';
import { deckByElement } from '../content/decks';
import { createRng } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { FIELD_ELEMENTS, PLAYER_MAX_HEALTH } from '../engine/types';
import type { FieldElement } from '../engine/types';
import {
  RUN_HEAL,
  RUN_MAX_HEALTH,
  RUN_SCHEMA_VERSION,
  applyBattleResult,
  createRun,
  startEncounter,
} from './run-model';
import type {
  RunBattleResult,
  RunResult,
  RunRewardChoice,
  RunState,
} from './run-model';
import {
  REWARD_HEAL_AMOUNT,
  REWARD_HEAL_THRESHOLD,
  REWARD_OFFER_COUNT,
  applyRewardChoice,
  generateRewardOffers,
  rewardPool,
  validateRewardOffers,
} from './rewards';
import type {
  RewardOffer,
  RewardOfferGeneration,
  RewardResult,
} from './rewards';

/* -------------------------------------------------------------------------- */
/* Helpers and fixtures                                                        */
/* -------------------------------------------------------------------------- */

function starterDeck(element: FieldElement): readonly string[] {
  const deck = deckByElement(element);

  if (deck === undefined) {
    throw new Error(`no starter deck for ${element}`);
  }

  return deck.cards;
}

/** Unwraps a successful result; a failure fails the test with its code. */
function ok<T>(result: RunResult<T> | RewardResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `expected success, received ${result.error.code}: ${result.error.message}`,
    );
  }

  return result.value;
}

/** Returns the typed code of a rejected result. */
function rejected(result: RewardResult<unknown>): string {
  if (result.ok) {
    throw new Error('expected a typed failure, received success');
  }

  return result.error.code;
}

/**
 * A run waiting for its first reward (encounter 0 already won). Health defaults
 * to 30 so the heal option stays absent; boundary tests override it.
 */
function rewardRun(overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    seed: 123_456_789,
    element: 'ember',
    health: 30,
    deck: [...starterDeck('ember')],
    encounterIndex: 1,
    turnsTotal: 9,
    cardsAdded: 1,
    damageTaken: 14,
    phase: 'reward',
    ...overrides,
  };
}

/** Generates offers for a fixture run and unwraps the result. */
function offersFor(
  run: RunState = rewardRun(),
  state: RngState = createRng(12_345),
): RewardOfferGeneration {
  return ok(generateRewardOffers(run, state));
}

function cardsOf(offers: readonly RewardOffer[]): string[] {
  return offers.flatMap((offer) => (offer.kind === 'card' ? [offer.cardId] : []));
}

/** A legal three-offer set for heal tests, with the heal in the third slot. */
function healOffers(element: FieldElement = 'ember'): readonly RewardOffer[] {
  const pool = rewardPool(element);
  const first = pool[0];
  const second = pool[1];

  if (first === undefined || second === undefined) {
    throw new Error('reward pool is too small for a fixture');
  }

  return [
    { kind: 'card', cardId: first.id },
    { kind: 'card', cardId: second.id },
    { kind: 'heal', amount: REWARD_HEAL_AMOUNT },
  ];
}

/* -------------------------------------------------------------------------- */
/* Frozen numbers                                                              */
/* -------------------------------------------------------------------------- */

describe('frozen reward numbers', () => {
  it('pins the offer count, the heal threshold and the heal amount', () => {
    expect(REWARD_OFFER_COUNT).toBe(3);
    expect(REWARD_HEAL_THRESHOLD).toBe(20);
    expect(REWARD_HEAL_AMOUNT).toBe(12);
    expect(REWARD_HEAL_AMOUNT).toBe(RUN_HEAL);
    expect(RUN_MAX_HEALTH).toBe(PLAYER_MAX_HEALTH);
  });
});

/* -------------------------------------------------------------------------- */
/* Pool                                                                        */
/* -------------------------------------------------------------------------- */

describe('rewardPool', () => {
  const neutralIds = CARDS.filter((card) => card.element === 'neutral').map(
    (card) => card.id,
  );

  it('holds the eight Neutral cards and the four Shift cards', () => {
    expect(neutralIds).toHaveLength(12);
    expect(neutralIds).toEqual(
      expect.arrayContaining([
        'neutral-plain-strike',
        'neutral-elemental-blow',
        'neutral-probe',
        'neutral-sift',
        'neutral-channel',
        'neutral-surge',
        'neutral-expose',
        'neutral-second-wind',
        'shift-ember',
        'shift-frost',
        'shift-gale',
        'shift-stone',
      ]),
    );
  });

  it.each([...FIELD_ELEMENTS])(
    'is exactly the %s cards plus Neutral, in catalog order',
    (element) => {
      const elementIds = CARDS.filter((card) => card.element === element).map(
        (card) => card.id,
      );
      const pool = rewardPool(element);

      expect(elementIds).toHaveLength(5);
      expect(pool.map((card) => card.id)).toEqual([...elementIds, ...neutralIds]);
      expect(pool).toHaveLength(17);
      expect(new Set(pool.map((card) => card.id)).size).toBe(17);

      for (const card of pool) {
        expect(card.element === element || card.element === 'neutral').toBe(
          true,
        );
      }
    },
  );

  it.each([...FIELD_ELEMENTS])(
    'excludes every other element from the %s pool',
    (element) => {
      const poolIds = new Set(rewardPool(element).map((card) => card.id));

      for (const other of FIELD_ELEMENTS.filter((value) => value !== element)) {
        for (const card of CARDS.filter((entry) => entry.element === other)) {
          expect(poolIds.has(card.id)).toBe(false);
        }
      }
    },
  );

  it('returns an empty pool for a value that is not a field element', () => {
    expect(rewardPool('arcane' as FieldElement)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Generation                                                                  */
/* -------------------------------------------------------------------------- */

describe('generateRewardOffers', () => {
  it('produces the same three offers and the same next state on repeat runs', () => {
    const run = rewardRun();
    const state = createRng(42);

    const first = offersFor(run, state);
    const second = offersFor(run, state);

    expect(first.offers).toEqual(second.offers);
    expect(first.rngState).toEqual(second.rngState);
    expect(first.offers).not.toBe(second.offers);
  });

  it('depends only on element, health and PRNG state, not carried totals', () => {
    const base = offersFor(rewardRun(), createRng(777));
    const differentTotals = offersFor(
      rewardRun({
        deck: [...starterDeck('ember'), 'neutral-probe'],
        turnsTotal: 41,
        cardsAdded: 7,
        damageTaken: 99,
      }),
      createRng(777),
    );

    expect(differentTotals.offers).toEqual(base.offers);
    expect(differentTotals.rngState).toEqual(base.rngState);
  });

  it('pins the seeded stream for the documented example seed', () => {
    const generation = offersFor(rewardRun(), createRng(12_345));

    expect(generation.offers).toEqual([
      { kind: 'card', cardId: 'shift-stone' },
      { kind: 'card', cardId: 'neutral-plain-strike' },
      { kind: 'card', cardId: 'neutral-sift' },
    ]);
    expect(generation.rngState).toEqual({ state: 1_199_742_488 });
  });

  it('returns three unique in-pool cards for many seeds and every element', () => {
    for (const element of FIELD_ELEMENTS) {
      const poolIds = new Set(rewardPool(element).map((card) => card.id));

      for (let seed = 0; seed < 40; seed += 1) {
        const run = rewardRun({ element, health: 30 });
        const state = createRng(seed);
        const generation = offersFor(run, state);

        expect(generation.offers).toHaveLength(REWARD_OFFER_COUNT);

        const ids = cardsOf(generation.offers);
        expect(ids).toHaveLength(REWARD_OFFER_COUNT);
        expect(new Set(ids).size).toBe(REWARD_OFFER_COUNT);

        for (const id of ids) {
          expect(poolIds.has(id)).toBe(true);
          expect(CARD_IDS).toContain(id);
        }

        expect(generation.rngState.state).not.toBe(state.state);
        expect(Number.isInteger(generation.rngState.state)).toBe(true);
        expect(generation.rngState.state).toBeGreaterThanOrEqual(0);
        expect(generation.rngState.state).toBeLessThanOrEqual(0xffff_ffff);
      }
    }
  });

  it('never mutates the run or the caller PRNG state', () => {
    const run = rewardRun();
    const snapshot = JSON.stringify(run);
    const state = createRng(99);
    const stateSnapshot = { ...state };

    offersFor(run, state);

    expect(JSON.stringify(run)).toBe(snapshot);
    expect(state).toEqual(stateSnapshot);
  });

  it('does not use Math.random', () => {
    const spy = vi.spyOn(Math, 'random');

    offersFor();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each(['overview', 'battle', 'victory', 'defeat'] as const)(
    'rejects generation in the %s phase',
    (phase) => {
      const result = generateRewardOffers(
        rewardRun({ phase }),
        createRng(1),
      );

      expect(rejected(result)).toBe('invalid-phase');
    },
  );

  it('rejects a reward run parked on the boss encounter', () => {
    const result = generateRewardOffers(
      rewardRun({ encounterIndex: 3 }),
      createRng(1),
    );

    expect(rejected(result)).toBe('invalid-encounter');
  });

  it('rejects a run whose element has no card pool', () => {
    const result = generateRewardOffers(
      rewardRun({ element: 'arcane' as FieldElement }),
      createRng(1),
    );

    expect(rejected(result)).toBe('invalid-element');
  });

  it.each([
    { state: -1 },
    { state: 1.5 },
    { state: 0x1_0000_0000 },
    { state: Number.NaN },
    {},
    null,
    7,
  ])('rejects the invalid PRNG state %s', (state) => {
    const result = generateRewardOffers(
      rewardRun(),
      state as unknown as RngState,
    );

    expect(rejected(result)).toBe('invalid-rng-state');
  });
});

/* -------------------------------------------------------------------------- */
/* Heal slot                                                                  */
/* -------------------------------------------------------------------------- */

describe('the third offer below 20 health', () => {
  it('replaces the third card with Heal 12 at 19 health', () => {
    const generation = offersFor(rewardRun({ health: 19 }));

    expect(generation.offers).toHaveLength(REWARD_OFFER_COUNT);
    expect(generation.offers[0]?.kind).toBe('card');
    expect(generation.offers[1]?.kind).toBe('card');
    expect(generation.offers[2]).toEqual({
      kind: 'heal',
      amount: REWARD_HEAL_AMOUNT,
    });
    expect(new Set(cardsOf(generation.offers)).size).toBe(2);
  });

  it.each([20, 21, 30, 40])('keeps three cards at %i health', (health) => {
    const generation = offersFor(rewardRun({ health }));

    expect(generation.offers).toHaveLength(REWARD_OFFER_COUNT);
    expect(generation.offers.every((offer) => offer.kind === 'card')).toBe(
      true,
    );
    expect(new Set(cardsOf(generation.offers)).size).toBe(REWARD_OFFER_COUNT);
  });

  it.each([0, 1, 10, 19])('offers the heal at %i health', (health) => {
    const generation = offersFor(rewardRun({ health }));

    expect(generation.offers[2]).toEqual({
      kind: 'heal',
      amount: REWARD_HEAL_AMOUNT,
    });
  });

  it('keeps the first two cards and the PRNG state identical on both sides of the boundary', () => {
    const low = offersFor(rewardRun({ health: 19 }), createRng(555));
    const high = offersFor(rewardRun({ health: 20 }), createRng(555));

    expect(low.offers.slice(0, 2)).toEqual(high.offers.slice(0, 2));
    expect(low.rngState).toEqual(high.rngState);
  });

  it('draws the third slot even when the heal replaces it', () => {
    const atZero = offersFor(rewardRun({ health: 0 }), createRng(31337));
    const atForty = offersFor(rewardRun({ health: 40 }), createRng(31337));

    expect(atZero.rngState).toEqual(atForty.rngState);
  });

  it('applies the heal before the reward in a real victory', () => {
    const created = ok(createRun('ember', 4242));
    const battle = ok(startEncounter(created));
    const result: RunBattleResult = {
      outcome: 'player-victory',
      turns: 6,
      damageTaken: 37,
      health: 3,
    };
    const won = ok(applyBattleResult(battle, result));

    expect(won.phase).toBe('reward');
    expect(won.health).toBe(15);

    const generation = offersFor(won, createRng(won.seed));

    expect(generation.offers[2]).toEqual({
      kind: 'heal',
      amount: REWARD_HEAL_AMOUNT,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Applying a card                                                            */
/* -------------------------------------------------------------------------- */

describe('applyRewardChoice with a card', () => {
  it('appends exactly one copy and advances the encounter', () => {
    const run = rewardRun();
    const generation = offersFor(run);
    const cardId = cardsOf(generation.offers)[0];

    if (cardId === undefined) {
      throw new Error('fixture offers contained no card');
    }

    const next = ok(
      applyRewardChoice(run, generation.offers, { kind: 'card', cardId }),
    );

    expect(next.deck).toHaveLength(run.deck.length + 1);
    expect(next.deck).not.toBe(run.deck);
    expect(next.deck).toEqual([...run.deck, cardId]);
    expect(next.cardsAdded).toBe(run.cardsAdded + 1);
    expect(next.encounterIndex).toBe(run.encounterIndex + 1);
    expect(next.phase).toBe('overview');
    expect(next.health).toBe(run.health);
    expect(next.turnsTotal).toBe(run.turnsTotal);
    expect(next.damageTaken).toBe(run.damageTaken);
    expect(next.element).toBe(run.element);
    expect(next.seed).toBe(run.seed);
  });

  it('applies an offer set that survived a JSON round-trip', () => {
    const run = rewardRun();
    const generation = offersFor(run);
    const stored: unknown = JSON.parse(JSON.stringify(generation.offers));
    const cardId = cardsOf(generation.offers)[0];

    if (cardId === undefined) {
      throw new Error('fixture offers contained no card');
    }

    const next = ok(
      applyRewardChoice(run, stored as readonly RewardOffer[], {
        kind: 'card',
        cardId,
      }),
    );

    expect(next.deck).toContain(cardId);
  });

  it('rejects the same choice a second time without duplicating the card', () => {
    const run = rewardRun();
    const generation = offersFor(run);
    const cardId = cardsOf(generation.offers)[0];

    if (cardId === undefined) {
      throw new Error('fixture offers contained no card');
    }

    const first = ok(
      applyRewardChoice(run, generation.offers, { kind: 'card', cardId }),
    );
    const second = applyRewardChoice(first, generation.offers, {
      kind: 'card',
      cardId,
    });

    expect(rejected(second)).toBe('invalid-phase');
    expect(first.deck).toEqual([...run.deck, cardId]);
    expect(first.cardsAdded).toBe(run.cardsAdded + 1);
    expect(first.encounterIndex).toBe(run.encounterIndex + 1);
  });

  it('rejects a different offer a second time too', () => {
    const run = rewardRun();
    const generation = offersFor(run);
    const [firstCard, secondCard] = cardsOf(generation.offers);

    if (firstCard === undefined || secondCard === undefined) {
      throw new Error('fixture offers contained fewer than two cards');
    }

    const first = ok(
      applyRewardChoice(run, generation.offers, {
        kind: 'card',
        cardId: firstCard,
      }),
    );
    const second = applyRewardChoice(first, generation.offers, {
      kind: 'card',
      cardId: secondCard,
    });

    expect(rejected(second)).toBe('invalid-phase');
    expect(first.deck).toEqual([...run.deck, firstCard]);
  });

  it('rejects a card that is in the pool but was not offered', () => {
    const run = rewardRun();
    const generation = offersFor(run);
    const offered = new Set(cardsOf(generation.offers));
    const notOffered = rewardPool(run.element).find(
      (card) => !offered.has(card.id),
    );

    if (notOffered === undefined) {
      throw new Error('every pool card was offered');
    }

    const snapshot = JSON.stringify(run);
    const result = applyRewardChoice(run, generation.offers, {
      kind: 'card',
      cardId: notOffered.id,
    });

    expect(rejected(result)).toBe('invalid-offer');
    expect(JSON.stringify(run)).toBe(snapshot);
  });

  it('rejects an offer set containing a card from another element', () => {
    const run = rewardRun({ element: 'ember' });
    const frost = CARDS.find((card) => card.element === 'frost');

    if (frost === undefined) {
      throw new Error('catalog has no frost card');
    }

    const offers: readonly RewardOffer[] = [
      { kind: 'card', cardId: frost.id },
      { kind: 'card', cardId: 'neutral-probe' },
      { kind: 'card', cardId: 'neutral-sift' },
    ];

    expect(
      rejected(applyRewardChoice(run, offers, { kind: 'card', cardId: frost.id })),
    ).toBe('invalid-offer');
  });

  it('rejects a duplicate card id in the offer set', () => {
    const run = rewardRun();
    const offers: readonly RewardOffer[] = [
      { kind: 'card', cardId: 'neutral-probe' },
      { kind: 'card', cardId: 'neutral-probe' },
      { kind: 'card', cardId: 'neutral-sift' },
    ];

    expect(
      rejected(
        applyRewardChoice(run, offers, {
          kind: 'card',
          cardId: 'neutral-probe',
        }),
      ),
    ).toBe('invalid-offer');
  });
});

/* -------------------------------------------------------------------------- */
/* Applying a heal                                                            */
/* -------------------------------------------------------------------------- */

describe('applyRewardChoice with a heal', () => {
  it('restores 12 health and appends no card', () => {
    const run = rewardRun({ health: 19 });
    const generation = offersFor(run);
    const next = ok(
      applyRewardChoice(run, generation.offers, { kind: 'heal' }),
    );

    expect(next.health).toBe(31);
    expect(next.deck).toEqual(run.deck);
    expect(next.deck).toHaveLength(run.deck.length);
    expect(next.cardsAdded).toBe(run.cardsAdded);
    expect(next.encounterIndex).toBe(run.encounterIndex + 1);
    expect(next.phase).toBe('overview');
    expect(next.turnsTotal).toBe(run.turnsTotal);
    expect(next.damageTaken).toBe(run.damageTaken);
  });

  it('caps the heal at 40 even though generation only offers it below 20', () => {
    const run = rewardRun({ health: 34 });
    const next = ok(
      applyRewardChoice(run, healOffers(), { kind: 'heal' }),
    );

    expect(next.health).toBe(40);
    expect(next.deck).toEqual(run.deck);
    expect(next.cardsAdded).toBe(run.cardsAdded);
  });

  it('never exceeds 40 from full health', () => {
    const run = rewardRun({ health: 40 });
    const next = ok(applyRewardChoice(run, healOffers(), { kind: 'heal' }));

    expect(next.health).toBe(40);
  });

  it('rejects the same heal a second time', () => {
    const run = rewardRun({ health: 19 });
    const generation = offersFor(run);
    const first = ok(applyRewardChoice(run, generation.offers, { kind: 'heal' }));
    const second = applyRewardChoice(first, generation.offers, {
      kind: 'heal',
    });

    expect(rejected(second)).toBe('invalid-phase');
    expect(first.health).toBe(31);
    expect(first.encounterIndex).toBe(run.encounterIndex + 1);
  });

  it('rejects a heal that was not offered', () => {
    const run = rewardRun({ health: 20 });
    const generation = offersFor(run);
    const snapshot = JSON.stringify(run);

    expect(
      rejected(applyRewardChoice(run, generation.offers, { kind: 'heal' })),
    ).toBe('invalid-offer');
    expect(JSON.stringify(run)).toBe(snapshot);
  });

  it.each([0, 1])('rejects a heal placed in offer slot %i', (index) => {
    const offers: RewardOffer[] = [
      { kind: 'card', cardId: 'neutral-probe' },
      { kind: 'card', cardId: 'neutral-sift' },
      { kind: 'card', cardId: 'neutral-channel' },
    ];
    offers[index] = { kind: 'heal', amount: REWARD_HEAL_AMOUNT };

    expect(rejected(applyRewardChoice(rewardRun({ health: 5 }), offers, { kind: 'heal' }))).toBe(
      'invalid-offer',
    );
  });

  it('rejects a retuned heal amount', () => {
    const offers: RewardOffer[] = [
      { kind: 'card', cardId: 'neutral-probe' },
      { kind: 'card', cardId: 'neutral-sift' },
      { kind: 'heal', amount: 13 },
    ];

    expect(
      rejected(applyRewardChoice(rewardRun({ health: 5 }), offers, { kind: 'heal' })),
    ).toBe('invalid-offer');
  });
});

/* -------------------------------------------------------------------------- */
/* Offer validation and choice shape                                          */
/* -------------------------------------------------------------------------- */

describe('validateRewardOffers', () => {
  it('rebuilds canonical offers from JSON and drops unknown fields', () => {
    const generation = offersFor(rewardRun({ health: 19 }));
    const stored: unknown = JSON.parse(
      JSON.stringify(generation.offers.map((offer) => ({ ...offer, name: 'x' }))),
    );

    const validated = ok(validateRewardOffers(stored, 'ember'));

    expect(validated).toEqual(generation.offers);
    expect(validated).not.toBe(stored);
    expect(validated[0]).not.toBe(generation.offers[0]);
  });

  it.each([
    ['not an array', null],
    ['too few options', [{ kind: 'card', cardId: 'neutral-probe' }]],
    ['too many options', new Array(4).fill({ kind: 'card', cardId: 'neutral-probe' })],
    ['an empty card id', [{ kind: 'card', cardId: '' }, { kind: 'card', cardId: 'neutral-probe' }, { kind: 'card', cardId: 'neutral-sift' }]],
    ['an unknown kind', [{ kind: 'skip' }, { kind: 'card', cardId: 'neutral-probe' }, { kind: 'card', cardId: 'neutral-sift' }]],
    ['a non-object entry', [1, { kind: 'card', cardId: 'neutral-probe' }, { kind: 'card', cardId: 'neutral-sift' }]],
  ])('rejects %s', (_label, input) => {
    expect(rejected(validateRewardOffers(input, 'ember'))).toBe('invalid-offer');
  });

  it('rejects an offer list for a value that is not a field element', () => {
    const generation = offersFor();

    expect(rejected(validateRewardOffers(generation.offers, 'arcane' as FieldElement))).toBe(
      'invalid-element',
    );
  });
});

describe('applyRewardChoice guards', () => {
  it.each(['overview', 'battle', 'victory', 'defeat'] as const)(
    'rejects a choice in the %s phase',
    (phase) => {
      const run = rewardRun({ phase });
      const result = applyRewardChoice(run, healOffers(), { kind: 'heal' });

      expect(rejected(result)).toBe('invalid-phase');
    },
  );

  it('rejects a non-object offer set', () => {
    const result = applyRewardChoice(
      rewardRun(),
      null as unknown as readonly RewardOffer[],
      { kind: 'heal' },
    );

    expect(rejected(result)).toBe('invalid-offer');
  });

  it('rejects a non-object choice', () => {
    const result = applyRewardChoice(
      rewardRun(),
      healOffers(),
      null as unknown as RunRewardChoice,
    );

    expect(rejected(result)).toBe('invalid-reward');
  });

  it('rejects a card choice without a card id', () => {
    const result = applyRewardChoice(
      rewardRun(),
      healOffers(),
      { kind: 'card', cardId: '' },
    );

    expect(rejected(result)).toBe('invalid-reward');
  });

  it('rejects an unknown choice kind', () => {
    const result = applyRewardChoice(
      rewardRun(),
      healOffers(),
      { kind: 'skip' } as unknown as RunRewardChoice,
    );

    expect(rejected(result)).toBe('invalid-reward');
  });

  it('leaves the deck and totals untouched on every rejection', () => {
    const run = rewardRun({ health: 19 });
    const generation = offersFor(run);
    const snapshot = JSON.stringify(run);

    applyRewardChoice(run, generation.offers, {
      kind: 'card',
      cardId: 'ember-inferno-not-offered',
    });

    expect(JSON.stringify(run)).toBe(snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* Totality guard                                                             */
/* -------------------------------------------------------------------------- */

describe('a PRNG stream that cannot produce unique offers', () => {
  it('fails with a typed error instead of looping forever', async () => {
    vi.resetModules();
    vi.doMock('../engine/rng', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../engine/rng')>();

      return {
        ...actual,
        nextUint32: (state: RngState) => {
          const draw = actual.nextUint32(state);

          return { state: draw.state, value: 0 };
        },
      };
    });

    try {
      const rewards = await import('./rewards');
      const result = rewards.generateRewardOffers(rewardRun(), createRng(5));

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.error.code).toBe('reward-draw-exhausted');
      }
    } finally {
      vi.doUnmock('../engine/rng');
      vi.resetModules();
    }
  });
});
