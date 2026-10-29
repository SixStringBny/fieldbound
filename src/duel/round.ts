/**
 * Privacy-gated duel round controller (DUEL-FR-02, DUEL-FR-03, DUEL-FR-04,
 * DUEL-FR-06, VIS-US-02, VIS-CON-08).
 *
 * A duel round is one symmetric engine battle with a human sitting on each
 * side. This module owns exactly the shared-device layer:
 *
 *   createDuelRound ──▶ privacy ──dismissPrivacy──▶ battle ──endDuelTurn──▶ privacy
 *                          │                         │
 *                          └─────────── no action ───┘
 *                                                    │ settled outcome
 *                                                    ▼
 *                                                 complete
 *
 * Guarantees:
 *
 *   - both sides are built from the locked deck ids and the match's round seed,
 *     so round 1, 2 and 3 shuffle differently and a round always starts at 40
 *     health, Neutral field, 0 defense, no statuses, 3 energy and a 5-card hand
 *     (the engine owns those values; this module never restates them);
 *   - every turn, including the first turn of a round, begins with
 *     `privacyPending: true`; the battle exists but the view exposes nothing
 *     about it until an explicit dismissal;
 *   - Play and End Turn are rejected while privacy is pending and after the
 *     round settles; rejections are typed and leave the supplied state
 *     untouched;
 *   - only the acting viewer's hand leaves the controller as card ids; the
 *     opponent is a count, and the privacy view carries no battle detail at
 *     all;
 *   - a settled engine outcome is mapped back to the human seat and ends the
 *     round immediately, so a later action cannot be queued;
 *   - both humans drive the same engine functions with the same explicit side
 *     mapping, and no AI planner, storage key, screen or DOM is involved.
 *
 * The series stays in `match.ts`: this controller only reads the match to learn
 * the round number, seed, first player, locked decks and entering score. It
 * never records a round win itself, so the match model remains the single owner
 * of the best-of-three score (VIS-CON-08).
 */
import { byId as CARD_CATALOG } from '../content/cards';
import { deckById } from '../content/decks';
import { createBattle, endTurn, otherSide, playCard } from '../engine/battle';
import type {
  BattleOutcome,
  BattleSide,
  BattleState,
  Element,
  EngineErrorCode,
  Side,
  StatusCounters,
} from '../engine/types';
import { duelPlayerForSide, sideForDuelPlayer } from './match';
import type { DuelMatch, DuelPlayer, DuelRound, DuelWins } from './match';

/* -------------------------------------------------------------------------- */
/* Public constants and errors                                                 */
/* -------------------------------------------------------------------------- */

/** Round-controller phases: hidden handoff, active turn, or settled round. */
export const DUEL_ROUND_PHASES = ['privacy', 'battle', 'complete'] as const;
export type DuelRoundPhase = (typeof DUEL_ROUND_PHASES)[number];

/**
 * Typed reasons a round transition can be rejected. Engine rejections keep the
 * engine's own code (`card-not-in-hand`, `unaffordable-card`, ...) so the duel
 * layer never invents a second vocabulary for the same rule.
 */
export type DuelRoundErrorCode =
  | EngineErrorCode
  | 'privacy-pending'
  | 'privacy-not-pending'
  | 'round-complete'
  | 'invalid-match'
  | 'unknown-deck';

export interface DuelRoundError {
  readonly code: DuelRoundErrorCode;
  readonly message: string;
}

export interface DuelRoundSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface DuelRoundFailure {
  readonly ok: false;
  readonly error: DuelRoundError;
}

/** Discriminated result for every fallible round transition. */
export type DuelRoundResult<T> = DuelRoundSuccess<T> | DuelRoundFailure;

function failure(
  code: DuelRoundErrorCode,
  message: string,
): DuelRoundFailure {
  return { ok: false, error: { code, message } };
}

function success<T>(value: T): DuelRoundSuccess<T> {
  return { ok: true, value };
}

/* -------------------------------------------------------------------------- */
/* Round state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fields every round state carries. `match` is the series as it stood when the
 * round began; the entering score is presentation data only.
 */
interface DuelRoundCommon {
  readonly match: DuelMatch;
  /**
   * The live engine battle. Hidden from every view until the privacy gate is
   * dismissed on the first turn and between every later turn.
   */
  readonly battle: BattleState;
  /** Human seat whose turn this is once the gate is dismissed. */
  readonly viewer: DuelPlayer;
}

/**
 * A turn is waiting behind the full-screen handoff. `roundWinner` is `null`
 * because a round that has not started cannot have one.
 */
export interface DuelRoundPrivacy extends DuelRoundCommon {
  readonly phase: 'privacy';
  readonly privacyPending: true;
  readonly roundWinner: null;
}

/**
 * The active viewer has dismissed privacy and may act. Only this phase accepts
 * Play or End Turn.
 */
export interface DuelRoundBattle extends DuelRoundCommon {
  readonly phase: 'battle';
  readonly privacyPending: false;
  readonly roundWinner: null;
}

/**
 * Either side reached 0 health. The winner is recorded in the round state and
 * every later transition is rejected with `round-complete`.
 */
export interface DuelRoundComplete extends DuelRoundCommon {
  readonly phase: 'complete';
  readonly privacyPending: false;
  readonly roundWinner: DuelPlayer;
}

/**
 * The privacy field and phase literal make the gate structural: a state that
 * claims to be a live battle cannot also report pending privacy, and a complete
 * round always names a winner.
 */
export type DuelRoundState =
  | DuelRoundPrivacy
  | DuelRoundBattle
  | DuelRoundComplete;

/* -------------------------------------------------------------------------- */
/* Redacted views                                                              */
/* -------------------------------------------------------------------------- */

/** One card the viewer is allowed to see, by instance and catalog id. */
export interface DuelHandCard {
  readonly instanceId: string;
  readonly cardId: string;
}

/** The active viewer's own panel. Only their own hand is ever listed here. */
export interface DuelSelfView {
  readonly player: DuelPlayer;
  readonly side: Side;
  readonly element: Element;
  readonly health: number;
  readonly maxHealth: number;
  readonly defense: number;
  readonly energy: number;
  readonly statuses: StatusCounters;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardCount: number;
}

/**
 * The opposing panel. Deliberately no hand, card ids or energy: the opponent's
 * hand is represented by `handCount`, and their unspent energy cannot matter
 * because their turn starts at the engine's fixed turn-start value.
 */
export interface DuelOpponentView {
  readonly player: DuelPlayer;
  readonly side: Side;
  readonly element: Element;
  readonly health: number;
  readonly maxHealth: number;
  readonly defense: number;
  readonly statuses: StatusCounters;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardCount: number;
}

/**
 * The handoff screen view. It names the player and nothing else about the
 * battle: no health, field, deck, hand count, card name or cost. An explicit
 * dismissal is the only way forward (DUEL-FR-03).
 */
export interface DuelPrivacyView {
  readonly kind: 'privacy';
  readonly viewer: DuelPlayer;
  readonly round: DuelRound;
  /** Series score entering the round; no battle information. */
  readonly wins: DuelWins;
}

/**
 * The active-turn view. `hand` belongs to `viewer` only; `opponent` exposes a
 * count. This is the only view that carries card ids.
 */
export interface DuelBattleView {
  readonly kind: 'battle';
  readonly viewer: DuelPlayer;
  readonly round: DuelRound;
  /** Series score entering the round. */
  readonly wins: DuelWins;
  readonly field: Element;
  readonly turn: number;
  readonly self: DuelSelfView;
  readonly opponent: DuelOpponentView;
  readonly hand: readonly DuelHandCard[];
}

/** The settled-round view. It carries no hand from either side. */
export interface DuelRoundResultView {
  readonly kind: 'result';
  readonly viewer: DuelPlayer;
  readonly winner: DuelPlayer;
  readonly round: DuelRound;
  /** Series score entering the round, before the winner is recorded. */
  readonly wins: DuelWins;
}

/** Everything a screen may render for a duel round. */
export type DuelRoundView =
  | DuelPrivacyView
  | DuelBattleView
  | DuelRoundResultView;

/* -------------------------------------------------------------------------- */
/* Outcome mapping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Maps a settled engine outcome back to the human seat. The engine names its
 * outcomes from the `player` side's perspective, and `player` is permanently
 * Player 1 (`sideForDuelPlayer`), so this never guesses from health.
 */
function winnerForOutcome(outcome: BattleOutcome): DuelPlayer | null {
  if (outcome === 'player-victory') {
    return 'player1';
  }

  if (outcome === 'opponent-victory') {
    return 'player2';
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds a fresh round from an in-progress match.
 *
 * Both deck ids must still resolve against the content catalog (the match model
 * already validated them at creation, so an unknown id here means a malformed
 * match object). The battle is seeded with the match's `roundSeed`, both sides
 * start from their locked deck lists, and the opening turn belongs to the
 * match's first player. The result is always the privacy state: the engine
 * deals both hands immediately, but nothing is exposed until an explicit
 * dismissal.
 */
export function createDuelRound(
  match: DuelMatch,
): DuelRoundResult<DuelRoundState> {
  if (match.phase !== 'round') {
    return failure(
      'invalid-match',
      `a round can only start from an in-progress match, not the ${match.phase} phase`,
    );
  }

  const player1Deck = deckById(match.deckIds.player1);

  if (player1Deck === undefined) {
    return failure(
      'unknown-deck',
      `player1 deck id "${match.deckIds.player1}" is not a starter deck`,
    );
  }

  const player2Deck = deckById(match.deckIds.player2);

  if (player2Deck === undefined) {
    return failure(
      'unknown-deck',
      `player2 deck id "${match.deckIds.player2}" is not a starter deck`,
    );
  }

  const created = createBattle({
    seed: match.roundSeed,
    player: { element: player1Deck.element, cards: player1Deck.cards },
    opponent: { element: player2Deck.element, cards: player2Deck.cards },
    catalog: CARD_CATALOG,
    startingSide: sideForDuelPlayer(match.firstPlayer),
  });

  if (!created.ok) {
    return failure(created.error.code, created.error.message);
  }

  const viewer = duelPlayerForSide(created.value.activeSide);

  if (viewer !== match.firstPlayer) {
    return failure(
      'invalid-match',
      `round ${String(match.round)} must open with ${match.firstPlayer}, not ${viewer}`,
    );
  }

  const state: DuelRoundPrivacy = {
    match,
    battle: created.value,
    phase: 'privacy',
    privacyPending: true,
    viewer,
    roundWinner: null,
  };

  return success(state);
}

/* -------------------------------------------------------------------------- */
/* Privacy gate                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The only acceptable way to reveal the battle for the current turn. Callers
 * wire this to an explicit "I'm ready" activation; Escape and any other key
 * must not reach it (DUEL-FR-03).
 *
 * Rejects a second dismissal with `privacy-not-pending` and any dismissal after
 * the round settled with `round-complete`. The battle object is carried across
 * untouched, so revealing a hand cannot deal, draw or reshuffle anything.
 */
export function dismissDuelPrivacy(
  state: DuelRoundState,
): DuelRoundResult<DuelRoundState> {
  if (state.phase === 'complete') {
    return failure(
      'round-complete',
      'the round is complete; privacy cannot be dismissed again',
    );
  }

  if (state.phase === 'battle') {
    return failure(
      'privacy-not-pending',
      'privacy has already been dismissed for this turn',
    );
  }

  const revealed: DuelRoundBattle = {
    match: state.match,
    battle: state.battle,
    phase: 'battle',
    privacyPending: false,
    viewer: state.viewer,
    roundWinner: null,
  };

  return success(revealed);
}

/* -------------------------------------------------------------------------- */
/* Action gate                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The single gate every action passes through. A complete round rejects first,
 * then a pending handoff, then an internally inconsistent battle. It returns the
 * narrowed battle state so callers cannot dispatch against a hidden hand.
 */
function actionGate(
  state: DuelRoundState,
): DuelRoundResult<DuelRoundBattle> {
  if (state.phase === 'complete') {
    return failure(
      'round-complete',
      'the round is complete; every later action is rejected',
    );
  }

  if (state.phase === 'privacy') {
    return failure(
      'privacy-pending',
      `privacy is still pending for ${state.viewer}; dismiss the handoff before acting`,
    );
  }

  if (
    state.battle.outcome !== 'ongoing' ||
    state.battle.phase !== 'action' ||
    state.battle.activeSide !== sideForDuelPlayer(state.viewer)
  ) {
    return failure(
      'invalid-state',
      `the live battle is not ready for ${state.viewer} to act`,
    );
  }

  return success(state);
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Plays one card for the active viewer and returns the next round state.
 *
 * The engine is the only place a play is validated or resolved. Its typed
 * rejection is forwarded unchanged and the supplied state is not touched, which
 * is what makes a duplicate tap, an unaffordable card or a card from the other
 * hand harmless. A play that settles the battle ends the round immediately: the
 * winner is recorded and no further play or handoff is accepted.
 */
export function playDuelCard(
  state: DuelRoundState,
  instanceId: string,
): DuelRoundResult<DuelRoundState> {
  const gate = actionGate(state);

  if (!gate.ok) {
    return gate;
  }

  const active = gate.value;
  const played = playCard(
    active.battle,
    {
      type: 'play-card',
      side: sideForDuelPlayer(active.viewer),
      instanceId,
    },
    CARD_CATALOG,
  );

  if (!played.ok) {
    return failure(played.error.code, played.error.message);
  }

  if (played.value.outcome !== 'ongoing') {
    const winner = winnerForOutcome(played.value.outcome);

    if (winner === null) {
      return failure(
        'invalid-state',
        'the battle settled without naming a winner',
      );
    }

    const complete: DuelRoundComplete = {
      match: active.match,
      battle: played.value,
      phase: 'complete',
      privacyPending: false,
      viewer: active.viewer,
      roundWinner: winner,
    };

    return success(complete);
  }

  const next: DuelRoundBattle = {
    match: active.match,
    battle: played.value,
    phase: 'battle',
    privacyPending: false,
    viewer: active.viewer,
    roundWinner: null,
  };

  return success(next);
}

/**
 * Ends the active viewer's turn. The engine discards the hand, passes control
 * and starts the other side's turn (energy reset, Regen tick, draw to five).
 *
 * The controller immediately returns to the privacy state with the viewer
 * switched to the side that now owns the turn. This ordering is deliberate: the
 * opponent's hand exists before the gate is dismissed, but no view can expose
 * it, so the next viewer never briefly sees the wrong side (DUEL-FR-04).
 */
export function endDuelTurn(
  state: DuelRoundState,
): DuelRoundResult<DuelRoundState> {
  const gate = actionGate(state);

  if (!gate.ok) {
    return gate;
  }

  const active = gate.value;
  const ended = endTurn(active.battle, {
    type: 'end-turn',
    side: sideForDuelPlayer(active.viewer),
  });

  if (!ended.ok) {
    return failure(ended.error.code, ended.error.message);
  }

  if (ended.value.outcome !== 'ongoing') {
    const winner = winnerForOutcome(ended.value.outcome);

    if (winner === null) {
      return failure(
        'invalid-state',
        'the battle settled without naming a winner',
      );
    }

    const complete: DuelRoundComplete = {
      match: active.match,
      battle: ended.value,
      phase: 'complete',
      privacyPending: false,
      viewer: active.viewer,
      roundWinner: winner,
    };

    return success(complete);
  }

  const handoff: DuelRoundPrivacy = {
    match: active.match,
    battle: ended.value,
    phase: 'privacy',
    privacyPending: true,
    viewer: duelPlayerForSide(ended.value.activeSide),
    roundWinner: null,
  };

  return success(handoff);
}

/* -------------------------------------------------------------------------- */
/* Predicates                                                                  */
/* -------------------------------------------------------------------------- */

/** The human seat that owns the live engine turn. */
export function duelActivePlayer(state: DuelRoundState): DuelPlayer {
  return duelPlayerForSide(state.battle.activeSide);
}

/**
 * True only when the viewer has dismissed privacy and the engine will accept
 * their action. Screens use this to decide whether Play and End Turn are live;
 * it reveals nothing about either hand.
 */
export function canDuelAct(state: DuelRoundState): boolean {
  return (
    state.phase === 'battle' &&
    state.battle.outcome === 'ongoing' &&
    state.battle.phase === 'action' &&
    state.battle.activeSide === sideForDuelPlayer(state.viewer)
  );
}

/* -------------------------------------------------------------------------- */
/* View mapping                                                                */
/* -------------------------------------------------------------------------- */

function selfView(player: DuelPlayer, side: BattleSide): DuelSelfView {
  return {
    player,
    side: side.side,
    element: side.element,
    health: side.health,
    maxHealth: side.maxHealth,
    defense: side.defense,
    energy: side.energy,
    statuses: { ...side.statuses },
    handCount: side.hand.length,
    deckCount: side.deck.length,
    discardCount: side.discard.length,
  };
}

function opponentView(
  player: DuelPlayer,
  side: BattleSide,
): DuelOpponentView {
  return {
    player,
    side: side.side,
    element: side.element,
    health: side.health,
    maxHealth: side.maxHealth,
    defense: side.defense,
    statuses: { ...side.statuses },
    handCount: side.hand.length,
    deckCount: side.deck.length,
    discardCount: side.discard.length,
  };
}

/**
 * Projects the controller state into the smallest screen contract:
 *
 *   - `privacy` carries only the viewer, round number and entering score;
 *   - `battle` carries the viewer's hand and counts, never the other hand;
 *   - `result` carries the winner and no hand at all.
 *
 * The battle state itself is deliberately not passed through, so the inactive
 * hand cannot reach the DOM by accident.
 */
export function duelRoundView(state: DuelRoundState): DuelRoundView {
  const round = state.match.round;
  const wins: DuelWins = { ...state.match.wins };

  if (state.phase === 'privacy') {
    return { kind: 'privacy', viewer: state.viewer, round, wins };
  }

  if (state.phase === 'complete') {
    return {
      kind: 'result',
      viewer: state.viewer,
      winner: state.roundWinner,
      round,
      wins,
    };
  }

  const viewerSideName = sideForDuelPlayer(state.viewer);
  const viewerSide = state.battle.sides[viewerSideName];
  const opponentSideName = otherSide(viewerSideName);
  const opponentSide = state.battle.sides[opponentSideName];
  const hand: readonly DuelHandCard[] = viewerSide.hand.map((card) => ({
    instanceId: card.instanceId,
    cardId: card.cardId,
  }));

  return {
    kind: 'battle',
    viewer: state.viewer,
    round,
    wins,
    field: state.battle.field,
    turn: state.battle.turn,
    self: selfView(state.viewer, viewerSide),
    opponent: opponentView(
      duelPlayerForSide(opponentSideName),
      opponentSide,
    ),
    hand,
  };
}
