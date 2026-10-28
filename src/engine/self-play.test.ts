// @vitest-environment node
/**
 * Seeded AI-versus-AI self-play (ENG-FR-09, ENG-FR-01, ENG-FR-06).
 *
 * This is the cross-module safety net for the engine: two deterministic
 * planners drive both sides of a real battle through the same public API the
 * solo and duel controllers use. It proves the properties the unit suites
 * cannot:
 *
 *   - 200 seeded battles settle with a winner/loser inside the 100-turn guard;
 *   - every intermediate state stays inside its bound (energy, hand, defense,
 *     health, status caps, one physical card per zone);
 *   - replaying a recorded seed and action log reproduces a byte-identical
 *     snapshot, because one PRNG stream and a seed-independent planner drive
 *     every decision;
 *   - a battle that cannot settle reports the turn limit instead of hanging.
 *
 * Fixtures are defined here on purpose: the engine must never import content,
 * and the suite must keep running when the content tables are tuned. The decks
 * are small but representative - attacks, bursts, Wards, Shifts and utility in
 * every one - so both sides act, spend, draw and reshuffle like a real match.
 *
 * Legality is asserted, not assumed:
 *
 *   - the planner may only name cards the acting hand actually holds;
 *   - every planned step must pass `canPlayCard` before it is played, which is
 *     the same affordability rule `playCard` enforces;
 *   - rejected probes (out of turn, unaffordable, after battle end) must leave
 *     the state byte-identical, including the PRNG counter.
 */
import { describe, expect, it } from 'vitest';

import { planEnemyTurn } from './ai';
import type { EnemyPlanProfile } from './ai';
import {
  canPlayCard,
  createBattle,
  endTurn,
  playCard,
} from './battle';
import type { BattleSetup, BattleSideSetup, CardCatalog } from './battle';
import { restoreSnapshot, serializeSnapshot } from './snapshot';
import {
  DEFENSE_CAP,
  FIELD_ELEMENTS,
  HAND_SIZE,
  MAX_BATTLE_TURNS,
  SIDES,
  STATUS_CAPS,
  STATUS_KINDS,
  TURN_START_ENERGY,
} from './types';
import type {
  BattleAction,
  BattleSide,
  BattleState,
  CardDefinition,
  CardInstance,
  FieldElement,
  Side,
} from './types';

/* -------------------------------------------------------------------------- */
/* Fixture catalog                                                             */
/* -------------------------------------------------------------------------- */

/** Four themed decks so every element plays, not just one lucky matchup. */
function elementCards(element: FieldElement): readonly CardDefinition[] {
  return [
    {
      id: `${element}-strike`,
      name: `${element} strike`,
      element,
      type: 'attack',
      cost: 1,
      damage: 4,
    },
    {
      id: `${element}-burst`,
      name: `${element} burst`,
      element,
      type: 'attack',
      cost: 2,
      damage: 7,
    },
    {
      id: `shift-${element}`,
      name: `${element} shift`,
      element: 'neutral',
      type: 'shift',
      cost: 1,
      shiftTo: element,
    },
    {
      id: `${element}-ward`,
      name: `${element} ward`,
      element,
      type: 'ward',
      cost: 1,
      defense: 2,
    },
  ];
}

const cardList: readonly CardDefinition[] = [
  ...FIELD_ELEMENTS.flatMap((element) => elementCards(element)),
  {
    id: 'insight',
    name: 'Insight',
    element: 'neutral',
    type: 'utility',
    cost: 0,
    draw: 1,
  },
  {
    id: 'focus-charm',
    name: 'Focus Charm',
    element: 'neutral',
    type: 'utility',
    cost: 0,
    status: { kind: 'focus', stacks: 1, target: 'self' },
  },
  {
    // Grants energy after the attacks, so a turn can exceed 3 and the next turn
    // must still reset to exactly 3.
    id: 'battery',
    name: 'Battery',
    element: 'neutral',
    type: 'utility',
    cost: 0,
    energy: 1,
  },
  {
    // Cost 3: makes the unaffordable-card probe deterministic after one play.
    id: 'heavy-blast',
    name: 'Heavy Blast',
    element: 'neutral',
    type: 'attack',
    cost: 3,
    damage: 7,
  },
  {
    // The stall fixture: a Ward that can never reduce a side to 0 health.
    id: 'stall-ward',
    name: 'Stall Ward',
    element: 'neutral',
    type: 'ward',
    cost: 1,
    defense: 2,
  },
  {
    id: 'stall-draw',
    name: 'Stall Draw',
    element: 'neutral',
    type: 'utility',
    cost: 0,
    draw: 1,
  },
];

const catalog: CardCatalog = Object.fromEntries(
  cardList.map((card) => [card.id, card]),
);

/**
 * A 13-card deck: four cheap matching attacks, two bursts, two Shifts, two
 * Wards, then draw, Focus and energy utility. Every element gets the same
 * shape, so neither side is handed a structural advantage.
 */
function elementDeck(element: FieldElement): readonly string[] {
  return [
    `${element}-strike`,
    `${element}-strike`,
    `${element}-strike`,
    `${element}-strike`,
    `${element}-burst`,
    `${element}-burst`,
    `shift-${element}`,
    `shift-${element}`,
    `${element}-ward`,
    `${element}-ward`,
    'insight',
    'focus-charm',
    'battery',
  ];
}

const stallDeck: readonly string[] = [
  'stall-ward',
  'stall-ward',
  'stall-ward',
  'stall-ward',
  'stall-ward',
  'stall-ward',
  'stall-ward',
  'stall-ward',
  'stall-draw',
  'stall-draw',
];

interface MatchupFixture {
  readonly id: string;
  readonly player: BattleSideSetup;
  readonly opponent: BattleSideSetup;
  /** Boss flag for the opponent planner: prefers the countering element. */
  readonly opponentBoss: boolean;
}

function matchup(
  id: string,
  playerElement: FieldElement,
  opponentElement: FieldElement,
  opponentBoss = false,
): MatchupFixture {
  return {
    id,
    player: { element: playerElement, cards: elementDeck(playerElement) },
    opponent: { element: opponentElement, cards: elementDeck(opponentElement) },
    opponentBoss,
  };
}

/** The player deck's element beats the opponent deck's element. */
const MATCHUPS: readonly MatchupFixture[] = [
  matchup('ember-vs-frost', 'ember', 'frost', true),
  matchup('frost-vs-gale', 'frost', 'gale'),
  matchup('gale-vs-stone', 'gale', 'stone'),
  matchup('stone-vs-ember', 'stone', 'ember'),
];

/** Both sides only defend and draw: no card can ever reduce health. */
const STALL_MATCHUP: MatchupFixture = {
  id: 'stalemate',
  player: { element: 'neutral', cards: stallDeck },
  opponent: { element: 'neutral', cards: stallDeck },
  opponentBoss: false,
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function startBattle(setup: BattleSetup): BattleState {
  const created = createBattle(setup);

  if (!created.ok) {
    throw new Error(`fixture battle did not start: ${created.error.message}`);
  }

  return created.value;
}

function handCard(side: BattleSide, index = 0): CardInstance {
  return required(side.hand[index], `${side.side} hand has no card at ${index}`);
}

function snapshotJson(state: BattleState): string {
  return JSON.stringify(serializeSnapshot(state));
}

/* -------------------------------------------------------------------------- */
/* Invariants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every bound the engine promises, checked against one side. The list is
 * deliberately exhaustive for resources - a self-play run that trips any of
 * these is a rules defect, not a tuning problem.
 */
function sideProblems(
  side: BattleSide,
  stage: string,
): readonly string[] {
  const problems: string[] = [];
  const tag = `${stage}/${side.side}`;

  if (!Number.isInteger(side.energy) || side.energy < 0) {
    problems.push(
      `${tag}: energy ${String(side.energy)} is not a non-negative integer`,
    );
  }

  if (
    !Number.isInteger(side.health) ||
    side.health < 0 ||
    side.health > side.maxHealth
  ) {
    problems.push(
      `${tag}: health ${String(side.health)} is outside 0..${String(side.maxHealth)}`,
    );
  }

  if (
    !Number.isInteger(side.defense) ||
    side.defense < 0 ||
    side.defense > DEFENSE_CAP
  ) {
    problems.push(
      `${tag}: defense ${String(side.defense)} is outside 0..${String(DEFENSE_CAP)}`,
    );
  }

  if (side.hand.length > HAND_SIZE) {
    problems.push(
      `${tag}: hand holds ${String(side.hand.length)} cards, above ${String(HAND_SIZE)}`,
    );
  }

  for (const kind of STATUS_KINDS) {
    const stacks = side.statuses[kind];

    if (
      !Number.isInteger(stacks) ||
      stacks < 0 ||
      stacks > STATUS_CAPS[kind]
    ) {
      problems.push(
        `${tag}: ${kind} stacks ${String(stacks)} are outside 0..${String(STATUS_CAPS[kind])}`,
      );
    }
  }

  const seen = new Set<string>();

  for (const zone of ['deck', 'hand', 'discard'] as const) {
    for (const card of side[zone]) {
      if (seen.has(card.instanceId)) {
        problems.push(`${tag}: instance id ${card.instanceId} appears twice`);
      } else {
        seen.add(card.instanceId);
      }

      if (catalog[card.cardId] === undefined) {
        problems.push(
          `${tag}: card id ${card.cardId} is missing from the fixture catalog`,
        );
      }
    }
  }

  return problems;
}

/** Phase, outcome and health must always agree with each other. */
function stateProblems(
  state: BattleState,
  stage: string,
): readonly string[] {
  const problems: string[] = [];

  for (const side of SIDES) {
    problems.push(...sideProblems(state.sides[side], stage));
  }

  const { player, opponent } = state.sides;

  if (state.outcome === 'ongoing') {
    if (state.phase === 'ended') {
      problems.push(`${stage}: ended phase with an ongoing outcome`);
    }

    if (player.health <= 0 || opponent.health <= 0) {
      problems.push(`${stage}: ongoing battle with a side at 0 health`);
    }
  } else if (state.phase !== 'ended') {
    problems.push(`${stage}: outcome ${state.outcome} outside the ended phase`);
  }

  if (state.outcome === 'player-victory' && opponent.health !== 0) {
    problems.push(`${stage}: player-victory with the opponent above 0 health`);
  }

  if (state.outcome === 'opponent-victory' && player.health !== 0) {
    problems.push(`${stage}: opponent-victory with the player above 0 health`);
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Self-play driver                                                            */
/* -------------------------------------------------------------------------- */

type Termination = 'settled' | 'turn-limit' | 'illegal';

interface BattleRun {
  readonly matchupId: string;
  readonly seed: number;
  /** 1-based turn index the battle reached (101 signals the 100-turn guard). */
  readonly turn: number;
  readonly termination: Termination;
  readonly outcome: BattleState['outcome'];
  readonly actionCount: number;
  readonly finalState: BattleState;
  /** Highest energy each side held at any point in the battle. */
  readonly peakEnergy: Readonly<Record<Side, number>>;
  /** Flattened snapshot of the final state; empty when the run is illegal. */
  readonly snapshot: string;
  readonly log: readonly BattleAction[];
  readonly problems: readonly string[];
}

function setupFor(fixture: MatchupFixture, seed: number): BattleSetup {
  return {
    seed,
    player: fixture.player,
    opponent: fixture.opponent,
    catalog,
  };
}

function profileFor(
  fixture: MatchupFixture,
  side: Side,
): EnemyPlanProfile | null {
  return fixture.opponentBoss && side === 'opponent'
    ? { counterElementBias: true }
    : null;
}

/**
 * Plays one complete AI-versus-AI battle.
 *
 * Each turn is planned at its start with `planEnemyTurn` (the same pure planner
 * the solo controller uses), every planned card is checked with `canPlayCard`
 * before `playCard` sees it, and the turn ends with `endTurn`. The loop checks
 * the turn guard before acting, so a non-terminating matchup returns a
 * `turn-limit` result instead of hanging the test runner.
 *
 * Rejections are never retried: the first illegal plan, state or action records
 * a problem and stops the run with `termination: 'illegal'`.
 */
function runSelfPlay(
  fixture: MatchupFixture,
  seed: number,
  maxTurns = MAX_BATTLE_TURNS,
): BattleRun {
  let state = startBattle(setupFor(fixture, seed));
  const log: BattleAction[] = [];
  const problems: string[] = [...stateProblems(state, 'setup')];
  const peakEnergy: Record<Side, number> = {
    player: state.sides.player.energy,
    opponent: state.sides.opponent.energy,
  };
  const observe = (next: BattleState): void => {
    for (const side of SIDES) {
      peakEnergy[side] = Math.max(peakEnergy[side], next.sides[side].energy);
    }
  };
  let termination: Termination = 'settled';

  while (
    state.phase !== 'ended' &&
    state.outcome === 'ongoing' &&
    problems.length === 0
  ) {
    if (state.turn > maxTurns) {
      termination = 'turn-limit';
      break;
    }

    const side = state.activeSide;
    const actor = state.sides[side];
    const tag = `turn ${String(state.turn)}/${side}`;

    // Turn start (ENG-FR-01): exactly 3 energy - never the last turn's leftovers
    // - and a hand filled to 5 whenever the side still owns five cards.
    if (actor.energy !== TURN_START_ENERGY) {
      problems.push(
        `${tag}: turn-start energy ${String(actor.energy)}, expected ${String(TURN_START_ENERGY)}`,
      );
      break;
    }

    const owned = actor.deck.length + actor.hand.length + actor.discard.length;
    const expectedHand = Math.min(owned, HAND_SIZE);

    if (actor.hand.length !== expectedHand) {
      problems.push(
        `${tag}: turn-start hand ${String(actor.hand.length)}, expected ${String(expectedHand)} from ${String(owned)} cards`,
      );
      break;
    }

    const plan = planEnemyTurn(state, catalog, profileFor(fixture, side), side);

    if (plan === null) {
      problems.push(`${tag}: the planner produced no plan for an ongoing battle`);
      break;
    }

    const handIds = new Set(actor.hand.map((card) => card.instanceId));

    for (const step of plan.steps) {
      if (!handIds.has(step.instanceId)) {
        problems.push(
          `${tag}: plan names ${step.instanceId}, which is not in the acting hand`,
        );
      }
    }

    for (const step of plan.steps) {
      if (problems.length > 0) {
        break;
      }

      const card = catalog[step.cardId];

      if (card === undefined) {
        problems.push(`${tag}: plan names unknown card ${step.cardId}`);
        break;
      }

      const energy = state.sides[side].energy;

      if (card.cost > energy) {
        problems.push(
          `${tag}: plan includes ${step.cardId} costing ${String(card.cost)} with ${String(energy)} energy left`,
        );
        break;
      }

      // The reducer and the planner must agree on every planned play; checking
      // first also proves the plan never relies on a hidden affordability rule.
      if (!canPlayCard(state, side, step.instanceId, catalog)) {
        problems.push(
          `${tag}: planned card ${step.instanceId} is not playable`,
        );
        break;
      }

      const action: BattleAction = {
        type: 'play-card',
        side,
        instanceId: step.instanceId,
      };
      const played = playCard(state, action, catalog);

      if (!played.ok) {
        problems.push(
          `${tag}: playCard rejected a planned card (${played.error.code}: ${played.error.message})`,
        );
        break;
      }

      log.push(action);
      state = played.value;
      observe(state);
      problems.push(...stateProblems(state, `${tag} after ${step.cardId}`));
    }

    if (state.phase === 'ended' || problems.length > 0) {
      break;
    }

    const end: BattleAction = { type: 'end-turn', side };
    const ended = endTurn(state, end);

    if (!ended.ok) {
      problems.push(
        `${tag}: endTurn rejected (${ended.error.code}: ${ended.error.message})`,
      );
      break;
    }

    log.push(end);
    state = ended.value;
    observe(state);
    problems.push(...stateProblems(state, `turn ${String(state.turn)} start`));
  }

  let snapshot = '';

  if (problems.length === 0) {
    snapshot = snapshotJson(state);
    const restored = restoreSnapshot(JSON.parse(snapshot), catalog);

    if (!restored.ok) {
      problems.push(
        `final snapshot rejected (${restored.error.code}: ${restored.error.message})`,
      );
    } else if (snapshotJson(restored.value) !== snapshot) {
      problems.push('snapshot round-trip changed the final state');
    }
  }

  if (problems.length > 0) {
    termination = 'illegal';
  }

  return {
    matchupId: fixture.id,
    seed,
    turn: state.turn,
    termination,
    outcome: state.outcome,
    actionCount: log.length,
    finalState: state,
    peakEnergy,
    snapshot,
    log,
    problems,
  };
}

/* -------------------------------------------------------------------------- */
/* Replay                                                                      */
/* -------------------------------------------------------------------------- */

/** Applies a recorded log to a fresh battle from the same seed and decks. */
function replayLog(
  fixture: MatchupFixture,
  seed: number,
  log: readonly BattleAction[],
): BattleState {
  let state = startBattle(setupFor(fixture, seed));

  for (const action of log) {
    if (action.type === 'play-card') {
      const played = playCard(state, action, catalog);

      if (!played.ok) {
        throw new Error(
          `replay rejected ${action.instanceId} (${played.error.code}: ${played.error.message})`,
        );
      }

      state = played.value;
    } else {
      const ended = endTurn(state, action);

      if (!ended.ok) {
        throw new Error(
          `replay rejected end-turn (${ended.error.code}: ${ended.error.message})`,
        );
      }

      state = ended.value;
    }
  }

  return state;
}

function matchupById(id: string): MatchupFixture {
  return required(
    [...MATCHUPS, STALL_MATCHUP].find((fixture) => fixture.id === id),
    `unknown matchup ${id}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Seeded sweep                                                                */
/* -------------------------------------------------------------------------- */

const SEED_COUNT = 200;

let sweepCache: readonly BattleRun[] | null = null;

/**
 * 200 battles, seeds 0..199 rotating through the four themed matchups. The
 * result is memoized so the termination and bounds tests assert different
 * facets of one run instead of paying for the simulation twice.
 */
function sweep(): readonly BattleRun[] {
  if (sweepCache !== null) {
    return sweepCache;
  }

  const runs: BattleRun[] = [];

  for (let seed = 0; seed < SEED_COUNT; seed += 1) {
    const fixture = required(
      MATCHUPS[seed % MATCHUPS.length],
      `no matchup for seed ${String(seed)}`,
    );
    runs.push(runSelfPlay(fixture, seed));
  }

  sweepCache = runs;
  return runs;
}

function describeRuns(runs: readonly BattleRun[]): readonly string[] {
  return runs.map((run) => {
    const head =
      `${run.matchupId}#${String(run.seed)}: ${run.termination}` +
      ` at turn ${String(run.turn)} (${run.outcome})`;

    return run.problems.length === 0
      ? head
      : `${head} - ${run.problems.join('; ')}`;
  });
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe('seeded self-play', () => {
  it('settles 200 seeded AI-versus-AI battles within 100 turns', () => {
    const runs = sweep();

    expect(runs).toHaveLength(SEED_COUNT);

    // Every themed deck takes part; no single matchup carries the sweep.
    const covered = [...new Set(runs.map((run) => run.matchupId))].sort();
    expect(covered).toEqual(MATCHUPS.map((fixture) => fixture.id).sort());

    const unsettled = runs.filter((run) => run.termination !== 'settled');
    expect(describeRuns(unsettled)).toEqual([]);

    const overBudget = runs.filter((run) => run.turn > MAX_BATTLE_TURNS);
    expect(describeRuns(overBudget)).toEqual([]);

    const drawn = runs.filter(
      (run) =>
        run.outcome !== 'player-victory' &&
        run.outcome !== 'opponent-victory',
    );
    expect(describeRuns(drawn)).toEqual([]);

    // Every battle has a winner *and* a loser, not just an outcome label.
    const incoherent = runs.filter((run) => {
      const { player, opponent } = run.finalState.sides;
      return run.outcome === 'player-victory'
        ? opponent.health !== 0
        : player.health !== 0;
    });
    expect(describeRuns(incoherent)).toEqual([]);
  });

  it('keeps energy, hand, defense, health and statuses inside their bounds after every action', () => {
    const runs = sweep();
    const problems = runs.flatMap((run) =>
      run.problems.map(
        (problem) => `${run.matchupId}#${String(run.seed)}: ${problem}`,
      ),
    );

    expect(problems).toEqual([]);

    // The fixtures deliberately include an energy-granting utility, so the
    // bound test also proves that a turn may exceed the turn-start 3 while the
    // next turn still resets (checked for every turn in the harness).
    const peak = Math.max(
      ...runs.flatMap((run) => [run.peakEnergy.player, run.peakEnergy.opponent]),
    );
    expect(peak).toBeGreaterThan(TURN_START_ENERGY);
  });

  it('replays one recorded seed and action log to a byte-identical snapshot', () => {
    const recorded = required(
      sweep().find(
        (run) =>
          run.termination === 'settled' &&
          run.log.length > 0 &&
          run.snapshot.length > 0,
      ),
      'the sweep recorded no settled battle',
    );
    const fixture = matchupById(recorded.matchupId);

    expect(recorded.log.length).toBe(recorded.actionCount);

    const first = snapshotJson(
      replayLog(fixture, recorded.seed, recorded.log),
    );
    const second = snapshotJson(
      replayLog(fixture, recorded.seed, recorded.log),
    );

    expect(first).toBe(recorded.snapshot);
    expect(second).toBe(recorded.snapshot);
  });

  it('reports the turn limit instead of hanging when a battle cannot settle', () => {
    const run = runSelfPlay(STALL_MATCHUP, 7);

    expect(run.termination).toBe('turn-limit');
    // The guard stops before any action on turn 101 is taken.
    expect(run.turn).toBe(MAX_BATTLE_TURNS + 1);
    expect(run.outcome).toBe('ongoing');
    expect(run.finalState.sides.player.health).toBeGreaterThan(0);
    expect(run.finalState.sides.opponent.health).toBeGreaterThan(0);
    expect(run.problems).toEqual([]);
  });
});

describe('self-play action legality', () => {
  const heavyCards = Array.from(
    { length: 12 },
    (): string => 'heavy-blast',
  );

  function heavySetup(seed: number): BattleSetup {
    return {
      seed,
      player: { element: 'neutral', cards: heavyCards },
      opponent: { element: 'neutral', cards: heavyCards },
      catalog,
    };
  }

  it('rejects an out-of-turn card or end-turn without changing state', () => {
    const state = startBattle(heavySetup(1_001));
    const opponentCard = handCard(state.sides.opponent);
    const before = snapshotJson(state);

    const play = playCard(
      state,
      {
        type: 'play-card',
        side: 'opponent',
        instanceId: opponentCard.instanceId,
      },
      catalog,
    );

    expect(play.ok).toBe(false);
    if (!play.ok) {
      expect(play.error.code).toBe('not-active-side');
    }

    const end = endTurn(state, { type: 'end-turn', side: 'opponent' });

    expect(end.ok).toBe(false);
    if (!end.ok) {
      expect(end.error.code).toBe('not-active-side');
    }

    expect(snapshotJson(state)).toBe(before);
  });

  it('rejects an unaffordable card without changing state or energy', () => {
    const state = startBattle(heavySetup(2_002));
    const first = handCard(state.sides.player);
    const played = playCard(
      state,
      { type: 'play-card', side: 'player', instanceId: first.instanceId },
      catalog,
    );

    expect(played.ok).toBe(true);
    if (!played.ok) {
      return;
    }

    const afterPlay = played.value;

    expect(afterPlay.sides.player.energy).toBe(0);
    expect(afterPlay.sides.opponent.health).toBe(33);

    const second = handCard(afterPlay.sides.player);
    const before = snapshotJson(afterPlay);
    const rejected = playCard(
      afterPlay,
      { type: 'play-card', side: 'player', instanceId: second.instanceId },
      catalog,
    );

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe('unaffordable-card');
    }

    expect(snapshotJson(afterPlay)).toBe(before);
  });

  it('rejects every action after the battle ends without changing state', () => {
    const state = startBattle({
      seed: 3_003,
      player: { element: 'neutral', cards: heavyCards },
      opponent: {
        element: 'neutral',
        cards: heavyCards,
        maxHealth: 1,
        health: 1,
      },
      catalog,
    });
    const first = handCard(state.sides.player);
    const played = playCard(
      state,
      { type: 'play-card', side: 'player', instanceId: first.instanceId },
      catalog,
    );

    expect(played.ok).toBe(true);
    if (!played.ok) {
      return;
    }

    const ended = played.value;

    expect(ended.phase).toBe('ended');
    expect(ended.outcome).toBe('player-victory');
    expect(ended.sides.opponent.health).toBe(0);
    expect(ended.sides.player.statuses).toEqual({
      focus: 0,
      weaken: 0,
      regen: 0,
    });
    expect(ended.sides.opponent.statuses).toEqual({
      focus: 0,
      weaken: 0,
      regen: 0,
    });
    expect(ended.enemyPlan).toBeNull();

    const before = snapshotJson(ended);
    const playerCard = handCard(ended.sides.player);
    const opponentCard = handCard(ended.sides.opponent);
    const probes = [
      playCard(
        ended,
        {
          type: 'play-card',
          side: 'player',
          instanceId: playerCard.instanceId,
        },
        catalog,
      ),
      playCard(
        ended,
        {
          type: 'play-card',
          side: 'opponent',
          instanceId: opponentCard.instanceId,
        },
        catalog,
      ),
      endTurn(ended, { type: 'end-turn', side: 'player' }),
      endTurn(ended, { type: 'end-turn', side: 'opponent' }),
    ];

    for (const probe of probes) {
      expect(probe.ok).toBe(false);
      if (!probe.ok) {
        expect(probe.error.code).toBe('battle-ended');
      }
    }

    expect(snapshotJson(ended)).toBe(before);
  });
});
