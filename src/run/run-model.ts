/**
 * Pure solo run model (RUN-FR-01, RUN-FR-02, RUN-FR-04, VIS-CON-08).
 *
 * The run is the state that survives between battles: the starter element the
 * player chose, the carried health, the growing deck, which rung of the
 * four-enemy ladder is next, and the totals the result screen reports.
 *
 * This module owns the run's transitions and nothing else:
 *
 *   - no storage, React, controller or screen import;
 *   - no reward generation (RUN-02) and no persistence (RUN-03);
 *   - no battle rules. Damage, draw, statuses, affordability and victory are
 *     settled by `src/engine`; this module only consumes a reported
 *     `RunBattleResult` and carries the run forward (VIS-CON-08);
 *   - enemy identity, health and deck come from the frozen content catalog,
 *     never from values declared here.
 *
 * Phases
 * ------
 *
 *   overview ──startEncounter──▶ battle
 *      ▲                           │
 *      │                    applyBattleResult
 *      │                           │
 *      │              ┌────────────┴────────────┐
 *      │        normal victory              boss victory / defeat
 *      │              ▼                           ▼
 *      │           reward                    victory | defeat
 *      └─resolveReward─┘
 *
 * A normal victory heals 12 (capped at 40) before the reward phase; a boss
 * victory ends the run without a reward. `applyBattleResult` and
 * `resolveReward` are the only transitions out of their phase, so a second
 * battle result or a second reward choice is a typed rejection rather than a
 * double count.
 *
 * The model never uses `Math.random`. The run seed travels with the state so
 * the controller can initialize the single engine PRNG where the run begins;
 * reward offers and saves consume and persist that stream in later tasks.
 */
import { deckByElement } from '../content/decks';
import { ENEMIES } from '../content/enemies';
import { FIELD_ELEMENTS, PLAYER_MAX_HEALTH } from '../engine/types';
import type {
  BattleOutcome,
  EnemyDefinition,
  FieldElement,
} from '../engine/types';

/* -------------------------------------------------------------------------- */
/* Frozen run numbers                                                          */
/* -------------------------------------------------------------------------- */

/** Current `RunState` schema version. A mismatch is foreign data on read. */
export const RUN_SCHEMA_VERSION = 1 as const;

/** Starting and maximum player health across the whole run. */
export const RUN_MAX_HEALTH = PLAYER_MAX_HEALTH;

/** Health restored after a normal victory and by the "Heal 12" reward. */
export const RUN_HEAL = 12;

/**
 * The four-enemy ladder in documented order. The content catalog is the single
 * source of names, elements, health and decks; this module only reads it.
 */
export const RUN_LADDER: readonly EnemyDefinition[] = ENEMIES;

/** Number of encounters in a complete run. */
export const RUN_ENCOUNTER_COUNT = RUN_LADDER.length;

/**
 * Run lifecycle phases:
 *
 *   - `overview`  between battles; the next encounter is selected but not begun
 *   - `battle`    an engine battle is in progress
 *   - `reward`    a normal victory is waiting for its one mandatory choice
 *   - `victory`   the boss is down; the run is complete
 *   - `defeat`    the player reached 0 health; the run is complete
 */
export const RUN_PHASES = [
  'overview',
  'battle',
  'reward',
  'victory',
  'defeat',
] as const;

export type RunPhase = (typeof RUN_PHASES)[number];

/** The two settled engine outcomes a run can consume. */
export type SettledBattleOutcome = Extract<
  BattleOutcome,
  'player-victory' | 'opponent-victory'
>;

/** Outcome shown on the run result screen. */
export type RunOutcome = 'victory' | 'defeat';

/* -------------------------------------------------------------------------- */
/* Run state                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Complete solo-run state.
 *
 * `seed` is kept on the run because it is fixed for the life of the run. The
 * versioned save hoists it next to the PRNG state (see the save contract), so
 * `src/persistence/run-save.ts` serializes it at the top level rather than
 * nesting a second copy.
 *
 * `deck` is the ordered list of card ids the next battle is built from. It
 * starts as the ten-card starter deck and grows by exactly one card for a card
 * reward; a heal reward leaves it unchanged.
 */
export interface RunState {
  readonly schemaVersion: typeof RUN_SCHEMA_VERSION;
  /** Unsigned 32-bit seed chosen when the run was created. */
  readonly seed: number;
  /** Starter element chosen at setup. */
  readonly element: FieldElement;
  /** Carried health, 0..`RUN_MAX_HEALTH`; healed between normal fights. */
  readonly health: number;
  /** Card ids for the next battle, in order, including reward additions. */
  readonly deck: readonly string[];
  /** Zero-based ladder position, 0..`RUN_ENCOUNTER_COUNT - 1`. */
  readonly encounterIndex: number;
  /** Turns completed across every settled battle in this run. */
  readonly turnsTotal: number;
  /** Cards gained from rewards in this run. */
  readonly cardsAdded: number;
  /** Damage suffered across every settled battle in this run. */
  readonly damageTaken: number;
  readonly phase: RunPhase;
}

/**
 * What the battle layer reports after the engine settles a fight.
 *
 * `health` is the player's ending battle health, so in-battle Regen and heals
 * are carried exactly. `damageTaken` is the damage actually suffered during
 * the battle and is accumulated for the result screen; it may exceed the net
 * health loss when the player healed mid-fight.
 */
export interface RunBattleResult {
  readonly outcome: SettledBattleOutcome;
  /** Turns started during this battle, either side. */
  readonly turns: number;
  /** Player damage actually suffered during this battle. */
  readonly damageTaken: number;
  /** Player health when the battle settled, 0..`RUN_MAX_HEALTH`. */
  readonly health: number;
}

/**
 * The two reward actions the run understands. Offer generation and checking
 * that the action is one of the displayed offers belong to RUN-02; this module
 * owns applying exactly one choice and advancing the ladder.
 */
export type RunRewardChoice =
  | { readonly kind: 'card'; readonly cardId: string }
  | { readonly kind: 'heal' };

/** Totals the result screen and the best-run record consume. */
export interface RunSummary {
  readonly outcome: RunOutcome;
  /** Encounters fully cleared: 4 on victory, prior wins on defeat. */
  readonly encountersCleared: number;
  readonly encountersTotal: number;
  /** Furthest one-based step reached, 1..4 (4 even when the boss wins). */
  readonly reachedEncounter: number;
  readonly turnsTotal: number;
  readonly cardsAdded: number;
  readonly damageTaken: number;
}

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

/** Typed reasons a run transition or validation can be rejected. */
export type RunErrorCode =
  | 'invalid-element'
  | 'invalid-seed'
  | 'invalid-phase'
  | 'invalid-encounter'
  | 'invalid-battle-result'
  | 'invalid-reward'
  | 'invalid-state';

export interface RunError {
  readonly code: RunErrorCode;
  readonly message: string;
}

export interface RunSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface RunFailure {
  readonly ok: false;
  readonly error: RunError;
}

/** Discriminated result for every fallible exported run function. */
export type RunResult<T> = RunSuccess<T> | RunFailure;

function failure(code: RunErrorCode, message: string): RunFailure {
  return { ok: false, error: { code, message } };
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                          */
/* -------------------------------------------------------------------------- */

const UINT32_MAX = 0xffff_ffff;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUint32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= UINT32_MAX
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isFieldElement(value: unknown): value is FieldElement {
  return (
    typeof value === 'string' &&
    (FIELD_ELEMENTS as readonly string[]).includes(value)
  );
}

function isRunPhase(value: unknown): value is RunPhase {
  return (
    typeof value === 'string' &&
    (RUN_PHASES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Ladder helpers                                                              */
/* -------------------------------------------------------------------------- */

/** The enemy for the run's current ladder step, or `undefined` if corrupt. */
export function currentEnemy(run: RunState): EnemyDefinition | undefined {
  return RUN_LADDER[run.encounterIndex];
}

/** True on the final ladder step, where a win ends the run without a reward. */
export function isBossEncounter(run: RunState): boolean {
  return run.encounterIndex === RUN_ENCOUNTER_COUNT - 1;
}

/** True once the run has reached a terminal victory or defeat. */
export function isRunOver(run: RunState): boolean {
  return run.phase === 'victory' || run.phase === 'defeat';
}

/**
 * Encounters fully cleared. A pending reward counts the just-won encounter; a
 * defeat counts only the wins before the lost fight. The value is derived from
 * the phase and index so it can never drift from the saved state.
 */
export function encountersCleared(run: RunState): number {
  if (run.phase === 'victory') {
    return RUN_ENCOUNTER_COUNT;
  }

  if (run.phase === 'reward') {
    return Math.min(RUN_ENCOUNTER_COUNT, run.encounterIndex + 1);
  }

  return Math.max(0, Math.min(RUN_ENCOUNTER_COUNT, run.encounterIndex));
}

/** Furthest one-based encounter reached, clamped to the ladder. */
export function reachedEncounter(run: RunState): number {
  return Math.min(
    RUN_ENCOUNTER_COUNT,
    Math.max(1, run.encounterIndex + 1),
  );
}

/**
 * The result-screen summary, or null while the run is still in progress.
 * Every number is read from the run state, so the summary cannot update the
 * best-run record early (RUN-06).
 */
export function runSummary(run: RunState): RunSummary | null {
  if (run.phase !== 'victory' && run.phase !== 'defeat') {
    return null;
  }

  return {
    outcome: run.phase,
    encountersCleared: encountersCleared(run),
    encountersTotal: RUN_ENCOUNTER_COUNT,
    reachedEncounter: reachedEncounter(run),
    turnsTotal: run.turnsTotal,
    cardsAdded: run.cardsAdded,
    damageTaken: run.damageTaken,
  };
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Starts a new run from one of the four starter elements at 40 health on the
 * first ladder enemy. The deck is an independent copy of the chosen starter
 * deck, so a later reward can never mutate content.
 *
 * The run begins in `overview`; the controller calls `startEncounter` when the
 * player presses Next Battle (or immediately after creation if it wants to
 * open the first battle directly).
 */
export function createRun(
  element: FieldElement,
  seed: number,
): RunResult<RunState> {
  const deck = deckByElement(element);

  if (deck === undefined) {
    return failure(
      'invalid-element',
      `no starter deck is defined for element ${String(element)}`,
    );
  }

  if (!isUint32(seed)) {
    return failure(
      'invalid-seed',
      `seed must be an unsigned 32-bit integer, received ${String(seed)}`,
    );
  }

  if (RUN_ENCOUNTER_COUNT === 0) {
    return failure('invalid-state', 'the enemy ladder is empty');
  }

  return {
    ok: true,
    value: {
      schemaVersion: RUN_SCHEMA_VERSION,
      seed,
      element,
      health: RUN_MAX_HEALTH,
      deck: [...deck.cards],
      encounterIndex: 0,
      turnsTotal: 0,
      cardsAdded: 0,
      damageTaken: 0,
      phase: 'overview',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Encounter start                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Moves from the between-battle overview into the next battle. Only the phase
 * changes; health, deck and totals are already carried on the run. A reward
 * must be resolved before this is legal, which is what enforces "the next
 * battle cannot start until one option is chosen".
 */
export function startEncounter(run: RunState): RunResult<RunState> {
  if (run.phase !== 'overview') {
    return failure(
      'invalid-phase',
      `a battle can only start from the overview phase, not ${run.phase}`,
    );
  }

  if (currentEnemy(run) === undefined) {
    return failure(
      'invalid-encounter',
      `encounter index ${String(run.encounterIndex)} is not on the ladder`,
    );
  }

  return { ok: true, value: { ...run, phase: 'battle' } };
}

/* -------------------------------------------------------------------------- */
/* Battle result                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Checks a reported battle result without touching run state. Returns null
 * when it is usable. The damage floor catches the one arithmetic lie that
 * matters: a report cannot claim less damage than the health the player
 * actually lost (in-battle healing may make actual damage larger).
 */
function battleResultProblem(
  run: RunState,
  result: RunBattleResult,
): RunFailure | null {
  if (typeof result !== 'object' || result === null) {
    return failure('invalid-battle-result', 'a battle result must be an object');
  }

  if (
    result.outcome !== 'player-victory' &&
    result.outcome !== 'opponent-victory'
  ) {
    return failure(
      'invalid-battle-result',
      `outcome must be a settled battle outcome, received ${String(result.outcome)}`,
    );
  }

  if (!isNonNegativeSafeInteger(result.turns)) {
    return failure(
      'invalid-battle-result',
      `turns must be a non-negative integer, received ${String(result.turns)}`,
    );
  }

  if (!isNonNegativeSafeInteger(result.damageTaken)) {
    return failure(
      'invalid-battle-result',
      `damageTaken must be a non-negative integer, received ${String(result.damageTaken)}`,
    );
  }

  if (
    !Number.isInteger(result.health) ||
    result.health < 0 ||
    result.health > RUN_MAX_HEALTH
  ) {
    return failure(
      'invalid-battle-result',
      `health must be an integer in 0..${String(RUN_MAX_HEALTH)}, received ${String(result.health)}`,
    );
  }

  const healthLost = Math.max(0, run.health - result.health);

  if (result.damageTaken < healthLost) {
    return failure(
      'invalid-battle-result',
      `damageTaken ${String(result.damageTaken)} is less than the ${String(healthLost)} health lost`,
    );
  }

  if (result.outcome === 'opponent-victory' && result.health !== 0) {
    return failure(
      'invalid-battle-result',
      `a defeat must report the player at 0 health, received ${String(result.health)}`,
    );
  }

  return null;
}

/**
 * Settles exactly one battle and carries the run forward.
 *
 *   - turns and damage are added once; a repeated call is rejected because the
 *     phase is no longer `battle`
 *   - a normal victory heals 12, capped at 40, then waits in `reward`
 *   - a boss victory ends the run in `victory` with no heal and no reward
 *   - a defeat ends the run in `defeat` and preserves the encounter reached and
 *     every accumulated total
 *
 * Health is taken from the reported battle health, not recalculated from
 * damage, so in-battle healing and Regen survive the carry exactly.
 */
export function applyBattleResult(
  run: RunState,
  result: RunBattleResult,
): RunResult<RunState> {
  if (run.phase !== 'battle') {
    return failure(
      'invalid-phase',
      `a battle result can only settle a run in the battle phase, not ${run.phase}`,
    );
  }

  if (currentEnemy(run) === undefined) {
    return failure(
      'invalid-encounter',
      `encounter index ${String(run.encounterIndex)} is not on the ladder`,
    );
  }

  const problem = battleResultProblem(run, result);

  if (problem !== null) {
    return problem;
  }

  const turnsTotal = run.turnsTotal + result.turns;
  const damageTaken = run.damageTaken + result.damageTaken;

  if (!Number.isSafeInteger(turnsTotal) || !Number.isSafeInteger(damageTaken)) {
    return failure(
      'invalid-battle-result',
      'battle totals would exceed the safe integer range',
    );
  }

  const totals = { turnsTotal, damageTaken };

  if (result.outcome === 'opponent-victory') {
    return {
      ok: true,
      value: {
        ...run,
        ...totals,
        health: result.health,
        phase: 'defeat',
      },
    };
  }

  if (isBossEncounter(run)) {
    return {
      ok: true,
      value: {
        ...run,
        ...totals,
        health: result.health,
        phase: 'victory',
      },
    };
  }

  return {
    ok: true,
    value: {
      ...run,
      ...totals,
      health: Math.min(RUN_MAX_HEALTH, result.health + RUN_HEAL),
      phase: 'reward',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Reward resolution                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Applies exactly one reward choice and advances to the next encounter's
 * overview.
 *
 *   - a card reward appends one copy and increments `cardsAdded`; duplicates
 *     are allowed because the deck is a multiset of physical cards
 *   - a heal reward restores 12, capped at 40, and appends nothing
 *
 * Offer generation (which cards are legal for the pool) and checking that the
 * choice matches a displayed offer belong to RUN-02. Because the phase leaves
 * `reward` here, a second call for the same offer is rejected.
 */
export function resolveReward(
  run: RunState,
  choice: RunRewardChoice,
): RunResult<RunState> {
  if (run.phase !== 'reward') {
    return failure(
      'invalid-phase',
      `no reward is pending in the ${run.phase} phase`,
    );
  }

  if (currentEnemy(run) === undefined) {
    return failure(
      'invalid-encounter',
      `encounter index ${String(run.encounterIndex)} is not on the ladder`,
    );
  }

  if (isBossEncounter(run)) {
    return failure(
      'invalid-encounter',
      'the boss encounter ends the run without a reward',
    );
  }

  if (typeof choice !== 'object' || choice === null) {
    return failure('invalid-reward', 'a reward choice must be an object');
  }

  const nextIndex = run.encounterIndex + 1;

  if (choice.kind === 'card') {
    if (
      typeof choice.cardId !== 'string' ||
      choice.cardId.length === 0 ||
      choice.cardId !== choice.cardId.trim()
    ) {
      return failure(
        'invalid-reward',
        'a card reward needs an exact, non-empty card id',
      );
    }

    return {
      ok: true,
      value: {
        ...run,
        deck: [...run.deck, choice.cardId],
        cardsAdded: run.cardsAdded + 1,
        encounterIndex: nextIndex,
        phase: 'overview',
      },
    };
  }

  if (choice.kind === 'heal') {
    return {
      ok: true,
      value: {
        ...run,
        health: Math.min(RUN_MAX_HEALTH, run.health + RUN_HEAL),
        encounterIndex: nextIndex,
        phase: 'overview',
      },
    };
  }

  return failure(
    'invalid-reward',
    `unknown reward kind ${String((choice as { kind?: unknown }).kind)}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validates untrusted run data and reconstructs a canonical `RunState`.
 *
 * The function is total: it returns a typed failure for anything that is not
 * exactly the current schema, never throws and never returns a partially built
 * run. Unknown extra keys are ignored so a future additive field cannot
 * invalidate today's payload. Cross-checking deck ids against the card catalog
 * belongs to the save layer, which has the catalog at hand; this function
 * enforces the run's own shape, bounds and phase/encounter agreement.
 */
export function validateRunState(input: unknown): RunResult<RunState> {
  if (!isRecord(input)) {
    return failure('invalid-state', 'run state must be a plain object');
  }

  if (input.schemaVersion !== RUN_SCHEMA_VERSION) {
    return failure(
      'invalid-state',
      `run schemaVersion must be ${String(RUN_SCHEMA_VERSION)}, received ${String(input.schemaVersion)}`,
    );
  }

  const seed = input.seed;

  if (!isUint32(seed)) {
    return failure(
      'invalid-seed',
      `seed must be an unsigned 32-bit integer, received ${String(seed)}`,
    );
  }

  const element = input.element;

  if (!isFieldElement(element)) {
    return failure(
      'invalid-element',
      `element must be a field element, received ${String(element)}`,
    );
  }

  const health = input.health;

  if (
    typeof health !== 'number' ||
    !Number.isInteger(health) ||
    health < 0 ||
    health > RUN_MAX_HEALTH
  ) {
    return failure(
      'invalid-state',
      `health must be an integer in 0..${String(RUN_MAX_HEALTH)}, received ${String(health)}`,
    );
  }

  const rawDeck = input.deck;

  if (!Array.isArray(rawDeck) || rawDeck.length === 0) {
    return failure('invalid-state', 'deck must be a non-empty array of card ids');
  }

  const deck: string[] = [];

  for (const cardId of rawDeck) {
    if (typeof cardId !== 'string' || cardId.length === 0) {
      return failure(
        'invalid-state',
        'every deck entry must be a non-empty card id',
      );
    }

    deck.push(cardId);
  }

  const encounterIndex = input.encounterIndex;

  if (
    typeof encounterIndex !== 'number' ||
    !Number.isInteger(encounterIndex) ||
    encounterIndex < 0 ||
    encounterIndex >= RUN_ENCOUNTER_COUNT
  ) {
    return failure(
      'invalid-encounter',
      `encounterIndex must be an integer in 0..${String(RUN_ENCOUNTER_COUNT - 1)}, received ${String(encounterIndex)}`,
    );
  }

  const turnsTotal = input.turnsTotal;
  const cardsAdded = input.cardsAdded;
  const damageTaken = input.damageTaken;

  if (!isNonNegativeSafeInteger(turnsTotal)) {
    return failure(
      'invalid-state',
      `turnsTotal must be a non-negative integer, received ${String(turnsTotal)}`,
    );
  }

  if (!isNonNegativeSafeInteger(cardsAdded)) {
    return failure(
      'invalid-state',
      `cardsAdded must be a non-negative integer, received ${String(cardsAdded)}`,
    );
  }

  if (!isNonNegativeSafeInteger(damageTaken)) {
    return failure(
      'invalid-state',
      `damageTaken must be a non-negative integer, received ${String(damageTaken)}`,
    );
  }

  const phase = input.phase;

  if (!isRunPhase(phase)) {
    return failure(
      'invalid-phase',
      `phase must be one of ${RUN_PHASES.join(', ')}, received ${String(phase)}`,
    );
  }

  if (phase === 'victory' && encounterIndex !== RUN_ENCOUNTER_COUNT - 1) {
    return failure(
      'invalid-state',
      'a victory is only possible on the final ladder encounter',
    );
  }

  if (phase === 'reward' && encounterIndex === RUN_ENCOUNTER_COUNT - 1) {
    return failure(
      'invalid-state',
      'the boss encounter cannot be in the reward phase',
    );
  }

  return {
    ok: true,
    value: {
      schemaVersion: RUN_SCHEMA_VERSION,
      seed,
      element,
      health,
      deck,
      encounterIndex,
      turnsTotal,
      cardsAdded,
      damageTaken,
      phase,
    },
  };
}
