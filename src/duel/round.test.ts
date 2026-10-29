// @vitest-environment node
/**
 * Privacy-gated duel round controller tests (DUEL-FR-02, DUEL-FR-03, DUEL-FR-04,
 * DUEL-FR-06, LOG-FR-01, LOG-FR-05, LOG-NF-01, VIS-US-02).
 *
 * These are integration tests over the real battle engine and the frozen
 * starter content: no mocked engine, no fake cards and no reimplemented combat
 * rules. The suite proves the shared-device contract from the outside:
 *
 *   - every turn opens behind a pending privacy gate, including round starts;
 *   - Play and End Turn are typed rejections while the gate is up and after the
 *     round settles;
 *   - a revealed battle exposes the active hand as card ids and the opponent as
 *     a count, and the privacy view exposes no battle detail at all;
 *   - the public log starts once per round, grows by one entry per settled play
 *     and per handoff, is capped at 80 entries and appears only in the active
 *     battle view, never in the privacy or result contracts;
 *   - the controller forwards to the same engine actions solo uses and keeps
 *     both sides' decks, hands and energy independent;
 *   - a lethal play maps the settled engine outcome back to the human seat and
 *     ends the round immediately.
 *
 * A final block reads the production source to prove the controller cannot
 * persist, render, plan an AI turn or restate a combat rule.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { byId as CARD_CATALOG } from '../content/cards';
import { deckById } from '../content/decks';
import { canPlayCard, endTurn, playCard } from '../engine/battle';
import type { BattleState, Side } from '../engine/types';
import type { BattleLogEntry } from '../battle-log/types';
import {
  createMatch,
  recordRoundWinner,
  sideForDuelPlayer,
} from './match';
import type {
  DuelMatch,
  DuelMatchSetup,
  DuelPlayer,
} from './match';
import {
  canDuelAct,
  createDuelRound,
  dismissDuelPrivacy,
  duelActivePlayer,
  duelRoundView,
  endDuelTurn,
  playDuelCard,
} from './round';
import type {
  DuelRoundBattle,
  DuelRoundComplete,
  DuelRoundState,
} from './round';

/* -------------------------------------------------------------------------- */
/* Result helpers                                                              */
/* -------------------------------------------------------------------------- */

type ResultShape<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

/** Unwraps a successful transition; a failure fails the test with its code. */
function ok<T>(result: ResultShape<T>): T {
  if (!result.ok) {
    throw new Error(
      `expected success, received ${result.error.code}: ${result.error.message}`,
    );
  }

  return result.value;
}

/** Returns the typed code of a rejected transition. */
function rejected<T>(result: ResultShape<T>): string {
  if (result.ok) {
    throw new Error('expected a typed failure, received success');
  }

  return result.error.code;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const P1_DECK = 'deck-ember';
const P2_DECK = 'deck-gale';
const SEED = 123_456_789;

function matchSetup(overrides: Partial<DuelMatchSetup> = {}): DuelMatchSetup {
  return {
    player1DeckId: P1_DECK,
    player2DeckId: P2_DECK,
    seed: SEED,
    ...overrides,
  };
}

function newMatch(overrides: Partial<DuelMatchSetup> = {}): DuelMatch {
  return ok(createMatch(matchSetup(overrides)));
}

function roundFor(match: DuelMatch = newMatch()): DuelRoundState {
  return ok(createDuelRound(match));
}

/** A finished 2-0 series for the supplied seat. */
function completeMatch(winner: DuelPlayer): DuelMatch {
  return ok(
    recordRoundWinner(
      ok(recordRoundWinner(newMatch(), winner)),
      winner,
    ),
  );
}

/** Plain JSON snapshot, used to prove a rejected action changed nothing. */
function snapshot(state: DuelRoundState): string {
  return JSON.stringify(state);
}

function firstHandId(battle: BattleState, side: Side): string {
  const card = battle.sides[side].hand[0];

  if (card === undefined) {
    throw new Error(`the ${side} hand is empty in this fixture`);
  }

  return card.instanceId;
}

/** Proves every card in a hand came from that side's locked deck list. */
function expectHandFromDeck(
  battle: BattleState,
  side: Side,
  deckId: string,
): void {
  const deck = deckById(deckId);

  if (deck === undefined) {
    throw new Error(`test fixture deck "${deckId}" is missing`);
  }

  const allowed = new Set(deck.cards);

  for (const card of battle.sides[side].hand) {
    expect(allowed.has(card.cardId)).toBe(true);
  }
}

/** Narrows the active-turn view; fails the test for a redacted view. */
function battleViewOf(state: DuelRoundState) {
  const view = duelRoundView(state);

  if (view.kind !== 'battle') {
    throw new Error(`expected the battle view, received ${view.kind}`);
  }

  return view;
}

const ENTRY_KEYS: readonly string[] = [
  'actor',
  'cardId',
  'effects',
  'id',
  'kind',
  'ordinal',
  'turn',
];

const EFFECT_KINDS: readonly string[] = [
  'start',
  'damage',
  'heal',
  'defense',
  'status',
  'field',
  'outcome',
];

/**
 * Proves one entry is a public settled fact: only the documented entry and
 * effect fields, and no hand, deck, intent, energy, draw or instance detail.
 */
function expectPublicEntry(entry: BattleLogEntry): void {
  expect(Object.keys(entry).every((key) => ENTRY_KEYS.includes(key))).toBe(
    true,
  );

  for (const effect of entry.effects) {
    expect(EFFECT_KINDS.includes(effect.kind)).toBe(true);
  }

  const serialized = JSON.stringify(entry);

  for (const token of [
    'hand',
    'deck',
    'energy',
    'intent',
    'plan',
    'instanceId',
    'shuffle',
    'draw',
    'Math.random',
  ]) {
    expect(serialized).not.toContain(token);
  }
}

/** Every card id that appears in a card entry, in log order. */
function loggedCardIds(log: readonly BattleLogEntry[]): string[] {
  return log
    .filter((entry) => entry.kind === 'card')
    .map((entry) => entry.cardId)
    .filter((cardId): cardId is string => cardId !== undefined);
}

/**
 * Picks a legal card for the active side, preferring an attack so a scripted
 * round makes progress. Legality comes from the engine (`canPlayCard`), never
 * from a restated affordability rule.
 */
function nextPlayable(battle: BattleState, side: Side): string | null {
  const playable = battle.sides[side].hand.filter((card) =>
    canPlayCard(battle, side, card.instanceId, CARD_CATALOG),
  );
  const attack = playable.find(
    (card) => CARD_CATALOG[card.cardId]?.type === 'attack',
  );
  const chosen = attack ?? playable[0];

  return chosen === undefined ? null : chosen.instanceId;
}

interface SettledRun {
  /** The battle state immediately before the play that ended the round. */
  readonly before: DuelRoundBattle;
  readonly final: DuelRoundComplete;
}

/**
 * Plays a round to settlement through the controller only: dismiss every
 * handoff, prefer an affordable attack, otherwise play any legal card, otherwise
 * end the turn. The guard turns a stalled script into a failure instead of a
 * hang.
 */
function settleRound(match: DuelMatch): SettledRun {
  let state: DuelRoundState = roundFor(match);
  let before: DuelRoundBattle | null = null;
  let guard = 0;

  while (state.phase !== 'complete') {
    guard += 1;

    if (guard > 600) {
      throw new Error('the scripted round did not settle');
    }

    if (state.phase === 'privacy') {
      state = ok(dismissDuelPrivacy(state));
      continue;
    }

    const instanceId = nextPlayable(state.battle, state.battle.activeSide);
    before = state;
    state =
      instanceId === null
        ? ok(endDuelTurn(state))
        : ok(playDuelCard(state, instanceId));
  }

  if (state.phase !== 'complete') {
    throw new Error('the loop exited outside the complete phase');
  }

  if (before === null) {
    throw new Error('the round settled without a preceding action');
  }

  return { before, final: state };
}

/**
 * Player 1 discards every hand without acting while Player 2 attacks. This
 * deterministically drives the round to an opponent-side win so the
 * `opponent-victory` mapping has real coverage.
 */
function settleWithPlayerOnePassing(
  match: DuelMatch,
): DuelRoundComplete {
  let state: DuelRoundState = roundFor(match);
  let guard = 0;

  while (state.phase !== 'complete') {
    guard += 1;

    if (guard > 600) {
      throw new Error('the scripted round did not settle');
    }

    if (state.phase === 'privacy') {
      state = ok(dismissDuelPrivacy(state));
      continue;
    }

    if (state.viewer === 'player1') {
      state = ok(endDuelTurn(state));
      continue;
    }

    const instanceId = nextPlayable(state.battle, 'opponent');
    state =
      instanceId === null
        ? ok(endDuelTurn(state))
        : ok(playDuelCard(state, instanceId));
  }

  if (state.phase !== 'complete') {
    throw new Error('the loop exited outside the complete phase');
  }

  return state;
}

/* -------------------------------------------------------------------------- */
/* Creation and round reset                                                    */
/* -------------------------------------------------------------------------- */

describe('createDuelRound', () => {
  it('opens round 1 behind privacy with the match first player looking', () => {
    const match = newMatch();
    const round = roundFor(match);

    expect(round.phase).toBe('privacy');
    expect(round.privacyPending).toBe(true);
    expect(round.viewer).toBe('player1');
    expect(round.roundWinner).toBeNull();
    expect(round.match).toBe(match);
    expect(round.battle.seed).toBe(match.roundSeed);
    expect(round.battle.activeSide).toBe('player');
    expect(duelActivePlayer(round)).toBe('player1');
    expect(canDuelAct(round)).toBe(false);

    // A fresh round is the engine's documented opening board for both sides.
    expect(round.battle.field).toBe('neutral');
    expect(round.battle.sides.player.health).toBe(40);
    expect(round.battle.sides.opponent.health).toBe(40);
    expect(round.battle.sides.player.defense).toBe(0);
    expect(round.battle.sides.opponent.defense).toBe(0);
    expect(round.battle.sides.player.energy).toBe(3);
    expect(round.battle.sides.opponent.energy).toBe(3);
    expect(round.battle.sides.player.statuses).toEqual({
      focus: 0,
      weaken: 0,
      regen: 0,
    });
    expect(round.battle.sides.opponent.statuses).toEqual({
      focus: 0,
      weaken: 0,
      regen: 0,
    });
    expect(round.battle.sides.player.hand).toHaveLength(5);
    expect(round.battle.sides.opponent.hand).toHaveLength(5);
    expectHandFromDeck(round.battle, 'player', P1_DECK);
    expectHandFromDeck(round.battle, 'opponent', P2_DECK);
  });

  it('follows the alternating first player in rounds 2 and 3', () => {
    const round2 = roundFor(ok(recordRoundWinner(newMatch(), 'player1')));

    expect(round2.match.round).toBe(2);
    expect(round2.viewer).toBe('player2');
    expect(round2.battle.activeSide).toBe('opponent');
    expect(duelActivePlayer(round2)).toBe('player2');
    expectHandFromDeck(round2.battle, 'opponent', P2_DECK);

    const round3 = roundFor(
      ok(
        recordRoundWinner(
          ok(recordRoundWinner(newMatch(), 'player1')),
          'player2',
        ),
      ),
    );

    expect(round3.match.round).toBe(3);
    expect(round3.viewer).toBe('player1');
    expect(round3.battle.activeSide).toBe('player');
  });

  it('seeds the battle from the round seed and replays identically', () => {
    const match = newMatch();
    const first = roundFor(match);
    const repeat = roundFor(match);

    expect(first.battle.seed).toBe(match.roundSeed);
    expect(first.battle.seed).not.toBe(match.seed);
    expect(snapshot(repeat)).toBe(snapshot(first));

    const second = roundFor(ok(recordRoundWinner(match, 'player1')));

    expect(second.battle.seed).toBe(second.match.roundSeed);
    expect(second.battle.seed).not.toBe(first.battle.seed);
    expect(second.battle.seed).not.toBe(match.seed);
  });

  it('rebuilds the whole battle each round while keeping the locked decks', () => {
    const match = newMatch();
    const round1 = roundFor(match);
    const played = ok(
      playDuelCard(
        ok(dismissDuelPrivacy(round1)),
        firstHandId(round1.battle, 'player'),
      ),
    );

    expect(played.battle).not.toBe(round1.battle);

    const nextMatch = ok(recordRoundWinner(match, 'player1'));
    const round2 = roundFor(nextMatch);

    expect(round2.battle).not.toBe(round1.battle);
    expect(round2.match.deckIds).toEqual(match.deckIds);
    expect(round2.battle.field).toBe('neutral');
    expect(round2.battle.sides.player.health).toBe(40);
    expect(round2.battle.sides.opponent.health).toBe(40);
    expect(round2.battle.sides.player.defense).toBe(0);
    expect(round2.battle.sides.opponent.defense).toBe(0);
    expect(round2.battle.sides.player.energy).toBe(3);
    expect(round2.battle.sides.opponent.energy).toBe(3);
    expect(round2.battle.sides.player.statuses).toEqual({
      focus: 0,
      weaken: 0,
      regen: 0,
    });
    expect(round2.battle.sides.opponent.statuses).toEqual({
      focus: 0,
      weaken: 0,
      regen: 0,
    });
    expect(round2.battle.sides.player.hand).toHaveLength(5);
    expect(round2.battle.sides.opponent.hand).toHaveLength(5);
  });

  it('rejects a completed match and an unknown locked deck', () => {
    expect(rejected(createDuelRound(completeMatch('player1')))).toBe(
      'invalid-match',
    );

    const malformed: DuelMatch = {
      ...newMatch(),
      deckIds: { player1: P1_DECK, player2: 'deck-unknown' },
    };

    expect(rejected(createDuelRound(malformed))).toBe('unknown-deck');
  });
});

/* -------------------------------------------------------------------------- */
/* Privacy gate                                                                */
/* -------------------------------------------------------------------------- */

describe('privacy gate', () => {
  it('rejects a play before dismissal and leaves state unchanged', () => {
    const round = roundFor();
    const before = snapshot(round);
    const instanceId = firstHandId(round.battle, 'player');

    expect(rejected(playDuelCard(round, instanceId))).toBe('privacy-pending');
    expect(snapshot(round)).toBe(before);
    expect(round.phase).toBe('privacy');
    expect(round.privacyPending).toBe(true);
  });

  it('rejects end turn before dismissal and leaves state unchanged', () => {
    const round = roundFor();
    const before = snapshot(round);

    expect(rejected(endDuelTurn(round))).toBe('privacy-pending');
    expect(snapshot(round)).toBe(before);
  });

  it('rejects a second dismissal without changing the revealed battle', () => {
    const revealed = ok(dismissDuelPrivacy(roundFor()));
    const before = snapshot(revealed);

    expect(rejected(dismissDuelPrivacy(revealed))).toBe(
      'privacy-not-pending',
    );
    expect(snapshot(revealed)).toBe(before);
  });

  it('reveals exactly the active hand and an opponent count', () => {
    const round = roundFor();
    const revealed = ok(dismissDuelPrivacy(round));

    expect(revealed.phase).toBe('battle');
    expect(revealed.privacyPending).toBe(false);
    expect(revealed.viewer).toBe('player1');
    expect(revealed.battle).toBe(round.battle);
    expect(canDuelAct(revealed)).toBe(true);

    const view = duelRoundView(revealed);

    expect(view.kind).toBe('battle');

    if (view.kind !== 'battle') {
      throw new Error('expected the active-turn view');
    }

    expect(view.hand).toHaveLength(5);
    expect(view.hand.map((card) => card.instanceId)).toEqual(
      revealed.battle.sides.player.hand.map((card) => card.instanceId),
    );
    expect(view.self.handCount).toBe(5);
    expect(view.self.energy).toBe(3);
    expect(view.opponent.handCount).toBe(5);
    expect(view.opponent.player).toBe('player2');
    expect(view.log).toEqual(revealed.log);
    expect(view.log[0]?.kind).toBe('battle-start');

    // The opponent's panel is explicitly a count, not a card list.
    expect(Object.keys(view.opponent).sort()).toEqual(
      [
        'deckCount',
        'defense',
        'discardCount',
        'element',
        'handCount',
        'health',
        'maxHealth',
        'player',
        'side',
        'statuses',
      ].sort(),
    );

    // No opponent instance id (unique for the whole battle) reaches the view.
    const serialized = JSON.stringify(view);

    for (const card of revealed.battle.sides.opponent.hand) {
      expect(serialized).not.toContain(card.instanceId);
    }
  });

  it('keeps the privacy view free of battle detail', () => {
    const view = duelRoundView(roundFor());

    expect(view.kind).toBe('privacy');
    expect(Object.keys(view).sort()).toEqual(
      ['kind', 'round', 'viewer', 'wins'].sort(),
    );
    expect(view).not.toHaveProperty('log');

    if (view.kind !== 'privacy') {
      throw new Error('expected the privacy view');
    }

    expect(view.viewer).toBe('player1');

    const serialized = JSON.stringify(view);

    for (const token of [
      'health',
      'defense',
      'energy',
      'field',
      'hand',
      'cardId',
      'instanceId',
      'log',
      'battle-start',
    ]) {
      expect(serialized).not.toContain(token);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Turn handoff                                                                */
/* -------------------------------------------------------------------------- */

describe('turn handoff', () => {
  it('switches the viewer and re-arms privacy after a turn', () => {
    const first = ok(dismissDuelPrivacy(roundFor()));
    const handedOff = ok(endDuelTurn(first));

    expect(handedOff.phase).toBe('privacy');
    expect(handedOff.privacyPending).toBe(true);
    expect(handedOff.viewer).toBe('player2');
    expect(handedOff.battle.activeSide).toBe('opponent');
    expect(handedOff.battle.turn).toBe(first.battle.turn + 1);
    expect(handedOff.battle.sides.player.hand).toHaveLength(0);
    expect(handedOff.battle.sides.opponent.hand).toHaveLength(5);
    expect(duelRoundView(handedOff).kind).toBe('privacy');
    expect(canDuelAct(handedOff)).toBe(false);
  });

  it('rejects any action while the next handoff is pending', () => {
    const first = ok(dismissDuelPrivacy(roundFor()));
    const handedOff = ok(endDuelTurn(first));
    const before = snapshot(handedOff);

    expect(rejected(endDuelTurn(handedOff))).toBe('privacy-pending');
    expect(
      rejected(playDuelCard(handedOff, firstHandId(first.battle, 'player'))),
    ).toBe('privacy-pending');
    expect(snapshot(handedOff)).toBe(before);
  });

  it('rejects a card from the other hand after the handoff reveals Player 2', () => {
    const first = ok(dismissDuelPrivacy(roundFor()));
    const playerOneCard = firstHandId(first.battle, 'player');
    const second = ok(dismissDuelPrivacy(ok(endDuelTurn(first))));
    const before = snapshot(second);

    expect(second.viewer).toBe('player2');
    expect(rejected(playDuelCard(second, playerOneCard))).toBe(
      'card-not-in-hand',
    );
    expect(snapshot(second)).toBe(before);
  });

  it('rejects a duplicate play and leaves state unchanged', () => {
    const active = ok(dismissDuelPrivacy(roundFor()));
    const instanceId = firstHandId(active.battle, 'player');
    const afterFirst = ok(playDuelCard(active, instanceId));
    const before = snapshot(afterFirst);

    expect(
      afterFirst.battle.sides.player.hand.some(
        (card) => card.instanceId === instanceId,
      ),
    ).toBe(false);
    expect(rejected(playDuelCard(afterFirst, instanceId))).toBe(
      'card-not-in-hand',
    );
    expect(snapshot(afterFirst)).toBe(before);
  });

  it('uses the same engine actions as the solo path', () => {
    const active = ok(dismissDuelPrivacy(roundFor()));
    const instanceId = firstHandId(active.battle, 'player');
    const expectedPlay = playCard(
      active.battle,
      { type: 'play-card', side: 'player', instanceId },
      CARD_CATALOG,
    );

    if (!expectedPlay.ok) {
      throw new Error(expectedPlay.error.message);
    }

    const dueled = ok(playDuelCard(active, instanceId));

    expect(dueled.battle).toEqual(expectedPlay.value);

    const activeForEnd = ok(dismissDuelPrivacy(roundFor()));
    const expectedEnd = endTurn(activeForEnd.battle, {
      type: 'end-turn',
      side: 'player',
    });

    if (!expectedEnd.ok) {
      throw new Error(expectedEnd.error.message);
    }

    const dueledEnd = ok(endDuelTurn(activeForEnd));

    expect(dueledEnd.battle).toEqual(expectedEnd.value);
  });

  it('keeps both sides independent while the active player acts', () => {
    const active = ok(dismissDuelPrivacy(roundFor()));
    const opponentBefore = active.battle.sides.opponent;
    const playerBefore = active.battle.sides.player;
    const played = ok(
      playDuelCard(active, firstHandId(active.battle, 'player')),
    );

    expect(played.battle.sides.opponent.energy).toBe(opponentBefore.energy);
    expect(played.battle.sides.opponent.hand).toEqual(opponentBefore.hand);
    expect(played.battle.sides.opponent.deck).toEqual(opponentBefore.deck);
    expect(played.battle.sides.opponent.discard).toEqual(
      opponentBefore.discard,
    );
    expect(played.battle.sides.player.energy).toBeLessThanOrEqual(
      playerBefore.energy,
    );
    expect(played.battle.sides.player.hand).not.toEqual(playerBefore.hand);

    const handedOff = ok(endDuelTurn(active));
    const second = ok(dismissDuelPrivacy(handedOff));

    expect(second.viewer).toBe('player2');
    expect(second.battle.sides.opponent.energy).toBe(3);
    expect(second.battle.sides.opponent.hand).toHaveLength(5);
    expect(second.battle.sides.player.hand).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Public duel log                                                             */
/* -------------------------------------------------------------------------- */

describe('public duel log', () => {
  it('starts a fresh round with one battle-start entry at ordinal 0', () => {
    const round = roundFor();
    const start = round.log[0];

    expect(round.log).toHaveLength(1);

    if (start === undefined) {
      throw new Error('a fresh round must log its battle start');
    }

    expect(start.kind).toBe('battle-start');
    expect(start.ordinal).toBe(0);
    expect(start.actor).toBe('system');
    expect(start.turn).toBe(round.battle.turn);
    expect(start).not.toHaveProperty('cardId');
    expect(start.effects).toEqual([
      {
        kind: 'start',
        opposingMaxHealth: round.battle.sides.opponent.maxHealth,
        field: round.battle.field,
      },
    ]);
    expectPublicEntry(start);
    expect(JSON.stringify(start)).not.toContain('cardId');
  });

  it('exposes the log only on the active battle view', () => {
    const round = roundFor();
    const privacy = duelRoundView(round);

    expect(privacy.kind).toBe('privacy');
    expect(privacy).not.toHaveProperty('log');
    expect(Object.keys(privacy).sort()).toEqual(
      ['kind', 'round', 'viewer', 'wins'].sort(),
    );
    expect(JSON.stringify(privacy)).not.toContain('"log"');
    expect(JSON.stringify(privacy)).not.toContain('battle-start');

    const revealed = ok(dismissDuelPrivacy(round));
    const battle = battleViewOf(revealed);

    expect(battle.log).toEqual(revealed.log);
    expect(battle.log).toHaveLength(1);
    expect(Object.keys(battle).sort()).toEqual(
      [
        'field',
        'hand',
        'kind',
        'log',
        'opponent',
        'round',
        'self',
        'turn',
        'viewer',
        'wins',
      ].sort(),
    );
  });

  it('appends one card entry naming the played card and its public effects', () => {
    const active = ok(dismissDuelPrivacy(roundFor()));
    const instanceId = firstHandId(active.battle, 'player');
    const held = active.battle.sides.player.hand.find(
      (card) => card.instanceId === instanceId,
    );

    if (held === undefined) {
      throw new Error('the fixture hand must contain the played instance');
    }

    const played = ok(playDuelCard(active, instanceId));
    const entry = played.log[played.log.length - 1];

    expect(played.log).toHaveLength(2);

    if (entry === undefined || entry.kind !== 'card') {
      throw new Error('a settled play must append one card entry');
    }

    expect(entry.ordinal).toBe(1);
    expect(entry.cardId).toBe(held.cardId);
    expect(entry.actor).toBe('player');
    expect(entry.turn).toBe(played.battle.turn);
    expectPublicEntry(entry);

    // Only cards that were actually played appear in the log.
    expect(loggedCardIds(played.log)).toEqual([held.cardId]);

    const view = battleViewOf(played);

    expect(view.log).toEqual(played.log);

    // The opponent's unplayed cards never enter the serialized view. Card ids
    // the viewer also holds are excluded because the viewer's own hand is
    // public to them; instance ids are unique and must never appear.
    const viewerCardIds = new Set([
      ...view.hand.map((card) => card.cardId),
      held.cardId,
    ]);
    const serialized = JSON.stringify(view);

    for (const card of played.battle.sides.opponent.hand) {
      expect(serialized).not.toContain(card.instanceId);

      if (!viewerCardIds.has(card.cardId)) {
        expect(serialized).not.toContain(card.cardId);
      }
    }

    for (const logged of view.log) {
      expectPublicEntry(logged);
    }
  });

  it('appends one turn entry per handoff and re-hides the log behind privacy', () => {
    const active = ok(dismissDuelPrivacy(roundFor()));
    const handedOff = ok(endDuelTurn(active));
    const entry = handedOff.log[handedOff.log.length - 1];

    expect(handedOff.log).toHaveLength(2);
    expect(handedOff.phase).toBe('privacy');
    expect(handedOff.privacyPending).toBe(true);

    if (entry === undefined || entry.kind !== 'turn') {
      throw new Error('a handoff must append one turn entry');
    }

    expect(entry.ordinal).toBe(1);
    expect(entry.actor).toBe('player');
    expect(entry.turn).toBe(handedOff.battle.turn);
    expect(entry).not.toHaveProperty('cardId');
    expectPublicEntry(entry);

    const view = duelRoundView(handedOff);

    expect(view.kind).toBe('privacy');
    expect(view).not.toHaveProperty('log');
    expect(JSON.stringify(view)).not.toContain('"log"');
    expect(JSON.stringify(view)).not.toContain('battle-start');
    // The privacy screen cannot reveal that a history exists at all.
    expect(JSON.stringify(view)).not.toContain('turn');
  });

  it('appends nothing when a play is rejected', () => {
    const active = ok(dismissDuelPrivacy(roundFor()));
    const before = snapshot(active);

    expect(rejected(playDuelCard(active, 'not-a-real-instance'))).toBe(
      'card-not-in-hand',
    );
    expect(snapshot(active)).toBe(before);
    expect(active.log).toHaveLength(1);
  });

  it('appends nothing when a play is rejected before privacy is dismissed', () => {
    const round = roundFor();
    const before = snapshot(round);

    expect(
      rejected(playDuelCard(round, firstHandId(round.battle, 'player'))),
    ).toBe('privacy-pending');
    expect(snapshot(round)).toBe(before);
    expect(round.log).toHaveLength(1);
  });

  it('redacts the log from the round result view and starts each round fresh', () => {
    const match = newMatch();
    const round1 = roundFor(match);
    const active = ok(dismissDuelPrivacy(round1));
    const played = ok(
      playDuelCard(active, firstHandId(active.battle, 'player')),
    );

    expect(played.log).toHaveLength(2);

    const round2 = roundFor(ok(recordRoundWinner(match, 'player1')));

    expect(round2.log).toHaveLength(1);
    expect(round2.log[0]?.ordinal).toBe(0);
    expect(round2.log[0]?.kind).toBe('battle-start');
    expect(round2.log).not.toBe(played.log);
    expect(round2.log.some((entry) => entry.kind === 'card')).toBe(false);

    const { final } = settleRound(newMatch());
    const result = duelRoundView(final);

    expect(result.kind).toBe('result');
    expect(result).not.toHaveProperty('log');
    expect(Object.keys(result).sort()).toEqual(
      ['kind', 'round', 'viewer', 'wins', 'winner'].sort(),
    );
    expect(JSON.stringify(result)).not.toContain('"log"');
    expect(JSON.stringify(result)).not.toContain('cardId');
    expect(final.log.length).toBeGreaterThan(1);
  });

  it('caps the log at 80 entries without renumbering the survivors', () => {
    let state = roundFor();

    for (let index = 0; index < 81; index += 1) {
      state = ok(dismissDuelPrivacy(state));
      state = ok(endDuelTurn(state));
    }

    expect(state.log).toHaveLength(80);
    expect(state.log.map((entry) => entry.ordinal)).toEqual(
      Array.from({ length: 80 }, (_, index) => index + 2),
    );
    expect(state.log[0]?.ordinal).toBe(2);
    expect(state.log[79]?.ordinal).toBe(81);
    expect(new Set(state.log.map((entry) => entry.id)).size).toBe(80);

    // A later handoff keeps counting from the newest surviving ordinal.
    state = ok(dismissDuelPrivacy(state));
    state = ok(endDuelTurn(state));

    expect(state.log).toHaveLength(80);
    expect(state.log[79]?.ordinal).toBe(82);
    expect(state.log[0]?.ordinal).toBe(3);
  });

  it('replays the same seed and actions to an identical log', () => {
    const first = ok(dismissDuelPrivacy(roundFor()));
    const second = ok(dismissDuelPrivacy(roundFor()));
    const firstPlayed = ok(
      playDuelCard(first, firstHandId(first.battle, 'player')),
    );
    const secondPlayed = ok(
      playDuelCard(second, firstHandId(second.battle, 'player')),
    );

    expect(JSON.stringify(firstPlayed.log)).toBe(
      JSON.stringify(secondPlayed.log),
    );

    // Reading the log through the view mutates nothing, including PRNG state.
    const before = snapshot(firstPlayed);

    expect(battleViewOf(firstPlayed).log).toEqual(firstPlayed.log);
    expect(snapshot(firstPlayed)).toBe(before);
  });

  it('records only public settled facts across a full round', () => {
    const { final } = settleRound(newMatch());

    for (const entry of final.log) {
      expectPublicEntry(entry);
    }

    const ids = final.log.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(final.log.length).toBeLessThanOrEqual(80);

    let previous = -1;

    for (const entry of final.log) {
      expect(entry.ordinal).toBeGreaterThan(previous);
      previous = entry.ordinal;
    }

    expect(final.log.some((entry) => entry.kind === 'battle-start')).toBe(true);
    expect(final.log.some((entry) => entry.kind === 'card')).toBe(true);
    expect(final.log.some((entry) => entry.kind === 'turn')).toBe(true);

    // The outcome lives on the closing entry, not in a hidden field.
    const closing = final.log[final.log.length - 1];
    expect(
      closing?.effects.some((effect) => effect.kind === 'outcome'),
    ).toBe(true);
    expect(loggedCardIds(final.log).every((cardId) => cardId.length > 0)).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Round completion                                                            */
/* -------------------------------------------------------------------------- */

describe('round completion', () => {
  it('ends the round on a lethal play and rejects every later action', () => {
    const { before, final } = settleRound(newMatch());

    expect(before.phase).toBe('battle');
    expect(before.battle.outcome).toBe('ongoing');
    expect(final.phase).toBe('complete');
    expect(final.privacyPending).toBe(false);
    expect(final.roundWinner).toBe(before.viewer);
    expect(final.battle.outcome).toBe(
      final.roundWinner === 'player1'
        ? 'player-victory'
        : 'opponent-victory',
    );

    const loser: DuelPlayer =
      final.roundWinner === 'player1' ? 'player2' : 'player1';

    expect(final.battle.sides[sideForDuelPlayer(loser)].health).toBe(0);
    expect(canDuelAct(final)).toBe(false);

    const view = duelRoundView(final);

    expect(view.kind).toBe('result');

    if (view.kind !== 'result') {
      throw new Error('expected the round result view');
    }

    expect(view.winner).toBe(final.roundWinner);
    expect(view).not.toHaveProperty('hand');
    expect(view).not.toHaveProperty('self');
    expect(view).not.toHaveProperty('opponent');
    expect(view).not.toHaveProperty('log');
    expect(JSON.stringify(view)).not.toContain('cardId');

    const beforeRejections = snapshot(final);

    expect(
      rejected(playDuelCard(final, 'player:0:ember-cinder-jab')),
    ).toBe('round-complete');
    expect(rejected(endDuelTurn(final))).toBe('round-complete');
    expect(rejected(dismissDuelPrivacy(final))).toBe('round-complete');
    expect(snapshot(final)).toBe(beforeRejections);
  });

  it('maps an opponent-side victory back to Player 2', () => {
    const final = settleWithPlayerOnePassing(newMatch());

    expect(final.phase).toBe('complete');
    expect(final.roundWinner).toBe('player2');
    expect(final.battle.outcome).toBe('opponent-victory');
    expect(final.battle.sides.player.health).toBe(0);
    expect(final.viewer).toBe('player2');
    expect(rejected(endDuelTurn(final))).toBe('round-complete');
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                      */
/* -------------------------------------------------------------------------- */

describe('purity', () => {
  it('imports only the content data, the log domain, the engine battle and the match contract', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/duel/round.ts'),
      'utf8',
    );
    const specifiers = [
      ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);

    expect(new Set(specifiers)).toEqual(
      new Set([
        '../battle-log/derive',
        '../battle-log/types',
        '../content/cards',
        '../content/decks',
        '../engine/battle',
        '../engine/types',
        './match',
      ]),
    );
  });

  it('never persists, renders, or plans an AI turn', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/duel/round.ts'),
      'utf8',
    );

    for (const token of [
      'Math.random',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'window.',
      'document.',
      'fetch(',
      'XMLHttpRequest',
      'prepareEnemyTurn',
      'planEnemyTurn',
      'previewEnemyPlan',
      'enemyPlan',
      'fieldbound.',
      'dangerouslySetInnerHTML',
    ]) {
      expect(source).not.toContain(token);
    }
  });

  it('restates no combat, draw or affordability rule', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/duel/round.ts'),
      'utf8',
    );

    for (const token of [
      'HAND_SIZE',
      'TURN_START_ENERGY',
      'DEFENSE_CAP',
      'drawFrom',
      'resolveAttack',
      'resolveWard',
      'shuffle(',
      '.damage',
      '.cost',
    ]) {
      expect(source).not.toContain(token);
    }
  });
});
