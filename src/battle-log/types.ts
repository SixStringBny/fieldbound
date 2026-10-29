/**
 * Battle-log domain model (LOG-FR-01, LOG-NF-01).
 *
 * A battle log is a bounded, chronological list of settled facts. Entries and
 * effects are plain JSON: no functions, class instances, `undefined` values or
 * dates, so a validated log survives `JSON.stringify` / `JSON.parse` and the
 * solo run save unchanged.
 *
 * The log never re-runs a rule. Every value here is a fact the engine already
 * produced, copied from a before/after `BattleState` pair by `derive.ts`. This
 * module imports engine types only; it never imports content, React, DOM,
 * storage or a controller and never reads or writes the engine PRNG.
 *
 * `ordinal` is the stable identity used by dialogue selection. It starts at 0
 * and increases by one per appended entry. When the log is capped at
 * `BATTLE_LOG_LIMIT` the oldest entries are dropped, but surviving entries keep
 * their original ordinals and ids, so their rendered text never changes.
 */
import type {
  BattleOutcome,
  Element,
  Side,
  StatusKind,
} from '../engine/types';

/** Maximum entries kept per battle. The oldest entries are dropped first. */
export const BATTLE_LOG_LIMIT = 80;

export const BATTLE_LOG_ENTRY_KINDS = ['battle-start', 'card', 'turn'] as const;
export type BattleLogEntryKind = (typeof BATTLE_LOG_ENTRY_KINDS)[number];

export const BATTLE_LOG_ACTORS = ['player', 'opponent', 'system'] as const;
export type BattleLogActor = (typeof BATTLE_LOG_ACTORS)[number];

export const BATTLE_LOG_EFFECT_KINDS = [
  'start',
  'damage',
  'heal',
  'defense',
  'status',
  'field',
  'outcome',
] as const;
export type BattleLogEffectKind = (typeof BATTLE_LOG_EFFECT_KINDS)[number];

/**
 * A side a fact applies to. `system` is an actor only: battle-start facts name
 * the opening field and the opposing maximum health, never a target side.
 */
export type BattleLogTarget = Side;

/** Battle-start fact: the opening opposing maximum health and field. */
export interface BattleLogStartEffect {
  readonly kind: 'start';
  readonly opposingMaxHealth: number;
  readonly field: Element;
}

/** Health lost by one side, with the engine-reported remaining and maximum. */
export interface BattleLogDamageEffect {
  readonly kind: 'damage';
  readonly target: BattleLogTarget;
  readonly amount: number;
  readonly remaining: number;
  readonly max: number;
}

/** Health restored to one side, capped at its maximum by the engine. */
export interface BattleLogHealEffect {
  readonly kind: 'heal';
  readonly target: BattleLogTarget;
  readonly amount: number;
  readonly remaining: number;
  readonly max: number;
}

/** Defense gained by one side, with the resulting total (never above 8). */
export interface BattleLogDefenseEffect {
  readonly kind: 'defense';
  readonly target: BattleLogTarget;
  readonly amount: number;
  readonly total: number;
}

/** A status application: the stack count after the application. */
export interface BattleLogStatusEffect {
  readonly kind: 'status';
  readonly target: BattleLogTarget;
  readonly status: StatusKind;
  readonly stacks: number;
}

/** The field changed from one element to another. */
export interface BattleLogFieldEffect {
  readonly kind: 'field';
  readonly previous: Element;
  readonly next: Element;
}

/** The battle settled. Emitted once, as the last fact of the closing entry. */
export interface BattleLogOutcomeEffect {
  readonly kind: 'outcome';
  readonly outcome: BattleOutcome;
}

/**
 * Ordered facts derived from one settled transition. The order is the order the
 * engine applied them, so prose can describe the sequence without re-deriving
 * any rule.
 */
export type BattleLogEffect =
  | BattleLogStartEffect
  | BattleLogDamageEffect
  | BattleLogHealEffect
  | BattleLogDefenseEffect
  | BattleLogStatusEffect
  | BattleLogFieldEffect
  | BattleLogOutcomeEffect;

/**
 * One settled transition.
 *
 * - `battle-start` is created once at setup, has actor `system` and exactly one
 *   `start` effect.
 * - `card` is created for every card either side plays, has a non-empty
 *   `cardId` and a player/opponent actor.
 * - `turn` is created when control passes between sides and never has a
 *   `cardId`.
 *
 * Rejected actions, renders and drawer toggles produce no entry.
 */
export interface BattleLogEntry {
  /** Stable unique id inside one battle, for example `t3-e12`. */
  readonly id: string;
  /** Strictly increasing per battle, starting at 0; never renumbered. */
  readonly ordinal: number;
  /** Engine turn number after the transition. */
  readonly turn: number;
  readonly kind: BattleLogEntryKind;
  readonly actor: BattleLogActor;
  /** Present only on a `card` entry, taken from the played instance. */
  readonly cardId?: string;
  /** Ordered facts; empty when the transition changed nothing observable. */
  readonly effects: readonly BattleLogEffect[];
}

/** A validated, chronological battle log. */
export type BattleLog = readonly BattleLogEntry[];
