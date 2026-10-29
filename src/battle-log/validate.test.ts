// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { BATTLE_LOG_LIMIT } from './types';
import { validateBattleLog } from './validate';

type JsonRecord = Record<string, unknown>;

const START_EFFECT: JsonRecord = {
  kind: 'start',
  opposingMaxHealth: 60,
  field: 'stone',
};

const DAMAGE_EFFECT: JsonRecord = {
  kind: 'damage',
  target: 'opponent',
  amount: 2,
  remaining: 38,
  max: 40,
};

function validCard(ordinal = 0): JsonRecord {
  return {
    id: `t1-e${String(ordinal)}`,
    ordinal,
    turn: 1,
    kind: 'card',
    actor: 'player',
    cardId: 'neutral-plain-strike',
    effects: [{ ...DAMAGE_EFFECT }],
  };
}

function validStart(ordinal = 0): JsonRecord {
  return {
    id: `t1-e${String(ordinal)}`,
    ordinal,
    turn: 1,
    kind: 'battle-start',
    actor: 'system',
    effects: [{ ...START_EFFECT }],
  };
}

function validTurn(ordinal = 1): JsonRecord {
  return {
    id: `t1-e${String(ordinal)}`,
    ordinal,
    turn: 2,
    kind: 'turn',
    actor: 'player',
    effects: [],
  };
}

function cardWith(patch: JsonRecord): JsonRecord {
  return { ...validCard(0), ...patch };
}

function without(source: JsonRecord, key: string): JsonRecord {
  const copy: JsonRecord = { ...source };
  delete copy[key];

  return copy;
}

function cards(count: number, startOrdinal = 0): JsonRecord[] {
  return Array.from({ length: count }, (_, index) =>
    validCard(startOrdinal + index),
  );
}

const INVALID_LOGS: readonly (readonly [string, unknown])[] = [
  ['a null input', null],
  ['a string input', 'battle-log'],
  ['a plain object input', {}],
  ['a non-object entry', [null]],
  ['an entry without an id', [without(validCard(), 'id')]],
  ['an empty id', [cardWith({ id: '' })]],
  ['a whitespace-only id', [cardWith({ id: '   ' })]],
  ['a non-string id', [cardWith({ id: 7 })]],
  ['a negative ordinal', [cardWith({ ordinal: -1 })]],
  ['a fractional ordinal', [cardWith({ ordinal: 1.5 })]],
  ['a string ordinal', [cardWith({ ordinal: '0' })]],
  ['a zero turn', [cardWith({ turn: 0 })]],
  ['a fractional turn', [cardWith({ turn: 1.5 })]],
  ['an unknown entry kind', [cardWith({ kind: 'summary' })]],
  ['an unknown actor', [cardWith({ actor: 'narrator' })]],
  ['a system actor on a card entry', [cardWith({ actor: 'system' })]],
  ['a card entry without a card id', [without(validCard(), 'cardId')]],
  ['a card entry with an empty card id', [cardWith({ cardId: '' })]],
  ['a card entry with a non-string card id', [cardWith({ cardId: 3 })]],
  ['a turn entry with a card id', [cardWith({ kind: 'turn', cardId: 'x' })]],
  ['a battle-start entry with a player actor', [
    { ...validStart(), actor: 'player' },
  ]],
  ['a battle-start entry with a card id', [
    { ...validStart(), cardId: 'x' },
  ]],
  ['a battle-start entry without a start effect', [
    { ...validStart(), effects: [] },
  ]],
  ['a battle-start entry with a second effect', [
    {
      ...validStart(),
      effects: [{ ...START_EFFECT }, { ...DAMAGE_EFFECT }],
    },
  ]],
  ['a battle-start entry with two start effects', [
    {
      ...validStart(),
      effects: [{ ...START_EFFECT }, { ...START_EFFECT }],
    },
  ]],
  ['a card entry with a start effect', [
    { ...validCard(), effects: [{ ...START_EFFECT }] },
  ]],
  ['a non-array effects field', [cardWith({ effects: {} })]],
  ['a null effect', [cardWith({ effects: [null] })]],
  ['an unknown effect kind', [
    cardWith({ effects: [{ kind: 'draw', cards: 1 }] }),
  ]],
  ['a start effect with zero maximum health', [
    { ...validStart(), effects: [{ ...START_EFFECT, opposingMaxHealth: 0 }] },
  ]],
  ['a start effect with an unknown field', [
    { ...validStart(), effects: [{ ...START_EFFECT, field: 'shadow' }] },
  ]],
  ['a damage effect with zero amount', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, amount: 0 }] }),
  ]],
  ['a damage effect with a negative amount', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, amount: -1 }] }),
  ]],
  ['a damage effect with a fractional amount', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, amount: 1.5 }] }),
  ]],
  ['a damage effect with remaining above the maximum', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, remaining: 41 }] }),
  ]],
  ['a damage effect with negative remaining health', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, remaining: -1 }] }),
  ]],
  ['a damage effect with zero maximum health', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, max: 0 }] }),
  ]],
  ['a damage effect with an unknown target', [
    cardWith({ effects: [{ ...DAMAGE_EFFECT, target: 'system' }] }),
  ]],
  ['a heal effect with a negative amount', [
    cardWith({
      effects: [
        { kind: 'heal', target: 'player', amount: -2, remaining: 40, max: 40 },
      ],
    }),
  ]],
  ['a heal effect with remaining above the maximum', [
    cardWith({
      effects: [
        { kind: 'heal', target: 'player', amount: 2, remaining: 42, max: 40 },
      ],
    }),
  ]],
  ['a defense effect with zero amount', [
    cardWith({
      effects: [{ kind: 'defense', target: 'player', amount: 0, total: 4 }],
    }),
  ]],
  ['a defense effect above the frozen cap', [
    cardWith({
      effects: [{ kind: 'defense', target: 'player', amount: 2, total: 9 }],
    }),
  ]],
  ['a defense effect with negative total', [
    cardWith({
      effects: [{ kind: 'defense', target: 'player', amount: 2, total: -1 }],
    }),
  ]],
  ['a status effect with an unknown status', [
    cardWith({
      effects: [
        { kind: 'status', target: 'opponent', status: 'burn', stacks: 1 },
      ],
    }),
  ]],
  ['a status effect with zero stacks', [
    cardWith({
      effects: [
        { kind: 'status', target: 'opponent', status: 'focus', stacks: 0 },
      ],
    }),
  ]],
  ['a status effect above the focus cap', [
    cardWith({
      effects: [
        { kind: 'status', target: 'opponent', status: 'focus', stacks: 4 },
      ],
    }),
  ]],
  ['a status effect above the regen cap', [
    cardWith({
      effects: [
        { kind: 'status', target: 'player', status: 'regen', stacks: 3 },
      ],
    }),
  ]],
  ['a field effect with an unknown previous field', [
    cardWith({
      effects: [{ kind: 'field', previous: 'shadow', next: 'ember' }],
    }),
  ]],
  ['a field effect with an unknown next field', [
    cardWith({
      effects: [{ kind: 'field', previous: 'ember', next: 'shadow' }],
    }),
  ]],
  ['a field effect that claims no change', [
    cardWith({
      effects: [{ kind: 'field', previous: 'ember', next: 'ember' }],
    }),
  ]],
  ['an outcome effect that is still ongoing', [
    cardWith({ effects: [{ kind: 'outcome', outcome: 'ongoing' }] }),
  ]],
  ['an outcome effect with an unknown outcome', [
    cardWith({ effects: [{ kind: 'outcome', outcome: 'draw' }] }),
  ]],
  ['a duplicate id', [
    validCard(0),
    { ...validCard(1), id: 't1-e0' },
  ]],
  ['an equal ordinal', [
    validCard(0),
    { ...validCard(1), ordinal: 0 },
  ]],
  ['a decreasing ordinal', [
    validCard(5),
    { ...validCard(6), ordinal: 4 },
  ]],
];

describe('validateBattleLog', () => {
  it('accepts an empty log', () => {
    expect(validateBattleLog([])).toEqual([]);
  });

  it('accepts start, card and turn entries and canonicalizes them', () => {
    const input = [validStart(0), validCard(1), validTurn(2)];

    const result = validateBattleLog(input);

    expect(result).toHaveLength(3);
    expect(result).toEqual(input);
  });

  it('returns a new array and new entry objects', () => {
    const input = Object.freeze([validStart(0), validCard(1)]);

    const result = validateBattleLog(input);

    expect(result).not.toBe(input);
    expect(result?.[0]).not.toBe(input[0]);
  });

  it('never mutates the supplied log', () => {
    const input = [validStart(0), validCard(1), validTurn(2)];
    const before = JSON.stringify(input);

    validateBattleLog(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(INVALID_LOGS)('rejects %s', (_name, value) => {
    expect(validateBattleLog(value)).toBeNull();
  });

  it('rejects the whole log when one entry is invalid', () => {
    const input = [
      validStart(0),
      cardWith({ ordinal: 1, id: 't1-e1', effects: [{ ...DAMAGE_EFFECT, amount: 0 }] }),
      validTurn(2),
    ];

    expect(validateBattleLog(input)).toBeNull();
  });

  it('rejects a duplicate id even when one copy would be truncated', () => {
    const input = cards(BATTLE_LOG_LIMIT + 1);
    input[0] = { ...input[0], id: `t1-e${String(BATTLE_LOG_LIMIT)}` };

    expect(validateBattleLog(input)).toBeNull();
  });

  it('rejects a corrupt oldest entry that capping would have dropped', () => {
    const input = cards(BATTLE_LOG_LIMIT + 1);
    input[0] = {
      ...input[0],
      effects: [{ ...DAMAGE_EFFECT, amount: 0 }],
    };

    expect(validateBattleLog(input)).toBeNull();
  });

  it('keeps 80 entries unchanged', () => {
    const input = cards(BATTLE_LOG_LIMIT);

    const result = validateBattleLog(input);

    expect(result).toHaveLength(BATTLE_LOG_LIMIT);
    expect(result?.[0]?.ordinal).toBe(0);
    expect(result?.at(-1)?.ordinal).toBe(BATTLE_LOG_LIMIT - 1);
  });

  it('caps 81 valid entries to the last 80 with ordinals intact', () => {
    const input = cards(BATTLE_LOG_LIMIT + 1);

    const result = validateBattleLog(input);

    expect(result).toHaveLength(BATTLE_LOG_LIMIT);
    expect(result?.[0]?.ordinal).toBe(1);
    expect(result?.[0]?.id).toBe('t1-e1');
    expect(result?.at(-1)?.ordinal).toBe(BATTLE_LOG_LIMIT);
    expect(result?.at(-1)?.id).toBe(`t1-e${String(BATTLE_LOG_LIMIT)}`);
    expect(result?.map((entry) => entry.ordinal)).toEqual(
      Array.from({ length: BATTLE_LOG_LIMIT }, (_, index) => index + 1),
    );
  });

  it('caps 100 entries to the last 80 without renumbering', () => {
    const input = cards(100);

    const result = validateBattleLog(input);

    expect(result).toHaveLength(BATTLE_LOG_LIMIT);
    expect(result?.[0]?.ordinal).toBe(20);
    expect(result?.at(-1)?.ordinal).toBe(99);
  });

  it('preserves a non-zero starting ordinal when capping', () => {
    const input = cards(BATTLE_LOG_LIMIT + 1, 5);

    const result = validateBattleLog(input);

    expect(result?.[0]?.ordinal).toBe(6);
    expect(result?.at(-1)?.ordinal).toBe(BATTLE_LOG_LIMIT + 5);
  });

  it('round-trips a validated log through JSON without functions or undefined', () => {
    const dirty = {
      ...validCard(0),
      note: 'discard me',
      missing: undefined,
      handler: () => 'discard me too',
      effects: [
        {
          ...DAMAGE_EFFECT,
          remaining: 39,
          note: 'discard me',
          handler: () => 'discard me too',
        },
      ],
    };

    const validated = validateBattleLog([dirty]);

    expect(validated).not.toBeNull();

    if (validated === null) {
      return;
    }

    expect(validated[0]).not.toHaveProperty('note');
    expect(validated[0]).not.toHaveProperty('missing');
    expect(validated[0]).not.toHaveProperty('handler');
    expect(validated[0]?.effects[0]).not.toHaveProperty('handler');

    const json = JSON.stringify(validated);
    const parsed: unknown = JSON.parse(json);

    expect(parsed).toEqual(validated);
    expect(JSON.stringify(parsed)).toBe(json);
  });
});
