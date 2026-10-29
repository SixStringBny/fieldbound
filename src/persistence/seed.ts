/**
 * Solo-run seed resolution (RUN-FR-08, VIS-NFR-04).
 *
 * A solo run is fixed by one unsigned 32-bit seed. The seed is read once, when
 * the run is created:
 *
 *   - `?seed=12345` (a non-negative integer that fits in 32 bits) fixes it;
 *   - an absent, malformed or out-of-range value is ignored and a fresh random
 *     seed is generated instead;
 *   - a value that appears after the run has started has no effect, because the
 *     composition root only calls this module from Start Run.
 *
 * Randomness comes from `crypto.getRandomValues`, never `Math.random`: the run
 * PRNG is the single gameplay source, and the created seed is then persisted, so
 * a reload continues the same sequence. A host without `crypto` falls back to a
 * time-and-counter value; that is only a seed *choice*, never a gameplay draw.
 *
 * This module owns no storage key and imports no React, screen or engine
 * mutator. It is pure apart from reading the supplied random source.
 */

/** Query parameter that fixes the run seed. */
export const SEED_QUERY_PARAMETER = 'seed';

/** Largest value an unsigned 32-bit seed may take. */
export const SEED_MAX = 0xffff_ffff;

/**
 * The minimum random-source surface needed. `Crypto` satisfies it, so the
 * browser source can be passed directly and tests can pass a deterministic
 * double.
 */
export interface SeedSource {
  getRandomValues(target: Uint32Array): Uint32Array;
}

/** Why a seed has the value it does. */
export type RunSeedSource = 'query' | 'generated';

/** A resolved run seed and where it came from. */
export interface RunSeedResolution {
  readonly seed: number;
  readonly source: RunSeedSource;
}

/**
 * Parse one query value into a seed.
 *
 * Only a plain decimal integer is accepted. Whitespace, a sign, a decimal
 * point, exponent notation, an empty value and anything above `SEED_MAX` are
 * rejected with `null`, so a malformed parameter is ignored rather than
 * silently coerced into a different run.
 */
export function parseSeedParam(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > SEED_MAX) {
    return null;
  }

  return parsed;
}

/**
 * Read the seed from a query string such as `?seed=12345` or `seed=12345`.
 * A missing parameter and a malformed one are both `null`.
 */
export function readSeedFromSearch(search: string): number | null {
  const query = search.startsWith('?') ? search.slice(1) : search;

  return parseSeedParam(new URLSearchParams(query).get(SEED_QUERY_PARAMETER));
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                  */
/* -------------------------------------------------------------------------- */

/** Used only to keep two generated seeds in the same millisecond distinct. */
let generatedSeedCounter = 0;

function fallbackSeed(): number {
  generatedSeedCounter = (generatedSeedCounter + 1) >>> 0;

  return (Date.now() ^ Math.imul(generatedSeedCounter, 0x9e3779b1)) >>> 0;
}

/**
 * Produce a random unsigned 32-bit seed. `source` is injectable for tests;
 * omit it in production to read `globalThis.crypto`. A missing or broken source
 * falls back to a time-and-counter value, so starting a run never throws.
 */
export function createRandomSeed(
  source?: SeedSource | null,
): number {
  const resolved =
    source === undefined
      ? typeof globalThis.crypto === 'undefined'
        ? null
        : globalThis.crypto
      : source;

  if (resolved !== null) {
    try {
      const draw = new Uint32Array(1);
      resolved.getRandomValues(draw);

      const value = draw[0];

      if (value !== undefined) {
        return value >>> 0;
      }
    } catch {
      // A hostile or unavailable random source is not a reason to fail a run.
    }
  }

  return fallbackSeed();
}

/**
 * Resolve the seed for a new run: the query parameter when it is a valid
 * integer, otherwise a generated 32-bit value. The returned `source` lets the
 * caller describe the choice without re-parsing the query.
 */
export function resolveRunSeed(
  search: string,
  source?: SeedSource | null,
): RunSeedResolution {
  const querySeed = readSeedFromSearch(search);

  if (querySeed !== null) {
    return { seed: querySeed, source: 'query' };
  }

  return { seed: createRandomSeed(source), source: 'generated' };
}
