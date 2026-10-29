import { describe, expect, it } from 'vitest';
import {
  createRandomSeed,
  parseSeedParam,
  readSeedFromSearch,
  resolveRunSeed,
  SEED_MAX,
} from './seed';
import type { SeedSource } from './seed';

/* -------------------------------------------------------------------------- */
/* Deterministic random-source double                                          */
/* -------------------------------------------------------------------------- */

function fixedSource(values: readonly number[]): SeedSource {
  let index = 0;

  return {
    getRandomValues(target: Uint32Array): Uint32Array {
      for (let offset = 0; offset < target.length; offset += 1) {
        target[offset] = values[(index + offset) % values.length] ?? 0;
      }

      index += target.length;
      return target;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

describe('parseSeedParam', () => {
  it('accepts non-negative 32-bit integers', () => {
    expect(parseSeedParam('0')).toBe(0);
    expect(parseSeedParam('12345')).toBe(12_345);
    expect(parseSeedParam('007')).toBe(7);
    expect(parseSeedParam(String(SEED_MAX))).toBe(SEED_MAX);
  });

  it('rejects absent and malformed values instead of coercing them', () => {
    for (const value of [
      null,
      undefined,
      '',
      ' ',
      ' 123',
      '123 ',
      '-1',
      '+1',
      '1.5',
      '1e3',
      '0x10',
      'NaN',
      'abc',
      '123abc',
    ]) {
      expect(parseSeedParam(value), JSON.stringify(value)).toBeNull();
    }
  });

  it('rejects values above the unsigned 32-bit range', () => {
    expect(parseSeedParam(String(SEED_MAX + 1))).toBeNull();
    expect(parseSeedParam('99999999999999999999999')).toBeNull();
  });
});

describe('readSeedFromSearch', () => {
  it('reads the seed from a query string with or without the question mark', () => {
    expect(readSeedFromSearch('?seed=424242')).toBe(424_242);
    expect(readSeedFromSearch('seed=424242')).toBe(424_242);
    expect(readSeedFromSearch('?other=1&seed=9')).toBe(9);
  });

  it('returns null for a missing or invalid parameter', () => {
    expect(readSeedFromSearch('')).toBeNull();
    expect(readSeedFromSearch('?other=1')).toBeNull();
    expect(readSeedFromSearch('?seed=nope')).toBeNull();
    expect(readSeedFromSearch('?seed=')).toBeNull();
    expect(readSeedFromSearch('?seed=-5')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Generation and resolution                                                   */
/* -------------------------------------------------------------------------- */

describe('createRandomSeed', () => {
  it('returns the first unsigned 32-bit value from the supplied source', () => {
    expect(createRandomSeed(fixedSource([0xdead_beef]))).toBe(0xdead_beef);
    expect(createRandomSeed(fixedSource([0]))).toBe(0);
    expect(createRandomSeed(fixedSource([0xffff_ffff]))).toBe(0xffff_ffff);
  });

  it('never throws when the source does or returns nothing usable', () => {
    const broken: SeedSource = {
      getRandomValues() {
        throw new Error('no entropy');
      },
    };

    const seed = createRandomSeed(broken);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(SEED_MAX);

    const empty: SeedSource = {
      getRandomValues(target: Uint32Array): Uint32Array {
        return target;
      },
    };

    expect(createRandomSeed(empty)).toBeGreaterThanOrEqual(0);
  });
});

describe('resolveRunSeed', () => {
  it('prefers a valid query seed and reports its source', () => {
    const resolution = resolveRunSeed(
      '?seed=123456789',
      fixedSource([7]),
    );

    expect(resolution).toEqual({ seed: 123_456_789, source: 'query' });
  });

  it('ignores an invalid query value and generates one', () => {
    const resolution = resolveRunSeed(
      '?seed=not-a-number',
      fixedSource([99]),
    );

    expect(resolution).toEqual({ seed: 99, source: 'generated' });
  });

  it('ignores an out-of-range query value', () => {
    const resolution = resolveRunSeed(
      `?seed=${String(SEED_MAX + 1)}`,
      fixedSource([12]),
    );

    expect(resolution).toEqual({ seed: 12, source: 'generated' });
  });

  it('reads the seed only from the supplied query string', () => {
    const first = resolveRunSeed('?seed=5', fixedSource([1]));
    const second = resolveRunSeed('', fixedSource([2]));

    expect(first).toEqual({ seed: 5, source: 'query' });
    expect(second).toEqual({ seed: 2, source: 'generated' });
  });
});
