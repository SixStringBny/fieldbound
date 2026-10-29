/**
 * Pure local-duel match model (DUEL-FR-02, DUEL-FR-05, VIS-CON-08).
 *
 * A duel is a best-of-three between two humans on one shared device. This
 * module owns the series layer only:
 *
 *   phase 'round' ──recordRoundWinner──▶ next round (2 or 3)
 *          ▲                                      │
 *          └──────────── rematch ◀── phase 'complete' ◀── two wins
 *                                         │
 *                                   changeDecks()
 *                                         ▼
 *                                   phase 'setup'
 *
 * Guarantees:
 *
 *   - both deck ids are locked at creation and validated against the frozen
 *     content catalog; an unknown id is a typed error, never a fallback deck;
 *   - the round seed is derived through the single engine PRNG from the match
 *     seed and the round index, so rounds 1-3 never share a seed, no round
 *     replays the match seed's shuffle and the same match seed reproduces the
 *     same series (VIS-NFR-04);
 *   - the opening player alternates Player 1, Player 2, Player 1;
 *   - the match ends at two round wins; every later result is rejected with
 *     `match-complete` instead of being queued;
 *   - a rematch keeps both locked decks, resets the score, derives a new match
 *     seed and returns to round 1 with Player 1 first;
 *   - `changeDecks()` discards the series and returns the setup phase.
 *
 * This module renders nothing, persists nothing (VIS-NFR-05), imports no
 * React, DOM, storage or screen module and never calls the AI planner. Battle
 * rules stay in `src/engine`; the duel layer only decides which human owns
 * which symmetric engine side and which seed a round begins from
 * (VIS-CON-08).
 */
import { deckById } from '../content/decks';
import { createRng, nextUint32 } from '../engine/rng';
import type { Side } from '../engine/types';

/* -------------------------------------------------------------------------- */
/* Frozen duel numbers                                                         */
/* -------------------------------------------------------------------------- */

/** Rounds in a best-of-three: 1, 2 and the 1-1 decider. */
export const DUEL_ROUNDS = [1, 2, 3] as const;
export type DuelRound = (typeof DUEL_ROUNDS)[number];

/** A match is complete as soon as one player holds this many round wins. */
export const DUEL_WINS_REQUIRED = 2 as const;

/** Highest round number a legal series can reach. */
export const DUEL_MAX_ROUNDS: DuelRound = 3;

/** The two human seats. They are fixed for the whole series. */
export const DUEL_PLAYERS = ['player1', 'player2'] as const;
export type DuelPlayer = (typeof DUEL_PLAYERS)[number];

/** Lifecycle phases: setup, a playable round, or a finished series. */
export const DUEL_PHASES = ['setup', 'round', 'complete'] as const;
export type DuelPhase = (typeof DUEL_PHASES)[number];

/* -------------------------------------------------------------------------- */
/* Match state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Locked deck ids, one per human seat. They are chosen during setup and never
 * change for the life of a match, including across a rematch.
 */
export type DuelDeckIds = Readonly<Record<DuelPlayer, string>>;

/** Round wins per seat; always 0-0, 0-1, 1-0, 1-1 or a completed 2-x. */
export type DuelWins = Readonly<Record<DuelPlayer, number>>;

/** Input accepted by `createMatch` once both players have confirmed a deck. */
export interface DuelMatchSetup {
  readonly player1DeckId: string;
  readonly player2DeckId: string;
  /** Unsigned 32-bit match seed; the first seed of the series. */
  readonly seed: number;
}

/**
 * One best-of-three series.
 *
 * `round` is the round currently being played, or the last round played when
 * the match is complete. `roundSeed` belongs to that round: the round
 * controller builds the engine battle from it, and it is re-derived from
 * `seed` and `round` on every advance, so it is stable across re-renders.
 *
 * `roundWinners` is append-only history for the score presentation; the score
 * itself is `wins`. Neither field ever contains hidden battle information.
 */
export interface DuelMatch {
  readonly phase: 'round' | 'complete';
  readonly deckIds: DuelDeckIds;
  /** Match seed the series started from; a rematch replaces it. */
  readonly seed: number;
  readonly round: DuelRound;
  /** Human seat that takes turn 1 of `round`. */
  readonly firstPlayer: DuelPlayer;
  readonly wins: DuelWins;
  /** Seed for `round`; distinct from `seed` and from every other round. */
  readonly roundSeed: number;
  /** Round winners in played order, one per completed round. */
  readonly roundWinners: readonly DuelPlayer[];
}

/**
 * The cleared state after Change decks (or before a match exists). Duels are
 * ephemeral, so setup carries no deck, score or seed from the previous series.
 */
export interface DuelSetupState {
  readonly phase: 'setup';
}

/** Everything one screen or controller needs to render the duel layer. */
export type DuelState = DuelSetupState | DuelMatch;

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

/** Typed reasons a match transition or setup can be rejected. */
export type DuelErrorCode =
  | 'invalid-seed'
  | 'unknown-deck'
  | 'invalid-player'
  | 'invalid-phase'
  | 'match-complete'
  | 'match-in-progress'
  | 'invalid-state';

export interface DuelError {
  readonly code: DuelErrorCode;
  readonly message: string;
}

export interface DuelSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface DuelFailure {
  readonly ok: false;
  readonly error: DuelError;
}

/** Discriminated result for every fallible duel transition. */
export type DuelResult<T> = DuelSuccess<T> | DuelFailure;

function failure(code: DuelErrorCode, message: string): DuelFailure {
  return { ok: false, error: { code, message } };
}

function success<T>(value: T): DuelSuccess<T> {
  return { ok: true, value };
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                          */
/* -------------------------------------------------------------------------- */

const UINT32_MAX = 0xffff_ffff;

function isUint32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= UINT32_MAX
  );
}

function isDuelRound(value: number): value is DuelRound {
  return Number.isInteger(value) && value >= 1 && value <= DUEL_MAX_ROUNDS;
}

/* -------------------------------------------------------------------------- */
/* Seat and ordering helpers                                                   */
/* -------------------------------------------------------------------------- */

/** The other human seat. */
export function duelOtherPlayer(player: DuelPlayer): DuelPlayer {
  return player === 'player1' ? 'player2' : 'player1';
}

/**
 * Fixed seat-to-engine-side mapping. Player 1 is the engine's `player` side in
 * every round and Player 2 is `opponent`, so the round controller never has to
 * re-derive a mapping and both humans use the same symmetric engine actions.
 */
export function sideForDuelPlayer(player: DuelPlayer): Side {
  return player === 'player1' ? 'player' : 'opponent';
}

/** Inverse of `sideForDuelPlayer`, for mapping a settled battle back to a seat. */
export function duelPlayerForSide(side: Side): DuelPlayer {
  return side === 'player' ? 'player1' : 'player2';
}

/**
 * Documented first-player order: round 1 Player 1, round 2 Player 2, round 3
 * Player 1. Throws `RangeError` only for a value outside the round contract;
 * game flow only ever passes a validated `DuelRound`.
 */
export function firstPlayerForRound(round: DuelRound): DuelPlayer {
  if (!isDuelRound(round)) {
    throw new RangeError(
      `round must be an integer in 1..${String(DUEL_MAX_ROUNDS)}, received ${String(round)}`,
    );
  }

  return round === 1 || round === 3 ? 'player1' : 'player2';
}

/* -------------------------------------------------------------------------- */
/* Round-seed derivation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic round seed for `round`, derived from `matchSeed` (PRNG
 * consumer #6 of the seeded-determinism contract).
 *
 * A fresh engine state is seeded with `matchSeed`; one value is drawn per round
 * in index order, and the draw is retried only for the astronomically unlikely
 * value that collides with the match seed or an earlier round seed. Recomputing
 * rounds 1..n from the same match seed therefore always produces exactly the
 * same seeds, while no round can replay the match seed's shuffle or another
 * round's shuffle.
 *
 * Throws `RangeError` only for input outside the documented contract; game flow
 * reaches this through validated match state.
 */
export function deriveRoundSeed(matchSeed: number, round: DuelRound): number {
  if (!isUint32(matchSeed)) {
    throw new RangeError(
      `match seed must be an unsigned 32-bit integer, received ${String(matchSeed)}`,
    );
  }

  if (!isDuelRound(round)) {
    throw new RangeError(
      `round must be an integer in 1..${String(DUEL_MAX_ROUNDS)}, received ${String(round)}`,
    );
  }

  const used = new Set<number>([matchSeed]);
  let state = createRng(matchSeed);
  let seed = 0;

  for (let index = 1; index <= round; index += 1) {
    let candidate = 0;

    do {
      const draw = nextUint32(state);
      state = draw.state;
      candidate = draw.value;
    } while (used.has(candidate));

    used.add(candidate);
    seed = candidate;
  }

  return seed;
}

/**
 * Derives the next match seed for a rematch (PRNG consumer #7): one draw from
 * the previous match seed, advanced only if it reproduces the previous seed so
 * a rematch always changes the series. The previous seed is validated by the
 * caller.
 */
function nextMatchSeed(previousSeed: number): number {
  let state = createRng(previousSeed);
  let candidate = previousSeed;

  do {
    const draw = nextUint32(state);
    state = draw.state;
    candidate = draw.value;
  } while (candidate === previousSeed);

  return candidate;
}

/* -------------------------------------------------------------------------- */
/* Match builders                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Builds a fresh round-1 match. The caller has already validated `seed` and the
 * deck ids, so this only fixes the documented opening state: 0-0, Player 1
 * first and a round seed distinct from the match seed.
 */
function buildMatch(deckIds: DuelDeckIds, seed: number): DuelMatch {
  return {
    phase: 'round',
    deckIds: { player1: deckIds.player1, player2: deckIds.player2 },
    seed,
    round: 1,
    firstPlayer: firstPlayerForRound(1),
    wins: { player1: 0, player2: 0 },
    roundSeed: deriveRoundSeed(seed, 1),
    roundWinners: [],
  };
}

/**
 * Checks one locked deck id against the content catalog without touching state.
 * Returns `null` when the id is usable.
 */
function deckProblem(
  player: DuelPlayer,
  deckId: string,
): DuelFailure | null {
  if (typeof deckId !== 'string' || deckId.length === 0) {
    return failure(
      'unknown-deck',
      `${player} deck id must be a non-empty string, received ${String(deckId)}`,
    );
  }

  if (deckById(deckId) === undefined) {
    return failure(
      'unknown-deck',
      `${player} deck id "${deckId}" is not a starter deck`,
    );
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Starts a best-of-three from two locked starter deck ids and a match seed.
 *
 * Both deck ids must resolve against the frozen content catalog; two players may
 * lock the same deck. The returned match is ready for round 1 with Player 1
 * first and its round seed already derived, so the round controller can build
 * the battle without drawing again.
 */
export function createMatch(setup: DuelMatchSetup): DuelResult<DuelMatch> {
  if (!isUint32(setup.seed)) {
    return failure(
      'invalid-seed',
      `seed must be an unsigned 32-bit integer, received ${String(setup.seed)}`,
    );
  }

  const player1Problem = deckProblem('player1', setup.player1DeckId);
  if (player1Problem !== null) {
    return player1Problem;
  }

  const player2Problem = deckProblem('player2', setup.player2DeckId);
  if (player2Problem !== null) {
    return player2Problem;
  }

  return success(
    buildMatch(
      { player1: setup.player1DeckId, player2: setup.player2DeckId },
      setup.seed,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Round transitions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Records exactly one round winner and moves the series forward.
 *
 *   - the score becomes `x + 1` for the winner;
 *   - at two wins the match moves to `complete` and nothing else changes;
 *   - below two wins the next round begins with the alternating first player
 *     and its freshly derived seed;
 *   - a completed match rejects every later winner with `match-complete`, so a
 *     third win is never counted;
 *   - an unknown seat is rejected with `invalid-player`.
 *
 * Every rejection returns a typed failure and leaves the supplied match
 * untouched; every success returns a new object rather than mutating it.
 */
export function recordRoundWinner(
  match: DuelMatch,
  winner: DuelPlayer,
): DuelResult<DuelMatch> {
  const decided =
    match.wins.player1 >= DUEL_WINS_REQUIRED ||
    match.wins.player2 >= DUEL_WINS_REQUIRED;

  if (match.phase === 'complete' || decided) {
    return failure(
      'match-complete',
      'the match is already complete; a further round win cannot be recorded',
    );
  }

  if (match.phase !== 'round') {
    return failure(
      'invalid-phase',
      `a round winner can only be recorded in the round phase, not ${match.phase}`,
    );
  }

  if (winner !== 'player1' && winner !== 'player2') {
    return failure(
      'invalid-player',
      `winner must be player1 or player2, received ${String(winner)}`,
    );
  }

  const wins: DuelWins =
    winner === 'player1'
      ? { player1: match.wins.player1 + 1, player2: match.wins.player2 }
      : { player1: match.wins.player1, player2: match.wins.player2 + 1 };

  const roundWinners = [...match.roundWinners, winner];

  if (wins[winner] >= DUEL_WINS_REQUIRED) {
    return success({
      ...match,
      phase: 'complete',
      wins,
      roundWinners,
    });
  }

  const nextRound = match.round + 1;

  if (!isDuelRound(nextRound)) {
    return failure(
      'invalid-state',
      `round ${String(match.round)} has no successor but neither player has ${String(DUEL_WINS_REQUIRED)} wins`,
    );
  }

  return success({
    ...match,
    round: nextRound,
    firstPlayer: firstPlayerForRound(nextRound),
    wins,
    roundSeed: deriveRoundSeed(match.seed, nextRound),
    roundWinners,
  });
}

/* -------------------------------------------------------------------------- */
/* Rematch and teardown                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Starts a rematch from a completed series: both locked deck ids are kept, the
 * score resets to 0-0, round 1 begins with Player 1 first, and the match seed
 * and round seed both change. Any in-progress series is rejected so a rematch
 * cannot silently erase a round still being played.
 *
 * The new match seed is derived deterministically from the finished one, which
 * keeps a seeded journey replayable while still guaranteeing a different
 * shuffle.
 */
export function rematch(match: DuelMatch): DuelResult<DuelMatch> {
  if (match.phase !== 'complete') {
    return failure(
      'match-in-progress',
      'a rematch is only available after the match is complete',
    );
  }

  if (!isUint32(match.seed)) {
    return failure(
      'invalid-state',
      `match seed must be an unsigned 32-bit integer, received ${String(match.seed)}`,
    );
  }

  return success(buildMatch(match.deckIds, nextMatchSeed(match.seed)));
}

/**
 * Change decks: clears the series and returns the setup phase. The match object
 * is not consulted because a duel is intentionally ephemeral - the controller
 * discards it and renders setup again (DUEL-FR-05).
 */
export function changeDecks(): DuelSetupState {
  return { phase: 'setup' };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The series winner, or `null` while the match is still running. Reads only the
 * recorded score, so the result screen cannot invent a winner from battle
 * state.
 */
export function matchWinner(match: DuelMatch): DuelPlayer | null {
  if (match.phase !== 'complete') {
    return null;
  }

  if (match.wins.player1 >= DUEL_WINS_REQUIRED) {
    return 'player1';
  }

  if (match.wins.player2 >= DUEL_WINS_REQUIRED) {
    return 'player2';
  }

  return null;
}
