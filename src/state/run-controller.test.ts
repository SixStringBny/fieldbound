import { describe, expect, it } from 'vitest';
import { byId as cardCatalog } from '../content/cards';
import { deckByElement } from '../content/decks';
import { enemyById } from '../content/enemies';
import { createRng } from '../engine/rng';
import { loadRunSave, saveRunSave, validateRunSave } from '../persistence/run-save';
import type { RunSaveStorage } from '../persistence/run-save';
import {
  RUN_MAX_HEALTH,
  RUN_SCHEMA_VERSION,
  runSummary,
} from '../run/run-model';
import type { RunState } from '../run/run-model';
import type { SoloEncounterFactory, SoloRunState } from './run-controller';
import {
  beginEncounter,
  createRunSave,
  createSoloRunState,
  endRunTurn,
  playRunCard,
  resolveRunReward,
  runCurrentHealth,
  runEncounterNumber,
  runProgress,
  screenForRun,
  startNextBattle,
  startSoloRun,
} from './run-controller';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Five unique cards keep the opening hand fully known. The fixture deck also
 * makes every turn's refilled hand identical, because a five-card deck cycles
 * through its whole contents each turn.
 */
const PLAYER_CARDS = [
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'ember-ember-lance',
  'ember-inferno',
] as const;

/** A mixed enemy hand: the opening plan is Jab, Plain Strike, Ash Guard. */
const ENEMY_CARDS = [
  'ember-cinder-jab',
  'ember-inferno',
  'ember-kindled-fury',
  'neutral-plain-strike',
  'ember-ash-guard',
] as const;

/** Ten copies of the cheapest attack: the plan is three jabs for 9 damage. */
const JAB_DECK: readonly string[] = Array.from(
  { length: 10 },
  () => 'ember-cinder-jab',
);

interface EncounterOptions {
  readonly opponentHealth: number;
  readonly opponentCards?: readonly string[];
}

function encounterFactory(options: EncounterOptions): SoloEncounterFactory {
  return (run, enemy) => ({
    seed: run.seed,
    player: {
      element: run.element,
      cards: PLAYER_CARDS,
      maxHealth: RUN_MAX_HEALTH,
      health: run.health,
    },
    opponent: {
      element: enemy.element,
      cards: options.opponentCards ?? ENEMY_CARDS,
      maxHealth: enemy.maxHealth,
      health: Math.min(options.opponentHealth, enemy.maxHealth),
    },
    cards: cardCatalog,
    enemy,
  });
}

function requiredDeck(element: 'ember') {
  const deck = deckByElement(element);

  if (deck === undefined) {
    throw new Error(`The content catalog is missing the ${element} deck`);
  }

  return deck;
}

function requiredEnemy(id: string) {
  const enemy = enemyById(id);

  if (enemy === undefined) {
    throw new Error(`The content catalog is missing enemy ${id}`);
  }

  return enemy;
}

function instanceOf(state: SoloRunState, cardId: string): string {
  const battle = state.battle;

  if (battle === null) {
    throw new Error('The run has no active battle');
  }

  const instance = battle.battle.sides.player.hand.find(
    (held) => held.cardId === cardId,
  );

  if (instance === undefined) {
    throw new Error(`The player hand does not hold ${cardId}`);
  }

  return instance.instanceId;
}

function startedRun(
  seed = 11,
  options: EncounterOptions = { opponentHealth: 3 },
): SoloRunState {
  const created = startSoloRun({
    element: 'ember',
    seed,
    encounterSetup: encounterFactory(options),
  });

  if (!created.ok) {
    throw new Error(`The fixture run failed to start: ${created.error.message}`);
  }

  return created.value;
}

function memoryStorage(): RunSaveStorage {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                   */
/* -------------------------------------------------------------------------- */

describe('solo run creation', () => {
  it('creates a 40-health Ember run on the overview with the ten-card deck', () => {
    const created = createSoloRunState('ember', 4242);

    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    const { run, battle, offers, battleDamage } = created.value;

    expect(run.health).toBe(RUN_MAX_HEALTH);
    expect(run.deck).toHaveLength(10);
    expect(run.element).toBe('ember');
    expect(run.encounterIndex).toBe(0);
    expect(run.turnsTotal).toBe(0);
    expect(run.cardsAdded).toBe(0);
    expect(run.damageTaken).toBe(0);
    expect(run.phase).toBe('overview');
    expect(battle).toBeNull();
    expect(offers).toBeNull();
    expect(battleDamage).toBe(0);
    expect(screenForRun(created.value)).toBe('run-overview');
  });

  it('rejects an unknown element and an invalid seed', () => {
    const badElement = createSoloRunState(
      'shadow' as unknown as 'ember',
      1,
    );
    expect(badElement.ok).toBe(false);

    if (!badElement.ok) {
      expect(badElement.error.code).toBe('invalid-element');
    }

    const badSeed = startSoloRun({ element: 'ember', seed: -1 });
    expect(badSeed.ok).toBe(false);

    if (!badSeed.ok) {
      expect(badSeed.error.code).toBe('invalid-seed');
    }
  });

  it('Start Run opens Cinder Warden with the carried health and full hand', () => {
    const state = startedRun(11, { opponentHealth: 30 });

    expect(state.run.phase).toBe('battle');
    expect(state.battle?.enemy.id).toBe('enemy-cinder-warden');
    expect(state.battle?.battle.sides.player.health).toBe(40);
    expect(state.battle?.battle.sides.player.maxHealth).toBe(40);
    expect(state.battle?.battle.sides.player.hand).toHaveLength(5);
    expect(state.battle?.battle.sides.opponent.health).toBe(30);
    expect(screenForRun(state)).toBe('battle');
  });

  it('produces the same opening hand for the same seed', () => {
    const hands = [1, 2].map(() =>
      startedRun(987_654, { opponentHealth: 30 }).battle?.battle.sides.player.hand.map(
        (held) => held.cardId,
      ),
    );

    expect(hands[0]).toEqual(hands[1]);
  });
});

/* -------------------------------------------------------------------------- */
/* Battle intents and autosave payloads                                       */
/* -------------------------------------------------------------------------- */

describe('solo battle transitions', () => {
  it('saves after an accepted card play without ending the battle', () => {
    const state = startedRun(11, { opponentHealth: 30 });
    const next = playRunCard(state, instanceOf(state, 'ember-ember-lance'));

    expect(next.error).toBeNull();
    expect(next.state.run.phase).toBe('battle');
    expect(next.state.battle?.battle.sides.player.energy).toBe(1);
    expect(next.state.battle?.battle.sides.opponent.health).toBe(26);
    expect(next.save).not.toBeNull();
    expect(next.endedRun).toBeNull();
    expect(next.cues).toEqual(['card-play', 'damage']);

    if (next.save === null) {
      return;
    }

    expect(next.save.run.phase).toBe('battle');
    expect(next.save.battle?.turn).toBe(1);
    expect(next.save.pendingReward).toBeNull();
    expect(validateRunSave(next.save).ok).toBe(true);
  });

  it('does not save a rejected unauthorised play', () => {
    const state = startedRun(11, { opponentHealth: 30 });
    const lanced = playRunCard(state, instanceOf(state, 'ember-ember-lance'));
    const rejected = playRunCard(
      lanced.state,
      instanceOf(lanced.state, 'ember-inferno'),
    );

    expect(rejected.error?.code).toBe('unaffordable-card');
    expect(rejected.save).toBeNull();
    expect(rejected.state.battle?.battle).toBe(lanced.state.battle?.battle);
    expect(rejected.state.run.phase).toBe('battle');
    expect(rejected.cues).toEqual([]);
  });

  it('saves after a completed turn and accumulates the damage taken', () => {
    const state = startedRun(11, {
      opponentHealth: 30,
      opponentCards: JAB_DECK,
    });
    const next = endRunTurn(state);

    expect(next.error).toBeNull();
    expect(next.state.battle?.battle.turn).toBe(3);
    expect(next.state.battle?.battle.sides.player.health).toBe(31);
    expect(next.state.battleDamage).toBe(9);
    expect(next.save).not.toBeNull();
    expect(next.save?.battle?.turn).toBe(3);
    expect(next.cues).toContain('damage');
  });

  it('rejects every intent outside its phase without writing a save', () => {
    const created = createSoloRunState('ember', 5);

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const card = playRunCard(created.value, 'anything');
    expect(card.error?.code).toBe('invalid-phase');
    expect(card.save).toBeNull();

    const reward = resolveRunReward(created.value, 0);
    expect(reward.error?.code).toBe('invalid-phase');
    expect(reward.save).toBeNull();

    const end = endRunTurn(created.value);
    expect(end.error?.code).toBe('invalid-phase');
    expect(end.save).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Victory, reward and the next encounter                                     */
/* -------------------------------------------------------------------------- */

describe('solo victory and rewards', () => {
  it('settles a normal victory, heals 12 and offers three rewards', () => {
    const state = startedRun(11, { opponentHealth: 3 });
    const victory = playRunCard(state, instanceOf(state, 'ember-cinder-jab'));

    expect(victory.error).toBeNull();
    expect(victory.endedRun).toBeNull();
    expect(victory.state.run.phase).toBe('reward');
    expect(victory.state.run.health).toBe(40);
    expect(victory.state.battle).toBeNull();
    expect(victory.state.offers).toHaveLength(3);
    expect(screenForRun(victory.state)).toBe('reward');
    expect(victory.cues).toContain('victory');
    expect(victory.save?.run.phase).toBe('reward');
    expect(victory.save?.battle).toBeNull();
    expect(victory.save?.pendingReward).toHaveLength(3);
    expect(validateRunSave(victory.save).ok).toBe(true);
  });

  it('adds exactly one card and advances to the next overview', () => {
    const state = startedRun(11, { opponentHealth: 3 });
    const victory = playRunCard(state, instanceOf(state, 'ember-cinder-jab'));

    if (victory.state.offers === null) {
      throw new Error('The fixture victory produced no offers');
    }

    const offer = victory.state.offers[0];

    if (offer === undefined || offer.kind !== 'card') {
      throw new Error('The fixture expected a card in the first offer slot');
    }

    const chosen = resolveRunReward(victory.state, 0);

    expect(chosen.error).toBeNull();
    expect(chosen.state.run.phase).toBe('overview');
    expect(chosen.state.run.encounterIndex).toBe(1);
    expect(chosen.state.run.cardsAdded).toBe(1);
    expect(chosen.state.run.deck).toHaveLength(11);
    expect(chosen.state.run.deck.at(-1)).toBe(offer.cardId);
    expect(chosen.state.offers).toBeNull();
    expect(chosen.state.battle).toBeNull();
    expect(screenForRun(chosen.state)).toBe('run-overview');
    expect(chosen.save?.run.phase).toBe('overview');
    expect(chosen.save?.pendingReward).toBeNull();
    expect(validateRunSave(chosen.save).ok).toBe(true);

    const second = resolveRunReward(chosen.state, 0);
    expect(second.error?.code).toBe('invalid-phase');
    expect(second.save).toBeNull();
  });

  it('opens the next ladder enemy with the carried health and deck', () => {
    const state = startedRun(11, { opponentHealth: 3 });
    const victory = playRunCard(state, instanceOf(state, 'ember-cinder-jab'));

    if (victory.state.offers === null) {
      throw new Error('The fixture victory produced no offers');
    }

    const chosen = resolveRunReward(victory.state, 0);
    const next = startNextBattle(chosen.state);

    expect(next.error).toBeNull();
    expect(next.state.run.phase).toBe('battle');
    expect(next.state.battle?.enemy.id).toBe('enemy-rime-sentinel');
    expect(next.state.battle?.battle.sides.player.health).toBe(
      chosen.state.run.health,
    );
    expect(next.state.battle?.battle.sides.player.hand).toHaveLength(5);
    expect(next.state.battleDamage).toBe(0);
    expect(next.save?.battle).not.toBeNull();
    expect(validateRunSave(next.save).ok).toBe(true);
  });

  it('offers Heal 12 only below 20 health and applies it without a card', () => {
    const state = startedRun(11, {
      opponentHealth: 1,
      opponentCards: JAB_DECK,
    });

    let current = state;

    // Four enemy turns at 9 damage leave 4 health.
    for (let index = 0; index < 4; index += 1) {
      const ended = endRunTurn(current);
      expect(ended.error).toBeNull();
      current = ended.state;
    }

    expect(current.battle?.battle.sides.player.health).toBe(4);
    expect(current.battleDamage).toBe(36);

    const victory = playRunCard(current, instanceOf(current, 'ember-cinder-jab'));

    expect(victory.state.run.phase).toBe('reward');
    expect(victory.state.run.health).toBe(16);

    const heal = victory.state.offers?.[2];
    expect(heal).toEqual({ kind: 'heal', amount: 12 });

    const chosen = resolveRunReward(victory.state, 2);

    expect(chosen.error).toBeNull();
    expect(chosen.state.run.health).toBe(28);
    expect(chosen.state.run.cardsAdded).toBe(0);
    expect(chosen.state.run.deck).toHaveLength(10);
    expect(chosen.state.run.encounterIndex).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Defeat, boss victory and the result summary                                */
/* -------------------------------------------------------------------------- */

describe('solo run ending', () => {
  it('ends in defeat after the telegraphed enemy turn is lethal', () => {
    let state = startedRun(11, {
      opponentHealth: 30,
      opponentCards: JAB_DECK,
    });
    let ended = null as ReturnType<typeof endRunTurn> | null;

    for (let index = 0; index < 5; index += 1) {
      ended = endRunTurn(state);
      expect(ended.error).toBeNull();
      state = ended.state;
    }

    expect(ended).not.toBeNull();
    expect(state.run.phase).toBe('defeat');
    expect(state.run.health).toBe(0);
    expect(state.run.turnsTotal).toBe(10);
    expect(state.run.damageTaken).toBe(40);
    expect(state.run.cardsAdded).toBe(0);
    expect(screenForRun(state)).toBe('run-result');
    expect(state.battle).toBeNull();
    expect(ended?.endedRun?.phase).toBe('defeat');
    expect(ended?.save?.battle).toBeNull();
    expect(ended?.save?.run.phase).toBe('defeat');
    expect(validateRunSave(ended?.save).ok).toBe(true);

    const summary = runSummary(state.run);
    expect(summary).toEqual({
      outcome: 'defeat',
      encountersCleared: 0,
      encountersTotal: 4,
      reachedEncounter: 1,
      turnsTotal: 10,
      cardsAdded: 0,
      damageTaken: 40,
    });
  });

  it('ends a boss victory without a reward and reports the complete run', () => {
    const deck = requiredDeck('ember');
    const bossRun: RunState = {
      schemaVersion: RUN_SCHEMA_VERSION,
      seed: 777,
      element: 'ember',
      health: 40,
      deck: [...deck.cards],
      encounterIndex: 3,
      turnsTotal: 20,
      cardsAdded: 3,
      damageTaken: 10,
      phase: 'overview',
    };
    const bossState: SoloRunState = {
      run: bossRun,
      rngState: createRng(9),
      battle: null,
      offers: null,
      battleDamage: 0,
      stats: null,
    };

    const entered = startNextBattle(
      bossState,
      encounterFactory({ opponentHealth: 1 }),
    );

    expect(entered.state.battle?.enemy.id).toBe('enemy-hollow-field');

    const victory = playRunCard(
      entered.state,
      instanceOf(entered.state, 'ember-cinder-jab'),
    );

    expect(victory.error).toBeNull();
    expect(victory.state.run.phase).toBe('victory');
    expect(victory.state.run.encounterIndex).toBe(3);
    expect(victory.state.run.cardsAdded).toBe(3);
    expect(victory.state.offers).toBeNull();
    expect(victory.state.battle).toBeNull();
    expect(victory.endedRun?.phase).toBe('victory');
    expect(victory.save?.run.phase).toBe('victory');
    expect(victory.save?.battle).toBeNull();
    expect(validateRunSave(victory.save).ok).toBe(true);

    const summary = runSummary(victory.state.run);
    expect(summary?.outcome).toBe('victory');
    expect(summary?.encountersCleared).toBe(4);
    expect(summary?.reachedEncounter).toBe(4);
    expect(summary?.cardsAdded).toBe(3);
    expect(summary?.turnsTotal).toBe(21);
    expect(summary?.damageTaken).toBe(10);
  });
});

/* -------------------------------------------------------------------------- */
/* Save round-trip and display helpers                                        */
/* -------------------------------------------------------------------------- */

describe('solo run save', () => {
  it('round-trips the run, seed, PRNG state and battle snapshot', () => {
    const state = startedRun(4242, { opponentHealth: 30 });
    const save = createRunSave(state);

    if (save === null) {
      throw new Error('The fixture battle produced no save');
    }

    expect(save.seed).toBe(4242);
    expect(save.rngState).toEqual(state.rngState);
    expect(save.run.seed).toBe(4242);
    expect(save.battle).not.toBeNull();
    expect(save.pendingReward).toBeNull();

    const storage = memoryStorage();
    expect(saveRunSave(storage, save).status).toBe('saved');

    const loaded = loadRunSave(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.save?.seed).toBe(4242);
    expect(loaded.save?.rngState).toEqual(state.rngState);
    expect(loaded.save?.run.health).toBe(40);
    expect(loaded.battle?.sides.player.health).toBe(40);
    expect(loaded.battle?.sides.player.hand).toHaveLength(5);
  });

  it('writes no battle snapshot outside the battle phase', () => {
    const created = createSoloRunState('frost', 9);

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const save = createRunSave(created.value);
    expect(save).not.toBeNull();
    expect(save?.battle).toBeNull();
    expect(save?.pendingReward).toBeNull();
    expect(validateRunSave(save).ok).toBe(true);
  });

  it('reports the live battle health in the overview and carried health elsewhere', () => {
    const state = startedRun(11, { opponentHealth: 30 });
    expect(runCurrentHealth(state)).toBe(40);

    const lanced = playRunCard(state, instanceOf(state, 'ember-ember-lance'));
    expect(runCurrentHealth(lanced.state)).toBe(40);

    const created = createSoloRunState('gale', 1);

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    expect(runCurrentHealth(created.value)).toBe(40);
  });
});

describe('run display helpers', () => {
  it('marks the ladder step and reports the one-based encounter', () => {
    const state = startedRun(11, { opponentHealth: 30 });
    const progress = runProgress(state.run);

    expect(progress).toHaveLength(4);
    expect(progress.map((step) => step.name)).toEqual([
      'Cinder Warden',
      'Rime Sentinel',
      'Storm Herald',
      'The Hollow Field',
    ]);
    expect(progress[0]?.status).toBe('current');
    expect(progress[1]?.status).toBe('upcoming');
    expect(runEncounterNumber(state.run)).toBe(1);

    const enemy = requiredEnemy('enemy-cinder-warden');
    expect(enemy.name).toBe('Cinder Warden');
  });

  it('requires the overview phase for beginEncounter', () => {
    const state = startedRun(11, { opponentHealth: 30 });
    const entered = beginEncounter(state);

    expect(entered.ok).toBe(false);

    if (!entered.ok) {
      expect(entered.error.code).toBe('invalid-phase');
    }
  });
});
