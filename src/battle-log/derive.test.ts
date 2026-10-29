// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { TURN_START_ENERGY } from '../engine/types';
import type {
  BattleOutcome,
  BattlePhase,
  BattleSide,
  BattleState,
  Element,
  Side,
  StatusCounters,
} from '../engine/types';
import {
  appendBattleLog,
  deriveBattleLogEntry,
  deriveBattleStartEntry,
} from './derive';
import { BATTLE_LOG_LIMIT } from './types';
import type { BattleLogEffect, BattleLogEntry } from './types';

const CARD_ID = 'ember-cinder-jab';
const CARD_CONTEXT = { kind: 'card', ordinal: 4, cardId: CARD_ID } as const;

function statuses(overrides: Partial<StatusCounters> = {}): StatusCounters {
  return { focus: 0, weaken: 0, regen: 0, ...overrides };
}

function makeSide(side: Side, overrides: Partial<BattleSide> = {}): BattleSide {
  const base: BattleSide = {
    side,
    element: 'ember',
    health: 40,
    maxHealth: 40,
    defense: 0,
    energy: TURN_START_ENERGY,
    deck: [],
    hand: [],
    discard: [],
    statuses: statuses(),
  };

  return { ...base, ...overrides, side };
}

interface StateOverrides {
  readonly turn?: number;
  readonly activeSide?: Side;
  readonly phase?: BattlePhase;
  readonly field?: Element;
  readonly outcome?: BattleOutcome;
  readonly player?: Partial<BattleSide>;
  readonly opponent?: Partial<BattleSide>;
}

function makeState(overrides: StateOverrides = {}): BattleState {
  return {
    seed: 0x1234_5678,
    rngState: { state: 0x9abc_def0 },
    turn: overrides.turn ?? 1,
    activeSide: overrides.activeSide ?? 'player',
    phase: overrides.phase ?? 'action',
    field: overrides.field ?? 'neutral',
    outcome: overrides.outcome ?? 'ongoing',
    sides: {
      player: makeSide('player', overrides.player ?? {}),
      opponent: makeSide('opponent', overrides.opponent ?? {}),
    },
    enemyPlan: null,
  };
}

interface EffectCase {
  readonly name: string;
  readonly before: BattleState;
  readonly after: BattleState;
  readonly expected: readonly BattleLogEffect[];
}

const EFFECT_CASES: readonly EffectCase[] = [
  {
    name: 'damage dealt to the opponent',
    before: makeState(),
    after: makeState({ opponent: { health: 32 } }),
    expected: [
      { kind: 'damage', target: 'opponent', amount: 8, remaining: 32, max: 40 },
    ],
  },
  {
    name: 'damage dealt to the player',
    before: makeState({ activeSide: 'opponent' }),
    after: makeState({ activeSide: 'opponent', player: { health: 27 } }),
    expected: [
      { kind: 'damage', target: 'player', amount: 13, remaining: 27, max: 40 },
    ],
  },
  {
    name: 'healing received by the actor',
    before: makeState({ player: { health: 30 } }),
    after: makeState({ player: { health: 34 } }),
    expected: [
      { kind: 'heal', target: 'player', amount: 4, remaining: 34, max: 40 },
    ],
  },
  {
    name: 'defense gained by a Ward',
    before: makeState({ player: { defense: 1 } }),
    after: makeState({ player: { defense: 6 } }),
    expected: [
      { kind: 'defense', target: 'player', amount: 5, total: 6 },
    ],
  },
  {
    name: 'a status application',
    before: makeState(),
    after: makeState({ opponent: { statuses: statuses({ weaken: 2 }) } }),
    expected: [
      { kind: 'status', target: 'opponent', status: 'weaken', stacks: 2 },
    ],
  },
  {
    name: 'a field shift',
    before: makeState(),
    after: makeState({ field: 'frost' }),
    expected: [
      { kind: 'field', previous: 'neutral', next: 'frost' },
    ],
  },
  {
    name: 'a player victory',
    before: makeState({ opponent: { health: 5 } }),
    after: makeState({
      opponent: { health: 0 },
      outcome: 'player-victory',
      phase: 'ended',
    }),
    expected: [
      { kind: 'damage', target: 'opponent', amount: 5, remaining: 0, max: 40 },
      { kind: 'outcome', outcome: 'player-victory' },
    ],
  },
  {
    name: 'an opponent victory',
    before: makeState({ activeSide: 'opponent', player: { health: 4 } }),
    after: makeState({
      activeSide: 'opponent',
      player: { health: 0 },
      outcome: 'opponent-victory',
      phase: 'ended',
    }),
    expected: [
      { kind: 'damage', target: 'player', amount: 4, remaining: 0, max: 40 },
      { kind: 'outcome', outcome: 'opponent-victory' },
    ],
  },
  {
    name: 'a zero-delta transition',
    before: makeState(),
    after: makeState(),
    expected: [],
  },
];

describe('deriveBattleLogEntry effects', () => {
  it.each(EFFECT_CASES)(
    'records $name from the before/after delta only',
    ({ before, after, expected }) => {
      const entry = deriveBattleLogEntry(before, after, CARD_CONTEXT);

      expect(entry.effects).toEqual(expected);
    },
  );

  it('orders effects as the engine applied them', () => {
    const before = makeState({
      player: { health: 30, defense: 0, statuses: statuses({ focus: 1 }) },
      opponent: { health: 4 },
    });
    const after = makeState({
      field: 'frost',
      outcome: 'player-victory',
      phase: 'ended',
      player: { health: 32, defense: 3, statuses: statuses() },
      opponent: {
        health: 0,
        statuses: statuses({ weaken: 1 }),
      },
    });

    const entry = deriveBattleLogEntry(before, after, CARD_CONTEXT);

    expect(entry.effects).toEqual([
      { kind: 'field', previous: 'neutral', next: 'frost' },
      { kind: 'defense', target: 'player', amount: 3, total: 3 },
      { kind: 'heal', target: 'player', amount: 2, remaining: 32, max: 40 },
      { kind: 'damage', target: 'opponent', amount: 4, remaining: 0, max: 40 },
      { kind: 'status', target: 'opponent', status: 'weaken', stacks: 1 },
      { kind: 'outcome', outcome: 'player-victory' },
    ]);
  });

  it('does not record a status stack that was only consumed', () => {
    const before = makeState({ player: { statuses: statuses({ focus: 2 }) } });
    const after = makeState({ player: { statuses: statuses({ focus: 1 }) } });

    const entry = deriveBattleLogEntry(before, after, CARD_CONTEXT);

    expect(entry.effects).toEqual([]);
  });

  it('does not record a battle-end status clear as applications', () => {
    const before = makeState({
      opponent: { health: 1, statuses: statuses({ focus: 2, regen: 1 }) },
    });
    const after = makeState({
      opponent: { health: 0 },
      outcome: 'player-victory',
      phase: 'ended',
    });

    const entry = deriveBattleLogEntry(before, after, CARD_CONTEXT);

    expect(
      entry.effects.filter((effect) => effect.kind === 'status'),
    ).toEqual([]);
    expect(entry.effects).toContainEqual({
      kind: 'outcome',
      outcome: 'player-victory',
    });
  });

  it('records a turn-start Regen tick as healing on the turn entry', () => {
    const before = makeState({
      turn: 3,
      activeSide: 'player',
      opponent: { health: 18, statuses: statuses({ regen: 1 }) },
    });
    const after = makeState({
      turn: 4,
      activeSide: 'opponent',
      opponent: { health: 20, statuses: statuses({ regen: 0 }) },
    });

    const entry = deriveBattleLogEntry(before, after, { kind: 'turn', ordinal: 7 });

    expect(entry).toEqual({
      id: 't4-e7',
      ordinal: 7,
      turn: 4,
      kind: 'turn',
      actor: 'player',
      effects: [
        { kind: 'heal', target: 'opponent', amount: 2, remaining: 20, max: 40 },
      ],
    });
  });
});

describe('deriveBattleLogEntry entry shape', () => {
  it('takes the card id from the context and only for a card entry', () => {
    const before = makeState();
    const after = makeState({ opponent: { health: 36 } });

    const cardEntry = deriveBattleLogEntry(before, after, CARD_CONTEXT);
    const turnEntry = deriveBattleLogEntry(before, after, {
      kind: 'turn',
      ordinal: 5,
    });

    expect(cardEntry.cardId).toBe(CARD_ID);
    expect(cardEntry.kind).toBe('card');
    expect(cardEntry.actor).toBe('player');
    expect('cardId' in turnEntry).toBe(false);
    expect(turnEntry.kind).toBe('turn');
  });

  it('records the acting side and the turn number after the transition', () => {
    const before = makeState({ activeSide: 'opponent', turn: 6 });
    const after = makeState({ activeSide: 'opponent', turn: 6 });

    const entry = deriveBattleLogEntry(before, after, {
      kind: 'card',
      ordinal: 12,
      cardId: 'frost-ice-needle',
    });

    expect(entry.actor).toBe('opponent');
    expect(entry.turn).toBe(6);
    expect(entry.ordinal).toBe(12);
    expect(entry.id).toBe('t6-e12');
  });

  it('does not leak a hidden hand or the enemy plan into an entry', () => {
    const before = makeState({
      player: {
        hand: [
          { instanceId: 'player:0:hidden-card', cardId: 'hidden-card' },
          { instanceId: 'player:1:also-hidden', cardId: 'also-hidden' },
        ],
      },
      opponent: {
        deck: [{ instanceId: 'opponent:0:deck-card', cardId: 'deck-card' }],
      },
    });
    const after = makeState();

    const json = JSON.stringify(
      deriveBattleLogEntry(before, after, CARD_CONTEXT),
    );

    expect(json).not.toContain('hidden-card');
    expect(json).not.toContain('also-hidden');
    expect(json).not.toContain('deck-card');
    expect(json).not.toContain('enemyPlan');
  });

  it('produces a plain-JSON entry that survives a round trip', () => {
    const before = makeState();
    const after = makeState({
      field: 'gale',
      opponent: { health: 31 },
      outcome: 'ongoing',
    });

    const entry = deriveBattleLogEntry(before, after, CARD_CONTEXT);

    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  });

  it('is deterministic for identical inputs', () => {
    const before = makeState({
      activeSide: 'opponent',
      field: 'ember',
      player: { health: 22, defense: 2 },
    });
    const after = makeState({
      activeSide: 'opponent',
      field: 'stone',
      player: { health: 17, defense: 2 },
    });

    const first = deriveBattleLogEntry(before, after, {
      kind: 'card',
      ordinal: 9,
      cardId: 'stone-stone-fist',
    });
    const second = deriveBattleLogEntry(before, after, {
      kind: 'card',
      ordinal: 9,
      cardId: 'stone-stone-fist',
    });

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('does not mutate either supplied state', () => {
    const before = makeState({ player: { health: 30 } });
    const after = makeState({ player: { health: 26 } });
    const beforeJson = JSON.stringify(before);
    const afterJson = JSON.stringify(after);

    deriveBattleLogEntry(before, after, CARD_CONTEXT);

    expect(JSON.stringify(before)).toBe(beforeJson);
    expect(JSON.stringify(after)).toBe(afterJson);
  });
});

describe('battle-start derivation', () => {
  it('records the opening opposing maximum health and field', () => {
    const opening = makeState({
      field: 'stone',
      opponent: { maxHealth: 60, health: 60, element: 'stone' },
    });

    const entry = deriveBattleStartEntry(opening, 0);

    expect(entry).toEqual({
      id: 't1-e0',
      ordinal: 0,
      turn: 1,
      kind: 'battle-start',
      actor: 'system',
      effects: [
        { kind: 'start', opposingMaxHealth: 60, field: 'stone' },
      ],
    });
  });

  it('uses the system actor and carries no card id', () => {
    const entry = deriveBattleStartEntry(makeState(), 0);

    expect(entry.actor).toBe('system');
    expect('cardId' in entry).toBe(false);
  });

  it('is reachable through deriveBattleLogEntry for setup callers', () => {
    const opening = makeState({ field: 'gale', opponent: { maxHealth: 45 } });

    const entry = deriveBattleLogEntry(opening, opening, {
      kind: 'battle-start',
      ordinal: 0,
    });

    expect(entry.effects).toEqual([
      { kind: 'start', opposingMaxHealth: 45, field: 'gale' },
    ]);
  });
});

describe('appendBattleLog', () => {
  function entryFor(ordinal: number): BattleLogEntry {
    return deriveBattleLogEntry(makeState(), makeState(), {
      kind: 'card',
      ordinal,
      cardId: CARD_ID,
    });
  }

  function entriesTo(count: number): BattleLogEntry[] {
    return Array.from({ length: count }, (_, index) => entryFor(index));
  }

  it('appends without mutating the supplied array', () => {
    const existing = entriesTo(2);
    const added = entryFor(2);

    const next = appendBattleLog(existing, added);

    expect(next).toHaveLength(3);
    expect(next[2]).toEqual(added);
    expect(existing).toHaveLength(2);
    expect(next).not.toBe(existing);
  });

  it('keeps the newest 80 entries and their original ordinals', () => {
    const entries = entriesTo(BATTLE_LOG_LIMIT);

    const next = appendBattleLog(entries, entryFor(BATTLE_LOG_LIMIT));

    expect(next).toHaveLength(BATTLE_LOG_LIMIT);
    expect(next[0]?.ordinal).toBe(1);
    expect(next[0]?.id).toBe('t1-e1');
    expect(next.at(-1)?.ordinal).toBe(BATTLE_LOG_LIMIT);
    expect(next.at(-1)?.id).toBe(`t1-e${String(BATTLE_LOG_LIMIT)}`);
  });

  it('holds at 80 however many entries are appended', () => {
    let log: BattleLogEntry[] = [];

    for (let ordinal = 0; ordinal < 100; ordinal += 1) {
      log = appendBattleLog(log, entryFor(ordinal));
    }

    expect(log).toHaveLength(BATTLE_LOG_LIMIT);
    expect(log[0]?.ordinal).toBe(20);
    expect(log.at(-1)?.ordinal).toBe(99);
  });
});
