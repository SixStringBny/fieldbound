/**
 * Five-viewport sweep over every route (`AB-E2`, ticket #25).
 *
 * One full-page screenshot per route per viewport, captured against the
 * production build on the real journeys: the menu, the two reading documents,
 * solo setup and a played solo run (battle, reward, overview, result), then a
 * played local duel (setup, privacy, round result, match result). Nothing is
 * injected and no route is reached by URL: the gated routes need a run or a
 * duel, so the sweep plays them.
 *
 * The artefacts are evidence, never baselines (`AB-E3`): they are written to
 * the git-ignored `test-results/screenshots/` and named
 * `<route>-<viewport>-<seed>-<sha>.png`, and CI uploads that directory on every
 * run. Nothing compares them byte-wise.
 *
 * Chromium only: `AB-G4`/`AB-G5` run on all three engines elsewhere, and the
 * sweep's job is the captured frame per composition.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  currentScreen,
  dismissPrivacy,
  expectNoHorizontalScroll,
  openApp,
  playGreedyTurn,
} from './helpers';

const SCREENSHOT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');

/** Seeds whose first solo battle is won, so a reward and an overview appear. */
const SOLO_SEEDS = [80, 19, 254] as const;
const DUEL_SEED = 20261103;

const VIEWPORTS = [
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

const ROUTES = [
  'menu',
  'how-to-play',
  'settings',
  'solo-setup',
  'run-overview',
  'battle',
  'reward',
  'run-result',
  'duel-setup',
  'privacy',
  'round-result',
  'match-result',
] as const;

/** The build's short commit, so two runs can never be confused. */
function runSha(): string {
  const fromCi = process.env.GITHUB_SHA?.slice(0, 7);

  if (fromCi !== undefined && fromCi !== '') {
    return fromCi;
  }

  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

const SHA = runSha();
const captured: string[] = [];
const done = new Set<string>();

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
}

/** Capture a route at all five viewports, then restore the desktop width. */
async function captureRoute(
  page: Page,
  route: string,
  seed: number,
  expectedScreen: string,
): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(
      page.locator('#main-content'),
      `${route} at ${viewport.label}: the router left the ${expectedScreen} surface.`,
    ).toHaveAttribute('data-screen', expectedScreen);
    await settle(page);
    await expectNoHorizontalScroll(page);

    const name = `${route}-${viewport.label}-${String(seed)}-${SHA}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true });
    captured.push(name);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
}

/** Capture only the first visit of a route; later visits are the same frame. */
async function captureOnce(
  page: Page,
  route: string,
  seed: number,
  expectedScreen: string,
): Promise<void> {
  if (done.has(route)) {
    return;
  }

  await captureRoute(page, route, seed, expectedScreen);
  done.add(route);
}

async function back(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#main-content')).toHaveAttribute('data-screen', 'menu');
}

/** One reward: select then confirm (solo-flow §5.2). */
async function chooseReward(page: Page, seed: number): Promise<void> {
  const options = page.locator('.reward__options button.reward-option');

  await expect(
    options,
    `seed ${String(seed)}: the reward offers exactly three options.`,
  ).toHaveCount(3);

  const labels = await options.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  );
  const healIndex = labels.findIndex((label) => /^Choose Heal \d+$/.test(label));
  const index = healIndex === -1 ? 0 : healIndex;
  const target = options.nth(index);

  await target.click();
  await expect(
    target,
    `seed ${String(seed)}: the chosen reward did not report itself as selected.`,
  ).toHaveAttribute('aria-pressed', 'true');

  const selectedName = (labels[index] ?? '').replace(/^Choose /, '');
  await page.getByRole('button', { name: `Take ${selectedName}`, exact: true }).click();
  await expect(page.locator('#main-content')).toHaveAttribute(
    'data-screen',
    'run-overview',
  );
}

/** The hub, the two reading documents and solo setup, before a run starts. */
async function sweepHub(page: Page, seed: number): Promise<void> {
  await openApp(page, seed);
  await captureOnce(page, 'menu', seed, 'menu');

  await page.getByRole('button', { name: 'How to Play', exact: true }).click();
  await captureOnce(page, 'how-to-play', seed, 'how-to-play');
  await back(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await captureOnce(page, 'settings', seed, 'settings');
  await back(page);

  await page.getByRole('button', { name: 'Play Solo', exact: true }).click();
  await expect(page.locator('#main-content')).toHaveAttribute('data-screen', 'solo-setup');
  await captureOnce(page, 'solo-setup', seed, 'solo-setup');
}

/** Play one seeded solo run, capturing the reward, overview and result. */
async function sweepSoloRun(page: Page, seed: number): Promise<void> {
  await openApp(page, seed);
  await page.getByRole('button', { name: 'Play Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Choose the Ember deck', exact: true }).click();
  await page.getByRole('button', { name: 'Start Run', exact: true }).click();
  await expect(page.locator('#main-content')).toHaveAttribute('data-screen', 'battle');
  await captureOnce(page, 'battle', seed, 'battle');

  for (let step = 0; step < 240; step += 1) {
    const screen = await currentScreen(page);

    if (screen === 'battle') {
      await playGreedyTurn(page);
      continue;
    }

    if (screen === 'reward') {
      await captureOnce(page, 'reward', seed, 'reward');
      await chooseReward(page, seed);
      continue;
    }

    if (screen === 'run-overview') {
      await captureOnce(page, 'run-overview', seed, 'run-overview');
      await page.getByRole('button', { name: 'Next Battle', exact: true }).click();
      await expect(page.locator('#main-content')).toHaveAttribute('data-screen', 'battle');
      continue;
    }

    if (screen === 'run-result') {
      await captureOnce(page, 'run-result', seed, 'run-result');
      return;
    }

    throw new Error(
      `seed ${String(seed)}: the solo run left the known surfaces at ${String(screen)}.`,
    );
  }

  throw new Error(`seed ${String(seed)}: the solo run did not settle within 240 steps.`);
}

/** Play a local duel, capturing setup, privacy, the round and match results. */
async function sweepDuel(page: Page, seed: number): Promise<void> {
  await openApp(page, seed);
  await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
  await expect(page.locator('#main-content')).toHaveAttribute('data-screen', 'duel-setup');
  await captureOnce(page, 'duel-setup', seed, 'duel-setup');

  await page.getByRole('button', { name: 'Choose the Ember deck', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Player 1 deck', exact: true }).click();
  await page.getByRole('button', { name: 'Choose the Frost deck', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Player 2 deck', exact: true }).click();
  await page.getByRole('button', { name: 'Start Match', exact: true }).click();

  await expect(page.locator('[data-duel-privacy="true"]')).toBeVisible();
  await captureOnce(page, 'privacy', seed, 'privacy');
  await page.getByRole('button', { name: "I'm ready", exact: true }).click();

  for (let step = 0; step < 500; step += 1) {
    const screen = await currentScreen(page);

    if (screen === 'battle') {
      await playGreedyTurn(page);
      continue;
    }

    if (screen === 'privacy') {
      const heading = await page.getByRole('heading', { level: 1 }).innerText();
      await dismissPrivacy(page, heading.includes('Player 2') ? 'Player 2' : 'Player 1');
      continue;
    }

    if (screen === 'round-result') {
      await captureOnce(page, 'round-result', seed, 'round-result');
      await page.getByRole('button', { name: 'Next Round', exact: true }).click();
      await page.getByRole('button', { name: "I'm ready", exact: true }).click();
      continue;
    }

    if (screen === 'match-result') {
      await captureOnce(page, 'match-result', seed, 'match-result');
      return;
    }

    throw new Error(`the duel left the known surfaces at ${String(screen)}.`);
  }

  throw new Error('the duel did not settle within 500 steps.');
}

test.describe('five-viewport sweep', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'AB-E2 captures one engine; AB-G4/G5 run on all three elsewhere.',
  );

  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('AB-E2 every route is captured at all five viewports', async ({ page }) => {
    test.setTimeout(900_000);

    await sweepHub(page, SOLO_SEEDS[0]);

    for (const seed of SOLO_SEEDS) {
      // A lost first battle never offers a reward, so keep trying seeds until
      // the reward and the overview have been seen.
      if (done.has('reward') && done.has('run-overview') && done.has('run-result')) {
        break;
      }

      await sweepSoloRun(page, seed);
    }

    await sweepDuel(page, DUEL_SEED);

    const missing = ROUTES.filter((route) => !done.has(route));

    expect(missing, `routes never reached: ${missing.join(', ')}`).toEqual([]);
    expect(
      captured,
      `expected one full-page frame per route per viewport in ${SCREENSHOT_DIR}`,
    ).toHaveLength(ROUTES.length * VIEWPORTS.length);
    expect(
      captured.filter((name) => name.endsWith(`-${SHA}.png`)),
      'every artefact is named <route>-<viewport>-<seed>-<sha>.png',
    ).toHaveLength(captured.length);

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'inventory.json'),
      JSON.stringify({ sha: SHA, viewports: VIEWPORTS.map((v) => v.label), captured }, null, 2),
      'utf8',
    );
  });
});
