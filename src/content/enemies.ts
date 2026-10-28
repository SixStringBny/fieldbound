/**
 * Typed access to the four frozen v1 enemy definitions (CNT-FR-04, VIS-CON-07).
 *
 * `enemies.json` is the single source of enemy values: id, display name,
 * element, starting health and the ordered deck list. Repeated card ids are
 * meaningful second physical copies, exactly as the engine's `EnemyDefinition`
 * documents. This module re-exports the catalog in ladder order and builds an
 * id lookup; it contains no planning, intent or targeting logic (VIS-CON-08).
 *
 * The only behaviour flag in data is the documented boss `counterElementBias`;
 * the engine derives the concrete element from battle state. `content.test.ts`
 * is the gate for deck legality, the health ladder and the boss contract.
 */
import enemiesJson from './enemies.json';
import type { EnemyDefinition } from '../engine/types';

/**
 * The JSON module widens `element` to `string`, which no assertion can narrow
 * at compile time. `content.test.ts` proves every value against the engine
 * element union and the frozen enemy table, so this cast is only the bridge
 * from JSON's inferred shape to the engine contract.
 */
export const ENEMIES: readonly EnemyDefinition[] =
  enemiesJson as unknown as readonly EnemyDefinition[];

/** Enemy ids in documented ladder order, Cinder Warden through the boss. */
export const ENEMY_IDS: readonly string[] = ENEMIES.map((enemy) => enemy.id);

/**
 * Id lookup. A `Record` (not a `Map`) so callers can index it directly;
 * indexing an unknown id yields `undefined` under `noUncheckedIndexedAccess`
 * and is never an exception.
 */
export const byId: Readonly<Record<string, EnemyDefinition>> = Object.freeze(
  Object.fromEntries(ENEMIES.map((enemy) => [enemy.id, enemy] as const)),
);

/** Typed lookup with an explicit signature; returns `undefined` for unknown ids. */
export function enemyById(id: string): EnemyDefinition | undefined {
  return byId[id];
}
