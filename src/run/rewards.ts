/**
 * Seeded reward offers and the one mandatory reward choice (RUN-FR-03).
 *
 * After every normal-encounter victory the solo run waits in its `reward`
 * phase for exactly one choice. This module builds the three options from the
 * run PRNG and gates the choice; `src/run/run-model.ts` still owns the state
 * transition, so reward application is one atomic step and a second choice is
 * rejected by the phase guard.
 *
 * Invariants
 * ----------
 *
 *   - the pool is the run element's five cards plus all twelve Neutral cards
 *     (eight Neutral plus the four Shift cards - card-content.md open question
 *     3 makes Shift cards reward-eligible), so every element has 17 cards;
 *   - three distinct card ids are drawn with `nextUint32`; a duplicate draw is
 *     retried, so an offer never repeats a card id and never leaves the pool;
 *   - the third slot is replaced by `Heal 12` only when health is strictly
 *     below 20. The third draw is still consumed and then discarded, so the
 *     PRNG state after a reward is identical at 19 and at 20 health;
 *   - the first two slots are never replaced, so a low-health reward still
 *     shows three options.
 *
 * Determinism
 * -----------
 *
 * The run PRNG state lives beside the run (see the `RunSaveV1` contract), not
 * inside `RunState`. Every function therefore takes the state it needs and
 * returns the advanced state; nothing is read from the clock, crypto or
 * `Math.random`, and the input run and state objects are never mutated.
 *
 * The module is pure: no storage, React, controller or screen import.
 */
import { CARDS } from '../content/cards';
import { isValidRngState, nextUint32 } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { FIELD_ELEMENTS } from '../engine/types';
import type { CardDefinition, FieldElement } from '../engine/types';
import { RUN_HEAL, isBossEncounter, resolveReward } from './run-model';
import type {
  RunErrorCode,
  RunRewardChoice,
  RunState,
} from './run-model';

/* -------------------------------------------------------------------------- */
/* Frozen reward numbers                                                       */
/* -------------------------------------------------------------------------- */

/** Every reward shows exactly three options, heal included. */
export const REWARD_OFFER_COUNT = 3;

/**
 * Health below which the third card offer becomes `Heal 12`. The boundary is
 * strict: 19 health offers the heal, exactly 20 does not.
 */
export const REWARD_HEAL_THRESHOLD = 20;

/** Health restored by the heal option; the same frozen number as a win heal. */
export const REWARD_HEAL_AMOUNT = RUN_HEAL;

/* -------------------------------------------------------------------------- */
/* Offer model                                                                 */
/* -------------------------------------------------------------------------- */

/** One card option. Only the id travels; the catalog owns name, cost and text. */
export interface RewardCardOffer {
  readonly kind: 'card';
  readonly cardId: string;
}

/**
 * The low-health option. `amount` is carried so a screen can render the option
 * without importing a constant, and is always `REWARD_HEAL_AMOUNT`.
 */
export interface RewardHealOffer {
  readonly kind: 'heal';
  readonly amount: number;
}

/** A plain-JSON, serializable reward option (safe to store as `pendingReward`). */
export type RewardOffer = RewardCardOffer | RewardHealOffer;

/** The three options plus the PRNG state the caller must persist next. */
export interface RewardOfferGeneration {
  readonly offers: readonly RewardOffer[];
  /** State after the fixed three-slot draw sequence. */
  readonly rngState: RngState;
}

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

/** Run rejections plus the reward-specific ones this module can produce. */
export type RewardErrorCode =
  | RunErrorCode
  | 'invalid-rng-state'
  | 'invalid-offer'
  | 'insufficient-reward-pool'
  | 'reward-draw-exhausted';

export interface RewardError {
  readonly code: RewardErrorCode;
  readonly message: string;
}

export interface RewardSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface RewardFailure {
  readonly ok: false;
  readonly error: RewardError;
}

/** Discriminated result for every fallible reward function. */
export type RewardResult<T> = RewardSuccess<T> | RewardFailure;

function failure(
  code: RewardErrorCode,
  message: string,
): RewardFailure {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* Pool                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Legal reward cards for an element: its own five cards plus all Neutral cards,
 * in catalog order. The order only matters for the "outside the pool" check and
 * for readable test failures; selection uses PRNG indices, not this order.
 *
 * A value that is not a field element yields an empty pool, which callers treat
 * as a corrupt run rather than clamping to Neutral.
 */
export function rewardPool(element: FieldElement): readonly CardDefinition[] {
  if (!FIELD_ELEMENTS.includes(element)) {
    return [];
  }

  return CARDS.filter(
    (card) => card.element === element || card.element === 'neutral',
  );
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

const UINT32_RANGE = 0x1_0000_0000;

interface DrawnOffers {
  readonly cards: readonly [CardDefinition, CardDefinition, CardDefinition];
  readonly rngState: RngState;
}

/**
 * Draws three distinct cards by index, consuming one draw per slot plus one
 * extra draw per duplicate index. The attempt ceiling is a totality guard: a
 * hostile constant stream can never loop forever, it fails with a typed error.
 */
function drawUniqueCards(
  pool: readonly CardDefinition[],
  state: RngState,
): RewardResult<DrawnOffers> {
  if (pool.length < REWARD_OFFER_COUNT) {
    return failure(
      'insufficient-reward-pool',
      `a reward needs ${String(REWARD_OFFER_COUNT)} distinct cards, the pool holds ${String(pool.length)}`,
    );
  }

  const maxDraws = REWARD_OFFER_COUNT * pool.length;
  const chosenIndices = new Set<number>();
  const cards: CardDefinition[] = [];
  let current = state;
  let draws = 0;

  while (cards.length < REWARD_OFFER_COUNT) {
    if (draws >= maxDraws) {
      return failure(
        'reward-draw-exhausted',
        `the PRNG produced no unique reward card in ${String(maxDraws)} draws`,
      );
    }

    const draw = nextUint32(current);
    current = draw.state;
    draws += 1;

    const index = Math.floor((draw.value * pool.length) / UINT32_RANGE);

    if (chosenIndices.has(index)) {
      continue;
    }

    const card = pool[index];

    if (card === undefined) {
      // Unreachable: the index is scaled below `pool.length`. Kept so the
      // function stays total under `noUncheckedIndexedAccess`.
      return failure(
        'insufficient-reward-pool',
        `reward pool index ${String(index)} is missing`,
      );
    }

    chosenIndices.add(index);
    cards.push(card);
  }

  const [first, second, third] = cards;

  if (first === undefined || second === undefined || third === undefined) {
    return failure(
      'insufficient-reward-pool',
      'the reward draw did not produce three cards',
    );
  }

  return {
    ok: true,
    value: { cards: [first, second, third] as const, rngState: current },
  };
}

/**
 * Builds the three offers for a run that has just won a normal encounter.
 *
 * The run must already be in the `reward` phase (run-model heals 12 before
 * entering it), which is what makes a boss victory unable to reach this
 * function: it is in `victory` with no reward. The third draw always happens,
 * even when health replaces its result with the heal option.
 */
export function generateRewardOffers(
  run: RunState,
  rngState: RngState,
): RewardResult<RewardOfferGeneration> {
  if (run.phase !== 'reward') {
    return failure(
      'invalid-phase',
      `rewards are only offered after a normal victory, not in the ${run.phase} phase`,
    );
  }

  if (isBossEncounter(run)) {
    return failure(
      'invalid-encounter',
      'the boss encounter ends the run without a reward',
    );
  }

  const pool = rewardPool(run.element);

  if (pool.length === 0) {
    return failure(
      'invalid-element',
      `no reward cards exist for element ${String(run.element)}`,
    );
  }

  if (!isValidRngState(rngState)) {
    return failure(
      'invalid-rng-state',
      'the run PRNG state must contain an unsigned 32-bit integer',
    );
  }

  const drawn = drawUniqueCards(pool, rngState);

  if (!drawn.ok) {
    return drawn;
  }

  const offers: RewardOffer[] = drawn.value.cards.map(
    (card): RewardOffer => ({ kind: 'card', cardId: card.id }),
  );

  if (run.health < REWARD_HEAL_THRESHOLD) {
    offers[REWARD_OFFER_COUNT - 1] = {
      kind: 'heal',
      amount: REWARD_HEAL_AMOUNT,
    };
  }

  return {
    ok: true,
    value: { offers, rngState: drawn.value.rngState },
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validates an untrusted offer list for an element and rebuilds canonical
 * offers. Total: unknown shapes, duplicates, out-of-pool ids, a heal in the
 * wrong slot and a non-frozen heal amount are typed failures, never a partial
 * list. `pendingReward` in the run save uses this before restoring a screen.
 *
 * The below-20 rule belongs to generation, not here: a stored offer set is
 * self-describing and is validated against the pool and the slot contract.
 */
export function validateRewardOffers(
  input: unknown,
  element: FieldElement,
): RewardResult<readonly RewardOffer[]> {
  const pool = rewardPool(element);

  if (pool.length === 0) {
    return failure(
      'invalid-element',
      `no reward cards exist for element ${String(element)}`,
    );
  }

  if (!Array.isArray(input)) {
    return failure('invalid-offer', 'reward offers must be an array');
  }

  if (input.length !== REWARD_OFFER_COUNT) {
    return failure(
      'invalid-offer',
      `reward offers must hold exactly ${String(REWARD_OFFER_COUNT)} options, received ${String(input.length)}`,
    );
  }

  const poolIds = new Set(pool.map((card) => card.id));
  const seen = new Set<string>();
  const offers: RewardOffer[] = [];
  const lastIndex = REWARD_OFFER_COUNT - 1;

  for (const [index, entry] of input.entries()) {
    if (!isRecord(entry)) {
      return failure(
        'invalid-offer',
        `offer ${String(index + 1)} must be an object`,
      );
    }

    if (entry.kind === 'card') {
      const cardId = entry.cardId;

      if (typeof cardId !== 'string' || cardId.length === 0) {
        return failure(
          'invalid-offer',
          `offer ${String(index + 1)} needs a non-empty card id`,
        );
      }

      if (!poolIds.has(cardId)) {
        return failure(
          'invalid-offer',
          `offer ${String(index + 1)} (${cardId}) is outside the ${element}-plus-Neutral pool`,
        );
      }

      if (seen.has(cardId)) {
        return failure(
          'invalid-offer',
          `offer ${String(index + 1)} repeats card ${cardId}`,
        );
      }

      seen.add(cardId);
      offers.push({ kind: 'card', cardId });
      continue;
    }

    if (entry.kind === 'heal') {
      if (index !== lastIndex) {
        return failure(
          'invalid-offer',
          'a heal option only ever replaces the third offer',
        );
      }

      if (entry.amount !== REWARD_HEAL_AMOUNT) {
        return failure(
          'invalid-offer',
          `a heal offer restores exactly ${String(REWARD_HEAL_AMOUNT)}, received ${String(entry.amount)}`,
        );
      }

      offers.push({ kind: 'heal', amount: REWARD_HEAL_AMOUNT });
      continue;
    }

    return failure(
      'invalid-offer',
      `offer ${String(index + 1)} must be a card or heal option`,
    );
  }

  return { ok: true, value: offers };
}

/* -------------------------------------------------------------------------- */
/* Choice                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Applies exactly one choice from the displayed offers.
 *
 * The offer set is re-validated first, so a hand-built out-of-pool or duplicate
 * offer can never grow the deck, and the choice must match one of the three
 * options. The transition itself is delegated to `resolveReward`, which leaves
 * the `reward` phase; a second call - same choice or a different one - is
 * therefore rejected with `invalid-phase` and cannot duplicate a card.
 *
 * The heal cap is not re-derived here: `resolveReward` applies the frozen
 * `RUN_HEAL` against `RUN_MAX_HEALTH`, so a heal at 34 health yields 40.
 */
export function applyRewardChoice(
  run: RunState,
  offers: readonly RewardOffer[],
  choice: RunRewardChoice,
): RewardResult<RunState> {
  if (run.phase !== 'reward') {
    return failure(
      'invalid-phase',
      `no reward is pending in the ${run.phase} phase`,
    );
  }

  const validated = validateRewardOffers(offers, run.element);

  if (!validated.ok) {
    return validated;
  }

  if (typeof choice !== 'object' || choice === null) {
    return failure('invalid-reward', 'a reward choice must be an object');
  }

  const offered = validated.value;

  if (choice.kind === 'card') {
    if (typeof choice.cardId !== 'string' || choice.cardId.length === 0) {
      return failure(
        'invalid-reward',
        'a card reward needs a non-empty card id',
      );
    }

    const match = offered.find(
      (offer): offer is RewardCardOffer =>
        offer.kind === 'card' && offer.cardId === choice.cardId,
    );

    if (match === undefined) {
      return failure(
        'invalid-offer',
        `${choice.cardId} is not one of the three offered cards`,
      );
    }

    return resolveReward(run, { kind: 'card', cardId: match.cardId });
  }

  if (choice.kind === 'heal') {
    if (!offered.some((offer) => offer.kind === 'heal')) {
      return failure('invalid-offer', 'no heal option was offered');
    }

    return resolveReward(run, { kind: 'heal' });
  }

  return failure(
    'invalid-reward',
    `unknown reward kind ${String((choice as { kind?: unknown }).kind)}`,
  );
}
