import { describe, expect, it } from 'vitest';
import { byId as cardCatalog } from '../content/cards';
import { enemyById } from '../content/enemies';
import type { BattleSideSetup } from '../engine/battle';
import type { EnemyDefinition } from '../engine/types';
import { BATTLE_LOG_LIMIT } from '../battle-log/types';
import type { BattleLogEntry } from '../battle-log/types';
import type { BattleControllerConfig, BattleControllerState } from './battle-controller';
import {
  battleReducer,
  createBattleControllerState,
  fieldMatchupFor,
} from './battle-controller';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Five-card decks keep the opening hand fully known: with five unique cards
 * every card is dealt, so a test never depends on the shuffle order. The
 * player hand always holds an attack, a Ward, a Shift and two cards that make
 * the unaffordable path reachable (cost 2 then cost 3).
 */
const PLAYER_CARDS = [
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'ember-ember-lance',
  'ember-inferno',
] as const;

/**
 * Every non-piercing attack plus one Ward. The planner therefore builds a
 * damage total that player defense visibly reduces, and the opening plan is
 * deterministic: Cinder Jab, Plain Strike, Ash Guard.
 */
const ENEMY_CARDS = [
  'ember-cinder-jab',
  'ember-inferno',
  'ember-kindled-fury',
  'neutral-plain-strike',
  'ember-ash-guard',
] as const;

function requiredEnemy(id: string): EnemyDefinition {
  const enemy = enemyById(id);

  if (enemy === undefined) {
    throw new Error(`Test fixture is missing enemy ${id}`);
  }

  return enemy;
}

const CINDER_WARDEN = requiredEnemy('enemy-cinder-warden');

function makeConfig(
  overrides: {
    readonly player?: BattleSideSetup;
    readonly opponent?: BattleSideSetup;
    readonly seed?: number;
    readonly initialLog?: readonly BattleLogEntry[];
  } = {},
): BattleControllerConfig {
  return {
    seed: overrides.seed ?? 11,
    player: overrides.player ?? { element: 'ember', cards: PLAYER_CARDS },
    opponent: overrides.opponent ?? {
      element: 'ember',
      cards: ENEMY_CARDS,
      maxHealth: 30,
    },
    cards: cardCatalog,
    enemy: CINDER_WARDEN,
    ...(overrides.initialLog === undefined
      ? {}
      : { initialLog: overrides.initialLog }),
  };
}

function start(config: BattleControllerConfig = makeConfig()): BattleControllerState {
  const created = createBattleControllerState(config);

  if (!created.ok) {
    throw new Error(
      `Fixture battle failed to start: ${created.error.code} - ${created.error.message}`,
    );
  }

  return created.value;
}

function instanceOf(
  state: BattleControllerState,
  cardId: string,
): string {
  const instance = state.battle.sides.player.hand.find(
    (held) => held.cardId === cardId,
  );

  if (instance === undefined) {
    throw new Error(`Player hand does not hold ${cardId}`);
  }

  return instance.instanceId;
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

describe('battle controller setup', () => {
  it('starts on turn one with full health, three energy and the full hand', () => {
    const state = start();

    expect(state.battle.turn).toBe(1);
    expect(state.battle.activeSide).toBe('player');
    expect(state.battle.phase).toBe('action');
    expect(state.battle.outcome).toBe('ongoing');
    expect(state.battle.field).toBe('neutral');
    expect(state.fieldMatchup).toBeNull();

    expect(state.battle.sides.player.health).toBe(40);
    expect(state.battle.sides.player.maxHealth).toBe(40);
    expect(state.battle.sides.player.defense).toBe(0);
    expect(state.battle.sides.player.energy).toBe(3);
    expect(state.battle.sides.opponent.health).toBe(30);
    expect(state.battle.sides.opponent.maxHealth).toBe(30);

    expect(state.battle.sides.player.hand.map((held) => held.cardId).sort()).toEqual(
      [...PLAYER_CARDS].sort(),
    );
  });

  it('telegraphs the enemy turn before the player acts', () => {
    const state = start();
    const plan = state.battle.enemyPlan;

    expect(plan).not.toBeNull();
    expect(plan?.side).toBe('opponent');
    expect(plan?.turn).toBe(2);
    expect(plan?.steps.map((step) => step.cardId)).toEqual([
      'ember-cinder-jab',
      'neutral-plain-strike',
      'ember-ash-guard',
    ]);
    expect(plan?.totalDamage).toBe(6);
    expect(plan?.lethal).toBe(false);
  });

  it('returns a typed failure for an invalid setup', () => {
    const created = createBattleControllerState(makeConfig({ seed: -1 }));

    expect(created.ok).toBe(false);

    if (created.ok) {
      return;
    }

    expect(created.error.code).toBe('invalid-state');
  });
});

/* -------------------------------------------------------------------------- */
/* Player actions                                                             */
/* -------------------------------------------------------------------------- */

describe('battle controller player actions', () => {
  it('pays the cost, applies damage and reports the matching cues', () => {
    const state = start();
    const instanceId = instanceOf(state, 'ember-cinder-jab');
    const next = battleReducer(state, { type: 'play-card', instanceId });

    expect(next.battle.sides.player.energy).toBe(2);
    expect(next.battle.sides.opponent.health).toBe(27);
    expect(next.battle.sides.player.hand).toHaveLength(4);
    expect(
      next.battle.sides.player.discard.some(
        (held) => held.instanceId === instanceId,
      ),
    ).toBe(true);

    expect(next.report?.ok).toBe(true);
    expect(next.report?.cues).toEqual(['card-play', 'damage']);
    expect(next.sequence).toBe(1);
  });

  it('adds Ward defense and drops the previewed incoming damage', () => {
    const state = start();
    const before = state.battle.enemyPlan?.totalDamage ?? 0;
    const instanceId = instanceOf(state, 'ember-ash-guard');
    const next = battleReducer(state, { type: 'play-card', instanceId });

    expect(next.battle.sides.player.defense).toBe(2);
    expect(next.battle.sides.player.energy).toBe(2);
    expect(next.report?.cues).toEqual(['card-play', 'ward']);

    const plan = next.battle.enemyPlan;
    expect(plan).not.toBeNull();
    expect(plan?.steps.map((step) => step.cardId)).toEqual(
      state.battle.enemyPlan?.steps.map((step) => step.cardId),
    );
    expect(plan?.totalDamage).toBeLessThan(before);
  });

  it('shifts the field and recomputes the plan without changing its cards', () => {
    const state = start();
    const instanceId = instanceOf(state, 'shift-ember');
    const next = battleReducer(state, { type: 'play-card', instanceId });

    expect(next.battle.field).toBe('ember');
    expect(next.fieldMatchup).toEqual({
      empowered: 'ember',
      countered: 'frost',
      beatenBy: 'stone',
    });
    expect(next.report?.cues).toEqual(['card-play', 'shift']);

    const plan = next.battle.enemyPlan;
    expect(plan?.steps.map((step) => step.cardId)).toEqual(
      state.battle.enemyPlan?.steps.map((step) => step.cardId),
    );
    // Ember attacks are empowered by the Ember field, so the recomputed total
    // is higher than the Neutral-field telegraph.
    expect(plan?.totalDamage).toBeGreaterThan(
      state.battle.enemyPlan?.totalDamage ?? 0,
    );
  });

  it('rejects an unaffordable card without touching battle state', () => {
    const state = start();
    const lanced = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-ember-lance'),
    });

    expect(lanced.battle.sides.player.energy).toBe(1);

    const inferno = battleReducer(lanced, {
      type: 'play-card',
      instanceId: instanceOf(lanced, 'ember-inferno'),
    });

    expect(inferno.report?.ok).toBe(false);
    expect(inferno.report?.error?.code).toBe('unaffordable-card');
    expect(inferno.report?.cues).toEqual([]);
    expect(inferno.battle).toBe(lanced.battle);
  });

  it('rejects an instance id that is not in the player hand', () => {
    const state = start();
    const ended = battleReducer(state, { type: 'end-turn' });

    const stale = battleReducer(ended, {
      type: 'play-card',
      instanceId: 'opponent:never:0:ember-cinder-jab',
    });

    expect(stale.report?.ok).toBe(false);
    expect(stale.report?.error?.code).toBe('card-not-in-hand');
    expect(stale.battle).toBe(ended.battle);
  });
});

/* -------------------------------------------------------------------------- */
/* End turn and the enemy plan                                                */
/* -------------------------------------------------------------------------- */

describe('battle controller end turn', () => {
  it('executes the telegraph, returns control and prepares the next plan', () => {
    const state = start();
    const plan = state.battle.enemyPlan;

    if (plan === null) {
      throw new Error('Opening telegraph is missing');
    }

    const next = battleReducer(state, { type: 'end-turn' });
    const battle = next.battle;

    expect(next.report?.ok).toBe(true);
    expect(battle.turn).toBe(3);
    expect(battle.activeSide).toBe('player');
    expect(battle.phase).toBe('action');
    expect(battle.outcome).toBe('ongoing');

    // The enemy turn spent exactly the telegraphed damage.
    expect(battle.sides.player.health).toBe(40 - plan.totalDamage);
    expect(battle.sides.opponent.health).toBe(30);

    // Turn start resets energy to exactly three and refills the hand.
    expect(battle.sides.player.energy).toBe(3);
    expect(battle.sides.player.hand).toHaveLength(5);

    expect(battle.enemyPlan).not.toBeNull();
    expect(battle.enemyPlan?.turn).toBe(4);

    expect(next.report?.cues).toContain('card-play');
    expect(next.report?.cues.filter((cue) => cue === 'damage')).toHaveLength(2);
  });

  it('does not accumulate unspent energy across a turn', () => {
    const state = start();
    const next = battleReducer(state, { type: 'end-turn' });

    expect(next.battle.sides.player.energy).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Battle end                                                                 */
/* -------------------------------------------------------------------------- */

describe('battle controller battle end', () => {
  it('exposes victory, emits the cue and refuses every later action', () => {
    const state = start(
      makeConfig({
        opponent: {
          element: 'ember',
          cards: ENEMY_CARDS,
          maxHealth: 30,
          health: 3,
        },
      }),
    );
    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-cinder-jab'),
    });

    expect(next.battle.outcome).toBe('player-victory');
    expect(next.battle.phase).toBe('ended');
    expect(next.battle.sides.opponent.health).toBe(0);
    expect(next.battle.enemyPlan).toBeNull();
    expect(next.report?.cues).toContain('victory');

    const remaining = next.battle.sides.player.hand[0];

    if (remaining === undefined) {
      throw new Error('Expected a remaining hand card after the lethal play');
    }

    const again = battleReducer(next, {
      type: 'play-card',
      instanceId: remaining.instanceId,
    });

    expect(again.report?.ok).toBe(false);
    expect(again.report?.error?.code).toBe('battle-ended');
    expect(again.battle).toBe(next.battle);

    const ended = battleReducer(next, { type: 'end-turn' });
    expect(ended.report?.ok).toBe(false);
    expect(ended.report?.error?.code).toBe('battle-ended');
    expect(ended.battle).toBe(next.battle);
  });

  it('exposes defeat when the telegraphed turn is lethal', () => {
    const state = start(
      makeConfig({
        player: {
          element: 'ember',
          cards: PLAYER_CARDS,
          maxHealth: 40,
          health: 1,
        },
      }),
    );

    expect(state.battle.enemyPlan?.lethal).toBe(true);

    const next = battleReducer(state, { type: 'end-turn' });

    expect(next.battle.outcome).toBe('opponent-victory');
    expect(next.battle.phase).toBe('ended');
    expect(next.battle.sides.player.health).toBe(0);
    expect(next.report?.cues).toContain('defeat');
    expect(next.battle.enemyPlan).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Field facts                                                                */
/* -------------------------------------------------------------------------- */

describe('fieldMatchupFor', () => {
  it('derives the banner facts from the engine cycle', () => {
    expect(fieldMatchupFor('neutral')).toBeNull();
    expect(fieldMatchupFor('ember')).toEqual({
      empowered: 'ember',
      countered: 'frost',
      beatenBy: 'stone',
    });
    expect(fieldMatchupFor('frost')).toEqual({
      empowered: 'frost',
      countered: 'gale',
      beatenBy: 'ember',
    });
    expect(fieldMatchupFor('gale')).toEqual({
      empowered: 'gale',
      countered: 'stone',
      beatenBy: 'frost',
    });
    expect(fieldMatchupFor('stone')).toEqual({
      empowered: 'stone',
      countered: 'ember',
      beatenBy: 'gale',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Battle log                                                                 */
/* -------------------------------------------------------------------------- */

/** A deck whose first useful cards exercise a status application and a heal. */
const STATUS_CARDS = [
  'neutral-expose',
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'neutral-second-wind',
] as const;

function statusConfig(): BattleControllerConfig {
  return makeConfig({
    player: { element: 'ember', cards: STATUS_CARDS },
  });
}

function restoredStart(ordinal: number): BattleLogEntry {
  return {
    id: `t1-e${String(ordinal)}`,
    ordinal,
    turn: 1,
    kind: 'battle-start',
    actor: 'system',
    effects: [{ kind: 'start', opposingMaxHealth: 30, field: 'neutral' }],
  };
}

function restoredCard(ordinal: number, cardId: string): BattleLogEntry {
  return {
    id: `t1-e${String(ordinal)}`,
    ordinal,
    turn: 1,
    kind: 'card',
    actor: 'player',
    cardId,
    effects: [],
  };
}

function restoredTurn(ordinal: number, turn: number): BattleLogEntry {
  return {
    id: `t${String(turn)}-e${String(ordinal)}`,
    ordinal,
    turn,
    kind: 'turn',
    actor: 'player',
    effects: [],
  };
}

function expectStrictlyIncreasing(log: readonly BattleLogEntry[]): void {
  expect(new Set(log.map((entry) => entry.id)).size).toBe(log.length);

  for (let index = 1; index < log.length; index += 1) {
    const previous = log[index - 1];
    const current = log[index];

    if (previous === undefined || current === undefined) {
      throw new Error('Log fixture is unexpectedly sparse');
    }

    expect(current.ordinal).toBe(previous.ordinal + 1);
  }
}

describe('battle controller log', () => {
  it('starts a new battle with exactly one battle-start entry', () => {
    const state = start();

    expect(state.log).toHaveLength(1);
    expect(state.log[0]).toMatchObject({
      id: 't1-e0',
      ordinal: 0,
      turn: 1,
      kind: 'battle-start',
      actor: 'system',
      effects: [
        { kind: 'start', opposingMaxHealth: 30, field: 'neutral' },
      ],
    });
  });

  it('appends one card entry naming the played card and its damage', () => {
    const state = start();
    const instanceId = instanceOf(state, 'ember-cinder-jab');
    const next = battleReducer(state, { type: 'play-card', instanceId });

    expect(next.log).toHaveLength(2);
    expect(next.log[0]).toBe(state.log[0]);
    expect(next.log[1]).toMatchObject({
      id: 't1-e1',
      ordinal: 1,
      turn: 1,
      kind: 'card',
      actor: 'player',
      cardId: 'ember-cinder-jab',
      effects: [
        { kind: 'damage', target: 'opponent', amount: 3, remaining: 27, max: 30 },
      ],
    });
  });

  it('records Ward defense in the card entry', () => {
    const state = start();
    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-ash-guard'),
    });

    expect(next.log).toHaveLength(2);
    expect(next.log[1]?.effects).toEqual([
      { kind: 'defense', target: 'player', amount: 2, total: 2 },
    ]);
  });

  it('records a field shift in the card entry', () => {
    const state = start();
    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'shift-ember'),
    });

    expect(next.log).toHaveLength(2);
    expect(next.log[1]?.effects).toEqual([
      { kind: 'field', previous: 'neutral', next: 'ember' },
    ]);
  });

  it('records a status application with its resulting stacks', () => {
    const state = start(statusConfig());
    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'neutral-expose'),
    });

    expect(next.log).toHaveLength(2);
    expect(next.log[1]).toMatchObject({
      kind: 'card',
      actor: 'player',
      cardId: 'neutral-expose',
      effects: [
        { kind: 'status', target: 'opponent', status: 'weaken', stacks: 1 },
      ],
    });
  });

  it('appends one enemy card entry per plan step and one turn entry per handoff', () => {
    const state = start();
    const plan = state.battle.enemyPlan;

    if (plan === null) {
      throw new Error('Opening telegraph is missing');
    }

    const next = battleReducer(state, { type: 'end-turn' });
    const appended = next.log.slice(1);

    expect(appended).toHaveLength(plan.steps.length + 2);
    expect(appended.map((entry) => entry.kind)).toEqual([
      'turn',
      'card',
      'card',
      'card',
      'turn',
    ]);
    expect(
      appended
        .filter((entry) => entry.kind === 'card')
        .map((entry) => entry.cardId),
    ).toEqual(plan.steps.map((step) => step.cardId));

    // The handoff to the opponent is a settled transition of its own.
    expect(appended[0]).toMatchObject({
      ordinal: 1,
      turn: 2,
      kind: 'turn',
      actor: 'player',
      effects: [],
    });

    // The enemy steps carry the engine-reported facts of that turn.
    expect(appended[1]).toMatchObject({
      ordinal: 2,
      turn: 2,
      kind: 'card',
      actor: 'opponent',
      cardId: 'ember-cinder-jab',
      effects: [
        { kind: 'damage', target: 'player', amount: 3, remaining: 37, max: 40 },
      ],
    });
    expect(appended[2]).toMatchObject({
      ordinal: 3,
      kind: 'card',
      actor: 'opponent',
      cardId: 'neutral-plain-strike',
      effects: [
        { kind: 'damage', target: 'player', amount: 3, remaining: 34, max: 40 },
      ],
    });
    expect(appended[3]).toMatchObject({
      ordinal: 4,
      kind: 'card',
      actor: 'opponent',
      cardId: 'ember-ash-guard',
      effects: [{ kind: 'defense', target: 'opponent', amount: 2, total: 2 }],
    });

    // Control returns to the player on the next turn.
    expect(appended[4]).toMatchObject({
      ordinal: 5,
      turn: 3,
      kind: 'turn',
      actor: 'opponent',
      effects: [],
    });

    expectStrictlyIncreasing(next.log);
  });

  it('appends nothing for an unaffordable play and keeps report and cues', () => {
    const state = start();
    const lanced = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-ember-lance'),
    });
    const inferno = battleReducer(lanced, {
      type: 'play-card',
      instanceId: instanceOf(lanced, 'ember-inferno'),
    });

    expect(inferno.report?.ok).toBe(false);
    expect(inferno.report?.error?.code).toBe('unaffordable-card');
    expect(inferno.report?.cues).toEqual([]);
    expect(inferno.sequence).toBe(lanced.sequence + 1);
    expect(inferno.log).toBe(lanced.log);
  });

  it('appends nothing after the battle has settled', () => {
    const state = start(
      makeConfig({
        opponent: {
          element: 'ember',
          cards: ENEMY_CARDS,
          maxHealth: 30,
          health: 3,
        },
      }),
    );
    const won = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-cinder-jab'),
    });

    expect(won.battle.outcome).toBe('player-victory');
    expect(won.log).toHaveLength(2);
    expect(won.log[1]?.effects).toContainEqual({
      kind: 'outcome',
      outcome: 'player-victory',
    });

    const again = battleReducer(won, { type: 'end-turn' });

    expect(again.report?.error?.code).toBe('battle-ended');
    expect(again.report?.cues).toEqual([]);
    expect(again.log).toBe(won.log);
  });

  it('adopts a restored log unchanged and appends after its last ordinal', () => {
    const restored: readonly BattleLogEntry[] = [
      restoredStart(0),
      restoredCard(1, 'ember-cinder-jab'),
      restoredTurn(2, 3),
    ];
    const state = start(makeConfig({ initialLog: restored }));

    expect(state.log).toHaveLength(3);
    expect(state.log).toEqual(restored);
    expect(state.log[0]).toBe(restored[0]);
    expect(state.log[2]).toBe(restored[2]);

    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-cinder-jab'),
    });

    expect(next.log).toHaveLength(4);
    expect(next.log[0]).toBe(restored[0]);
    expect(next.log[1]).toBe(restored[1]);
    expect(next.log[2]).toBe(restored[2]);
    expect(next.log[3]).toMatchObject({
      ordinal: 3,
      kind: 'card',
      cardId: 'ember-cinder-jab',
    });
  });

  it('adopts an empty restored log without inventing a battle start', () => {
    const state = start(makeConfig({ initialLog: [] }));

    expect(state.log).toEqual([]);

    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-cinder-jab'),
    });

    expect(next.log).toHaveLength(1);
    expect(next.log[0]).toMatchObject({
      ordinal: 0,
      kind: 'card',
      cardId: 'ember-cinder-jab',
    });
  });

  it('keeps the newest 80 entries and their ordinals when the log overflows', () => {
    const restored = Array.from({ length: BATTLE_LOG_LIMIT }, (_, ordinal) =>
      restoredTurn(ordinal, 1),
    );
    const state = start(makeConfig({ initialLog: restored }));

    expect(state.log).toHaveLength(BATTLE_LOG_LIMIT);

    const next = battleReducer(state, {
      type: 'play-card',
      instanceId: instanceOf(state, 'ember-cinder-jab'),
    });

    expect(next.log).toHaveLength(BATTLE_LOG_LIMIT);
    expect(next.log.map((entry) => entry.ordinal)).toEqual(
      Array.from({ length: BATTLE_LOG_LIMIT }, (_, index) => index + 1),
    );
    expect(next.log[0]).toBe(restored[1]);
    expect(next.log[BATTLE_LOG_LIMIT - 1]).toMatchObject({
      ordinal: BATTLE_LOG_LIMIT,
      kind: 'card',
      cardId: 'ember-cinder-jab',
    });
  });

  it('replays the same seed and actions to identical log facts', () => {
    const left = start();
    const right = start();

    const leftPlayed = battleReducer(left, {
      type: 'play-card',
      instanceId: instanceOf(left, 'ember-cinder-jab'),
    });
    const rightPlayed = battleReducer(right, {
      type: 'play-card',
      instanceId: instanceOf(right, 'ember-cinder-jab'),
    });

    expect(leftPlayed.log).toEqual(rightPlayed.log);
    expect(leftPlayed.battle.rngState).toEqual(rightPlayed.battle.rngState);

    const leftEnded = battleReducer(leftPlayed, { type: 'end-turn' });
    const rightEnded = battleReducer(rightPlayed, { type: 'end-turn' });

    expect(leftEnded.log).toEqual(rightEnded.log);
    expect(leftEnded.battle.rngState).toEqual(rightEnded.battle.rngState);
    expect(leftEnded.battle.outcome).toBe(rightEnded.battle.outcome);

    // The controller stores facts, never rendered strings: the log is plain JSON.
    expect(JSON.parse(JSON.stringify(leftEnded.log))).toEqual(leftEnded.log);
  });
});
