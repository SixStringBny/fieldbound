/**
 * Typed access to the four frozen v1 starter decks (CNT-FR-03, VIS-CON-07).
 *
 * `decks.json` is the single source of deck values: id, display name, built
 * element and the ordered list of card ids. This module re-exports that data
 * with the engine `DeckDefinition` type and builds the lookups consumers need:
 * by id and by starter element. It deliberately contains no shuffle, draw,
 * reward or affordability logic and no UI text; the engine and controllers own
 * behaviour (VIS-CON-08).
 *
 * Every deck is ten distinct cards: five of its own element, three Neutral
 * non-Shift cards and two Shift cards (its own element and the element it
 * beats). `content.test.ts` is the gate that proves it.
 */
import decksJson from './decks.json';
import type { DeckDefinition, FieldElement } from '../engine/types';

/**
 * The JSON module widens `element` to `string`, which no assertion can narrow
 * at compile time. `content.test.ts` proves every value against the engine
 * field-element union and the frozen deck table, so this cast is only the
 * bridge from JSON's inferred shape to the engine contract.
 */
export const STARTER_DECKS: readonly DeckDefinition[] =
  decksJson as unknown as readonly DeckDefinition[];

/** Deck ids in documented starter order: Ember, Frost, Gale, Stone. */
export const DECK_IDS: readonly string[] = STARTER_DECKS.map((deck) => deck.id);

/**
 * Id lookup. A `Record` (not a `Map`) so callers can index it directly;
 * indexing an unknown id yields `undefined` under `noUncheckedIndexedAccess`
 * and is never an exception.
 */
export const byId: Readonly<Record<string, DeckDefinition>> = Object.freeze(
  Object.fromEntries(STARTER_DECKS.map((deck) => [deck.id, deck] as const)),
);

/** Typed lookup with an explicit signature; returns `undefined` for unknown ids. */
export function deckById(id: string): DeckDefinition | undefined {
  return byId[id];
}

/**
 * Starter-element lookup. Solo setup and duel locking choose a deck from the
 * player's element, so they never need to know the concrete deck id.
 */
export function deckByElement(element: FieldElement): DeckDefinition | undefined {
  return STARTER_DECKS.find((deck) => deck.element === element);
}
