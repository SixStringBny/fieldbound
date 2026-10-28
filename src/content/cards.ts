/**
 * Typed access to the frozen v1 card catalog (CNT-FR-01, CNT-FR-02, VIS-CON-07).
 *
 * `cards.json` is the single source of card values: id, name, element, type,
 * cost and effect descriptors. This module re-exports that data with the engine
 * types and builds the id lookup consumers hand to the engine as a
 * `CardCatalog`. It deliberately contains no damage, draw, status or
 * affordability logic, no UI text branching and no storage access; every number
 * and every effect is interpreted by `src/engine` (VIS-CON-08).
 *
 * `cards.test.ts` is the gate: it freezes the table, checks the counts and
 * per-element roles, and rejects any id the lookup cannot resolve.
 */
import cardsJson from './cards.json';
import type { CardDefinition } from '../engine/types';

/**
 * The JSON module widens `element` and `type` to `string`, which no assertion
 * can narrow at compile time. `cards.test.ts` proves every value against the
 * engine unions and the frozen table, so this cast is only the bridge from
 * JSON's inferred shape to the engine contract.
 */
export const CARDS: readonly CardDefinition[] =
  cardsJson as unknown as readonly CardDefinition[];

/** Card ids in documented catalog order. */
export const CARD_IDS: readonly string[] = CARDS.map((card) => card.id);

/**
 * Id lookup. A `Record` (not a `Map`) so it can be passed straight to the
 * engine as a `CardCatalog`; indexing with an unknown id yields `undefined`
 * under `noUncheckedIndexedAccess` and is never an exception.
 */
export const byId: Readonly<Record<string, CardDefinition>> = Object.freeze(
  Object.fromEntries(CARDS.map((card) => [card.id, card] as const)),
);

/** Typed lookup with an explicit signature; returns `undefined` for unknown ids. */
export function cardById(id: string): CardDefinition | undefined {
  return byId[id];
}
