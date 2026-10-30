/**
 * Seeded solo journey with a mid-battle reload (REL-02, REL-FR-01).
 *
 * The spec drives the built application through the real UI only:
 *
 *   - deck selection -> Ember -> Start Run
 *   - the greedy policy from `helpers.ts` until the boss is cleared
 *   - one page reload after the first turn that leaves the battle open, then
 *     Continue Run and an exact comparison of the restored board
 *   - a victory result reporting four of four encounters and a written
 *     `fieldbound.stats.v1` record
 *
 * Seeding goes through `?seed=`; the spec never writes localStorage. It only
 * reads the stats key afterwards, because "the stats key is updated" is part of
 * the acceptance criteria and cannot be observed from the result screen alone.
 *
 * Five fixed seeds are the whole retry budget. A seed whose run ends short of a
 * victory is reported and the next seed is tried; after the fifth the spec fails
 * with every attempted seed and its outcome. The cap is never raised to hide an
 * unwinnable content baseline.
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  collectConsoleErrors,
  currentScreen,
  expectNoConsoleErrors,
  expectScreen,
  openApp,
  playGreedyTurn,
  startSolo,
} from './helpers';

/**
 * Fixed deterministic seeds. The list is capped at five because that is the
 * documented retry budget (release-verification.md 4.2 and section 8).
 */
const SEEDS = [80, 19, 254, 1234, 7] as const;

const MAX_ATTEMPTS = 5;

/** The product budget for the Chromium journey, in milliseconds. */
const RUN_BUDGET_MS = 180_000;

const RUN_MAX_HEALTH = 40;

/** The versioned key the run controller writes when a run ends. */
const STATS_STORAGE_KEY = 'fieldbound.stats.v1';

/** Everything a reload must reproduce for the same battle to be on screen. */
interface BattleSnapshotView {
  readonly screen: string | null;
  readonly turnText: string;
  readonly field: string;
  readonly health: number;
  readonly defense: number;
  readonly energy: string;
  readonly hand: readonly string[];
  readonly enemyName: string;
  readonly enemyHealth: number;
  readonly enemyPlan: string;
}

interface StatsRecord {
  readonly schemaVersion: number;
  readonly furthestEncounter: number;
  readonly bossClears: number;
  readonly bestCompletedTurns: number | null;
}

interface VictoryOutcome {
  readonly kind: 'victory';
  readonly seed: number;
  readonly turns: number;
}

interface DefeatOutcome {
  readonly kind: 'defeat';
  readonly seed: number;
  readonly detail: string;
}

type AttemptOutcome = VictoryOutcome | DefeatOutcome;

type Checkpoint =
  | { readonly kind: 'battle'; readonly snapshot: BattleSnapshotView }
  | {
      readonly kind: 'ended';
      readonly heading: string;
      readonly outcomeText: string;
    };

/* -------------------------------------------------------------------------- */
/* Reading the board and the record                                            */
/* -------------------------------------------------------------------------- */

async function ariaNow(
  locator: Locator,
  context: string,
): Promise<number> {
  await expect(locator, context).toBeVisible();
  const raw = await locator.getAttribute('aria-valuenow');

  if (raw === null || !/^-?\d+$/.test(raw)) {
    throw new Error(
      `${context}: expected a numeric aria-valuenow, received ${String(raw)}.`,
    );
  }

  return Number(raw);
}

/**
 * Read the live battle exactly as the DOM presents it. Health, energy and hand
 * are the acceptance trio; the turn marker, field, defense, enemy state and
 * telegraph make the "same battle" claim stronger than a single number.
 */
async function readBattleSnapshot(
  page: Page,
  seed: number,
): Promise<BattleSnapshotView> {
  const context = `seed ${seed} mid-battle snapshot`;
  const board = page.locator('.battle-board');

  await expect(board, `${context}: the battle board is not visible.`).toBeVisible();

  const turnText = (await page.locator('.battle-board__turn').innerText()).trim();
  const field = (await board.getAttribute('data-field')) ?? '';
  const energy = (
    await page.locator('.player-panel__energy-text').innerText()
  ).trim();
  const enemyName = (
    await page.locator('.enemy-panel__title').innerText()
  ).trim();
  const enemyPlan = (
    await page.locator('.enemy-panel__intent').innerText()
  ).trim();

  const hand = await page
    .locator('.hand .card-view')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const instanceId = node.getAttribute('data-instance-id') ?? '';
        const cardId = node.getAttribute('data-card-id') ?? '';
        return `${instanceId}:${cardId}`;
      }),
    );

  return {
    screen: await currentScreen(page),
    turnText,
    field,
    health: await ariaNow(
      page.getByRole('meter', { name: 'Your health', exact: true }),
      `${context}: the player health meter`,
    ),
    defense: await ariaNow(
      page.getByRole('meter', { name: 'Your defense', exact: true }),
      `${context}: the player defense meter`,
    ),
    energy,
    hand,
    enemyName,
    enemyHealth: await ariaNow(
      page.locator('.enemy-panel .stat-meter--health [role="meter"]'),
      `${context}: the enemy health meter`,
    ),
    enemyPlan,
  };
}

function readStatsRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STATS_STORAGE_KEY);
}

/**
 * Parse the versioned record, failing with the offending value rather than
 * silently accepting a malformed key. The spec reads this key but never writes
 * it: the run controller is the only writer.
 */
function parseStatsRecord(raw: string, context: string): StatsRecord {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${context}: ${STATS_STORAGE_KEY} is not valid JSON.`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${context}: ${STATS_STORAGE_KEY} must hold a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  const { schemaVersion, furthestEncounter, bossClears, bestCompletedTurns } =
    record;

  if (schemaVersion !== 1) {
    throw new Error(
      `${context}: expected ${STATS_STORAGE_KEY}.schemaVersion 1, received ${String(
        schemaVersion,
      )}.`,
    );
  }

  if (typeof furthestEncounter !== 'number' || typeof bossClears !== 'number') {
    throw new Error(
      `${context}: furthestEncounter and bossClears must be numbers.`,
    );
  }

  if (bestCompletedTurns !== null && typeof bestCompletedTurns !== 'number') {
    throw new Error(
      `${context}: bestCompletedTurns must be a number or null.`,
    );
  }

  return {
    schemaVersion,
    furthestEncounter,
    bossClears,
    bestCompletedTurns: bestCompletedTurns as number | null,
  };
}

async function readStats(
  page: Page,
  context: string,
): Promise<StatsRecord | null> {
  const raw = await readStatsRaw(page);

  return raw === null ? null : parseStatsRecord(raw, context);
}

/** One result-screen stat value, selected by its exact term. */
function resultStat(page: Page, label: string): Locator {
  return page
    .locator('.run-result__stat')
    .filter({
      has: page
        .locator('dt')
        .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
    })
    .locator('dd');
}

async function readResultStat(
  page: Page,
  label: string,
  context: string,
): Promise<string> {
  const value = resultStat(page, label);

  await expect(
    value,
    `${context}: expected exactly one "${label}" stat on the result screen.`,
  ).toHaveCount(1);

  return (await value.innerText()).trim();
}

/* -------------------------------------------------------------------------- */
/* Driving the run                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Choose exactly one reward. The greedy policy prefers Heal when the run's
 * health is low enough for the offer to exist and otherwise takes the first
 * card, mirroring the order the release policy documents.
 *
 * Selection and confirmation are two deliberate steps (solo-flow §5.2): the
 * option activation only marks it `aria-pressed`, and the labelled confirm
 * action is what advances the run. The first click must leave the reward screen
 * mounted, so a helper that expected an immediate advance would hide a
 * regression in the one-dispatch contract.
 */
async function chooseReward(page: Page, seed: number): Promise<void> {
  const context = `seed ${seed}: reward choice`;
  await expectScreen(page, 'reward', context);

  const options = page.locator('.reward__options button.reward-option');
  await expect(
    options,
    `${context}: the reward screen must offer exactly three options.`,
  ).toHaveCount(3);

  const labels = await options.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  );
  const healIndex = labels.findIndex((label) => /^Choose Heal \d+$/.test(label));
  const index = healIndex === -1 ? 0 : healIndex;
  const target = options.nth(index);
  const label = labels[index] ?? '';

  await expect(
    target,
    `${context}: no reward option "${label}" was found.`,
  ).toBeVisible();
  await target.click();

  await expect(
    target,
    `${context}: the chosen reward did not report itself as selected.`,
  ).toHaveAttribute('aria-pressed', 'true');
  await expectScreen(page, 'reward', `${context} after selecting`);

  const selectedName = label.replace(/^Choose /, '');
  const take = page.getByRole('button', {
    name: `Take ${selectedName}`,
    exact: true,
  });

  await expect(
    take,
    `${context}: the confirm action for "${selectedName}" is missing.`,
  ).toBeEnabled();
  await take.click();

  await expectScreen(page, 'run-overview', `${context} settled`);
}

async function startNextBattle(page: Page, seed: number): Promise<void> {
  const context = `seed ${seed}: next battle`;
  const next = page.getByRole('button', { name: 'Next Battle', exact: true });

  await expect(next, `${context}: the Next Battle action is missing.`).toBeVisible();
  await next.click();
  await expectScreen(page, 'battle', context);
  await expect(
    page.locator('.battle-board'),
    `${context}: the battle board did not mount.`,
  ).toBeVisible();
}

/**
 * Play the first turn that leaves the battle open and return its snapshot.
 *
 * Seed 80's opening turn already satisfies this, which is the documented
 * checkpoint. A seed that settles its first battle returns a run-end report
 * instead of a snapshot; a run that somehow completes without a single
 * surviving battle fails because the reload contract could not be exercised.
 */
async function reachReloadCheckpoint(
  page: Page,
  seed: number,
): Promise<Checkpoint> {
  for (let step = 0; step < 120; step += 1) {
    const screen = await currentScreen(page);

    if (screen === 'battle') {
      await playGreedyTurn(page);

      if ((await currentScreen(page)) === 'battle') {
        return {
          kind: 'battle',
          snapshot: await readBattleSnapshot(page, seed),
        };
      }

      continue;
    }

    if (screen === 'reward') {
      await chooseReward(page, seed);
      continue;
    }

    if (screen === 'run-overview') {
      await startNextBattle(page, seed);
      continue;
    }

    if (screen === 'run-result') {
      return readRunEnd(page, seed);
    }

    throw new Error(
      `seed ${seed}: the run left the known screens at "${String(
        screen,
      )}" while looking for a mid-battle reload point.`,
    );
  }

  throw new Error(
    `seed ${seed}: no battle survived a turn within 120 steps, so the mid-battle reload could not be checked.`,
  );
}

async function readRunEnd(page: Page, seed: number): Promise<Checkpoint> {
  const context = `seed ${seed}: run result`;
  await expectScreen(page, 'run-result', context);

  const heading = (
    await page.getByRole('heading', { level: 1 }).innerText()
  ).trim();
  const outcomeText = (
    await page.locator('.run-result__outcome').innerText()
  ).trim();

  return { kind: 'ended', heading, outcomeText };
}

/** Play the run to its result, one greedy turn, reward or battle at a time. */
async function playToResult(
  page: Page,
  seed: number,
): Promise<Checkpoint> {
  for (let step = 0; step < 240; step += 1) {
    const screen = await currentScreen(page);

    if (screen === 'battle') {
      await playGreedyTurn(page);
      continue;
    }

    if (screen === 'reward') {
      await chooseReward(page, seed);
      continue;
    }

    if (screen === 'run-overview') {
      await startNextBattle(page, seed);
      continue;
    }

    if (screen === 'run-result') {
      return readRunEnd(page, seed);
    }

    throw new Error(
      `seed ${seed}: the run left the known screens at "${String(
        screen,
      )}" while advancing to the result.`,
    );
  }

  throw new Error(
    `seed ${seed}: the run did not settle within 240 greedy steps (the frozen ladder needs far fewer).`,
  );
}

/* -------------------------------------------------------------------------- */
/* Assertions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Prove the victory result: four of four encounters, the totals, the best-run
 * panel and a record written by this run. Returns the reported turn total so the
 * stats key can be tied to the screen rather than to a hardcoded number.
 */
async function assertVictory(
  page: Page,
  seed: number,
  baseline: StatsRecord | null,
): Promise<number> {
  const context = `seed ${seed}: victory`;

  await expectScreen(page, 'run-result', context);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Run complete', exact: true }),
    `${context}: the boss victory must show the Run complete heading.`,
  ).toBeVisible();
  await expect(
    page.locator('.run-result__outcome'),
    `${context}: the result must state that all four encounters were cleared.`,
  ).toHaveText('You cleared all 4 encounters.');

  await expect(
    resultStat(page, 'Encounters cleared'),
    `${context}: the result must report four of four encounters cleared.`,
  ).toHaveText('4 of 4');

  const turnsText = await readResultStat(page, 'Turns', context);
  const turns = Number(turnsText);

  expect(
    Number.isInteger(turns) && turns > 0,
    `${context}: the reported turn total "${turnsText}" is not a positive integer.`,
  ).toBe(true);

  const stats = await readStats(page, context);

  if (stats === null) {
    throw new Error(
      `${context}: ${STATS_STORAGE_KEY} was not written when the run ended.`,
    );
  }

  const expectedBossClears = (baseline?.bossClears ?? 0) + 1;
  const baselineBest = baseline?.bestCompletedTurns ?? null;
  const expectedBestTurns =
    baselineBest === null ? turns : Math.min(baselineBest, turns);

  expect(
    stats.schemaVersion,
    `${context}: the record must use schema version 1.`,
  ).toBe(1);
  expect(
    stats.furthestEncounter,
    `${context}: a completed run must record the boss (encounter 4).`,
  ).toBe(4);
  expect(
    stats.bossClears,
    `${context}: boss clears must increase by exactly one for this run.`,
  ).toBe(expectedBossClears);
  expect(
    stats.bestCompletedTurns,
    `${context}: bestCompletedTurns must be the faster of the stored best and this run's ${String(
      turns,
    )} turns.`,
  ).toBe(expectedBestTurns);

  await expect(
    resultStat(page, 'Furthest encounter'),
    `${context}: the best-run panel must show the boss.`,
  ).toHaveText('4 of 4');
  await expect(
    resultStat(page, 'Boss clears'),
    `${context}: the best-run panel must show the stored boss clears.`,
  ).toHaveText(String(stats.bossClears));
  await expect(
    page.locator('.run-result__best'),
    `${context}: a first boss clear must be announced as a new best.`,
  ).toBeVisible();

  return turns;
}

/**
 * Reload once, prove Continue Run is offered with the saved health, resume, and
 * compare the whole board against the pre-reload snapshot. A missing entry, a
 * wrong hint or any drift fails with the seed named.
 */
async function reloadAndResume(
  page: Page,
  seed: number,
  before: BattleSnapshotView,
): Promise<void> {
  const context = `seed ${seed}: mid-battle reload`;

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(
    page,
    `${context}: the seeded URL must survive a reload.`,
  ).toHaveURL((url) => url.searchParams.get('seed') === String(seed));
  await expectScreen(page, 'menu', context);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Fieldbound', exact: true }),
    `${context}: the reloaded app did not return to the menu.`,
  ).toBeVisible();

  const continueRun = page.getByRole('button', {
    name: 'Continue Run',
    exact: true,
  });
  await expect(
    continueRun,
    `${context}: a valid mid-battle save must offer Continue Run after the reload.`,
  ).toBeVisible();

  await expect(
    page.locator('#menu-continue-run-hint'),
    `${context}: the Continue Run hint must describe the saved battle (health ${String(
      before.health,
    )}).`,
  ).toHaveText(
    new RegExp(
      `^Encounter [1-4] of 4 · ${String(before.health)} of ${String(
        RUN_MAX_HEALTH,
      )} health$`,
    ),
  );

  await continueRun.click();

  await expectScreen(page, 'battle', `${context}: Continue Run`);
  const after = await readBattleSnapshot(page, seed);

  expect(
    after,
    `${context}: Continue Run must restore the same battle (turn, field, health, defense, energy, hand, enemy and telegraph).`,
  ).toEqual(before);
}

/**
 * One full attempt. Returns a victory or the retryable defeat reason; an
 * unexpected failure throws, because that is a finding rather than a seed that
 * simply lost.
 */
async function attemptRun(
  page: Page,
  seed: number,
  baseline: StatsRecord | null,
): Promise<AttemptOutcome> {
  await startSolo(page, 'ember');

  const checkpoint = await reachReloadCheckpoint(page, seed);

  if (checkpoint.kind === 'ended') {
    if (checkpoint.heading === 'Run complete') {
      throw new Error(
        `seed ${seed}: the run completed without any battle surviving a turn; the mid-battle reload was never exercised.`,
      );
    }

    return {
      kind: 'defeat',
      seed,
      detail: `run ended before the boss (${checkpoint.outcomeText})`,
    };
  }

  await reloadAndResume(page, seed, checkpoint.snapshot);

  const result = await playToResult(page, seed);

  if (result.kind === 'ended' && result.heading === 'Run over') {
    return {
      kind: 'defeat',
      seed,
      detail: `run ended before a victory (${result.outcomeText})`,
    };
  }

  if (result.kind !== 'ended' || result.heading !== 'Run complete') {
    throw new Error(
      `seed ${seed}: the run result reported "${String(
        (result as { heading?: string }).heading,
      )}" instead of a victory or defeat.`,
    );
  }

  const turns = await assertVictory(page, seed, baseline);

  return { kind: 'victory', seed, turns };
}

/* -------------------------------------------------------------------------- */
/* The journey                                                                 */
/* -------------------------------------------------------------------------- */

test.describe('seeded solo run', () => {
  // The long journey is Chromium-only by design (release-verification.md 4.1):
  // smoke and responsive checks are the three-engine suites.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The full seeded solo journey runs on Chromium only.',
  );

  test('reaches the boss and resumes the exact battle after a reload', async ({
    page,
  }) => {
    // The product budget covers the whole seeded journey, not one assertion.
    test.setTimeout(RUN_BUDGET_MS);

    const startedAt = Date.now();
    const errors = collectConsoleErrors(page);

    await openApp(page, SEEDS[0]);

    // A fresh browser context must not advertise a resumable run before this
    // spec has played one; that proves the save later reloaded came from us.
    await expect(
      page.getByRole('button', { name: 'Continue Run', exact: true }),
      'A fresh context must not offer Continue Run before the run starts.',
    ).toHaveCount(0);

    const baseline = await readStats(page, 'baseline before the run');
    const attempts: string[] = [];

    for (let index = 0; index < SEEDS.length; index += 1) {
      const seed = SEEDS[index];

      if (seed === undefined) {
        break;
      }

      if (index > 0) {
        // Remount the app on the next seeded URL; the in-memory run is dropped
        // and the previous save is simply ignored when Play Solo is clicked.
        await openApp(page, seed);
      }

      const outcome = await attemptRun(page, seed, baseline);

      if (outcome.kind === 'victory') {
        expectNoConsoleErrors(
          errors,
          `the seeded solo journey at seed ${seed} (victory after ${String(
            outcome.turns,
          )} turns)`,
        );

        expect(
          Date.now() - startedAt,
          `The Chromium solo journey at seed ${seed} exceeded the ${String(
            RUN_BUDGET_MS,
          )}ms budget.`,
        ).toBeLessThan(RUN_BUDGET_MS);

        return;
      }

      attempts.push(`seed ${seed}: ${outcome.detail}`);
    }

    expectNoConsoleErrors(errors, 'the attempted seeded solo journeys');

    throw new Error(
      `No seeded Ember run completed the four-encounter ladder within ${String(
        MAX_ATTEMPTS,
      )} seeds. Attempted seeds and outcomes:\n${attempts.join('\n')}`,
    );
  });
});
