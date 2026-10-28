// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  createRng,
  isValidRngState,
  nextUint32,
  restoreRng,
  serializeRng,
  shuffle,
} from './rng';
import type { RngState } from './rng';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

/** 2^32, the modulus of the generator's 32-bit arithmetic. */
const UINT32_RANGE = 0x1_0000_0000;

/** Built at runtime so this test file never matches its own guard. */
const MATH_RANDOM = ['Math', 'random'].join('.');

const TEN_CARDS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
] as const;

function drawSequence(from: RngState, count: number): number[] {
  const values: number[] = [];
  let state = from;

  for (let index = 0; index < count; index += 1) {
    const draw = nextUint32(state);
    values.push(draw.value);
    state = draw.state;
  }

  return values;
}

function advance(from: RngState, draws: number): RngState {
  let state = from;

  for (let index = 0; index < draws; index += 1) {
    state = nextUint32(state).state;
  }

  return state;
}

interface EngineSource {
  readonly file: string;
  readonly source: string;
}

function productionSources(directory: string): EngineSource[] {
  const sources: EngineSource[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      sources.push(...productionSources(path));
      continue;
    }

    const isTest = entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts');
    if (entry.isFile() && entry.name.endsWith('.ts') && !isTest) {
      sources.push({
        file: relative(ENGINE_DIR, path),
        source: readFileSync(path, 'utf8'),
      });
    }
  }

  return sources;
}

describe('createRng', () => {
  it('normalizes a seed into an unsigned 32-bit state', () => {
    expect(createRng(0)).toEqual({ state: 0 });
    expect(createRng(12345)).toEqual({ state: 12345 });
    expect(createRng(0xffffffff)).toEqual({ state: 0xffffffff });
  });

  it('rejects seeds that are not unsigned 32-bit integers', () => {
    for (const seed of [-1, 1.5, Number.NaN, 0x1_0000_0000, Number.POSITIVE_INFINITY]) {
      expect(() => createRng(seed)).toThrow(RangeError);
    }
  });
});

describe('nextUint32', () => {
  it('reproduces the same 100-value sequence for the same seed on repeat runs', () => {
    const first = drawSequence(createRng(987654321), 100);
    const second = drawSequence(createRng(987654321), 100);

    expect(first).toHaveLength(100);
    expect(first).toEqual(second);
  });

  it('produces a different sequence for a different seed', () => {
    expect(drawSequence(createRng(1), 20)).not.toEqual(
      drawSequence(createRng(2), 20),
    );
  });

  it('returns unsigned 32-bit integers', () => {
    let state = createRng(0);

    for (let index = 0; index < 500; index += 1) {
      const draw = nextUint32(state);

      expect(Number.isInteger(draw.value)).toBe(true);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThanOrEqual(0xffffffff);
      state = draw.state;
    }
  });

  it('advances without mutating the state passed in', () => {
    const state = createRng(42);
    const before = { ...state };

    const draw = nextUint32(state);

    expect(state).toEqual(before);
    expect(draw.state).not.toBe(state);
    expect(draw.state.state).not.toBe(state.state);
  });

  it('matches the frozen v1 reference vector', () => {
    let state = createRng(12345);
    const values: number[] = [];

    for (let index = 0; index < 6; index += 1) {
      const draw = nextUint32(state);
      values.push(draw.value);
      state = draw.state;
    }

    expect(values).toEqual([
      4207900869, 1317490944, 2079646450, 3513001552, 2187978186, 1492380277,
    ]);
    expect(state).toEqual({ state: 2399472631 });
  });

  it('matches the frozen v1 100-value vector for a repeated seed', () => {
    // Digest of 100 draws from seed 987654321: sum modulo 2^32, XOR, final
    // value and final state. Computed with an independent mulberry32
    // implementation, so this pins the algorithm instead of re-deriving it.
    let state = createRng(987654321);
    let sum = 0;
    let xor = 0;
    let last = 0;

    for (let index = 0; index < 100; index += 1) {
      const draw = nextUint32(state);
      last = draw.value;
      sum = (sum + draw.value) % UINT32_RANGE;
      xor = (xor ^ draw.value) >>> 0;
      state = draw.state;
    }

    expect({ sum, xor, last, state: state.state }).toEqual({
      sum: 655370534,
      xor: 3012472884,
      last: 3458240563,
      state: 3755609189,
    });
  });
});

describe('shuffle', () => {
  it('produces the same shuffle for the same seed on repeat runs', () => {
    const first = shuffle(TEN_CARDS, createRng(777));
    const second = shuffle(TEN_CARDS, createRng(777));

    expect(first.items).toEqual(second.items);
    expect(first.state).toEqual(second.state);
  });

  it('matches the frozen v1 shuffle reference vector', () => {
    const result = shuffle(TEN_CARDS, createRng(12345));

    expect(result.items).toEqual([
      'g',
      'e',
      'i',
      'a',
      'b',
      'h',
      'f',
      'd',
      'c',
      'j',
    ]);
    expect(result.state).toEqual({ state: 3599202774 });
  });

  it('returns a permutation with no duplicated or dropped entries', () => {
    for (const size of [0, 1, 2, 3, 10, 52]) {
      const items = Array.from({ length: size }, (_unused, index) => `card-${index}`);
      const result = shuffle(items, createRng(1000 + size));

      expect(result.items).toHaveLength(size);
      expect([...result.items].sort()).toEqual([...items].sort());
      expect(new Set(result.items).size).toBe(size);
    }
  });

  it('keeps undefined entries when the shuffled array contains them', () => {
    const items: (string | undefined)[] = ['a', undefined, 'b', undefined, 'c'];

    const result = shuffle(items, createRng(8));

    expect(result.items).toHaveLength(items.length);
    expect(result.items.map((item) => String(item)).sort()).toEqual(
      items.map((item) => String(item)).sort(),
    );
  });

  it('keeps duplicate card ids when a deck contains duplicates', () => {
    const deck = [
      'ember-cinder-jab',
      'ember-cinder-jab',
      'neutral-probe',
      'shift-frost',
    ] as const;

    const result = shuffle(deck, createRng(3));

    expect(result.items).toHaveLength(deck.length);
    expect([...result.items].sort()).toEqual([...deck].sort());
  });

  it('never mutates the input array', () => {
    const deck = ['a', 'b', 'c', 'd', 'e'];
    const before = [...deck];

    const result = shuffle(deck, createRng(5));

    expect(deck).toEqual(before);
    expect(result.items).not.toBe(deck);
  });

  it('consumes exactly one draw per position, n-1 in total', () => {
    const deck = Array.from({ length: 12 }, (_unused, index) => `card-${index}`);

    const result = shuffle(deck, createRng(99));

    expect(result.state).toEqual(advance(createRng(99), deck.length - 1));
  });

  it('consumes no draws for empty or single-element arrays', () => {
    expect(shuffle([], createRng(7)).state).toEqual(createRng(7));
    expect(shuffle(['solo'], createRng(7)).state).toEqual(createRng(7));
  });

  it('produces different permutations for different seeds', () => {
    const first = shuffle(TEN_CARDS, createRng(2024));
    const second = shuffle(TEN_CARDS, createRng(2025));

    expect(first.items).not.toEqual(second.items);
  });
});

describe('serializeRng and restoreRng', () => {
  it('serializes to a plain JSON object with only the unsigned state', () => {
    const serialized = serializeRng({ state: 0xffffffff });

    expect(serialized).toEqual({ state: 0xffffffff });
    expect(Object.keys(serialized)).toEqual(['state']);
    expect(JSON.parse(JSON.stringify(serialized))).toEqual({ state: 4294967295 });
  });

  it('returns a fresh object rather than the live state', () => {
    const state: RngState = { state: 1234 };

    const serialized = serializeRng(state);

    expect(serialized).toEqual(state);
    expect(serialized).not.toBe(state);
  });

  it('restores a JSON-round-tripped state and continues the exact sequence', () => {
    const advanced = advance(createRng(2468), 9);
    const wire: unknown = JSON.parse(JSON.stringify(serializeRng(advanced)));

    expect(isValidRngState(wire)).toBe(true);
    const restored = restoreRng(wire);

    expect(restored).toEqual(advanced);
    expect(drawSequence(restored, 50)).toEqual(drawSequence(advanced, 50));
  });

  it('restores the same shuffle outcome', () => {
    const advanced = advance(createRng(11), 2);
    const restored = restoreRng(serializeRng(advanced));

    expect(shuffle(TEN_CARDS, restored)).toEqual(shuffle(TEN_CARDS, advanced));
  });

  it('accepts the boundary states 0 and 4294967295', () => {
    expect(isValidRngState({ state: 0 })).toBe(true);
    expect(isValidRngState({ state: 0xffffffff })).toBe(true);
    expect(restoreRng({ state: 0 })).toEqual({ state: 0 });
    expect(restoreRng({ state: 0xffffffff })).toEqual({ state: 0xffffffff });
  });

  it('rejects values that are not unsigned 32-bit states', () => {
    const invalidValues: unknown[] = [
      { state: -1 },
      { state: 1.5 },
      { state: 0x1_0000_0000 },
      { state: Number.NaN },
      { state: '123' },
      { state: true },
      {},
      [],
      null,
      '123',
      123,
    ];

    for (const value of invalidValues) {
      expect(isValidRngState(value)).toBe(false);
    }
  });

  it('throws a RangeError when restoring an invalid state', () => {
    expect(() => restoreRng({ state: -1 })).toThrow(RangeError);
    expect(() => restoreRng({ state: 0x1_0000_0000 })).toThrow(RangeError);
  });
});

describe('engine purity', () => {
  // The scan runs inside each test rather than at collection time so a read
  // failure is reported against the rule it protects.
  it('scans the engine production modules', () => {
    expect(productionSources(ENGINE_DIR).map((source) => source.file)).toEqual(
      expect.arrayContaining(['rng.ts', 'types.ts']),
    );
  });

  it('contains no host randomness call in production engine sources', () => {
    const offenders = productionSources(ENGINE_DIR)
      .filter((source) => source.source.includes(MATH_RANDOM))
      .map((source) => source.file);

    expect(offenders).toEqual([]);
  });

  it('imports no framework, content, DOM or network module from the engine', () => {
    const banned = /^(?:react|react-dom|node:|\.\.\/content|.*\/content\/)/;
    const offenders: string[] = [];

    for (const source of productionSources(ENGINE_DIR)) {
      const specifiers = [
        ...source.source.matchAll(/from\s+['"]([^'"]+)['"]/g),
        ...source.source.matchAll(/import\s+['"]([^'"]+)['"]/g),
      ]
        .map((match) => match[1])
        .filter((specifier): specifier is string => specifier !== undefined);

      for (const specifier of specifiers) {
        if (banned.test(specifier) || /^https?:/.test(specifier)) {
          offenders.push(`${source.file}: ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never touches browser storage or DOM globals', () => {
    const bannedTokens = ['localStorage', 'sessionStorage', 'document.', 'window.', 'XMLHttpRequest'];
    const offenders: string[] = [];

    for (const source of productionSources(ENGINE_DIR)) {
      for (const token of bannedTokens) {
        if (source.source.includes(token)) {
          offenders.push(`${source.file}: ${token}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
