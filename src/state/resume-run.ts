/**
 * Boot-time solo-run resume (RUN-FR-05, RUN-FR-06, RUN-FR-08, VIS-NFR-06).
 *
 * This module is the single translation from a loaded `fieldbound.run.v1` save to
 * the in-memory controller state the solo screens render. It is deliberately
 * small, because the two hard parts already have owners:
 *
 *   - `src/persistence/run-save.ts` parses, version-checks and validates the
 *     payload, discards corrupt data and removes only the run key;
 *   - the engine's `restoreSnapshot` (called by that validator) rebuilds the
 *     battle from the versioned snapshot. This module never parses a snapshot
 *     itself and never re-derives a rule (VIS-CON-08).
 *
 * A save is resumable only when the load status is `ok` and the restored pieces
 * agree with the run phase: a battle-phase run needs the restored battle, a
 * reward-phase run needs its three offers. Anything else is a typed "no run",
 * never an exception and never a partial state.
 *
 * The screen is derived with the controller's own `screenForRun`, so a resumed
 * run lands on exactly the surface the save was written from: battle, reward,
 * overview or result.
 *
 * Two fields are intentionally reconstructed rather than persisted, because the
 * save schema is frozen by RUN-03:
 *
 *   - `battleDamage` restarts at 0. The run model floors a settled battle's
 *     reported damage at the net health lost since the run entered the fight, so
 *     the result screen's damage total stays correct after a reload.
 *   - `stats` is null. The best-run record is written exactly once, when the run
 *     ends; a reloaded result screen reads the run totals and must not rewrite
 *     or re-claim the record.
 */
import { byId as cardCatalog } from '../content/cards';
import type { CardCatalog } from '../engine/battle';
import type { BattleState, EnemyDefinition } from '../engine/types';
import type {
  RunSaveLoadResult,
  RunSaveLoadStatus,
  RunSaveV1,
} from '../persistence/run-save';
import { currentEnemy } from '../run/run-model';
import { fieldMatchupFor } from './battle-controller';
import type { BattleControllerState } from './battle-controller';
import { screenForRun } from './run-controller';
import type { RunScreen, SoloRunState } from './run-controller';

/** Why no run could be resumed. Diagnostic only; never shown verbatim. */
export type ResumeReason =
  | Exclude<RunSaveLoadStatus, 'ok'>
  | 'inconsistent-save';

/** A validated save that the menu may offer as Continue Run. */
export interface RunResumeAvailable {
  readonly status: 'available';
  /** Exactly the state the saved screen rendered from. */
  readonly state: SoloRunState;
  /** The screen the run occupied when it was saved. */
  readonly screen: RunScreen;
  /** The canonical save that was resumed, for diagnostics and tests. */
  readonly save: RunSaveV1;
}

/**
 * Nothing to resume. `reason` distinguishes "no save", "discarded" and
 * "storage unavailable" without ever carrying a raw storage exception.
 */
export interface RunResumeNone {
  readonly status: 'none';
  readonly reason: ResumeReason;
}

export type RunResume = RunResumeAvailable | RunResumeNone;

/**
 * Rebuild the reducer state a battle screen consumes from the engine's restored
 * `BattleState`.
 *
 * Only the derived field facts are computed here, through the controller's own
 * exported `fieldMatchupFor`, so a resumed banner states the same matchup words
 * as a battle that never left the screen. The telegraph arrives inside the
 * snapshot, which is what lets Continue Run show the exact enemy plan.
 */
function controllerStateFrom(
  battle: BattleState,
  enemy: EnemyDefinition,
  cards: CardCatalog,
): BattleControllerState {
  return {
    battle,
    enemy,
    cards,
    fieldMatchup: fieldMatchupFor(battle.field),
    // A restored board has no un-played reduction: sequence 0 and a null report
    // stop the screen from replaying a cue or an announcement on mount.
    sequence: 0,
    report: null,
  };
}

/**
 * Turn a load result into a resumable run, or a typed "no run".
 *
 * Total: any mismatch between the save and its restored battle is reported as
 * `inconsistent-save` instead of throwing or resuming a half-built state. Only
 * `status: 'ok'` can yield `available`; a discarded or unavailable load never
 * advertises Continue Run.
 */
export function resumeRun(load: RunSaveLoadResult): RunResume {
  if (load.status !== 'ok') {
    return { status: 'none', reason: load.status };
  }

  const { save, battle } = load;

  if (save === null) {
    return { status: 'none', reason: 'inconsistent-save' };
  }

  const phase = save.run.phase;

  const enemy = currentEnemy(save.run);

  if (enemy === undefined) {
    return { status: 'none', reason: 'inconsistent-save' };
  }

  // The validator guarantees these pairings; checking them again keeps this
  // function total even for a hand-built load result.
  if (phase === 'battle' && battle === null) {
    return { status: 'none', reason: 'inconsistent-save' };
  }

  if (phase !== 'battle' && battle !== null) {
    return { status: 'none', reason: 'inconsistent-save' };
  }

  const offers = phase === 'reward' ? save.pendingReward : null;

  if (phase === 'reward' && offers === null) {
    return { status: 'none', reason: 'inconsistent-save' };
  }

  const state: SoloRunState = {
    run: save.run,
    rngState: save.rngState,
    battle:
      battle === null ? null : controllerStateFrom(battle, enemy, cardCatalog),
    offers,
    battleDamage: 0,
    stats: null,
  };

  return {
    status: 'available',
    state,
    screen: screenForRun(state),
    save,
  };
}
