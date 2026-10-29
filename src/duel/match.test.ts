// @vitest-environment node
/**
 * Local duel match model tests (DUEL-FR-02, DUEL-FR-05, VIS-NFR-04).
 *
 * Pure series arithmetic only: no storage, no React, no DOM and no engine
 * battle. Deck ids are the real starter ids from the content catalog, and every
 * rejection asserts a typed code plus an unchanged input match. The final block
 * reads the production source to prove the module cannot persist, render or
 * plan an AI turn.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DECK_IDS } from '../content/decks';
import {
  DUEL_PHASES,
  DUEL_PLAYERS,
  DUEL_ROUNDS,
  DUEL_WINS_REQUIRED,
  changeDecks,
  createMatch,
  deriveRoundSeed,
  duelOtherPlayer,
  duelPlayerForSide,
  firstPlayerForRound,
  matchWinner,
  recordRoundWinner,
  rematch,
  sideForDuelPlayer,
} from './match';
import type {
  DuelErrorCode,
  DuelMatch,
  DuelMatchSetup,
  DuelPlayer,
  DuelResult,
  DuelRound,
  DuelState,
} from './match';

/* -------------------------------------------------------------------------- */
/* Helpers and fixtures                                                        */
/* -------------------------------------------------------------------------- */

const P1_DECK = 'deck-ember';
const P2_DECK = 'deck-gale';
const SEED = 123_456_789;

/** Unwraps a successful transition; a failure fails the test with its code. */
function ok<T>(result: DuelResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `expected success, received ${result.error.code}: ${result.error.message}`,
    );
  }

  return result.value;
}

/** Returns the typed code of a rejected transition. */
function rejected<T>(result: DuelResult<T>): DuelErrorCode {
  if (result.ok) {
    throw new Error('expected a typed failure, received success');
  }

  return result.error.code;
}

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

/** A finished 2-0 series for the supplied seat. */
function completeMatch(winner: DuelPlayer): DuelMatch {
  const afterRoundOne = ok(recordRoundWinner(newMatch(), winner));

  return ok(recordRoundWinner(afterRoundOne, winner));
}

/** Plain JSON snapshot, used to prove a rejected action changed nothing. */
function snapshot(match: DuelMatch): string {
  return JSON.stringify(match);
}

/* -------------------------------------------------------------------------- */
/* Creation and locked decks                                                   */
/* -------------------------------------------------------------------------- */

describe('createMatch', () => {
  it('locks both deck ids and opens round 1 with Player 1 first', () => {
    const match = newMatch();

    expect(match.phase).toBe('round');
    expect(match.round).toBe(1);
    expect(match.firstPlayer).toBe('player1');
    expect(match.deckIds).toEqual({ player1: P1_DECK, player2: P2_DECK });
    expect(match.wins).toEqual({ player1: 0, player2: 0 });
    expect(match.roundWinners).toEqual([]);
    expect(match.seed).toBe(SEED);
    expect(match.roundSeed).toBe(deriveRoundSeed(SEED, 1));
  });

  it('resolves every pair of starter deck ids, including mirror matches', () => {
    for (const player1DeckId of DECK_IDS) {
      for (const player2DeckId of DECK_IDS) {
        const match = ok(
          createMatch({ player1DeckId, player2DeckId, seed: SEED }),
        );

        expect(match.deckIds).toEqual({ player1: player1DeckId, player2: player2DeckId });
        expect(match.phase).toBe('round');
      }
    }
  });

  it('rejects an unknown deck id for either seat with a typed error', () => {
    for (const unknown of ['deck-shadow', '', 'DECK-EMBER', 'deck-ember ']) {
      expect(
        rejected(
          createMatch(
            matchSetup({ player1DeckId: unknown }),
          ),
        ),
      ).toBe('unknown-deck');
      expect(
        rejected(
          createMatch(
            matchSetup({ player2DeckId: unknown }),
          ),
        ),
      ).toBe('unknown-deck');
    }
  });

  it('accepts the full unsigned 32-bit seed range', () => {
    for (const seed of [0, 1, 0xffff_ffff]) {
      const match = newMatch({ seed });

      expect(match.seed).toBe(seed);
      expect(Number.isInteger(match.roundSeed)).toBe(true);
      expect(match.roundSeed).not.toBe(seed);
    }
  });

  it('rejects seeds that are not unsigned 32-bit integers', () => {
    for (const seed of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0x1_0000_0000,
    ]) {
      expect(rejected(createMatch(matchSetup({ seed })))).toBe('invalid-seed');
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Round seeds                                                                 */
/* -------------------------------------------------------------------------- */

describe('round seeds', () => {
  it('derives a seed distinct from the match seed and from the other rounds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const seeds = DUEL_ROUNDS.map((round) => deriveRoundSeed(seed, round));

      expect(new Set(seeds).size).toBe(DUEL_ROUNDS.length);
      expect(seeds).not.toContain(seed);

      for (const roundSeed of seeds) {
        expect(Number.isInteger(roundSeed)).toBe(true);
        expect(roundSeed).toBeGreaterThanOrEqual(0);
        expect(roundSeed).toBeLessThanOrEqual(0xffff_ffff);
      }
    }
  });

  it('derives the same seeds for the same match seed', () => {
    const first = DUEL_ROUNDS.map((round) => deriveRoundSeed(SEED, round));
    const second = DUEL_ROUNDS.map((round) => deriveRoundSeed(SEED, round));

    expect(first).toEqual(second);
  });

  it('gives every round the seed derived for that round', () => {
    let match = newMatch();

    expect(match.roundSeed).toBe(deriveRoundSeed(match.seed, 1));

    match = ok(recordRoundWinner(match, 'player1'));
    expect(match.round).toBe(2);
    expect(match.roundSeed).toBe(deriveRoundSeed(match.seed, 2));

    match = ok(recordRoundWinner(match, 'player2'));
    expect(match.round).toBe(3);
    expect(match.roundSeed).toBe(deriveRoundSeed(match.seed, 3));
  });

  it('never lets a three-round series repeat a seed', () => {
    let match = newMatch();
    const seeds = [match.roundSeed];

    match = ok(recordRoundWinner(match, 'player1'));
    seeds.push(match.roundSeed);
    match = ok(recordRoundWinner(match, 'player2'));
    seeds.push(match.roundSeed);

    expect(new Set(seeds).size).toBe(3);

    for (const roundSeed of seeds) {
      expect(roundSeed).not.toBe(match.seed);
    }
  });

  it('rejects seeds and rounds outside the documented contract', () => {
    expect(() => deriveRoundSeed(-1, 1)).toThrow(RangeError);
    expect(() => deriveRoundSeed(1.5, 1)).toThrow(RangeError);
    expect(() => deriveRoundSeed(0x1_0000_0000, 1)).toThrow(RangeError);
    expect(() => deriveRoundSeed(SEED, 0 as DuelRound)).toThrow(RangeError);
    expect(() => deriveRoundSeed(SEED, 4 as DuelRound)).toThrow(RangeError);
  });
});

/* -------------------------------------------------------------------------- */
/* First-player alternation                                                    */
/* -------------------------------------------------------------------------- */

describe('first-player order', () => {
  it('documents Player 1, Player 2, Player 1 for rounds 1-3', () => {
    expect(firstPlayerForRound(1)).toBe('player1');
    expect(firstPlayerForRound(2)).toBe('player2');
    expect(firstPlayerForRound(3)).toBe('player1');
  });

  it('alternates while a 1-1 series reaches the decider', () => {
    let match = newMatch();

    expect(match.round).toBe(1);
    expect(match.firstPlayer).toBe('player1');

    match = ok(recordRoundWinner(match, 'player1'));
    expect(match.round).toBe(2);
    expect(match.firstPlayer).toBe('player2');
    expect(match.wins).toEqual({ player1: 1, player2: 0 });

    match = ok(recordRoundWinner(match, 'player2'));
    expect(match.round).toBe(3);
    expect(match.firstPlayer).toBe('player1');
    expect(match.wins).toEqual({ player1: 1, player2: 1 });
    expect(match.phase).toBe('round');
    expect(match.roundWinners).toEqual(['player1', 'player2']);
  });

  it('rejects rounds outside 1-3', () => {
    expect(() => firstPlayerForRound(0 as DuelRound)).toThrow(RangeError);
    expect(() => firstPlayerForRound(4 as DuelRound)).toThrow(RangeError);
    expect(() => firstPlayerForRound(1.5 as DuelRound)).toThrow(RangeError);
  });
});

/* -------------------------------------------------------------------------- */
/* Score and match completion                                                  */
/* -------------------------------------------------------------------------- */

describe('recordRoundWinner', () => {
  it('completes a 2-0 series after round 2', () => {
    let match = newMatch();

    match = ok(recordRoundWinner(match, 'player1'));
    expect(match.phase).toBe('round');
    expect(match.round).toBe(2);

    match = ok(recordRoundWinner(match, 'player1'));
    expect(match.phase).toBe('complete');
    expect(match.round).toBe(2);
    expect(match.wins).toEqual({ player1: 2, player2: 0 });
    expect(match.roundWinners).toEqual(['player1', 'player1']);
    expect(matchWinner(match)).toBe('player1');
  });

  it('records a 2-0 sweep for Player 2 with Player 2 first in round 2', () => {
    let match = ok(recordRoundWinner(newMatch(), 'player2'));

    expect(match.round).toBe(2);
    expect(match.firstPlayer).toBe('player2');

    match = ok(recordRoundWinner(match, 'player2'));
    expect(match.phase).toBe('complete');
    expect(match.wins).toEqual({ player1: 0, player2: 2 });
    expect(matchWinner(match)).toBe('player2');
  });

  it('plays the 1-1 decider in round 3 and settles 2-1', () => {
    let match = newMatch();

    match = ok(recordRoundWinner(match, 'player1'));
    match = ok(recordRoundWinner(match, 'player2'));

    expect(match.round).toBe(3);
    expect(match.firstPlayer).toBe('player1');
    expect(match.phase).toBe('round');

    match = ok(recordRoundWinner(match, 'player1'));
    expect(match.phase).toBe('complete');
    expect(match.round).toBe(3);
    expect(match.wins).toEqual({ player1: 2, player2: 1 });
    expect(match.roundWinners).toEqual(['player1', 'player2', 'player1']);
    expect(matchWinner(match)).toBe('player1');
  });

  it('rejects a third win once the match is complete and changes nothing', () => {
    const match = completeMatch('player1');
    const before = snapshot(match);
    const beforeRoundSeed = match.roundSeed;

    for (const winner of DUEL_PLAYERS) {
      expect(rejected(recordRoundWinner(match, winner))).toBe('match-complete');
    }

    expect(snapshot(match)).toBe(before);
    expect(match.roundSeed).toBe(beforeRoundSeed);
    expect(match.wins).toEqual({ player1: 2, player2: 0 });
  });

  it('rejects an unknown seat and leaves the match unchanged', () => {
    const match = newMatch();
    const before = snapshot(match);

    expect(
      rejected(recordRoundWinner(match, 'player3' as DuelPlayer)),
    ).toBe('invalid-player');
    expect(snapshot(match)).toBe(before);
  });

  it('returns a new match rather than mutating the previous round', () => {
    const roundOne = newMatch();
    const roundTwo = ok(recordRoundWinner(roundOne, 'player1'));

    expect(roundTwo).not.toBe(roundOne);
    expect(roundOne.round).toBe(1);
    expect(roundOne.firstPlayer).toBe('player1');
    expect(roundOne.wins).toEqual({ player1: 0, player2: 0 });
    expect(roundOne.roundWinners).toEqual([]);
    expect(roundTwo.wins).toEqual({ player1: 1, player2: 0 });
    expect(roundTwo.roundWinners).toEqual(['player1']);
  });

  it('keeps the score symmetric regardless of which seat goes first', () => {
    let match = newMatch();

    match = ok(recordRoundWinner(match, 'player2'));
    expect(match.wins).toEqual({ player1: 0, player2: 1 });

    match = ok(recordRoundWinner(match, 'player1'));
    expect(match.wins).toEqual({ player1: 1, player2: 1 });
    expect(match.phase).toBe('round');
  });
});

/* -------------------------------------------------------------------------- */
/* Rematch                                                                     */
/* -------------------------------------------------------------------------- */

describe('rematch', () => {
  it('keeps both decks, resets the score, returns to Player 1 and changes the seed', () => {
    const finished = completeMatch('player2');
    const next = ok(rematch(finished));

    expect(next.deckIds).toEqual(finished.deckIds);
    expect(next.wins).toEqual({ player1: 0, player2: 0 });
    expect(next.round).toBe(1);
    expect(next.firstPlayer).toBe('player1');
    expect(next.phase).toBe('round');
    expect(next.roundWinners).toEqual([]);
    expect(next.seed).not.toBe(finished.seed);
    expect(next.roundSeed).toBe(deriveRoundSeed(next.seed, 1));
    expect(next.roundSeed).not.toBe(next.seed);
    expect(matchWinner(next)).toBeNull();
  });

  it('is deterministic for the same finished series', () => {
    const finished = completeMatch('player1');

    expect(ok(rematch(finished))).toEqual(ok(rematch(finished)));
  });

  it('leaves the completed match untouched', () => {
    const finished = completeMatch('player1');
    const before = snapshot(finished);

    ok(rematch(finished));

    expect(snapshot(finished)).toBe(before);
  });

  it('changes the seed again on a second rematch', () => {
    const first = completeMatch('player1');
    const second = ok(rematch(first));
    const secondFinished = ok(
      recordRoundWinner(
        ok(recordRoundWinner(second, 'player2')),
        'player2',
      ),
    );
    const third = ok(rematch(secondFinished));

    expect(secondFinished.seed).toBe(second.seed);
    expect(third.seed).not.toBe(second.seed);
    expect(third.deckIds).toEqual(first.deckIds);
  });

  it('rejects a rematch while a round is still in progress', () => {
    const match = newMatch();
    const before = snapshot(match);

    expect(rejected(rematch(match))).toBe('match-in-progress');
    expect(snapshot(match)).toBe(before);

    const afterOneRound = ok(recordRoundWinner(match, 'player1'));
    expect(rejected(rematch(afterOneRound))).toBe('match-in-progress');
  });
});

/* -------------------------------------------------------------------------- */
/* Change decks                                                                */
/* -------------------------------------------------------------------------- */

describe('changeDecks', () => {
  it('clears the series and returns the setup phase', () => {
    const state = changeDecks();

    expect(state).toEqual({ phase: 'setup' });
    expect(state).not.toHaveProperty('deckIds');
    expect(state).not.toHaveProperty('seed');
    expect(state).not.toHaveProperty('wins');
    expect(state).not.toHaveProperty('roundSeed');
  });

  it('fits the duel state union as the setup branch', () => {
    const state: DuelState = changeDecks();

    expect(state.phase).toBe('setup');
    expect(DUEL_PHASES).toContain(state.phase);
  });
});

/* -------------------------------------------------------------------------- */
/* Winner and seat helpers                                                     */
/* -------------------------------------------------------------------------- */

describe('matchWinner', () => {
  it('is null until one seat holds two wins', () => {
    expect(matchWinner(newMatch())).toBeNull();
    expect(
      matchWinner(ok(recordRoundWinner(newMatch(), 'player1'))),
    ).toBeNull();
    expect(matchWinner(completeMatch('player1'))).toBe('player1');
    expect(matchWinner(completeMatch('player2'))).toBe('player2');
  });
});

describe('seat helpers', () => {
  it('maps the two human seats onto the symmetric engine sides', () => {
    expect(sideForDuelPlayer('player1')).toBe('player');
    expect(sideForDuelPlayer('player2')).toBe('opponent');
    expect(duelPlayerForSide('player')).toBe('player1');
    expect(duelPlayerForSide('opponent')).toBe('player2');
  });

  it('names the other seat', () => {
    expect(duelOtherPlayer('player1')).toBe('player2');
    expect(duelOtherPlayer('player2')).toBe('player1');
  });

  it('requires exactly two wins for the match', () => {
    expect(DUEL_WINS_REQUIRED).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                      */
/* -------------------------------------------------------------------------- */

describe('purity', () => {
  it('imports only the content catalog and the engine PRNG contract', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/duel/match.ts'),
      'utf8',
    );
    const specifiers = [
      ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);

    expect(new Set(specifiers)).toEqual(
      new Set(['../content/decks', '../engine/rng', '../engine/types']),
    );
  });

  it('never reads storage, renders, or plans an AI turn', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/duel/match.ts'),
      'utf8',
    );

    for (const token of [
      'Math.random',
      'localStorage',
      'sessionStorage',
      'window.',
      'document.',
      'fetch(',
      'XMLHttpRequest',
      'planEnemyTurn',
      'fieldbound.',
      'dangerouslySetInnerHTML',
    ]) {
      expect(source).not.toContain(token);
    }
  });
});
