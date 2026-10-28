/**
 * The battle controller (SHL-FR-03, ENG-FR-01, ENG-FR-04, ENG-FR-07).
 *
 * This is the only layer between a screen and the battle engine. It owns every
 * engine mutator call, keeps the reducer state immutable, and turns engine
 * results into a small typed report the UI can react to (a cue list and one
 * typed error).
 *
 * What it deliberately does not do:
 *
 *   - it does not resolve damage, draw, statuses or affordability; those come
 *     from `src/engine` and the frozen content data (VIS-CON-08);
 *   - it does not render, read storage or know about the solo/duel modes. Both
 *     modes supply the same setup and consume the same state.
 *
 * Turn handling
 * -------------
 * A fresh battle begins on the player's action phase with no telegraph. The
 * controller immediately plans the enemy's first turn with `prepareEnemyTurn`,
 * which is the same housekeeping the solo loop performs between turns. When the
 * player ends a turn, the controller replays the stored plan through
 * `playCard`, ends the enemy turn, then draws and plans the next enemy turn.
 *
 * After every player action the stored plan is re-previewed against the live
 * field and defense with `previewEnemyPlan`. The chosen cards never change, so
 * a Shift or a Ward moves the displayed numbers without rewriting the plan
 * (ENG-FR-07).
 */
import { useCallback, useReducer } from 'react';
import { counteringElement, prepareEnemyTurn } from '../engine/ai';
import { createBattle, endTurn, playCard } from '../engine/battle';
import type {
  BattleSetup,
  BattleSideSetup,
  CardCatalog,
} from '../engine/battle';
import { FIELD_BEATS } from '../engine/damage';
import { previewEnemyPlan } from '../engine/intent';
import type {
  BattleState,
  Element,
  EnemyDefinition,
  EngineErrorCode,
  EngineResult,
  Side,
} from '../engine/types';
import type { FieldMatchup } from '../ui/components/FieldBanner';
import type { CueName } from '../ui/events';

/* -------------------------------------------------------------------------- */
/* Public contract                                                             */
/* -------------------------------------------------------------------------- */

/** Everything a battle needs. Both game modes build this same shape. */
export interface BattleControllerConfig {
  readonly seed: number;
  readonly player: BattleSideSetup;
  readonly opponent: BattleSideSetup;
  readonly cards: CardCatalog;
  /**
   * The enemy definition supplies the boss planning flag and the display
   * identity. Health and deck are already part of `opponent`.
   */
  readonly enemy: EnemyDefinition;
  /** Opening turn owner; defaults to the player. */
  readonly startingSide?: Side;
}

/** One rejected intent. The code is the engine's, never a UI-invented one. */
export interface BattleActionError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

/** The observable result of one dispatched intent. */
export interface BattleReport {
  readonly intent: BattleIntent['type'];
  readonly ok: boolean;
  readonly error: BattleActionError | null;
  /**
   * Cues the screen should emit, in playback order. A rejected intent emits
   * nothing. `victory` and `defeat` close the list when the battle settles.
   */
  readonly cues: readonly CueName[];
}

/**
 * Reducer state. `cards` and `enemy` travel with the battle so the reducer can
 * run every engine call without a second config object, and so a resumed run
 * can rebuild the controller from a plain snapshot.
 */
export interface BattleControllerState {
  readonly battle: BattleState;
  readonly enemy: EnemyDefinition;
  readonly cards: CardCatalog;
  /** Field facts derived from the engine's frozen cycle; null on Neutral. */
  readonly fieldMatchup: FieldMatchup | null;
  /**
   * Increments on every dispatched intent, including a rejection. The screen
   * emits `report.cues` once per sequence, so a repeated rejection cannot
   * replay audio and a real action cannot be missed.
   */
  readonly sequence: number;
  readonly report: BattleReport | null;
}

/** Every intent a battle screen may dispatch. */
export type BattleIntent =
  | { readonly type: 'play-card'; readonly instanceId: string }
  | { readonly type: 'end-turn' };

/** The handle a screen receives from the hook. */
export interface BattleController {
  readonly state: BattleControllerState;
  readonly playCard: (instanceId: string) => void;
  readonly endTurn: () => void;
}

/* -------------------------------------------------------------------------- */
/* Field facts                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The three field facts the banner states, taken from the engine's frozen
 * `FIELD_BEATS` table. Neutral has no empowered or countered element, so it
 * returns null instead of inventing a matchup. The inverse lookup is the
 * engine's `counteringElement`, so the controller never restates the cycle.
 */
export function fieldMatchupFor(field: Element): FieldMatchup | null {
  if (field === 'neutral') {
    return null;
  }

  const beatenBy = counteringElement(field);

  if (beatenBy === null) {
    return null;
  }

  return {
    empowered: field,
    countered: FIELD_BEATS[field],
    beatenBy,
  };
}

/* -------------------------------------------------------------------------- */
/* State construction                                                          */
/* -------------------------------------------------------------------------- */

function stateFromBattle(
  battle: BattleState,
  enemy: EnemyDefinition,
  cards: CardCatalog,
  sequence: number,
  report: BattleReport | null,
): BattleControllerState {
  return {
    battle,
    enemy,
    cards,
    fieldMatchup: fieldMatchupFor(battle.field),
    sequence,
    report,
  };
}

/**
 * Creates a battle and its opening telegraph. Returns a typed failure for an
 * invalid seed, element, health value or unknown card id; the engine remains
 * the single validator and nothing partial is returned.
 */
export function createBattleControllerState(
  config: BattleControllerConfig,
): EngineResult<BattleControllerState> {
  const setup: BattleSetup = {
    seed: config.seed,
    player: config.player,
    opponent: config.opponent,
    catalog: config.cards,
    ...(config.startingSide === undefined
      ? {}
      : { startingSide: config.startingSide }),
  };
  const created = createBattle(setup);

  if (!created.ok) {
    return created;
  }

  // The telegraph the player sees during their first turn. `prepareEnemyTurn`
  // draws only when the enemy hand is short (it is not, at setup) and never
  // advances the PRNG on a full hand.
  const planned = prepareEnemyTurn(
    created.value,
    config.cards,
    config.enemy,
    'opponent',
  );

  return {
    ok: true,
    value: stateFromBattle(planned, config.enemy, config.cards, 0, null),
  };
}

/* -------------------------------------------------------------------------- */
/* Cue derivation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cues for one resolved card. `card-play` always leads; the other cues are
 * derived from what actually changed, so a zero-damage hit or a Ward at the
 * defense cap stays silent for that cue.
 */
function cuesForCardPlay(
  before: BattleState,
  after: BattleState,
): readonly CueName[] {
  const cues: CueName[] = ['card-play'];

  if (
    after.sides.player.health < before.sides.player.health ||
    after.sides.opponent.health < before.sides.opponent.health
  ) {
    cues.push('damage');
  }

  if (
    after.sides.player.defense > before.sides.player.defense ||
    after.sides.opponent.defense > before.sides.opponent.defense
  ) {
    cues.push('ward');
  }

  if (after.field !== before.field) {
    cues.push('shift');
  }

  if (after.outcome === 'player-victory') {
    cues.push('victory');
  } else if (after.outcome === 'opponent-victory') {
    cues.push('defeat');
  }

  return cues;
}

/* -------------------------------------------------------------------------- */
/* Plan preview                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Recomputes the stored telegraph against live state. The plan's card list and
 * turn are preserved; only the step numbers move. A settled battle carries no
 * telegraph, and a preview failure leaves the last good plan in place.
 */
function refreshPlan(state: BattleState, cards: CardCatalog): BattleState {
  if (state.phase === 'ended' || state.outcome !== 'ongoing') {
    return state.enemyPlan === null ? state : { ...state, enemyPlan: null };
  }

  const preview = previewEnemyPlan(state, cards);

  if (!preview.ok || preview.value === null) {
    return state;
  }

  return { ...state, enemyPlan: preview.value };
}

/* -------------------------------------------------------------------------- */
/* Enemy turn                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Replays the telegraphed plan, ends the enemy turn and prepares the next
 * telegraph. Only this function calls a mutator with `side: 'opponent'`.
 *
 * If a planned step is unexpectedly refused the loop stops; the turn still
 * ends so the player can always act again. A plan that settles the battle
 * leaves the outcome in place and skips all housekeeping.
 */
function runEnemyTurn(
  battle: BattleState,
  plan: BattleState['enemyPlan'],
  enemy: EnemyDefinition,
  cards: CardCatalog,
  cues: CueName[],
): BattleState {
  let current = battle;

  if (plan !== null) {
    for (const step of plan.steps) {
      if (current.phase === 'ended' || current.outcome !== 'ongoing') {
        break;
      }

      const played = playCard(
        current,
        { type: 'play-card', side: 'opponent', instanceId: step.instanceId },
        cards,
      );

      if (!played.ok) {
        break;
      }

      cues.push(...cuesForCardPlay(current, played.value));
      current = played.value;
    }
  }

  if (current.phase === 'ended' || current.outcome !== 'ongoing') {
    return current;
  }

  const ended = endTurn(current, { type: 'end-turn', side: 'opponent' });

  if (!ended.ok) {
    return current;
  }

  return prepareEnemyTurn(ended.value, cards, enemy, 'opponent');
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

function rejected(
  state: BattleControllerState,
  intent: BattleIntent['type'],
  code: EngineErrorCode,
  message: string,
): BattleControllerState {
  return {
    ...state,
    sequence: state.sequence + 1,
    report: {
      intent,
      ok: false,
      error: { code, message },
      cues: [],
    },
  };
}

function reducePlayCard(
  state: BattleControllerState,
  instanceId: string,
): BattleControllerState {
  const played = playCard(
    state.battle,
    { type: 'play-card', side: 'player', instanceId },
    state.cards,
  );

  if (!played.ok) {
    return rejected(
      state,
      'play-card',
      played.error.code,
      played.error.message,
    );
  }

  const cues = cuesForCardPlay(state.battle, played.value);
  const battle = refreshPlan(played.value, state.cards);

  return stateFromBattle(battle, state.enemy, state.cards, state.sequence + 1, {
    intent: 'play-card',
    ok: true,
    error: null,
    cues,
  });
}

function reduceEndTurn(state: BattleControllerState): BattleControllerState {
  // The stored telegraph is cleared by the engine when the player's turn ends,
  // so it has to be captured before the call that consumes it.
  const plan = state.battle.enemyPlan;
  const ended = endTurn(state.battle, { type: 'end-turn', side: 'player' });

  if (!ended.ok) {
    return rejected(state, 'end-turn', ended.error.code, ended.error.message);
  }

  const cues: CueName[] = [];
  const battle = runEnemyTurn(ended.value, plan, state.enemy, state.cards, cues);

  return stateFromBattle(battle, state.enemy, state.cards, state.sequence + 1, {
    intent: 'end-turn',
    ok: true,
    error: null,
    cues,
  });
}

/**
 * The pure reducer. Screens never call it directly; the hook below turns it
 * into `useReducer`. It is exported so every transition can be tested without
 * React and so a resumable mode can reduce a restored snapshot.
 */
export function battleReducer(
  state: BattleControllerState,
  intent: BattleIntent,
): BattleControllerState {
  return intent.type === 'play-card'
    ? reducePlayCard(state, intent.instanceId)
    : reduceEndTurn(state);
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * React binding for the reducer. The initial state is created once by
 * `createBattleControllerState`; later renders are pure reductions.
 */
export function useBattleController(
  initialState: BattleControllerState,
): BattleController {
  const [state, dispatch] = useReducer(battleReducer, initialState);

  const playCardIntent = useCallback((instanceId: string) => {
    dispatch({ type: 'play-card', instanceId });
  }, []);

  const endTurnIntent = useCallback(() => {
    dispatch({ type: 'end-turn' });
  }, []);

  return {
    state,
    playCard: playCardIntent,
    endTurn: endTurnIntent,
  };
}
