/**
 * The solo-run controller (RUN-FR-01, RUN-FR-02, RUN-FR-04, RUN-FR-08).
 *
 * This is the only layer between the solo screens and the pure run model, the
 * reward generator and the battle controller. It owns every run transition and
 * every autosave point:
 *
 *   - Start Run creates the run, opens the first encounter and writes the save;
 *   - every settled card play and every completed turn writes the save;
 *   - the winning action settles the battle, applies the run model's heal and
 *     ladder transition, generates the three reward offers from the run PRNG
 *     and writes the save;
 *   - a reward choice writes the save and advances the ladder;
 *   - Next Battle starts the encounter and writes the save;
 *   - a terminal battle writes the final save and reports the run to the
 *     best-run store exactly once.
 *
 * What it deliberately does not do:
 *
 *   - it does not resolve damage, draw, statuses, affordability, healing or
 *     victory. `src/engine`, `src/run/run-model.ts` and `src/run/rewards.ts`
 *     own those rules; this module only calls them and carries their results
 *     (VIS-CON-08);
 *   - it does not render, read settings or generate prose. Screens receive
 *     plain state and dispatch typed intents;
 *   - it does not read `?seed=`. The composition root resolves the seed once
 *     when Start Run is pressed and passes the value here (RUN-FR-08).
 *
 * Autosave payload
 * ----------------
 *
 * The payload is the versioned `fieldbound.run.v1` contract from
 * `src/persistence/run-save.ts`. The battle snapshot is present exactly in the
 * battle phase and the three offers exactly in the reward phase, so a save made
 * after any settled action is always loadable by the same validator.
 *
 * Damage bookkeeping
 * ------------------
 *
 * `battleDamage` accumulates the player health actually lost across the battle
 * from the before/after states the engine reports. That may exceed the net
 * health loss when Regen or a heal card restores health mid-fight, which is what
 * the run model expects. On settle it is floored at the net loss, so the run
 * model's arithmetic check can never reject an otherwise valid battle.
 */
import { useCallback, useRef, useState } from 'react';
import { byId as cardCatalog } from '../content/cards';
import { RUN_LADDER } from '../run/run-model';
import {
  RUN_MAX_HEALTH,
  applyBattleResult,
  createRun,
  currentEnemy,
  encountersCleared,
  reachedEncounter,
  startEncounter,
} from '../run/run-model';
import type { RunState } from '../run/run-model';
import { applyRewardChoice, generateRewardOffers } from '../run/rewards';
import type { RewardOffer } from '../run/rewards';
import { createRng } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { serializeSnapshot } from '../engine/snapshot';
import type {
  BattleState,
  EnemyDefinition,
  EngineErrorCode,
  FieldElement,
} from '../engine/types';
import { createRunSaveStore } from '../persistence/run-save';
import { RUN_SAVE_SCHEMA_VERSION } from '../persistence/run-save';
import type {
  RunSaveStorage,
  RunSaveV1,
} from '../persistence/run-save';
import { createStatsStore } from '../persistence/stats';
import type {
  StatsRecordResult,
  StatsStorage,
} from '../persistence/stats';
import {
  battleReducer,
  createBattleControllerState,
} from './battle-controller';
import type {
  BattleControllerConfig,
  BattleControllerState,
} from './battle-controller';
import type { CueName } from '../ui/events';

/* -------------------------------------------------------------------------- */
/* Frozen controller facts                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Salt that separates the reward PRNG stream from the battle shuffle stream.
 * Both are seeded from the run seed; the XOR keeps the first reward draw from
 * mirroring the first shuffle draw without changing either engine.
 */
const REWARD_STREAM_SALT = 0x9e37_79b9;

/** The four surfaces a live run can occupy. */
export const RUN_SCREENS = [
  'battle',
  'reward',
  'run-overview',
  'run-result',
] as const;

export type RunScreen = (typeof RUN_SCREENS)[number];

/** One visible step of the four-enemy ladder. */
export interface RunProgressStep {
  readonly name: string;
  readonly element: EnemyDefinition['element'];
  readonly status: 'cleared' | 'current' | 'upcoming';
}

/* -------------------------------------------------------------------------- */
/* State and result types                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Complete controller state. `battle` is the battle controller's own state (and
 * therefore the only object a screen renders during a fight); it is null outside
 * the battle phase. `offers` carries the three reward options while the reward
 * screen is up, because the save contract stores exactly that list.
 */
export interface SoloRunState {
  readonly run: RunState;
  /** Run PRNG state after the last reward draw; persisted with the run. */
  readonly rngState: RngState;
  readonly battle: BattleControllerState | null;
  readonly offers: readonly RewardOffer[] | null;
  /** Player health actually lost during the current battle. */
  readonly battleDamage: number;
  /** Best-run record written when this run ended; null before run end. */
  readonly stats: StatsRecordResult | null;
}

/** Every rejection this controller can surface to a screen. */
export type SoloRunErrorCode =
  | 'invalid-action'
  | 'invalid-phase'
  | 'invalid-encounter'
  | 'invalid-reward'
  | 'invalid-battle-result'
  | 'invalid-state'
  | 'invalid-seed'
  | 'invalid-element'
  | EngineErrorCode
  | 'invalid-rng-state'
  | 'invalid-offer'
  | 'insufficient-reward-pool'
  | 'reward-draw-exhausted';

export interface SoloRunError {
  readonly code: SoloRunErrorCode;
  readonly message: string;
}

export interface SoloRunSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface SoloRunFailure {
  readonly ok: false;
  readonly error: SoloRunError;
}

export type SoloRunResult<T> = SoloRunSuccess<T> | SoloRunFailure;

/**
 * The observable result of one intent.
 *
 * `save` is null for a rejected intent: a rejected card play is not a settled
 * action and must not overwrite the good save. `endedRun` is set only by the
 * transition that ends the run, which is what makes the stats update exactly
 * once.
 */
export interface SoloRunTransition {
  readonly state: SoloRunState;
  readonly screen: RunScreen;
  readonly save: RunSaveV1 | null;
  readonly cues: readonly CueName[];
  readonly error: SoloRunError | null;
  readonly endedRun: RunState | null;
}

/** What one dispatched intent produced. A failed start has no state yet. */
export interface SoloRunAttempt {
  readonly transition: SoloRunTransition | null;
  readonly error: SoloRunError | null;
}

/** Builds the battle for one encounter. Tests override it; production omits it. */
export type SoloEncounterFactory = (
  run: RunState,
  enemy: EnemyDefinition,
) => BattleControllerConfig;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function failure(
  code: SoloRunErrorCode,
  message: string,
): SoloRunFailure {
  return { ok: false, error: { code, message } };
}

/** Largest unsigned 32-bit value. */
const UINT32_MAX = 0xffff_ffff;

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

/** The reward stream's starting state for a run seed. */
export function rewardStreamState(seed: number): RngState {
  return createRng((seed ^ REWARD_STREAM_SALT) >>> 0);
}

/**
 * The battle setup for one run encounter.
 *
 * The player keeps the run's element, carried health and current deck; the
 * enemy's name, element, health and deck come from the content catalog. The
 * battle seed is the run seed, which is what makes `?seed=` reproduce the same
 * first hand on two runs.
 */
export function createEncounterConfig(
  run: RunState,
  enemy: EnemyDefinition,
): BattleControllerConfig {
  return {
    seed: run.seed,
    player: {
      element: run.element,
      cards: run.deck,
      maxHealth: RUN_MAX_HEALTH,
      health: run.health,
    },
    opponent: {
      element: enemy.element,
      cards: enemy.deck,
      maxHealth: enemy.maxHealth,
    },
    cards: cardCatalog,
    enemy,
  };
}

/** The screen for a run phase. */
export function screenForRun(state: SoloRunState): RunScreen {
  switch (state.run.phase) {
    case 'battle':
      return 'battle';
    case 'reward':
      return 'reward';
    case 'overview':
      return 'run-overview';
    case 'victory':
    case 'defeat':
      return 'run-result';
  }
}

/** Four ladder steps with cleared / current / upcoming derived from the run. */
export function runProgress(run: RunState): readonly RunProgressStep[] {
  const cleared = encountersCleared(run);

  return RUN_LADDER.map((enemy, index) => ({
    name: enemy.name,
    element: enemy.element,
    status:
      index < cleared
        ? 'cleared'
        : index === run.encounterIndex
          ? 'current'
          : 'upcoming',
  }));
}

/** One-based position on the ladder, clamped to 1..4. */
export function runEncounterNumber(run: RunState): number {
  return reachedEncounter(run);
}

/** Health a status screen should show: the live battle value, else carried. */
export function runCurrentHealth(state: SoloRunState): number {
  if (state.run.phase === 'battle' && state.battle !== null) {
    return state.battle.battle.sides.player.health;
  }

  return state.run.health;
}

/**
 * Build the versioned save for the current state.
 *
 * Returns null only for an inconsistent state (battle phase without a battle,
 * or reward phase without offers); a caller must never write such a payload.
 * The shape is exactly the `fieldbound.run.v1` contract: hoisted seed, PRNG
 * state, run, phase-specific battle snapshot and phase-specific offers.
 */
export function createRunSave(state: SoloRunState): RunSaveV1 | null {
  const battle =
    state.run.phase === 'battle' && state.battle !== null
      ? serializeSnapshot(state.battle.battle)
      : null;

  if (state.run.phase === 'battle' && battle === null) {
    return null;
  }

  const pendingReward =
    state.run.phase === 'reward' ? state.offers : null;

  if (state.run.phase === 'reward' && pendingReward === null) {
    return null;
  }

  return {
    schemaVersion: RUN_SAVE_SCHEMA_VERSION,
    seed: state.run.seed,
    rngState: state.rngState,
    run: state.run,
    battle,
    pendingReward,
  };
}

function transition(
  state: SoloRunState,
  cues: readonly CueName[],
  error: SoloRunError | null,
  endedRun: RunState | null,
  save: RunSaveV1 | null,
): SoloRunTransition {
  return {
    state,
    screen: screenForRun(state),
    save,
    cues,
    error,
    endedRun,
  };
}

function rejectedTransition(
  state: SoloRunState,
  code: SoloRunErrorCode,
  message: string,
): SoloRunTransition {
  return {
    state,
    screen: screenForRun(state),
    save: null,
    cues: [],
    error: { code, message },
    endedRun: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Creation and encounter start                                                */
/* -------------------------------------------------------------------------- */

/**
 * Create a run in its `overview` phase without opening a battle. This is the
 * unit-test and Continue Run seam; Start Run uses `startSoloRun`, which opens
 * the first encounter immediately.
 */
export function createSoloRunState(
  element: FieldElement,
  seed: number,
): SoloRunResult<SoloRunState> {
  const created = createRun(element, seed);

  if (!created.ok) {
    return {
      ok: false,
      error: { code: created.error.code, message: created.error.message },
    };
  }

  return {
    ok: true,
    value: {
      run: created.value,
      rngState: rewardStreamState(seed),
      battle: null,
      offers: null,
      battleDamage: 0,
      stats: null,
    },
  };
}

/**
 * Move from the overview into the next encounter and build its battle. Every
 * call creates a fresh battle controller state from the run's carried health and
 * deck, so the previous fight's temporary energy, statuses and field cannot
 * leak into the next one.
 */
export function beginEncounter(
  state: SoloRunState,
  encounterSetup?: SoloEncounterFactory,
): SoloRunResult<SoloRunState> {
  const started = startEncounter(state.run);

  if (!started.ok) {
    return {
      ok: false,
      error: { code: started.error.code, message: started.error.message },
    };
  }

  const enemy = currentEnemy(started.value);

  if (enemy === undefined) {
    return failure(
      'invalid-encounter',
      `the ladder has no enemy at index ${String(started.value.encounterIndex)}`,
    );
  }

  const config =
    encounterSetup === undefined
      ? createEncounterConfig(started.value, enemy)
      : encounterSetup(started.value, enemy);
  const battle = createBattleControllerState(config);

  if (!battle.ok) {
    return {
      ok: false,
      error: { code: battle.error.code, message: battle.error.message },
    };
  }

  return {
    ok: true,
    value: {
      ...state,
      run: started.value,
      battle: battle.value,
      offers: null,
      battleDamage: 0,
      stats: null,
    },
  };
}

/**
 * Start a run and open its first battle. This is the setup screen's intent: it
 * creates the run at 40 health on the Ember/Frost/Gale/Stone starter deck, then
 * enters Cinder Warden immediately.
 */
export function startSoloRun(input: {
  readonly element: FieldElement;
  readonly seed: number;
  readonly encounterSetup?: SoloEncounterFactory;
}): SoloRunResult<SoloRunState> {
  if (!isUint32(input.seed)) {
    return failure(
      'invalid-seed',
      `seed must be an unsigned 32-bit integer, received ${String(input.seed)}`,
    );
  }

  const created = createSoloRunState(input.element, input.seed);

  if (!created.ok) {
    return created;
  }

  return input.encounterSetup === undefined
    ? beginEncounter(created.value)
    : beginEncounter(created.value, input.encounterSetup);
}

/* -------------------------------------------------------------------------- */
/* Battle settlement                                                           */
/* -------------------------------------------------------------------------- */

function playerHealthLost(before: BattleState, after: BattleState): number {
  return Math.max(0, before.sides.player.health - after.sides.player.health);
}

function battleSettled(battle: BattleState): boolean {
  return battle.phase === 'ended' || battle.outcome !== 'ongoing';
}

/**
 * Apply a settled battle to the run.
 *
 * The run model owns the heal, ladder advance and terminal phases. This
 * function only supplies the reported result and then:
 *
 *   - normal victory: generate the three offers with the run PRNG and stay on
 *     the reward screen;
 *   - boss victory or defeat: end the run, clear the battle and expose the
 *     summary through the run phase;
 *   - either way: persist the new state.
 */
function settleBattle(
  state: SoloRunState,
  battle: BattleState,
  battleDamage: number,
  cues: readonly CueName[],
): SoloRunTransition {
  const health = battle.sides.player.health;
  const damageTaken = Math.max(
    battleDamage,
    Math.max(0, state.run.health - health),
  );

  if (battle.outcome !== 'player-victory' && battle.outcome !== 'opponent-victory') {
    return rejectedTransition(
      state,
      'invalid-battle-result',
      'a battle settlement must report a victory or a defeat',
    );
  }

  const settled = applyBattleResult(state.run, {
    outcome: battle.outcome,
    turns: battle.turn,
    damageTaken,
    health,
  });

  if (!settled.ok) {
    return rejectedTransition(
      state,
      settled.error.code,
      settled.error.message,
    );
  }

  const nextRun = settled.value;

  if (nextRun.phase === 'reward') {
    const generated = generateRewardOffers(nextRun, state.rngState);

    if (!generated.ok) {
      const rewardless: SoloRunState = {
        ...state,
        run: nextRun,
        battle: null,
        offers: null,
        battleDamage: 0,
        stats: null,
      };

      return {
        state: rewardless,
        screen: 'reward',
        save: null,
        cues,
        error: {
          code: generated.error.code,
          message: generated.error.message,
        },
        endedRun: null,
      };
    }

    const rewarded: SoloRunState = {
      ...state,
      run: nextRun,
      rngState: generated.value.rngState,
      battle: null,
      offers: generated.value.offers,
      battleDamage: 0,
      stats: null,
    };

    return transition(rewarded, cues, null, null, createRunSave(rewarded));
  }

  const finished: SoloRunState = {
    ...state,
    run: nextRun,
    battle: null,
    offers: null,
    battleDamage: 0,
    stats: null,
  };

  return transition(finished, cues, null, nextRun, createRunSave(finished));
}

/* -------------------------------------------------------------------------- */
/* Intents                                                                     */
/* -------------------------------------------------------------------------- */

/** Play one card from the player's hand. A rejection updates the report only. */
export function playRunCard(
  state: SoloRunState,
  instanceId: string,
): SoloRunTransition {
  if (state.run.phase !== 'battle' || state.battle === null) {
    return rejectedTransition(
      state,
      'invalid-phase',
      `no card can be played during the ${state.run.phase} phase`,
    );
  }

  const before = state.battle.battle;
  const next = battleReducer(state.battle, { type: 'play-card', instanceId });
  const battleDamage =
    state.battleDamage + playerHealthLost(before, next.battle);
  const draft: SoloRunState = { ...state, battle: next, battleDamage };
  const report = next.report;

  if (report === null || !report.ok) {
    const reason =
      report === null || report.error === null
        ? { code: 'invalid-action' as const, message: 'the card play did not resolve' }
        : { code: report.error.code, message: report.error.message };

    return {
      state: draft,
      screen: 'battle',
      save: null,
      cues: [],
      error: reason,
      endedRun: null,
    };
  }

  if (battleSettled(next.battle)) {
    return settleBattle(draft, next.battle, battleDamage, report.cues);
  }

  return {
    state: draft,
    screen: 'battle',
    save: createRunSave(draft),
    cues: report.cues,
    error: null,
    endedRun: null,
  };
}

/** End the player's turn and run the telegraphed enemy turn. */
export function endRunTurn(state: SoloRunState): SoloRunTransition {
  if (state.run.phase !== 'battle' || state.battle === null) {
    return rejectedTransition(
      state,
      'invalid-phase',
      `the turn cannot end during the ${state.run.phase} phase`,
    );
  }

  const before = state.battle.battle;
  const next = battleReducer(state.battle, { type: 'end-turn' });
  const battleDamage =
    state.battleDamage + playerHealthLost(before, next.battle);
  const draft: SoloRunState = { ...state, battle: next, battleDamage };
  const report = next.report;

  if (report === null || !report.ok) {
    const reason =
      report === null || report.error === null
        ? { code: 'invalid-action' as const, message: 'the turn did not end' }
        : { code: report.error.code, message: report.error.message };

    return {
      state: draft,
      screen: 'battle',
      save: null,
      cues: [],
      error: reason,
      endedRun: null,
    };
  }

  if (battleSettled(next.battle)) {
    return settleBattle(draft, next.battle, battleDamage, report.cues);
  }

  return {
    state: draft,
    screen: 'battle',
    save: createRunSave(draft),
    cues: report.cues,
    error: null,
    endedRun: null,
  };
}

/**
 * Apply the one mandatory reward choice and advance to the next encounter's
 * overview. The offer list is re-validated by the reward module; a second
 * choice is rejected because the run has already left the reward phase.
 */
export function resolveRunReward(
  state: SoloRunState,
  index: number,
): SoloRunTransition {
  if (state.run.phase !== 'reward' || state.offers === null) {
    return rejectedTransition(
      state,
      'invalid-phase',
      `no reward is pending during the ${state.run.phase} phase`,
    );
  }

  if (!Number.isInteger(index) || index < 0 || index >= state.offers.length) {
    return rejectedTransition(
      state,
      'invalid-reward',
      `reward option ${String(index)} does not exist`,
    );
  }

  const offer = state.offers[index];

  if (offer === undefined) {
    return rejectedTransition(
      state,
      'invalid-reward',
      `reward option ${String(index)} does not exist`,
    );
  }

  const applied = applyRewardChoice(
    state.run,
    state.offers,
    offer.kind === 'heal'
      ? { kind: 'heal' }
      : { kind: 'card', cardId: offer.cardId },
  );

  if (!applied.ok) {
    return rejectedTransition(
      state,
      applied.error.code,
      applied.error.message,
    );
  }

  const next: SoloRunState = {
    ...state,
    run: applied.value,
    battle: null,
    offers: null,
    battleDamage: 0,
    stats: null,
  };

  return transition(next, [], null, null, createRunSave(next));
}

/** Start the encounter the overview is showing. */
export function startNextBattle(
  state: SoloRunState,
  encounterSetup?: SoloEncounterFactory,
): SoloRunTransition {
  if (state.run.phase !== 'overview') {
    return rejectedTransition(
      state,
      'invalid-phase',
      `a battle can only start from the overview phase, not ${state.run.phase}`,
    );
  }

  const entered =
    encounterSetup === undefined
      ? beginEncounter(state)
      : beginEncounter(state, encounterSetup);

  if (!entered.ok) {
    return rejectedTransition(state, entered.error.code, entered.error.message);
  }

  return transition(entered.value, [], null, null, createRunSave(entered.value));
}

/* -------------------------------------------------------------------------- */
/* React binding                                                               */
/* -------------------------------------------------------------------------- */

export interface SoloRunControllerOptions {
  /**
   * A run restored from a validated save (RUN-05). Read once at mount, exactly
   * like a browser reload: the boot check has already validated the payload, so
   * the controller adopts it and every later change flows through the intents.
   */
  readonly initialState?: SoloRunState | null;
  /** Test seam: replace the run save's storage, or pass null for none. */
  readonly saveStorage?: RunSaveStorage | null;
  /** Test seam: replace the best-run record's storage, or pass null for none. */
  readonly statsStorage?: StatsStorage | null;
  /** Test seam: build a deterministic or weakened encounter. */
  readonly encounterSetup?: SoloEncounterFactory;
}

export interface SoloRunController {
  readonly state: SoloRunState | null;
  /** Create the run and open the first battle. */
  start(element: FieldElement, seed: number): SoloRunAttempt;
  playCard(instanceId: string): SoloRunAttempt;
  endTurn(): SoloRunAttempt;
  chooseReward(index: number): SoloRunAttempt;
  nextBattle(): SoloRunAttempt;
  /** Drop the in-memory run and remove only the run save. */
  reset(): void;
}

/**
 * Bind the pure transitions to React and the two persistence stores.
 *
 * Saves happen in the intent callback, not in an effect: a settled action is
 * durable before the next paint, and a rejected action can never overwrite the
 * last good save. Every transition also updates the in-memory state so the
 * board can render the engine's report.
 *
 * `initialState` is the Continue Run seam: a run restored from a validated save
 * starts life here, so the first action after a reload saves the full resumed
 * state rather than a blank one.
 */
export function useSoloRunController(
  options: SoloRunControllerOptions = {},
): SoloRunController {
  const [saveStore] = useState(() => createRunSaveStore(options.saveStorage));
  const [statsStore] = useState(() =>
    createStatsStore(options.statsStorage),
  );
  const [encounterSetup] = useState<SoloEncounterFactory | undefined>(
    () => options.encounterSetup,
  );
  const [state, setState] = useState<SoloRunState | null>(
    () => options.initialState ?? null,
  );
  const stateRef = useRef<SoloRunState | null>(state);

  const apply = useCallback(
    (next: SoloRunTransition) => {
      let committed = next.state;

      // The record is written exactly once, by the transition that ends the
      // run. A restored terminal screen (RUN-05) never passes through here, so
      // it cannot inflate the record.
      if (next.endedRun !== null) {
        const recorded = statsStore.recordRun(next.endedRun);

        if (recorded !== null) {
          committed = { ...committed, stats: recorded };
        }
      }

      stateRef.current = committed;
      setState(committed);

      if (next.save !== null) {
        saveStore.save(next.save);
      }
    },
    [saveStore, statsStore],
  );

  const start = useCallback(
    (element: FieldElement, seed: number): SoloRunAttempt => {
      const created =
        encounterSetup === undefined
          ? startSoloRun({ element, seed })
          : startSoloRun({ element, seed, encounterSetup });

      if (!created.ok) {
        return { transition: null, error: created.error };
      }

      const next = created.value;
      const launched: SoloRunTransition = {
        state: next,
        screen: screenForRun(next),
        save: createRunSave(next),
        cues: [],
        error: null,
        endedRun: null,
      };

      apply(launched);
      return { transition: launched, error: null };
    },
    [apply, encounterSetup],
  );

  const playCard = useCallback(
    (instanceId: string): SoloRunAttempt => {
      const current = stateRef.current;

      if (current === null) {
        return {
          transition: null,
          error: { code: 'invalid-action', message: 'no run is in progress' },
        };
      }

      const next = playRunCard(current, instanceId);
      apply(next);
      return { transition: next, error: next.error };
    },
    [apply],
  );

  const endTurn = useCallback((): SoloRunAttempt => {
    const current = stateRef.current;

    if (current === null) {
      return {
        transition: null,
        error: { code: 'invalid-action', message: 'no run is in progress' },
      };
    }

    const next = endRunTurn(current);
    apply(next);
    return { transition: next, error: next.error };
  }, [apply]);

  const chooseReward = useCallback(
    (index: number): SoloRunAttempt => {
      const current = stateRef.current;

      if (current === null) {
        return {
          transition: null,
          error: { code: 'invalid-action', message: 'no run is in progress' },
        };
      }

      const next = resolveRunReward(current, index);
      apply(next);
      return { transition: next, error: next.error };
    },
    [apply],
  );

  const nextBattle = useCallback((): SoloRunAttempt => {
    const current = stateRef.current;

    if (current === null) {
      return {
        transition: null,
        error: { code: 'invalid-action', message: 'no run is in progress' },
      };
    }

    const next =
      encounterSetup === undefined
        ? startNextBattle(current)
        : startNextBattle(current, encounterSetup);
    apply(next);
    return { transition: next, error: next.error };
  }, [apply, encounterSetup]);

  const reset = useCallback(() => {
    stateRef.current = null;
    setState(null);
    saveStore.clear();
  }, [saveStore]);

  return {
    state,
    start,
    playCard,
    endTurn,
    chooseReward,
    nextBattle,
    reset,
  };
}
