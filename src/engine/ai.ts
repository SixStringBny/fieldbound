/**
 * Deterministic enemy planner (ENG-FR-06, VIS-CON-08).
 *
 * `planEnemyTurn` is a pure function from battle state, the enemy profile and
 * the card catalog to an `EnemyPlan`. It reads the acting side's current hand
 * and never mutates state, never draws and never touches the PRNG: repeated
 * planning of the same state returns a deep-equal plan.
 *
 * Priority (frozen by `docs/features/battle-engine.md` section 4.5):
 *
 *   1. an affordable sequence that reduces the player to 0 this turn;
 *   2. one Ward while the enemy is at 12 health or less;
 *   3. a Shift that enables an affordable matching attack - the boss prefers
 *      the element that counters the player's starter element;
 *   4. remaining attacks, by field match, then damage per energy, then card id;
 *   5. remaining Wards, then utility cards, then stop.
 *
 * Every candidate is evaluated with `simulateEnemyPlan`, which runs the same
 * damage, Ward and status helpers as the battle reducer. A sequence with a card
 * the simulated energy cannot pay for is a rejection, not a partial plan, so an
 * unaffordable card can never appear in a plan.
 *
 * Ties are broken by card id and then instance id. That is the whole
 * "randomness" budget of the planner: it is deterministic and seed-independent,
 * while the battle itself stays seeded.
 *
 * Housekeeping timing (`prepareEnemyTurn`): after the enemy ends its turn, the
 * solo controller discards, draws the enemy's next hand and asks for a plan.
 * Doing it here - not at the start of the player's turn - is what makes the
 * telegraph exact. The plan executes on the next turn the enemy acts.
 */
import { cardExecutionProblem, drawCards, otherSide } from './battle';
import type { CardCatalog } from './battle';
import { FIELD_BEATS, resolveMatchup } from './damage';
import { lastPlanStep, simulateEnemyPlan } from './intent';
import type { PlanSimulation, PlannedCard } from './intent';
import { FIELD_ELEMENTS, HAND_SIZE } from './types';
import type {
  BattleState,
  CardDefinition,
  Element,
  EnemyDefinition,
  EnemyPlan,
  FieldElement,
  Side,
} from './types';

/* -------------------------------------------------------------------------- */
/* Public contract                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The part of `EnemyDefinition` the planner needs. A full `EnemyDefinition`
 * satisfies it; tests and duel callers may pass `null`.
 */
export type EnemyPlanProfile = Pick<EnemyDefinition, 'counterElementBias'>;

/* -------------------------------------------------------------------------- */
/* The element that counters a starter element                                 */
/* -------------------------------------------------------------------------- */

/**
 * The field element that counters the supplied starter element, i.e. the field
 * under which an attack of `element` is countered: Frost by Ember, Gale by
 * Frost, Stone by Gale and Ember by Stone. This is the inverse of `FIELD_BEATS`
 * and is what the boss counter-element bias shifts to. Neutral is never
 * countered and never a shift target, so it returns `null`.
 */
export function counteringElement(element: Element): FieldElement | null {
  for (const field of FIELD_ELEMENTS) {
    if (FIELD_BEATS[field] === element) {
      return field;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Candidates                                                                  */
/* -------------------------------------------------------------------------- */

interface Candidate {
  readonly cardId: string;
  readonly instanceId: string;
  readonly card: CardDefinition;
}

/** Card id first, then instance id: the frozen deterministic tie-break. */
function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.cardId !== right.cardId) {
    return left.cardId < right.cardId ? -1 : 1;
  }

  if (left.instanceId !== right.instanceId) {
    return left.instanceId < right.instanceId ? -1 : 1;
  }

  return 0;
}

/**
 * The hand cards the planner may consider. A card missing from the catalog or
 * shaped so the reducer would refuse it cannot be executed, so it is skipped
 * rather than planned and then rejected mid-turn.
 */
function collectCandidates(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const instance of state.sides[side].hand) {
    const card = catalog[instance.cardId];

    if (card === undefined || cardExecutionProblem(card) !== null) {
      continue;
    }

    candidates.push({
      cardId: instance.cardId,
      instanceId: instance.instanceId,
      card,
    });
  }

  return candidates.sort(compareCandidates);
}

/** Field match rank used for attack ordering: empowered beats neutral. */
function matchupRank(field: Element, element: Element): number {
  const matchup = resolveMatchup(field, element);

  if (matchup === 'empowered') {
    return 2;
  }

  return matchup === 'neutral' ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* Sequence evaluation                                                         */
/* -------------------------------------------------------------------------- */

interface Selection {
  readonly cards: readonly PlannedCard[];
  readonly simulation: PlanSimulation;
}

function toPlanned(candidate: Candidate): PlannedCard {
  return { cardId: candidate.cardId, instanceId: candidate.instanceId };
}

/** One simulation, with a typed failure collapsed to `null` for search code. */
function evaluate(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  cards: readonly PlannedCard[],
): PlanSimulation | null {
  const result = simulateEnemyPlan({ state, side, catalog, cards });

  return result.ok ? result.value : null;
}

function usedInstanceIds(selection: Selection): ReadonlySet<string> {
  return new Set(selection.simulation.plan.steps.map((step) => step.instanceId));
}

/**
 * Appends one card to a selection. Returns null when the resulting sequence is
 * unaffordable or otherwise not executable, which is exactly the guarantee the
 * plan needs for every step.
 */
function appendCard(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  selection: Selection,
  candidate: Candidate,
): Selection | null {
  const cards = [...selection.cards, toPlanned(candidate)];
  const simulation = evaluate(state, side, catalog, cards);

  return simulation === null ? null : { cards, simulation };
}

/* -------------------------------------------------------------------------- */
/* 1. Lethal sequence                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generous upper bound on the damage still available from unused attack cards.
 * Each attack is assumed to be empowered (+2) and to have a Focus stack (+2),
 * and defense/Weaken are ignored, so this can never underestimate. It is used
 * only to prune searches that provably cannot kill the player: the common case
 * in a long battle, where the enemy's whole hand cannot reach 40 health.
 */
function attackDamageCeiling(
  candidates: readonly Candidate[],
  used: ReadonlySet<string>,
): number {
  let total = 0;

  for (const candidate of candidates) {
    if (used.has(candidate.instanceId) || candidate.card.type !== 'attack') {
      continue;
    }

    total +=
      Math.max(0, candidate.card.damage ?? 0) +
      Math.max(0, candidate.card.fieldBonus?.damage ?? 0) +
      4;
  }

  return total;
}

/**
 * Finds the shortest affordable card sequence that reduces the player to 0,
 * breaking ties lexicographically by card id and instance id.
 *
 * The search enumerates permutations of the hand by increasing length, so a
 * kill in one card always beats a kill in three, and the first kill found at a
 * given length is the lexicographically smallest one. A legal hand holds at
 * most `HAND_SIZE` cards; the depth cap keeps a corrupt oversized hand bounded.
 * A damage-ceiling prune removes branches that cannot possibly reach 0.
 */
function findLethalSequence(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  candidates: readonly Candidate[],
): readonly PlannedCard[] | null {
  const maxDepth = Math.min(candidates.length, HAND_SIZE);

  if (
    state.sides[otherSide(side)].health >
    attackDamageCeiling(candidates, new Set<string>())
  ) {
    return null;
  }

  const search = (
    prefix: readonly PlannedCard[],
    used: ReadonlySet<string>,
    remaining: number,
  ): readonly PlannedCard[] | null => {
    if (remaining <= 0) {
      return null;
    }

    for (const candidate of candidates) {
      if (used.has(candidate.instanceId)) {
        continue;
      }

      const next = [...prefix, toPlanned(candidate)];
      const simulation = evaluate(state, side, catalog, next);

      // An unaffordable or invalid prefix cannot become affordable by adding
      // more cards, so skipping it prunes the whole subtree.
      if (simulation === null) {
        continue;
      }

      if (simulation.playerHealthAfter <= 0) {
        return next;
      }

      const spent = new Set([...used, candidate.instanceId]);

      // Even every remaining attack at best-case modifiers cannot finish the
      // player from here, so no deeper sequence can be lethal.
      if (
        simulation.playerHealthAfter >
        attackDamageCeiling(candidates, spent)
      ) {
        continue;
      }

      const deeper = search(next, spent, remaining - 1);

      if (deeper !== null) {
        return deeper;
      }
    }

    return null;
  };

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const found = search([], new Set<string>(), depth);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* 2. Defensive Ward and 5. remaining Wards                                    */
/* -------------------------------------------------------------------------- */

interface WardChoice {
  readonly candidate: Candidate;
  readonly selection: Selection;
  readonly gained: number;
}

/**
 * Best affordable Ward from the remaining hand: the one that adds the most
 * defense after the cap, then the lowest card id. Zero-gain Wards at the cap
 * are never chosen, so a plan cannot idle away energy on a no-op.
 */
function bestWard(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  selection: Selection,
  candidates: readonly Candidate[],
): WardChoice | null {
  const used = usedInstanceIds(selection);
  let best: WardChoice | null = null;

  for (const candidate of candidates) {
    if (used.has(candidate.instanceId) || candidate.card.defense === undefined) {
      continue;
    }

    const next = appendCard(state, side, catalog, selection, candidate);

    if (next === null) {
      continue;
    }

    const step = lastPlanStep(next.simulation);

    if (step === null || step.defense <= 0) {
      continue;
    }

    if (
      best === null ||
      step.defense > best.gained ||
      (step.defense === best.gained &&
        compareCandidates(candidate, best.candidate) < 0)
    ) {
      best = { candidate, selection: next, gained: step.defense };
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* 3. Field-enabling Shift                                                     */
/* -------------------------------------------------------------------------- */

interface ShiftChoice {
  readonly selection: Selection;
  readonly score: number;
  readonly enablesAttack: boolean;
  readonly candidate: Candidate;
}

/**
 * The Shift to plan, or null.
 *
 * A Shift qualifies when it changes the field and either sets the enemy's own
 * element, sets the boss's counter element, or enables at least one affordable
 * matching attack. Requiring a matching attack for every Shift would make the
 * "own element before an unmatched attack" rule unreachable when the hand holds
 * no matching card yet; the explicit element rules win that tie. A Shift into
 * an unrelated element with no matching attack is never planned, because it
 * spends energy for nothing.
 *
 * Ranking: the boss counter element, then the enemy's own element, then any
 * other enabling Shift; within a rank a Shift that leaves an affordable
 * matching attack wins, then the lowest card id.
 */
function bestShift(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  selection: Selection,
  candidates: readonly Candidate[],
  enemyElement: Element,
  bossCounter: FieldElement | null,
): ShiftChoice | null {
  const used = usedInstanceIds(selection);
  const currentField = selection.simulation.fieldAfter;
  let best: ShiftChoice | null = null;

  for (const candidate of candidates) {
    if (used.has(candidate.instanceId)) {
      continue;
    }

    const target = candidate.card.shiftTo;

    if (target === undefined || target === currentField) {
      continue;
    }

    const next = appendCard(state, side, catalog, selection, candidate);

    if (next === null) {
      continue;
    }

    const enablesAttack = candidates.some((other) => {
      if (
        other.instanceId === candidate.instanceId ||
        used.has(other.instanceId) ||
        other.card.type !== 'attack' ||
        other.card.element !== target
      ) {
        return false;
      }

      return (
        evaluate(state, side, catalog, [...next.cards, toPlanned(other)]) !==
        null
      );
    });
    const isOwnElement = target === enemyElement;
    const isBossCounter = bossCounter !== null && target === bossCounter;

    if (!isOwnElement && !isBossCounter && !enablesAttack) {
      continue;
    }

    const score = isBossCounter ? 0 : isOwnElement ? 1 : 2;
    const current: ShiftChoice = {
      selection: next,
      score,
      enablesAttack,
      candidate,
    };

    if (
      best === null ||
      current.score < best.score ||
      (current.score === best.score &&
        current.enablesAttack &&
        !best.enablesAttack) ||
      (current.score === best.score &&
        current.enablesAttack === best.enablesAttack &&
        compareCandidates(current.candidate, best.candidate) < 0)
    ) {
      best = current;
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* 4. Attacks                                                                  */
/* -------------------------------------------------------------------------- */

interface AttackChoice {
  readonly candidate: Candidate;
  readonly selection: Selection;
  readonly rank: number;
  readonly damage: number;
  /** Cost denominator, never zero; a free attack ranks as one energy. */
  readonly cost: number;
}

/**
 * Compare two attacks exactly: field match, then damage per energy (by
 * cross-multiplication, so no floating-point comparison), then card id and
 * instance id.
 */
function isBetterAttack(choice: AttackChoice, best: AttackChoice): boolean {
  if (choice.rank !== best.rank) {
    return choice.rank > best.rank;
  }

  const choiceRatio = choice.damage * best.cost;
  const bestRatio = best.damage * choice.cost;

  if (choiceRatio !== bestRatio) {
    return choiceRatio > bestRatio;
  }

  return compareCandidates(choice.candidate, best.candidate) < 0;
}

/**
 * Plays affordable attacks greedily until none remains. The best attack is
 * re-picked after every step because Focus/Weaken consumption and energy
 * changes can reorder the remaining candidates; every choice is deterministic.
 */
function playAttacks(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  selection: Selection,
  candidates: readonly Candidate[],
): Selection {
  let current = selection;

  for (;;) {
    const used = usedInstanceIds(current);
    let best: AttackChoice | null = null;

    for (const candidate of candidates) {
      if (used.has(candidate.instanceId) || candidate.card.type !== 'attack') {
        continue;
      }

      const next = appendCard(state, side, catalog, current, candidate);

      if (next === null) {
        continue;
      }

      const step = lastPlanStep(next.simulation);

      if (step === null) {
        continue;
      }

      const choice: AttackChoice = {
        candidate,
        selection: next,
        rank: matchupRank(current.simulation.fieldAfter, candidate.card.element),
        damage: step.damage,
        cost: Math.max(1, step.cost),
      };

      if (best === null || isBetterAttack(choice, best)) {
        best = choice;
      }
    }

    if (best === null) {
      return current;
    }

    current = best.selection;
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Utility                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Plans every affordable utility card, lowest card id first, re-evaluating
 * after each play so energy granted by one utility can fund the next. Stops as
 * soon as no utility is affordable. Wards are handled before this phase.
 */
function playUtility(
  state: BattleState,
  side: Side,
  catalog: CardCatalog,
  selection: Selection,
  candidates: readonly Candidate[],
): Selection {
  let current = selection;

  for (;;) {
    const used = usedInstanceIds(current);
    let best: Selection | null = null;
    let bestCandidate: Candidate | null = null;

    for (const candidate of candidates) {
      if (used.has(candidate.instanceId) || candidate.card.type !== 'utility') {
        continue;
      }

      const next = appendCard(state, side, catalog, current, candidate);

      if (next === null) {
        continue;
      }

      if (
        bestCandidate === null ||
        compareCandidates(candidate, bestCandidate) < 0
      ) {
        best = next;
        bestCandidate = candidate;
      }
    }

    if (best === null) {
      return current;
    }

    current = best;
  }
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The complete deterministic plan for the acting side's next turn, or `null`
 * when no plan exists (settled battle or an inactive phase).
 *
 * `catalog` is read only. `enemy` supplies the boss flag; pass `null` for a
 * normal enemy or for the self-play player side.
 */
export function planEnemyTurn(
  state: BattleState,
  catalog: CardCatalog,
  enemy: EnemyPlanProfile | null = null,
  side: Side = 'opponent',
): EnemyPlan | null {
  if (state.phase !== 'action' || state.outcome !== 'ongoing') {
    return null;
  }

  const candidates = collectCandidates(state, side, catalog);
  const lethal = findLethalSequence(state, side, catalog, candidates);

  if (lethal !== null) {
    const simulation = evaluate(state, side, catalog, lethal);

    return simulation === null ? null : simulation.plan;
  }

  const initial = evaluate(state, side, catalog, []);

  if (initial === null) {
    return null;
  }

  const enemyElement = state.sides[side].element;
  const bossCounter =
    enemy?.counterElementBias === true
      ? counteringElement(state.sides[otherSide(side)].element)
      : null;

  let selection: Selection = { cards: [], simulation: initial };

  // 2. Defensive Ward at 12 health or less, ahead of any non-lethal attack.
  if (selection.simulation.enemyHealthAtTurnStart <= 12) {
    const ward = bestWard(state, side, catalog, selection, candidates);

    if (ward !== null) {
      selection = ward.selection;
    }
  }

  // 3. Field-enabling Shift, boss counter-element first.
  const shift = bestShift(
    state,
    side,
    catalog,
    selection,
    candidates,
    enemyElement,
    bossCounter,
  );

  if (shift !== null) {
    selection = shift.selection;
  }

  // 4. Attacks by field match, damage per energy, then card id.
  selection = playAttacks(state, side, catalog, selection, candidates);

  // 5. Remaining Wards, then utility cards.
  for (;;) {
    const ward = bestWard(state, side, catalog, selection, candidates);

    if (ward === null) {
      break;
    }

    selection = ward.selection;
  }

  selection = playUtility(state, side, catalog, selection, candidates);

  return selection.simulation.plan;
}

/**
 * Solo housekeeping: fill the enemy's next hand, then plan it, and store the
 * telegraph on the returned state. Call after the enemy's `endTurn`, while the
 * player's turn is active, so the player sees the exact next enemy turn.
 *
 * - A settled battle returns unchanged (nothing can grow after an outcome).
 * - Drawing happens before planning, in that order, so the plan is built from
 *   the hand the enemy will actually hold.
 * - The returned state is new; the input is never mutated.
 */
export function prepareEnemyTurn(
  state: BattleState,
  catalog: CardCatalog,
  enemy: EnemyPlanProfile | null = null,
  side: Side = 'opponent',
): BattleState {
  if (state.phase === 'ended' || state.outcome !== 'ongoing') {
    return state;
  }

  const missing = Math.max(0, HAND_SIZE - state.sides[side].hand.length);
  const drawn = missing > 0 ? drawCards(state, side, missing) : state;

  if (drawn.phase === 'ended' || drawn.outcome !== 'ongoing') {
    return drawn;
  }

  const plan = planEnemyTurn(drawn, catalog, enemy, side);

  return plan === null ? drawn : { ...drawn, enemyPlan: plan };
}
