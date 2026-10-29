/**
 * Boot-time resume tests (RUN-FR-05, RUN-FR-06, RUN-FR-08, VIS-NFR-06).
 *
 * Every fixture is a genuine save: a real run built by the run model, a real
 * engine battle serialized by `serializeSnapshot`, real reward offers from the
 * seeded generator, and a round trip through `saveRunSave`/`loadRunSave`. That
 * is deliberate - the suite proves `resumeRun` reads exactly what the app
 * writes, not a hand-shaped payload a parallel parser could also accept.
 *
 * The battle case additionally proves that the restored PRNG state replays the
 * same next draw, which is what makes a reload deterministic (RUN-FR-08).
 */
import { describe, expect, it } from 'vitest';

import { createRng } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { serializeSnapshot } from '../engine/snapshot';
import type { BattleState } from '../engine/types';
import {
  RUN_MAX_HEALTH,
  applyBattleResult,
  createRun,
  currentEnemy,
  startEncounter,
} from '../run/run-model';
import type { RunState } from '../run/run-model';
import { generateRewardOffers } from '../run/rewards';
import type { RewardOffer } from '../run/rewards';
import {
  RUN_SAVE_SCHEMA_VERSION,
  RUN_SAVE_STORAGE_KEY,
  loadRunSave,
  saveRunSave,
  serializeRunSave,
} from '../persistence/run-save';
import type {
  RunSaveLoadResult,
  RunSaveStorage,
  RunSaveV1,
} from '../persistence/run-save';
import {
  battleReducer,
  createBattleControllerState,
  fieldMatchupFor,
} from './battle-controller';
import type { BattleControllerState } from './battle-controller';
import { createEncounterConfig, endRunTurn, rewardStreamState } from './run-controller';
import { resumeRun } from './resume-run';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const SEED = 987_654_321;

const SETTINGS_KEY = 'fieldbound.settings.v1';
const SETTINGS_RAW = '{"schemaVersion":1,"muted":true,"reducedMotion":null}';

/** Minimal in-memory `Storage` double; the real browser store is never used. */
class MemoryStorage implements RunSaveStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createdRun(overrides: Partial<RunState> = {}): RunState {
  const created = createRun('ember', SEED);

  if (!created.ok) {
    throw new Error(`createRun failed: ${created.error.code}`);
  }

  return { ...created.value, ...overrides };
}

/** A run on the first ladder rung, already in its battle phase. */
function battleRun(): RunState {
  const started = startEncounter(createdRun());

  if (!started.ok) {
    throw new Error(`startEncounter failed: ${started.error.code}`);
  }

  return started.value;
}

/** The opening battle with one card already played, so nothing is pristine. */
function playedBattle(run: RunState): BattleControllerState {
  const enemy = currentEnemy(run);

  if (enemy === undefined) {
    throw new Error('the ladder has no enemy at the run index');
  }

  const created = createBattleControllerState(createEncounterConfig(run, enemy));

  if (!created.ok) {
    throw new Error(`createBattleControllerState failed: ${created.error.code}`);
  }

  for (const held of created.value.battle.sides.player.hand) {
    const played = battleReducer(created.value, {
      type: 'play-card',
      instanceId: held.instanceId,
    });

    if (played.report?.ok === true) {
      return played;
    }
  }

  throw new Error('no card in the opening hand could be played');
}

interface BattleFixture {
  readonly save: RunSaveV1;
  readonly run: RunState;
  readonly battle: BattleState;
}

function battleFixture(): BattleFixture {
  const run = battleRun();
  const controller = playedBattle(run);

  return {
    run,
    battle: controller.battle,
    save: {
      schemaVersion: RUN_SAVE_SCHEMA_VERSION,
      seed: run.seed,
      rngState: rewardStreamState(SEED),
      run,
      battle: serializeSnapshot(controller.battle),
      battleLog: [...controller.log],
      pendingReward: null,
    },
  };
}

/**
 * A later mid-battle save: one card, then a completed turn, so the controller's
 * log holds a battle start, a played card, the handoff and the enemy plan
 * entries. That is the three-plus-entry shape Continue Run must restore.
 */
function endedBattleFixture(): {
  readonly save: RunSaveV1;
  readonly battle: BattleState;
  readonly log: BattleControllerState['log'];
} {
  const run = battleRun();
  const ended = battleReducer(playedBattle(run), { type: 'end-turn' });

  if (ended.report?.ok !== true) {
    throw new Error('the fixture end turn was rejected');
  }

  return {
    battle: ended.battle,
    log: ended.log,
    save: {
      schemaVersion: RUN_SAVE_SCHEMA_VERSION,
      seed: run.seed,
      rngState: rewardStreamState(SEED),
      run,
      battle: serializeSnapshot(ended.battle),
      battleLog: [...ended.log],
      pendingReward: null,
    },
  };
}

interface RewardFixture {
  readonly save: RunSaveV1;
  readonly run: RunState;
  readonly offers: readonly RewardOffer[];
  readonly rngState: RngState;
}

function rewardFixture(): RewardFixture {
  const settled = applyBattleResult(battleRun(), {
    outcome: 'player-victory',
    turns: 4,
    damageTaken: 6,
    health: RUN_MAX_HEALTH - 6,
  });

  if (!settled.ok) {
    throw new Error(`applyBattleResult failed: ${settled.error.code}`);
  }

  const generated = generateRewardOffers(settled.value, rewardStreamState(SEED));

  if (!generated.ok) {
    throw new Error(`generateRewardOffers failed: ${generated.error.code}`);
  }

  return {
    run: settled.value,
    offers: generated.value.offers,
    rngState: generated.value.rngState,
    save: {
      schemaVersion: RUN_SAVE_SCHEMA_VERSION,
      seed: SEED,
      rngState: generated.value.rngState,
      run: settled.value,
      battle: null,
      battleLog: null,
      pendingReward: generated.value.offers,
    },
  };
}

function terminalRun(phase: 'victory' | 'defeat'): RunState {
  if (phase === 'victory') {
    const started = startEncounter(
      createdRun({ encounterIndex: 3, health: 18, turnsTotal: 20, cardsAdded: 3 }),
    );

    if (!started.ok) {
      throw new Error(`startEncounter failed: ${started.error.code}`);
    }

    const settled = applyBattleResult(started.value, {
      outcome: 'player-victory',
      turns: 9,
      damageTaken: 4,
      health: 14,
    });

    if (!settled.ok) {
      throw new Error(`applyBattleResult failed: ${settled.error.code}`);
    }

    return settled.value;
  }

  const settled = applyBattleResult(battleRun(), {
    outcome: 'opponent-victory',
    turns: 5,
    damageTaken: RUN_MAX_HEALTH,
    health: 0,
  });

  if (!settled.ok) {
    throw new Error(`applyBattleResult failed: ${settled.error.code}`);
  }

  return settled.value;
}

/** Write through the production writers, then read back through the loader. */
function loadSaved(save: RunSaveV1): RunSaveLoadResult {
  const storage = new MemoryStorage();
  const written = saveRunSave(storage, save);

  if (written.status !== 'saved') {
    throw new Error(`saveRunSave did not persist: ${written.status}`);
  }

  return loadRunSave(storage);
}

function available(resume: ReturnType<typeof resumeRun>) {
  if (resume.status !== 'available') {
    throw new Error(`expected a resumable run, received ${resume.reason}`);
  }

  return resume;
}

/* -------------------------------------------------------------------------- */
/* Restored screens and state                                                 */
/* -------------------------------------------------------------------------- */

describe('resumeRun', () => {
  it('restores a mid-battle run on the battle screen with the exact board', () => {
    const fixture = battleFixture();
    const load = loadSaved(fixture.save);

    expect(load.status).toBe('ok');

    const resume = available(resumeRun(load));

    expect(resume.screen).toBe('battle');
    expect(resume.state.run).toEqual(fixture.run);
    expect(resume.state.run.phase).toBe('battle');
    expect(resume.state.rngState).toEqual(fixture.save.rngState);
    expect(resume.state.offers).toBeNull();
    expect(resume.state.battleDamage).toBe(0);
    expect(resume.state.stats).toBeNull();

    const restored = resume.state.battle;

    if (restored === null) {
      throw new Error('a battle-phase resume must restore the battle');
    }

    // Health, hand, energy, field and the telegraph all come from the engine's
    // validated snapshot, not from a second parser.
    expect(restored.battle).toEqual(fixture.battle);
    expect(restored.battle.sides.player.hand).toEqual(
      fixture.battle.sides.player.hand,
    );
    expect(restored.battle.sides.player.energy).toBe(
      fixture.battle.sides.player.energy,
    );
    expect(restored.battle.field).toBe(fixture.battle.field);
    expect(restored.battle.enemyPlan).toEqual(fixture.battle.enemyPlan);
    expect(restored.enemy.name).toBe('Cinder Warden');
    expect(restored.fieldMatchup).toEqual(
      fieldMatchupFor(fixture.battle.field),
    );
    // The bounded log travels inside the save and is adopted, not re-derived.
    expect(restored.log).toEqual(fixture.save.battleLog);
    expect(restored.sequence).toBe(0);
    expect(restored.report).toBeNull();
  });

  it('restores three or more saved log entries in their saved order', () => {
    const fixture = endedBattleFixture();

    expect(fixture.log.length).toBeGreaterThanOrEqual(3);

    const resume = available(resumeRun(loadSaved(fixture.save)));
    const restored = resume.state.battle;

    if (restored === null) {
      throw new Error('a battle-phase resume must restore the battle');
    }

    expect(restored.log).toEqual(fixture.log);
    expect(restored.log.map((entry) => entry.id)).toEqual(
      fixture.log.map((entry) => entry.id),
    );
    expect(restored.log.map((entry) => entry.ordinal)).toEqual(
      fixture.log.map((entry) => entry.ordinal),
    );
    expect(restored.battle).toEqual(fixture.battle);
  });

  it('restores an empty log when the saved payload has no battleLog', () => {
    const fixture = battleFixture();
    const raw = JSON.parse(serializeRunSave(fixture.save)) as Record<
      string,
      unknown
    >;

    // The pre-LOG-07 v1 payload: every other field is intact, no log field.
    delete raw['battleLog'];

    const storage = new MemoryStorage();
    storage.setItem(RUN_SAVE_STORAGE_KEY, JSON.stringify(raw));

    const load = loadRunSave(storage);

    expect(load.status).toBe('ok');
    expect(load.save?.battleLog).toEqual([]);

    const resume = available(resumeRun(load));

    expect(resume.screen).toBe('battle');
    expect(resume.state.battle?.battle).toEqual(fixture.battle);
    expect(resume.state.battle?.log).toEqual([]);
  });

  it('drops a malformed saved log without discarding the run or battle', () => {
    const fixture = battleFixture();
    const raw = JSON.parse(serializeRunSave(fixture.save)) as {
      battleLog?: { effects: unknown[] }[];
    };
    const entry = raw.battleLog?.[1];

    if (entry === undefined) {
      throw new Error('the fixture battle log has no card entry');
    }

    entry.effects = [{ kind: 'teleport' }];

    const storage = new MemoryStorage();
    storage.setItem(RUN_SAVE_STORAGE_KEY, JSON.stringify(raw));

    const load = loadRunSave(storage);

    // The save is kept: only the presentation log is dropped.
    expect(load.status).toBe('ok');
    expect(load.save?.battleLog).toEqual([]);
    expect(storage.getItem(RUN_SAVE_STORAGE_KEY)).not.toBeNull();

    const resume = available(resumeRun(load));

    expect(resume.screen).toBe('battle');
    expect(resume.state.run).toEqual(fixture.run);
    expect(resume.state.battle?.battle).toEqual(fixture.battle);
    expect(resume.state.battle?.log).toEqual([]);
  });

  it('loads an 81-entry log as the last 80 with ordinals intact', () => {
    const fixture = battleFixture();
    const raw = JSON.parse(serializeRunSave(fixture.save)) as Record<
      string,
      unknown
    >;

    raw['battleLog'] = Array.from({ length: 81 }, (_unused, ordinal) => ({
      id: `t1-e${String(ordinal)}`,
      ordinal,
      turn: 1,
      kind: 'turn',
      actor: 'player',
      effects: [],
    }));

    const storage = new MemoryStorage();
    storage.setItem(RUN_SAVE_STORAGE_KEY, JSON.stringify(raw));

    const load = loadRunSave(storage);
    const restored = load.save?.battleLog ?? [];

    expect(load.status).toBe('ok');
    expect(restored).toHaveLength(80);
    expect(restored[0]?.ordinal).toBe(1);
    expect(restored[0]?.id).toBe('t1-e1');
    expect(restored[79]?.ordinal).toBe(80);

    const resume = available(resumeRun(load));

    expect(resume.state.battle?.log).toEqual(restored);
    expect(resume.state.battle?.battle).toEqual(fixture.battle);
  });

  it('replays the same next draw for the persisted seed and PRNG state', () => {
    const fixture = battleFixture();
    const resume = available(resumeRun(loadSaved(fixture.save)));

    const continuous: BattleControllerState = playedBattle(fixture.run);
    const uninterrupted = endRunTurn({
      run: fixture.run,
      rngState: fixture.save.rngState,
      battle: continuous,
      offers: null,
      battleDamage: 0,
      stats: null,
    });
    const reloaded = endRunTurn(resume.state);

    expect(uninterrupted.error).toBeNull();
    expect(reloaded.error).toBeNull();
    expect(reloaded.state.battle).not.toBeNull();
    expect(uninterrupted.state.battle).not.toBeNull();

    expect(reloaded.state.battle?.battle.sides.player.hand).toEqual(
      uninterrupted.state.battle?.battle.sides.player.hand,
    );
    expect(reloaded.state.battle?.battle.turn).toBe(
      uninterrupted.state.battle?.battle.turn,
    );
    expect(reloaded.state.rngState).toEqual(uninterrupted.state.rngState);
  });

  it('restores the reward screen with the same three offers', () => {
    const fixture = rewardFixture();
    const load = loadSaved(fixture.save);

    expect(load.status).toBe('ok');

    const resume = available(resumeRun(load));

    expect(resume.screen).toBe('reward');
    expect(resume.state.run.phase).toBe('reward');
    expect(resume.state.offers).toEqual(fixture.offers);
    expect(resume.state.offers).toHaveLength(3);
    expect(resume.state.rngState).toEqual(fixture.rngState);
    expect(resume.state.battle).toBeNull();
  });

  it('restores the overview and both terminal result screens', () => {
    const overview = createdRun({ turnsTotal: 7, cardsAdded: 1 });
    const overviewResume = available(
      resumeRun(
        loadSaved({
          schemaVersion: RUN_SAVE_SCHEMA_VERSION,
          seed: overview.seed,
          rngState: createRng(0x1234_5678),
          run: overview,
          battle: null,
          battleLog: null,
          pendingReward: null,
        }),
      ),
    );

    expect(overviewResume.screen).toBe('run-overview');

    for (const phase of ['victory', 'defeat'] as const) {
      const run = terminalRun(phase);
      const resume = available(
        resumeRun(
          loadSaved({
            schemaVersion: RUN_SAVE_SCHEMA_VERSION,
            seed: run.seed,
            rngState: createRng(0x1234_5678),
            run,
            battle: null,
            battleLog: null,
            pendingReward: null,
          }),
        ),
      );

      expect(resume.screen).toBe('run-result');
      expect(resume.state.run.phase).toBe(phase);
      expect(resume.state.battle).toBeNull();
      expect(resume.state.offers).toBeNull();
    }
  });

  it('produces a state the save validator accepts again', () => {
    const resume = available(resumeRun(loadSaved(battleFixture().save)));
    const resaved = loadSaved({
      schemaVersion: RUN_SAVE_SCHEMA_VERSION,
      seed: resume.state.run.seed,
      rngState: resume.state.rngState,
      run: resume.state.run,
      battle:
        resume.state.battle === null
          ? null
          : serializeSnapshot(resume.state.battle.battle),
      battleLog:
        resume.state.battle === null ? null : [...resume.state.battle.log],
      pendingReward: resume.state.offers,
    });

    expect(resaved.status).toBe('ok');
    expect(resaved.save?.run.phase).toBe('battle');
    expect(resaved.save?.seed).toBe(resume.save.seed);
  });
});

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

describe('resumeRun refusals', () => {
  it('reports no save for empty and unavailable storage', () => {
    const empty = resumeRun(loadRunSave(new MemoryStorage()));

    expect(empty).toEqual({ status: 'none', reason: 'empty' });

    const unavailable = resumeRun(loadRunSave(null));

    expect(unavailable).toEqual({ status: 'none', reason: 'unavailable' });
  });

  it('discards a corrupt payload and removes only the run key', () => {
    const storage = new MemoryStorage();

    storage.setItem(RUN_SAVE_STORAGE_KEY, '{"schemaVersion":2,"seed":1}');
    storage.setItem(SETTINGS_KEY, SETTINGS_RAW);

    const resume = resumeRun(loadRunSave(storage));

    expect(resume).toEqual({ status: 'none', reason: 'discarded' });
    expect(storage.getItem(RUN_SAVE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(SETTINGS_KEY)).toBe(SETTINGS_RAW);
  });

  it('refuses a load whose battle and phase disagree', () => {
    const fixture = battleFixture();

    const missingBattle = resumeRun({
      status: 'ok',
      save: fixture.save,
      battle: null,
      error: null,
    });

    expect(missingBattle).toEqual({
      status: 'none',
      reason: 'inconsistent-save',
    });

    const reward = rewardFixture();

    const missingOffers = resumeRun({
      status: 'ok',
      save: { ...reward.save, pendingReward: null },
      battle: null,
      error: null,
    });

    expect(missingOffers).toEqual({
      status: 'none',
      reason: 'inconsistent-save',
    });

    const unexpectedBattle = resumeRun({
      status: 'ok',
      save: reward.save,
      battle: fixture.battle,
      error: null,
    });

    expect(unexpectedBattle).toEqual({
      status: 'none',
      reason: 'inconsistent-save',
    });
  });
});
