/**
 * Legal battle state machine (ENG-FR-01, ENG-FR-04, ENG-FR-11, VIS-NFR-04).
 *
 * This is the only place in Fieldbound that owns deck order, drawing, the
 * discard pile, energy, turn ownership, card resolution and victory. Both game
 * modes call the same functions: every action names its acting side, and both
 * sides have exactly the same shape. Solo and duel never restate a rule.
 *
 * What this module deliberately does not do:
 *
 *   - no AI planning (the planner lives in `ai.ts` and is only called by solo);
 *   - no snapshot serialization or validation (`snapshot.ts`);
 *   - no React, DOM, storage or network access, and no `src/content` import;
 *   - no card-id conditionals. Every effect is read from `CardDefinition`.
 *
 * Turn sequence (frozen by `docs/features/battle-engine.md` section 4.1):
 *
 *   setup        shuffle both decks, deal 5 to each side, both at 3 energy
 *   turn start   energy := 3, Regen tick, draw to a hand of 5, burn overdraw
 *   action       play affordable cards atomically until the side ends the turn
 *   turn end     discard the whole hand, then the next side's turn starts
 *   battle end   either side at 0 health: outcome set, statuses cleared
 *
 * Determinism: one PRNG stream. Setup consumes it in a fixed order (shuffle the
 * player deck, shuffle the opponent deck, deal the player hand, deal the
 * opponent hand). Every reshuffle consumes it at the moment the draw pile
 * empties. This module never reads the host random source.
 *
 * `endTurn` starts the next side's turn in the same call, which is what makes a
 * discarded hand always refill to five. The enemy planner draws the enemy's next
 * hand at the end of the enemy turn with `drawCards`; the following turn-start
 * fill is then a no-op because the hand is already full, so the telegraph stays
 * exact.
 */
import { resolveAttack, resolveWard } from './damage';
import { createRng, shuffle } from './rng';
import type { RngState } from './rng';
import {
  applyStatus,
  clearBattleStatuses,
  consumeAttackStatuses,
  emptyStatuses,
  resolveStatusTarget,
  tickRegen,
} from './status';
import {
  CARD_TYPES,
  ELEMENTS,
  FIELD_ELEMENTS,
  HAND_SIZE,
  PLAYER_MAX_HEALTH,
  SIDES,
  STATUS_KINDS,
  STATUS_TARGETS,
  TURN_START_ENERGY,
} from './types';
import type {
  BattleOutcome,
  BattleSide,
  BattleSides,
  BattleState,
  CardDefinition,
  CardInstance,
  Element,
  EndTurnAction,
  EndTurnResult,
  EngineErrorCode,
  EngineFailure,
  EngineResult,
  PlayCardAction,
  PlayCardResult,
  Side,
} from './types';

/* -------------------------------------------------------------------------- */
/* Public setup contract                                                       */
/* -------------------------------------------------------------------------- */

/** Card definitions keyed by id. The caller owns the catalog; the engine only reads it. */
export type CardCatalog = Readonly<Record<string, CardDefinition>>;

/**
 * One side's starting configuration. Health defaults let a fresh battle start
 * at the frozen 40 player health while an enemy passes its configured value:
 * `maxHealth` defaults to `PLAYER_MAX_HEALTH` and `health` defaults to
 * `maxHealth`. A carried solo-run health is passed as `health`.
 */
export interface BattleSideSetup {
  /** Starter element recorded on the side, read by the boss counter-element bias. */
  readonly element: Element;
  /** Card ids in deck order; a repeated id means a second physical copy. */
  readonly cards: readonly string[];
  /** Maximum health; defaults to `PLAYER_MAX_HEALTH`. */
  readonly maxHealth?: number;
  /** Starting health; defaults to `maxHealth`, never above it. */
  readonly health?: number;
}

/**
 * Everything needed to begin a battle. `startingSide` lets the duel layer give
 * the opening turn to either human without inventing a second battle model.
 */
export interface BattleSetup {
  readonly seed: number;
  readonly player: BattleSideSetup;
  readonly opponent: BattleSideSetup;
  readonly catalog: CardCatalog;
  /** Side that owns turn 1; defaults to `player`. Both sides are dealt in. */
  readonly startingSide?: Side;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const UINT32_MAX = 0xffff_ffff;

/** The other side. Exported because controllers need the same mapping. */
export function otherSide(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player';
}

/** Typed failure. Never a thrown string, never a partial state. */
function failure<Code extends EngineErrorCode>(
  code: Code,
  message: string,
): EngineFailure<Code> {
  return { ok: false, error: { code, message } };
}

/** Replaces one side and copies the other, so side objects are never aliased. */
function setSide(sides: BattleSides, side: Side, next: BattleSide): BattleSides {
  return side === 'player'
    ? { player: next, opponent: sides.opponent }
    : { player: sides.player, opponent: next };
}

/** Truncates to a non-negative integer; corrupt input becomes 0. */
function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const integer = Math.trunc(value);

  return integer > 0 ? integer : 0;
}

function sideMaxHealth(setup: BattleSideSetup): number {
  return setup.maxHealth ?? PLAYER_MAX_HEALTH;
}

function sideStartHealth(setup: BattleSideSetup): number {
  return setup.health ?? sideMaxHealth(setup);
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Validates every input before any state exists: seed range, element, health
 * bounds and catalog hits. Returns null when the setup is usable.
 */
function validateSetup(setup: BattleSetup): EngineFailure | null {
  if (
    !Number.isInteger(setup.seed) ||
    setup.seed < 0 ||
    setup.seed > UINT32_MAX
  ) {
    return failure(
      'invalid-state',
      `seed must be an unsigned 32-bit integer, received ${String(setup.seed)}`,
    );
  }

  for (const side of SIDES) {
    const config: BattleSideSetup | undefined = setup[side];

    if (config === undefined) {
      return failure('invalid-state', `missing setup for the ${side} side`);
    }

    if (!(ELEMENTS as readonly string[]).includes(config.element)) {
      return failure(
        'invalid-state',
        `${side} element ${String(config.element)} is not a known element`,
      );
    }

    const maxHealth = sideMaxHealth(config);
    const health = sideStartHealth(config);

    if (!Number.isInteger(maxHealth) || maxHealth <= 0) {
      return failure(
        'invalid-state',
        `${side} maxHealth must be a positive integer, received ${String(maxHealth)}`,
      );
    }

    if (!Number.isInteger(health) || health <= 0 || health > maxHealth) {
      return failure(
        'invalid-state',
        `${side} health must be an integer in 1..${String(maxHealth)}, received ${String(health)}`,
      );
    }

    for (const cardId of config.cards) {
      if (typeof cardId !== 'string' || cardId.length === 0) {
        return failure(
          'invalid-state',
          `${side} deck contains a card id that is not a non-empty string`,
        );
      }

      if (setup.catalog[cardId] === undefined) {
        return failure(
          'unknown-card',
          `${side} deck references card id "${cardId}", which is not in the catalog`,
        );
      }
    }
  }

  if (
    setup.startingSide !== undefined &&
    !(SIDES as readonly string[]).includes(setup.startingSide)
  ) {
    return failure(
      'invalid-state',
      `startingSide ${String(setup.startingSide)} is not a battle side`,
    );
  }

  return null;
}

/**
 * Turns a deck's card ids into distinct physical copies. Ids are built from the
 * side, the deck position and the card id, so they are unique for the whole
 * battle and stay stable across a JSON round-trip.
 */
function buildDeck(side: Side, cardIds: readonly string[]): CardInstance[] {
  return cardIds.map((cardId, index) => ({
    instanceId: `${side}:${String(index)}:${cardId}`,
    cardId,
  }));
}

/**
 * Creates a battle that is ready for the opening side's action phase: both
 * decks shuffled, both hands dealt to 5, both sides at 3 energy on a Neutral
 * field with 0 defense and no statuses. Inputs are validated before any state
 * is returned, so a bad setup is a typed error rather than a half-built battle.
 */
export function createBattle(setup: BattleSetup): EngineResult<BattleState> {
  const invalid = validateSetup(setup);

  if (invalid !== null) {
    return invalid;
  }

  let rngState: RngState;

  try {
    rngState = createRng(setup.seed);
  } catch {
    return failure(
      'invalid-state',
      `seed must be an unsigned 32-bit integer, received ${String(setup.seed)}`,
    );
  }

  // Fixed consumption order. Changing it changes every seeded battle.
  const playerShuffle = shuffle(buildDeck('player', setup.player.cards), rngState);
  rngState = playerShuffle.state;
  const opponentShuffle = shuffle(
    buildDeck('opponent', setup.opponent.cards),
    rngState,
  );
  rngState = opponentShuffle.state;
  const playerDeal = drawFrom(
    { deck: playerShuffle.items, hand: [], discard: [] },
    HAND_SIZE,
    rngState,
  );
  rngState = playerDeal.rngState;
  const opponentDeal = drawFrom(
    { deck: opponentShuffle.items, hand: [], discard: [] },
    HAND_SIZE,
    rngState,
  );
  rngState = opponentDeal.rngState;

  const startingSide: Side = setup.startingSide ?? 'player';

  const sides: BattleSides = {
    player: {
      side: 'player',
      element: setup.player.element,
      health: sideStartHealth(setup.player),
      maxHealth: sideMaxHealth(setup.player),
      defense: 0,
      energy: TURN_START_ENERGY,
      deck: playerDeal.deck,
      hand: playerDeal.hand,
      discard: playerDeal.discard,
      statuses: emptyStatuses(),
    },
    opponent: {
      side: 'opponent',
      element: setup.opponent.element,
      health: sideStartHealth(setup.opponent),
      maxHealth: sideMaxHealth(setup.opponent),
      defense: 0,
      energy: TURN_START_ENERGY,
      deck: opponentDeal.deck,
      hand: opponentDeal.hand,
      discard: opponentDeal.discard,
      statuses: emptyStatuses(),
    },
  };

  return {
    ok: true,
    value: {
      seed: setup.seed,
      rngState,
      turn: 1,
      activeSide: startingSide,
      phase: 'action',
      field: 'neutral',
      outcome: 'ongoing',
      sides,
      enemyPlan: null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

/** The three ordered zones a draw touches. */
interface Piles {
  readonly deck: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
}

interface DrawOutcome {
  readonly deck: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  readonly rngState: RngState;
  /** Cards that entered the hand. */
  readonly drawn: number;
  /** Cards drawn while the hand was full; they leave the battle entirely. */
  readonly burned: number;
}

/**
 * Draws `count` cards from the front of the draw pile.
 *
 * - An empty draw pile reshuffles the discard pile with the battle PRNG; only a
 *   pile that is empty on both sides ends the draw early.
 * - A card drawn at a full hand is burned: it is consumed by the overdraw and
 *   appears in no zone afterwards. It is not discarded, so it cannot return
 *   through a later reshuffle.
 * - The input arrays are never mutated.
 */
function drawFrom(piles: Piles, count: number, state: RngState): DrawOutcome {
  const deck = [...piles.deck];
  const hand = [...piles.hand];
  let discard = [...piles.discard];
  let rngState = state;
  let drawn = 0;
  let burned = 0;
  const total = toNonNegativeInteger(count);

  for (let index = 0; index < total; index += 1) {
    if (deck.length === 0) {
      if (discard.length === 0) {
        break;
      }

      const reshuffled = shuffle(discard, rngState);
      rngState = reshuffled.state;
      deck.push(...reshuffled.items);
      discard = [];
    }

    const card = deck.shift();

    if (card === undefined) {
      break;
    }

    if (hand.length < HAND_SIZE) {
      hand.push(card);
      drawn += 1;
    } else {
      burned += 1;
    }
  }

  return { deck, hand, discard, rngState, drawn, burned };
}

/** Fills the hand up to `HAND_SIZE`, burning any impossible overdraw. */
function fillHand(piles: Piles, state: RngState): DrawOutcome {
  return drawFrom(piles, Math.max(0, HAND_SIZE - piles.hand.length), state);
}

/**
 * Draws `count` cards for one side. Exposed because the enemy draws its next
 * hand at the end of its own turn (solo housekeeping); the following turn-start
 * fill is then a no-op. This does not reset energy and does not tick Regen -
 * those belong to turn start. Returns a new state and never mutates the input.
 * A settled battle is returned unchanged, so nothing can grow after an outcome.
 */
export function drawCards(
  state: BattleState,
  side: Side,
  count: number,
): BattleState {
  if (state.phase === 'ended' || state.outcome !== 'ongoing') {
    return state;
  }

  const piles = state.sides[side];
  const outcome = drawFrom(piles, count, state.rngState);
  const nextSide: BattleSide = {
    ...piles,
    deck: outcome.deck,
    hand: outcome.hand,
    discard: outcome.discard,
  };

  return {
    ...state,
    rngState: outcome.rngState,
    sides: setSide(state.sides, side, nextSide),
  };
}

/* -------------------------------------------------------------------------- */
/* Action gating                                                               */
/* -------------------------------------------------------------------------- */

interface ActionGate {
  readonly ok: true;
  readonly value: null;
}

/**
 * Every action goes through the same gate: a settled battle rejects everything,
 * a side may only act during its own action phase. Checked before any state is
 * touched, so a rejected action cannot partially apply.
 */
function checkActionAllowed(
  state: BattleState,
  side: Side,
): ActionGate | EngineFailure {
  if (state.phase === 'ended' || state.outcome !== 'ongoing') {
    return failure('battle-ended', 'the battle has already ended');
  }

  if (state.phase !== 'action') {
    return failure(
      'invalid-phase',
      `no action is legal during the ${state.phase} phase`,
    );
  }

  if (state.activeSide !== side) {
    return failure(
      'not-active-side',
      `it is the ${state.activeSide} side's turn, not the ${String(side)} side's`,
    );
  }

  return { ok: true, value: null };
}

/* -------------------------------------------------------------------------- */
/* Card validation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reports why a definition cannot be executed, or null when it can. The check
 * is data-driven: no id appears here. Shift targets must be one of the four
 * field elements, because a shift can never set Neutral.
 */
function cardExecutionProblem(card: CardDefinition): string | null {
  if (!(ELEMENTS as readonly string[]).includes(card.element)) {
    return `card "${String(card.id)}" has unknown element ${String(card.element)}`;
  }

  if (!(CARD_TYPES as readonly string[]).includes(card.type)) {
    return `card "${String(card.id)}" has unknown type ${String(card.type)}`;
  }

  if (!Number.isInteger(card.cost) || card.cost < 0) {
    return `card "${String(card.id)}" has an invalid cost`;
  }

  for (const [field, value] of [
    ['damage', card.damage],
    ['defense', card.defense],
    ['draw', card.draw],
    ['energy', card.energy],
    ['heal', card.heal],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 0)
    ) {
      return `card "${String(card.id)}" has an invalid ${field} value`;
    }
  }

  if (card.fieldBonus !== undefined) {
    for (const [field, value] of [
      ['damage', card.fieldBonus.damage],
      ['defense', card.fieldBonus.defense],
    ] as const) {
      if (
        value !== undefined &&
        (!Number.isInteger(value) || value < 0)
      ) {
        return `card "${String(card.id)}" has an invalid field bonus ${field}`;
      }
    }
  }

  if (card.status !== undefined) {
    if (!(STATUS_KINDS as readonly string[]).includes(card.status.kind)) {
      return `card "${String(card.id)}" applies an unknown status`;
    }

    if (!(STATUS_TARGETS as readonly string[]).includes(card.status.target)) {
      return `card "${String(card.id)}" applies a status to an unknown target`;
    }

    if (!Number.isFinite(card.status.stacks)) {
      return `card "${String(card.id)}" applies a non-finite status stack count`;
    }
  }

  if (
    card.shiftTo !== undefined &&
    !(FIELD_ELEMENTS as readonly string[]).includes(card.shiftTo)
  ) {
    return `card "${String(card.id)}" shifts to ${String(card.shiftTo)}, which is not a field element`;
  }

  return null;
}

interface PlayableCard {
  readonly instance: CardInstance;
  readonly card: CardDefinition;
}

/**
 * The single affordability/legality rule, shared by `playCard` and
 * `canPlayCard`. Returns the selected card when the play is legal so the caller
 * never looks it up twice or re-derives a cost check.
 */
function checkPlayable(
  state: BattleState,
  side: Side,
  instanceId: string,
  catalog: CardCatalog,
): EngineResult<PlayableCard> {
  const gate = checkActionAllowed(state, side);

  if (!gate.ok) {
    return gate;
  }

  const actor = state.sides[side];
  const instance = actor.hand.find(
    (held) => held.instanceId === instanceId,
  );

  if (instance === undefined) {
    return failure(
      'card-not-in-hand',
      `no card with instance id "${String(instanceId)}" is in the ${side} hand`,
    );
  }

  const card = catalog[instance.cardId];

  if (card === undefined) {
    return failure(
      'unknown-card',
      `card id "${instance.cardId}" is not in the catalog`,
    );
  }

  const problem = cardExecutionProblem(card);

  if (problem !== null) {
    return failure('unsupported-card', problem);
  }

  if (card.cost > actor.energy) {
    return failure(
      'unaffordable-card',
      `card "${instance.cardId}" costs ${String(card.cost)} but only ${String(actor.energy)} energy is available`,
    );
  }

  return { ok: true, value: { instance, card } };
}

/**
 * True when the side could play the card right now. The UI uses this instead of
 * comparing cost and energy itself, so affordability stays a single rule
 * (VIS-CON-08). Never mutates state.
 */
export function canPlayCard(
  state: BattleState,
  side: Side,
  instanceId: string,
  catalog: CardCatalog,
): boolean {
  return checkPlayable(state, side, instanceId, catalog).ok;
}

/* -------------------------------------------------------------------------- */
/* Playing a card                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolves one card atomically. Either the whole play applies and a new state
 * is returned, or a typed error is returned and the caller's state is untouched.
 *
 * Effect order (fixed; the played card is already out of the hand so a draw can
 * use the freed slot):
 *
 *   1. pay the cost
 *   2. shift the field (`shiftTo`)
 *   3. Ward defense (`defense`, matching +2, field bonus, cap 8)
 *   4. heal self
 *   5. attack (`type: "attack"`): spend one Focus and one Weaken stack, then
 *      resolve damage against the other side
 *   6. apply the declared status to its resolved target
 *   7. draw (`draw`)
 *   8. gain energy (`energy`, may exceed 3 for this turn)
 *   9. move the played card to the discard pile
 *
 * Defense is persistent: it reduces every non-piercing attack and is not spent.
 * Focus and Weaken are spent when an attack card is played even if the final
 * damage is 0, and the card still resolves fully when it also ends the battle.
 */
export function playCard(
  state: BattleState,
  action: PlayCardAction,
  catalog: CardCatalog,
): PlayCardResult {
  const playable = checkPlayable(
    state,
    action.side,
    action.instanceId,
    catalog,
  );

  if (!playable.ok) {
    return playable;
  }

  const { instance, card } = playable.value;
  const actor = state.sides[action.side];
  const defenderSide = otherSide(action.side);

  // The card leaves the hand before any effect, so its slot is free for a draw.
  let actorSide: BattleSide = {
    ...actor,
    hand: actor.hand.filter(
      (held) => held.instanceId !== instance.instanceId,
    ),
    energy: actor.energy - card.cost,
  };
  let defender: BattleSide = { ...state.sides[defenderSide] };
  let field: Element = state.field;
  let rngState = state.rngState;

  // 2. Field shift. A card that also attacks attacks under the new field.
  if (card.shiftTo !== undefined) {
    field = card.shiftTo;
  }

  // 3. Ward defense, against the field after any shift.
  const baseDefense = card.defense ?? 0;

  if (card.defense !== undefined) {
    const ward = resolveWard({
      currentDefense: actorSide.defense,
      baseDefense,
      element: card.element,
      field,
      ...(card.fieldBonus?.defense !== undefined
        ? { fieldBonusDefense: card.fieldBonus.defense }
        : {}),
    });
    actorSide = { ...actorSide, defense: ward.defense };
  }

  // 4. Heal self, capped at maximum health.
  const heal = card.heal ?? 0;

  if (heal > 0) {
    actorSide = {
      ...actorSide,
      health: Math.min(actorSide.maxHealth, actorSide.health + heal),
    };
  }

  // 5. Attack. The status spend happens here, before damage, so the stacks are
  //    gone even when defense or a countered floor reduces the hit to 0.
  if (card.type === 'attack') {
    const spend = consumeAttackStatuses(actorSide.statuses);
    actorSide = { ...actorSide, statuses: spend.statuses };

    const attack = resolveAttack({
      baseDamage: card.damage ?? 0,
      element: card.element,
      field,
      targetDefense: defender.defense,
      piercing: card.piercing === true,
      statusModifier: spend.modifier,
      ...(card.fieldBonus?.damage !== undefined
        ? { fieldBonusDamage: card.fieldBonus.damage }
        : {}),
    });

    defender = {
      ...defender,
      health: Math.max(0, defender.health - attack.damage),
    };
  }

  // 6. Statuses apply to their resolved owner. Regen is a self-status by data;
  //    the helper keeps targeting out of this reducer.
  if (card.status !== undefined) {
    const owner = resolveStatusTarget(action.side, card.status.target);
    const updated = applyStatus(
      owner === action.side ? actorSide.statuses : defender.statuses,
      card.status.kind,
      card.status.stacks,
    );

    if (owner === action.side) {
      actorSide = { ...actorSide, statuses: updated };
    } else {
      defender = { ...defender, statuses: updated };
    }
  }

  // 7. Draw, burning anything that does not fit in the hand.
  const drawCount = card.draw ?? 0;

  if (drawCount > 0) {
    const drawn = drawFrom(
      {
        deck: actorSide.deck,
        hand: actorSide.hand,
        discard: actorSide.discard,
      },
      drawCount,
      rngState,
    );
    rngState = drawn.rngState;
    actorSide = {
      ...actorSide,
      deck: drawn.deck,
      hand: drawn.hand,
      discard: drawn.discard,
    };
  }

  // 8. Energy gain. No cap: it may exceed the turn-start 3 until this turn ends.
  const energyGain = card.energy ?? 0;

  if (energyGain > 0) {
    actorSide = { ...actorSide, energy: actorSide.energy + energyGain };
  }

  // 9. The resolved card is now in the discard pile.
  actorSide = {
    ...actorSide,
    discard: [...actorSide.discard, instance],
  };

  let sides = setSide(
    setSide(state.sides, action.side, actorSide),
    defenderSide,
    defender,
  );
  const outcome = resolveOutcome(sides);

  if (outcome !== 'ongoing') {
    sides = clearBattleStatuses(sides);
  }

  return {
    ok: true,
    value: {
      ...state,
      field,
      rngState,
      sides,
      outcome,
      phase: outcome === 'ongoing' ? state.phase : 'ended',
      // The telegraph describes a future enemy turn; a settled battle has none.
      enemyPlan: outcome === 'ongoing' ? state.enemyPlan : null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Ending a turn                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Ends the acting side's turn and starts the next side's turn.
 *
 * - The whole remaining hand is discarded.
 * - Control passes to the other side, and the turn counter advances.
 * - The new active side's energy is reset to exactly 3: unspent energy never
 *   accumulates, and card-granted energy above 3 ends with the turn.
 * - The new active side's Regen ticks (heal 2, spend one stack).
 * - The new active side draws back up to a hand of 5; the enemy's hand is often
 *   already full from its end-of-turn draw, which makes this a no-op.
 * - Defense and the field persist.
 * - The consumed `enemyPlan` is cleared; the planner sets the next one.
 *
 * Rejects an out-of-turn end, a non-action phase and a settled battle without
 * touching state.
 */
export function endTurn(
  state: BattleState,
  action: EndTurnAction,
): EndTurnResult {
  const gate = checkActionAllowed(state, action.side);

  if (!gate.ok) {
    return gate;
  }

  const finishing = state.sides[action.side];
  const discarded: BattleSide = {
    ...finishing,
    hand: [],
    discard: [...finishing.discard, ...finishing.hand],
  };
  let sides = setSide(state.sides, action.side, discarded);

  const nextSideName = otherSide(action.side);
  const starting = sides[nextSideName];
  const regen = tickRegen(
    starting.statuses,
    starting.health,
    starting.maxHealth,
  );
  const prepared: BattleSide = {
    ...starting,
    energy: TURN_START_ENERGY,
    health: regen.health,
    statuses: regen.statuses,
  };
  const draw = fillHand(prepared, state.rngState);
  const begun: BattleSide = {
    ...prepared,
    deck: draw.deck,
    hand: draw.hand,
    discard: draw.discard,
  };
  sides = setSide(sides, nextSideName, begun);

  return {
    ok: true,
    value: {
      ...state,
      rngState: draw.rngState,
      turn: state.turn + 1,
      activeSide: nextSideName,
      phase: 'action',
      sides,
      enemyPlan: null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Outcome                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Either side at 0 health settles the battle immediately. Both sides at 0 can
 * only happen through corrupt state; the player-victory branch is then the
 * deterministic answer so the result is never ambiguous.
 */
function resolveOutcome(sides: BattleSides): BattleOutcome {
  if (sides.opponent.health <= 0) {
    return 'player-victory';
  }

  if (sides.player.health <= 0) {
    return 'opponent-victory';
  }

  return 'ongoing';
}
