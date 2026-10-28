import { describe, expect, it } from 'vitest';
import { byId as cardCatalog } from '../content/cards';
import { enemyById } from '../content/enemies';
import type { BattleSideSetup } from '../engine/battle';
import type { EnemyDefinition } from '../engine/types';
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
