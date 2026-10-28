/**
 * Enemy intent preview (ENG-FR-07, VIS-CON-08).
 *
 * The planner (`ai.ts`) chooses *which* cards the enemy will play; this module
 * turns that ordered card list into an `EnemyPlan` whose numbers are computed
 * against live battle state. Two callers share it:
 *
 *   - the planner, while it evaluates candidate sequences;
 *   - the UI/controller, via `previewEnemyPlan`, whenever the player changes the
 *     field or gains defense during their own turn. The preview keeps the
 *     stored card ids and instance ids and only recomputes totals.
 *
 * Every number here comes from the same helpers the battle reducer uses:
 * `resolveAttack`, `resolveWard`, `consumeAttackStatuses`, `applyStatus` and
 * `tickRegen`. The effect order mirrors `playCard` exactly:
 *
 *   1. pay the cost
 *   2. shift the field
 *   3. Ward defense (matching +2, card field bonus, cap 8)
 *   4. heal self
 *   5. attack (consume Focus/Weaken, then resolve damage)
 *   6. apply the declared status
 *   7. gain energy
 *
 * Draw effects are intentionally not simulated: the plan is a fixed list of the
 * cards the enemy already holds, so a drawn card could never join the plan and
 * cannot change any displayed total. Nothing here touches the PRNG.
 *
 * Planning assumes the enemy's next turn begins normally: energy resets to
 * exactly `TURN_START_ENERGY` (3) and one Regen stack ticks before the first
 * step. That makes the preview independent of whatever energy the enemy had
 * left when the plan was made, and it makes a recomputed preview stable.
 */
import { cardExecutionProblem, otherSide } from './battle';
import type { CardCatalog } from './battle';
import { resolveAttack, resolveWard } from './damage';
import {
  applyStatus,
  consumeAttackStatuses,
  normalizeStatusCounters,
  resolveStatusTarget,
  tickRegen,
} from './status';
import { TURN_START_ENERGY } from './types';
import type {
  BattleState,
  Element,
  EngineFailure,
  EngineResult,
  EnemyPlan,
  PlanStatusChange,
  PlanStep,
  Side,
  StatusCounters,
} from './types';

/* -------------------------------------------------------------------------- */
/* Public contract                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One chosen card, by definition id and physical instance id. The pair is the
 * planner's entire decision: previewing may change numbers, never these values.
 */
export interface PlannedCard {
  readonly cardId: string;
  readonly instanceId: string;
}

export interface PlanSimulationInput {
  readonly state: BattleState;
  /** Side that owns the plan. Solo always passes `opponent`. */
  readonly side: Side;
  readonly catalog: CardCatalog;
  /** The ordered cards the side intends to play, all from its current hand. */
  readonly cards: readonly PlannedCard[];
  /**
   * Turn the plan executes on. Defaults to the next turn the side acts on;
   * a stored plan passes its own value so a preview keeps the original turn.
   */
  readonly turn?: number;
}

/**
 * The computed plan plus the intermediate outcomes the planner needs to choose
 * between candidate sequences. `playerHealthAfter` is floored at 0, while each
 * step's `damage` is the full expected hit, so overkill is visible.
 */
export interface PlanSimulation {
  readonly plan: EnemyPlan;
  /** Enemy health after the turn-start Regen tick, before any planned card. */
  readonly enemyHealthAtTurnStart: number;
  readonly playerHealthAfter: number;
  readonly enemyHealthAfter: number;
  readonly enemyDefenseAfter: number;
  readonly fieldAfter: Element;
  readonly enemyEnergyAfter: number;
}

/** Reasons a plan cannot be computed. All are typed, none throw. */
export type PlanErrorCode =
  | 'unknown-card'
  | 'unsupported-card'
  | 'unaffordable-card'
  | 'invalid-state';

export type PlanSimulationResult = EngineResult<PlanSimulation, PlanErrorCode>;

/** Preview of a stored telegraph: `null` means the battle has no plan. */
export type EnemyPlanPreviewResult = EngineResult<EnemyPlan | null, PlanErrorCode>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function failure<Code extends PlanErrorCode>(
  code: Code,
  message: string,
): EngineFailure<Code> {
  return { ok: false, error: { code, message } };
}

/**
 * The turn index a plan made against `state` would execute on. A plan made
 * during the other side's turn (the housekeeping timing) runs on the very next
 * turn; a plan made mid-own-turn can only run two turns later.
 */
export function planTurnFor(state: BattleState, side: Side): number {
  return state.activeSide === side ? state.turn + 2 : state.turn + 1;
}

/** Mirrors the battle reducer's integer normalisation for additive values. */
function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const integer = Math.trunc(value);

  return integer > 0 ? integer : 0;
}

/** Mutable simulation side; never exposed, never aliased with battle state. */
interface SimSide {
  health: number;
  readonly maxHealth: number;
  defense: number;
  energy: number;
  statuses: StatusCounters;
}

/**
 * The step a candidate card would add: always the last one. Exposed because the
 * planner compares candidate damage and defense through this single accessor
 * instead of indexing `steps` itself.
 */
export function lastPlanStep(simulation: PlanSimulation): PlanStep | null {
  return simulation.plan.steps[simulation.plan.steps.length - 1] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Computes the full plan and every intermediate value. Pure: reads `input`
 * only, returns new objects, and never advances the battle PRNG.
 *
 * Rejections are all pre-computed before any partial result exists:
 *
 *   - a card id missing from the catalog        -> `unknown-card`
 *   - a definition the battle reducer refuses    -> `unsupported-card`
 *   - a step the simulated energy cannot pay for -> `unaffordable-card`
 *   - a settled battle or a repeated instance    -> `invalid-state`
 *
 * Hand membership is not enforced here: like the snapshot contract, this
 * validates structure, card shape and affordability. The planner is what
 * restricts its choices to the actual hand; a preview of a stored plan must
 * keep working even though the enemy eventually plays those cards.
 */
export function simulateEnemyPlan(
  input: PlanSimulationInput,
): PlanSimulationResult {
  if (input.state.phase === 'ended' || input.state.outcome !== 'ongoing') {
    return failure('invalid-state', 'no plan exists for a settled battle');
  }

  const targetSide = otherSide(input.side);
  const actor = input.state.sides[input.side];
  const target = input.state.sides[targetSide];

  // Turn start: energy resets and one Regen stack ticks before the first card.
  const regen = tickRegen(actor.statuses, actor.health, actor.maxHealth);
  const enemy: SimSide = {
    health: regen.health,
    maxHealth: actor.maxHealth,
    defense: actor.defense,
    energy: TURN_START_ENERGY,
    statuses: regen.statuses,
  };
  const player: SimSide = {
    health: target.health,
    maxHealth: target.maxHealth,
    defense: target.defense,
    energy: target.energy,
    statuses: normalizeStatusCounters(target.statuses),
  };

  let field: Element = input.state.field;
  const steps: PlanStep[] = [];
  const seenInstances = new Set<string>();

  for (const planned of input.cards) {
    if (seenInstances.has(planned.instanceId)) {
      return failure(
        'invalid-state',
        `instance id "${planned.instanceId}" appears more than once in the plan`,
      );
    }

    seenInstances.add(planned.instanceId);

    const card = input.catalog[planned.cardId];

    if (card === undefined) {
      return failure(
        'unknown-card',
        `planned card id "${planned.cardId}" is not in the catalog`,
      );
    }

    const problem = cardExecutionProblem(card);

    if (problem !== null) {
      return failure('unsupported-card', problem);
    }

    // 1. Pay the cost. The plan is rejected rather than partially paid.
    if (card.cost > enemy.energy) {
      return failure(
        'unaffordable-card',
        `card "${planned.cardId}" costs ${String(card.cost)} but the plan has ${String(enemy.energy)} energy at that step`,
      );
    }

    enemy.energy -= card.cost;

    // 2. Field shift. Later steps resolve against the new field.
    if (card.shiftTo !== undefined) {
      field = card.shiftTo;
    }

    // 3. Ward defense, computed against the field after any shift.
    let stepDefense = 0;

    if (card.defense !== undefined) {
      const ward = resolveWard({
        currentDefense: enemy.defense,
        baseDefense: card.defense,
        element: card.element,
        field,
        ...(card.fieldBonus?.defense !== undefined
          ? { fieldBonusDefense: card.fieldBonus.defense }
          : {}),
      });
      stepDefense = ward.gained;
      enemy.defense = ward.defense;
    }

    // 4. Heal self, capped at maximum health.
    const heal = card.heal ?? 0;

    if (heal > 0) {
      enemy.health = Math.min(enemy.maxHealth, enemy.health + heal);
    }

    // 5. Attack. Stacks are spent before damage, exactly like `playCard`, so a
    //    hit reduced to 0 still consumes them.
    let stepDamage = 0;

    if (card.type === 'attack') {
      const spend = consumeAttackStatuses(enemy.statuses);
      enemy.statuses = spend.statuses;

      const attack = resolveAttack({
        baseDamage: card.damage ?? 0,
        element: card.element,
        field,
        targetDefense: player.defense,
        piercing: card.piercing === true,
        statusModifier: spend.modifier,
        ...(card.fieldBonus?.damage !== undefined
          ? { fieldBonusDamage: card.fieldBonus.damage }
          : {}),
      });

      stepDamage = attack.damage;
      player.health = Math.max(0, player.health - attack.damage);
    }

    // 6. Status application to its resolved owner. The plan stores the card's
    //    descriptor unchanged, which is what the UI explains the step with.
    const stepStatuses: PlanStatusChange[] =
      card.status === undefined
        ? []
        : [
            {
              kind: card.status.kind,
              stacks: card.status.stacks,
              target: card.status.target,
            },
          ];

    if (card.status !== undefined) {
      const owner = resolveStatusTarget(input.side, card.status.target);

      if (owner === input.side) {
        enemy.statuses = applyStatus(
          enemy.statuses,
          card.status.kind,
          card.status.stacks,
        );
      } else {
        player.statuses = applyStatus(
          player.statuses,
          card.status.kind,
          card.status.stacks,
        );
      }
    }

    // 7. Energy gain. No cap: it may exceed the turn-start 3 for this turn.
    enemy.energy += toNonNegativeInteger(card.energy ?? 0);

    steps.push({
      cardId: planned.cardId,
      instanceId: planned.instanceId,
      cost: card.cost,
      damage: stepDamage,
      defense: stepDefense,
      statuses: stepStatuses,
      shiftTo: card.shiftTo ?? null,
      energyAfter: enemy.energy,
    });
  }

  const totalDamage = steps.reduce((sum, step) => sum + step.damage, 0);
  const totalDefense = steps.reduce((sum, step) => sum + step.defense, 0);

  const plan: EnemyPlan = {
    side: input.side,
    turn: input.turn ?? planTurnFor(input.state, input.side),
    steps,
    totalDamage,
    totalDefense,
    lethal: player.health <= 0,
    remainingEnergy: enemy.energy,
  };

  return {
    ok: true,
    value: {
      plan,
      enemyHealthAtTurnStart: enemy.health,
      playerHealthAfter: player.health,
      enemyHealthAfter: enemy.health,
      enemyDefenseAfter: enemy.defense,
      fieldAfter: field,
      enemyEnergyAfter: enemy.energy,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Stored telegraph preview                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Recomputes the numbers of the telegraph stored on `state` (ENG-FR-07).
 *
 * The chosen cards are read from the stored plan and never re-chosen, so a
 * player who raises defense or shifts the field sees different totals but the
 * same ordered card list. The stored `turn` and `side` are preserved. Returns
 * `null` (not an error) when there is no plan or the battle has settled.
 */
export function previewEnemyPlan(
  state: BattleState,
  catalog: CardCatalog,
): EnemyPlanPreviewResult {
  if (state.phase === 'ended' || state.outcome !== 'ongoing') {
    return { ok: true, value: null };
  }

  const stored = state.enemyPlan;

  if (stored === null) {
    return { ok: true, value: null };
  }

  const simulated = simulateEnemyPlan({
    state,
    side: stored.side,
    catalog,
    cards: stored.steps.map((step) => ({
      cardId: step.cardId,
      instanceId: step.instanceId,
    })),
    turn: stored.turn,
  });

  if (!simulated.ok) {
    return simulated;
  }

  return { ok: true, value: simulated.value.plan };
}
