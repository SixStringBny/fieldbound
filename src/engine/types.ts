/**
 * Fieldbound domain model.
 *
 * Pure types plus frozen domain constants only. This module contains no
 * behaviour, imports no React/DOM/storage/network module and never imports
 * `src/content`; content, controllers, UI and tests all type against it.
 *
 * Numbers frozen by the PRD and the Battle Engine feature live here so no
 * consumer has to re-declare them: 40 player health, 5-card hand, 3 starting
 * energy, defense cap 8, status caps 3/3/2 and the 100-turn termination guard.
 */
import type { RngState } from './rng';

/* -------------------------------------------------------------------------- */
/* Elements                                                                    */
/* -------------------------------------------------------------------------- */

/** Elements that can be an active field. Neutral is never a shift target. */
export const FIELD_ELEMENTS = ['ember', 'frost', 'gale', 'stone'] as const;
export type FieldElement = (typeof FIELD_ELEMENTS)[number];

/** Every element, including the neutral opening field. */
export const ELEMENTS = [...FIELD_ELEMENTS, 'neutral'] as const;
export type Element = (typeof ELEMENTS)[number];

/* -------------------------------------------------------------------------- */
/* Card model                                                                  */
/* -------------------------------------------------------------------------- */

export const CARD_TYPES = ['attack', 'ward', 'utility', 'shift'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const STATUS_KINDS = ['focus', 'weaken', 'regen'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const STATUS_TARGETS = ['self', 'opponent'] as const;
export type StatusTarget = (typeof STATUS_TARGETS)[number];

/**
 * Bonus that only applies while the card's own element is the active field.
 * The engine reads this from data; card ids are never special-cased.
 */
export interface FieldBonus {
  readonly damage?: number;
  readonly defense?: number;
}

/** One status application declared by a card. */
export interface StatusApplication {
  readonly kind: StatusKind;
  readonly stacks: number;
  readonly target: StatusTarget;
}

/**
 * Immutable card data. Effect fields are omitted when unused, values are
 * executed by the engine, and no field carries UI text or a damage formula.
 */
export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly element: Element;
  readonly type: CardType;
  readonly cost: number;
  readonly damage?: number;
  readonly defense?: number;
  readonly piercing?: boolean;
  readonly fieldBonus?: FieldBonus;
  readonly draw?: number;
  readonly energy?: number;
  readonly status?: StatusApplication;
  readonly shiftTo?: FieldElement;
  readonly heal?: number;
}

/**
 * A starter deck or enemy deck in content form: a display name, the element it
 * is built around and an ordered list of card ids. Duplicates are meaningful.
 */
export interface DeckDefinition {
  readonly id: string;
  readonly name: string;
  readonly element: FieldElement;
  readonly cards: readonly string[];
}

/**
 * Immutable enemy data. `counterElementBias` is the boss flag: when true the
 * planner prefers the Shift for the element that counters the player's side
 * element. The engine derives the concrete element from `BattleState`; content
 * never encodes planning behaviour.
 */
export interface EnemyDefinition {
  readonly id: string;
  readonly name: string;
  readonly element: Element;
  /**
   * Starting and maximum health. Battle setup copies it to
   * `BattleSide.maxHealth`; enemies never heal between encounters.
   */
  readonly maxHealth: number;
  /** Card ids in deck order; a repeated id means a second physical copy. */
  readonly deck: readonly string[];
  /**
   * Boss flag: prefer the Shift for the element that counters the other side's
   * starter element. The planner derives that element from battle state, so
   * content never names it.
   */
  readonly counterElementBias?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Battle sides                                                                */
/* -------------------------------------------------------------------------- */

export const SIDES = ['player', 'opponent'] as const;
export type Side = (typeof SIDES)[number];

export const BATTLE_PHASES = ['setup', 'action', 'ended'] as const;
export type BattlePhase = (typeof BATTLE_PHASES)[number];

export const BATTLE_OUTCOMES = [
  'ongoing',
  'player-victory',
  'opponent-victory',
] as const;
export type BattleOutcome = (typeof BATTLE_OUTCOMES)[number];

/**
 * Counted status stacks. Focus and Weaken cap at 3, Regen at 2; see
 * `STATUS_CAPS`. Counters are plain numbers so they survive JSON unchanged.
 */
export type StatusCounters = Readonly<Record<StatusKind, number>>;

/**
 * One physical copy of a card inside a battle. `instanceId` is unique across
 * both sides for the whole battle, which is what lets a snapshot reject
 * duplicates and lets two copies of the same card coexist in one hand.
 */
export interface CardInstance {
  readonly instanceId: string;
  readonly cardId: string;
}

/** One battle side. Both sides use exactly the same shape (ENG-FR-11). */
export interface BattleSide {
  readonly side: Side;
  /** Starter element for the player, configured element for the enemy. */
  readonly element: Element;
  readonly health: number;
  readonly maxHealth: number;
  readonly defense: number;
  /**
   * Current-turn energy. No upper bound: a card may grant energy above the
   * turn-start 3, but unspent energy never carries into the next turn.
   */
  readonly energy: number;
  readonly deck: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  readonly statuses: StatusCounters;
}

export type BattleSides = Readonly<Record<Side, BattleSide>>;

/* -------------------------------------------------------------------------- */
/* Enemy plan and intent preview                                               */
/* -------------------------------------------------------------------------- */

/**
 * A status change the plan expects to apply. The shape is the card-data shape
 * (`StatusApplication`) so the planner can map `card.status` straight through
 * and there is only one status descriptor to keep in sync.
 */
export type PlanStatusChange = StatusApplication;

/**
 * One ordered step of an enemy turn with the numbers recomputed from live
 * state. The chosen card never changes during preview; only these values do.
 */
export interface PlanStep {
  readonly cardId: string;
  readonly instanceId: string;
  readonly cost: number;
  /** Damage this step is expected to deal after field, statuses and defense. */
  readonly damage: number;
  /** Defense this step is expected to grant. */
  readonly defense: number;
  readonly statuses: readonly PlanStatusChange[];
  /** Field this step sets, or null when the card does not shift. */
  readonly shiftTo: FieldElement | null;
  /** Energy left after paying for this step. */
  readonly energyAfter: number;
}

/**
 * The enemy's full next-turn plan: an ordered card list plus a recomputed
 * preview. Stored on `BattleState` so a snapshot resumes the exact telegraph.
 */
export interface EnemyPlan {
  readonly side: Side;
  /** 1-based turn index this plan executes on. */
  readonly turn: number;
  readonly steps: readonly PlanStep[];
  readonly totalDamage: number;
  readonly totalDefense: number;
  /** True when the recomputed totals reduce the player to 0 health. */
  readonly lethal: boolean;
  readonly remainingEnergy: number;
}

/* -------------------------------------------------------------------------- */
/* Battle state                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Complete battle state for two symmetric sides. Mutated only by returning a
 * new object from the exported action functions; nothing here is ever mutated
 * in place.
 */
export interface BattleState {
  /** 32-bit seed the battle started from; kept for replay and saves. */
  readonly seed: number;
  /** Live PRNG state after every draw consumed so far. */
  readonly rngState: RngState;
  /** 1-based count of turns started in this battle, either side. */
  readonly turn: number;
  readonly activeSide: Side;
  readonly phase: BattlePhase;
  readonly field: Element;
  readonly outcome: BattleOutcome;
  readonly sides: BattleSides;
  /** Telegraph set by the planner at the end of the enemy turn. */
  readonly enemyPlan: EnemyPlan | null;
}

/* -------------------------------------------------------------------------- */
/* Snapshot contract                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Versioned, plain-JSON form of `BattleState`. It extends the state so a new
 * mutable field can never be serialized out of sync with the snapshot.
 * Functions never appear in a snapshot.
 */
export interface BattleSnapshot extends BattleState {
  readonly schemaVersion: number;
}

/* -------------------------------------------------------------------------- */
/* Result types and actions                                                    */
/* -------------------------------------------------------------------------- */

/** Reasons an engine action or restore can be rejected. */
export type EngineErrorCode =
  | 'battle-ended'
  | 'not-active-side'
  | 'invalid-phase'
  | 'card-not-in-hand'
  | 'unaffordable-card'
  | 'unsupported-card'
  | 'invalid-action'
  | 'invalid-state'
  | 'unknown-schema-version'
  | 'invalid-snapshot'
  | 'unknown-card'
  | 'duplicate-instance-id'
  | 'impossible-count'
  | 'invalid-rng-state';

export type SnapshotErrorCode = Extract<
  EngineErrorCode,
  | 'unknown-schema-version'
  | 'invalid-snapshot'
  | 'unknown-card'
  | 'duplicate-instance-id'
  | 'impossible-count'
  | 'invalid-rng-state'
>;

/** Typed failure. Never a thrown string, never a partial state. */
export interface EngineError<Code extends string = EngineErrorCode> {
  readonly code: Code;
  readonly message: string;
}

export interface EngineSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface EngineFailure<Code extends string = EngineErrorCode> {
  readonly ok: false;
  readonly error: EngineError<Code>;
}

/** Discriminated result for every exported fallible engine function. */
export type EngineResult<
  T,
  Code extends string = EngineErrorCode,
> = EngineSuccess<T> | EngineFailure<Code>;

export type PlayCardResult = EngineResult<BattleState>;
export type EndTurnResult = EngineResult<BattleState>;
export type SnapshotRestoreResult = EngineResult<BattleState, SnapshotErrorCode>;

/**
 * Actions accepted by the battle reducer. Both sides take the same actions, so
 * solo and duel share one engine; the acting side is always explicit.
 */
export interface PlayCardAction {
  readonly type: 'play-card';
  readonly side: Side;
  readonly instanceId: string;
}

export interface EndTurnAction {
  readonly type: 'end-turn';
  readonly side: Side;
}

export type BattleAction = PlayCardAction | EndTurnAction;

/* -------------------------------------------------------------------------- */
/* Frozen domain numbers                                                       */
/* -------------------------------------------------------------------------- */

/** Starting and maximum health of the player. Enemy health comes from data. */
export const PLAYER_MAX_HEALTH = 40;

/** Hand size drawn to at turn start, and the overdraw burn threshold. */
export const HAND_SIZE = 5;

/** Energy granted at every turn start. Unspent energy never accumulates. */
export const TURN_START_ENERGY = 3;

/** Persistent defense never exceeds this value. */
export const DEFENSE_CAP = 8;

/** Status stack caps; applying beyond the cap keeps the cap. */
export const STATUS_CAPS: StatusCounters = {
  focus: 3,
  weaken: 3,
  regen: 2,
};

/** Health restored by one Regen stack at the owner's turn start. */
export const REGEN_HEAL = 2;

/** Self-play and UI guard: a battle must settle before this turn count. */
export const MAX_BATTLE_TURNS = 100;

/** Current `BattleSnapshot` schema version. Restore rejects anything else. */
export const BATTLE_SCHEMA_VERSION = 1;
