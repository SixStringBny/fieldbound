/**
 * Reading screens (reading-screens §2–§6, §8 and §10; ticket #23).
 *
 * How to Play and Settings are one 42rem parchment sheet on the warm slate table
 * with a masthead above it and a contents surface; the run result is a verdict
 * with parchment ledgers; the round and match results are verdict plaques with
 * no paper at all.
 *
 * These checks are behaviour and structure, not pixels: the geometry assertions
 * name the spec's boxes with the tolerances §7 allows, and every text assertion
 * is one of the frozen strings in §10.1. Nothing imports an app module and no
 * state is injected; the result routes are reached by playing the real seeded
 * run and the real local duel.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  collectConsoleErrors,
  currentScreen,
  dismissPrivacy,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
  playGreedyTurn,
  startSolo,
} from './helpers';

const SEED = 20261102;

const VIEWPORTS = [
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

/** The four free content entries, in the order the charters name them. */
const SECTION_IDS = [
  'rules-turn-title',
  'rules-energy-title',
  'rules-field-title',
  'rules-defense-title',
  'rules-status-title',
  'rules-modes-title',
] as const;

const SECTION_NAMES = [
  'A turn in three steps',
  'Energy',
  'The field cycle',
  'Defense',
  'Statuses',
  'Modes',
] as const;

async function openHowToPlay(page: Page): Promise<void> {
  await openApp(page, SEED);
  await page.getByRole('button', { name: 'How to Play', exact: true }).click();
  await expectScreen(page, 'how-to-play', 'reading screens');
  await page.evaluate(() => document.fonts.ready);
}

async function openSettings(page: Page): Promise<void> {
  await openApp(page, SEED);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectScreen(page, 'settings', 'reading screens');
  await page.evaluate(() => document.fonts.ready);
}

/** Play the seeded run to its defeat result by ending turns. */
async function openRunResult(page: Page): Promise<void> {
  await openApp(page, SEED);
  await startSolo(page, 'ember');

  for (let turn = 0; turn < 30; turn += 1) {
    if ((await currentScreen(page)) === 'run-result') {
      await expectScreen(page, 'run-result', 'reading screens');
      await page.evaluate(() => document.fonts.ready);
      return;
    }

    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  }

  throw new Error(`seed ${SEED}: the run did not settle into its result.`);
}

/** One settled duel round at the frozen greedy policy both seats share. */
async function playSettledRound(page: Page): Promise<string> {
  for (let step = 0; step < 160; step += 1) {
    const screen = await currentScreen(page);

    if (screen === 'round-result' || screen === 'match-result') {
      return screen;
    }

    if (screen === 'privacy') {
      const heading = await page.getByRole('heading', { level: 1 }).innerText();
      await dismissPrivacy(page, heading.includes('Player 2') ? 'Player 2' : 'Player 1');
      continue;
    }

    if (screen === 'battle') {
      await playGreedyTurn(page);
      continue;
    }

    throw new Error(`the duel left the known surfaces at ${String(screen)}.`);
  }

  throw new Error('the duel round did not settle within 160 steps.');
}

async function openDuel(page: Page): Promise<void> {
  await openApp(page, SEED);
  await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
  await expectScreen(page, 'duel-setup', 'reading screens');

  for (const [player, deck] of [
    ['1', 'Ember'],
    ['2', 'Frost'],
  ] as const) {
    await page
      .getByRole('button', { name: `Choose the ${deck} deck`, exact: true })
      .click();
    await page
      .getByRole('button', { name: `Confirm Player ${player} deck`, exact: true })
      .click();
  }

  await page.getByRole('button', { name: 'Start Match', exact: true }).click();
  await expect(page.locator('[data-duel-privacy="true"]')).toBeVisible();
  await page.getByRole('button', { name: "I'm ready", exact: true }).click();
  await expectScreen(page, 'battle', 'the first duel round');
}

async function focusShape(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;

    if (!(active instanceof HTMLElement)) {
      return null;
    }

    const style = getComputedStyle(active);

    return {
      tag: active.tagName,
      text: (active.textContent ?? '').replace(/\s+/g, ' ').trim(),
      id: active.id,
      tabindex: active.getAttribute('tabindex'),
      marked: active.hasAttribute('data-route-focus'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
    };
  });
}

async function liveRegionCount(page: Page) {
  return page.evaluate(() => ({
    statuses: document.querySelectorAll('[role="status"]').length,
    liveRegions: document.querySelectorAll('[aria-live]').length,
    inMain: document.querySelectorAll('#main-content [role="status"], #main-content [aria-live]').length,
    text: document.querySelector('[role="status"]')?.textContent?.trim() ?? '',
  }));
}

/* -------------------------------------------------------------------------- */
/* How to Play — the reading document                                         */
/* -------------------------------------------------------------------------- */

test.describe('how to play', () => {
  test.use({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });

  test('the masthead, the sheet and the six verbatim sections render', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await openHowToPlay(page);

    await expect(
      page.getByRole('heading', { level: 1, name: 'How to Play', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.document__eyebrow')).toHaveText('Rules reference');
    await expect(page.locator('.document__tagline')).toHaveText(
      'Take your opponent to 0 health. The shared field decides how hard that is.',
    );
    await expect(page.locator('.document__sheet')).toHaveCount(1);

    const headings = page.locator('.document__sheet h2');
    await expect(headings).toHaveCount(6);

    const names = await headings.evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
    expect(names).toEqual([...SECTION_NAMES]);

    const ids = await headings.evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(ids).toEqual([...SECTION_IDS]);

    const tabindexes = await headings.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('tabindex')),
    );
    expect(tabindexes).toEqual(['-1', '-1', '-1', '-1', '-1', '-1']);

    // The frozen rules strings, unchanged.
    const text = (await page.locator('.document__sheet').innerText()).replace(/\s+/g, ' ');
    for (const line of [
      'Ember beats Frost',
      'Frost beats Gale',
      'Gale beats Stone',
      'Stone beats Ember',
      'three energy',
      'Empowered',
      'Countered',
      'caps at 8',
      'Solo run',
      'Local duel',
      'best of three',
      'Stacks up to 3.',
    ]) {
      expect(text, `How to Play lost the rules string "${line}"`).toContain(line);
    }

    await expectNoHorizontalScroll(page);
    expectNoConsoleErrors(errors, 'how-to-play masthead');
  });

  test('the route heading takes focus on arrival', async ({ page }) => {
    await openHowToPlay(page);

    const focus = await focusShape(page);
    expect(focus?.tag).toBe('H1');
    expect(focus?.text).toBe('How to Play');
    expect(focus?.marked).toBe(true);
    expect(focus?.tabindex).toBe('-1');
    expect(focus?.outlineStyle).toBe('solid');
    expect(focus?.outlineWidth).toBe('2px');
  });

  test('the contents opens, jumps to the heading and closes without a hash', async ({ page }) => {
    await openHowToPlay(page);

    const toggle = page.getByRole('button', { name: 'Contents', exact: true });
    const links = page.getByRole('navigation', { name: 'On this page' }).getByRole('link');

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'how-to-play-contents');
    await expect(page.locator('.contents__count')).toHaveText('6 sections');

    // Closed below 1024: the list is not rendered and its links are not in the
    // tab order (display: none), so the disclosure is the only way in.
    await expect(links).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(links).toHaveCount(6);
    await expect(links.first()).toBeVisible();

    await page.getByRole('link', { name: 'The field cycle', exact: true }).click();

    const focus = await focusShape(page);
    expect(focus?.tag).toBe('H2');
    expect(focus?.id).toBe('rules-field-title');
    expect(focus?.outlineStyle).toBe('solid');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(new URL(page.url()).hash).toBe('');
    await expectScreen(page, 'how-to-play', 'a contents jump');
  });

  test('Escape closes the disclosure and returns focus to the button', async ({ page }) => {
    await openHowToPlay(page);

    const toggle = page.getByRole('button', { name: 'Contents', exact: true });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')),
      'focus returns to the Contents button',
    ).toBe('how-to-play-contents');
  });

  test('the field cycle is a 2x2 seal chain with the beats text and no side scroll', async ({ page }) => {
    await openHowToPlay(page);

    const cycle = page.locator('.rules__cycle');

    await expect(cycle.locator('.rules__cycle-step')).toHaveCount(4);
    await expect(cycle.locator('.field-cycle__seal')).toHaveCount(8);

    const sealsHidden = await cycle
      .locator('.field-cycle__pair')
      .evaluateAll((nodes) => nodes.every((node) => node.getAttribute('aria-hidden') === 'true'));
    expect(sealsHidden, 'the seals are decoration; the sentence carries the rule').toBe(true);

    const columns = await cycle.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    expect(columns.split(' ').length, 'the chain is 2x2 at 375').toBe(2);

    const overflow = await cycle.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    for (const beats of [
      'Ember beats Frost',
      'Frost beats Gale',
      'Gale beats Stone',
      'Stone beats Ember',
    ]) {
      await expect(cycle.getByText(beats, { exact: true })).toBeVisible();
    }

    await expectNoHorizontalScroll(page);
  });

  test('the phone contents is a 44px strip that stays pinned and pushes the sheet down', async ({ page }) => {
    await openHowToPlay(page);

    const strip = page.locator('.contents__bar');
    const box = await strip.boundingBox();

    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(
      await strip.evaluate((node) => getComputedStyle(node.parentElement ?? node).position),
    ).toBe('sticky');

    // Below 1024 the rail links are collapsed: the list is not rendered.
    await expect(page.locator('.contents__list')).toBeHidden();

    await page.getByRole('button', { name: 'Contents', exact: true }).click();

    const list = page.locator('.contents__list');
    await expect(list).toBeVisible();

    const toggleBox = await page.getByRole('button', { name: 'Contents', exact: true }).boundingBox();
    const listBox = await list.boundingBox();
    const sheetBox = await page.locator('.document__sheet').boundingBox();

    expect(listBox!.y, 'the list opens under the strip').toBeGreaterThanOrEqual(toggleBox!.y);
    expect(sheetBox!.y, 'the open list pushes the sheet down').toBeGreaterThan(
      listBox!.y + listBox!.height - 1,
    );

    // scroll-margin keeps a jumped heading clear of the pinned strip.
    const margin = await page
      .locator('#rules-field-title')
      .evaluate((node) => getComputedStyle(node).scrollMarginTop);
    expect(margin).toBe('56px');

    // The strip really pins: it stays at the top while the sheet scrolls.
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect
      .poll(async () => Math.round((await strip.boundingBox())?.y ?? -1), {
        message: 'the Contents strip did not pin to the top of the viewport',
      })
      .toBe(0);

    const stuckSheet = await page.locator('.document__sheet').boundingBox();
    expect(stuckSheet!.y, 'the sheet scrolls under the pinned strip').toBeLessThan(0);
  });
});

test.describe('how to play at the game table', () => {
  for (const viewport of VIEWPORTS.filter((entry) => entry.width >= 1024)) {
    test.describe(viewport.label, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

      test(`the contents rail measures 224px beside the 672px sheet at ${viewport.label}`, async ({
        page,
      }) => {
      await openHowToPlay(page);

      const boxes = await page.evaluate(() => {
        const read = (selector: string) => {
          const node = document.querySelector(selector);
          if (node === null) {
            return null;
          }
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            position: style.position,
            display: style.display,
            scrollMarginTop: style.scrollMarginTop,
          };
        };

        return {
          contents: read('.contents'),
          sheet: read('.document__sheet'),
          bar: read('.contents__bar'),
          heading: read('#rules-field-title'),
          innerWidth: window.innerWidth,
        };
      });

      expect(boxes.contents).not.toBeNull();
      expect(boxes.sheet).not.toBeNull();

      expect(boxes.contents!.position, 'the rail is sticky at the table').toBe('sticky');
      expect(boxes.bar!.display, 'no phone strip at the table').toBe('none');
      expect(Math.abs(boxes.contents!.width - 224), 'the rail is 224px').toBeLessThanOrEqual(8);
      expect(Math.abs(boxes.sheet!.width - 672), 'the sheet is 42rem').toBeLessThanOrEqual(8);
      expect(
        Math.abs(boxes.sheet!.x - (boxes.contents!.x + boxes.contents!.width) - 24),
        'rail + 24px + sheet',
      ).toBeLessThanOrEqual(2);
      expect(boxes.heading!.scrollMarginTop, 'no sticky strip to clear').toBe('0px');

      // Six rail links, all in the tab order.
      const links = page.getByRole('navigation', { name: 'On this page' }).getByRole('link');
      await expect(links).toHaveCount(6);

      for (const link of await links.all()) {
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box!.height, 'each contents link is a 44px target').toBeGreaterThanOrEqual(44);
      }

      await expectNoHorizontalScroll(page);
      });
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Settings — the reading document                                            */
/* -------------------------------------------------------------------------- */

test.describe('settings', () => {
  test.use({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });

  test('one sheet, two switches, one Back and no third motion state', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await openSettings(page);

    await expect(page.locator('.document__sheet')).toHaveCount(1);
    await expect(page.locator('.settings__row')).toHaveCount(2);
    await expect(page.locator('.settings__list li')).toHaveCount(2);
    await expect(page.getByRole('switch')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(1);
    await expect(page.getByText('Sound', { exact: true })).toBeVisible();
    await expect(page.getByText('Reduce motion', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Synthesized cues play after your first tap or key press.', {
        exact: true,
      }),
    ).toBeVisible();

    const rows = page.locator('.settings__row');
    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      expect(box!.height, 'a settings row is at least 72px at the phone').toBeGreaterThanOrEqual(72);
    }

    for (const toggle of await page.getByRole('switch').all()) {
      const box = await toggle.boundingBox();
      expect(Math.abs(box!.width - 72), 'the switch is 72px wide').toBeLessThanOrEqual(1);
      expect(Math.abs(box!.height - 44), 'the switch is 44px tall').toBeLessThanOrEqual(1);
      await expect(toggle).toHaveAttribute('aria-labelledby', /settings-.*-label/);
      await expect(toggle).toHaveAttribute('aria-describedby', /settings-.*-hint/);
    }

    // The visible word matches aria-checked, and toggling writes immediately.
    const sound = page.getByRole('switch', { name: 'Sound' });
    const before = await sound.getAttribute('aria-checked');

    await expect(sound).toContainText(before === 'true' ? 'On' : 'Off');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
    await expect(sound).toContainText(before === 'true' ? 'Off' : 'On');

    const live = await liveRegionCount(page);
    expect(live.statuses, 'one app-wide polite status').toBe(1);
    expect(live.inMain, 'Settings adds no live region; the notice is static').toBe(0);

    await expectNoHorizontalScroll(page);
    expectNoConsoleErrors(errors, 'settings');
  });

  test('the route heading takes focus and the switch shows a visible ring', async ({ page }) => {
    await openSettings(page);

    const focus = await focusShape(page);
    expect(focus?.text).toBe('Settings');
    expect(focus?.tag).toBe('H1');
    expect(focus?.marked).toBe(true);

    // Tab order: skip → Back → Sound. From the route heading the first tab stop
    // is the Sound switch, because `Back` sits before the h1 in the masthead.
    await page.keyboard.press('Tab');

    const sound = page.getByRole('switch', { name: 'Sound' });
    await expect(sound).toBeFocused();

    const ring = await sound.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        shadow: style.boxShadow,
      };
    });

    expect(ring.outlineStyle, 'the switch shows the two-tone ring').toBe('solid');
    expect(ring.outlineWidth).toBe('2px');
    expect(ring.outlineOffset, 'the ring is inset so the row hairline cannot clip it').toBe('-2px');
    expect(ring.shadow).not.toBe('none');
  });
});

test.describe('settings at the game table', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('the sheet stays a centred 672px and the rows grow to 88px', async ({ page }) => {
    await openSettings(page);

    const sheet = await page.locator('.document__sheet').boundingBox();
    const innerWidth = await page.evaluate(() => window.innerWidth);

    expect(Math.abs(sheet!.width - 672), 'the settings sheet is 42rem').toBeLessThanOrEqual(8);

    const leftGap = sheet!.x;
    const rightGap = innerWidth - (sheet!.x + sheet!.width);
    expect(Math.abs(leftGap - rightGap), 'the sheet is centred').toBeLessThanOrEqual(2);

    for (const row of await page.locator('.settings__row').all()) {
      const box = await row.boundingBox();
      expect(box!.height, 'a settings row is at least 88px at the table').toBeGreaterThanOrEqual(88);
    }

    // Nothing is sticky on Settings and there is no contents surface.
    await expect(page.locator('.contents')).toHaveCount(0);
    expect(
      await page.locator('.document__sheet').evaluate((node) => getComputedStyle(node).position),
    ).toBe('static');
  });
});

/* -------------------------------------------------------------------------- */
/* Run result — verdict and record                                           */
/* -------------------------------------------------------------------------- */

test.describe('run result', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('the verdict sits on the slate above parchment ledgers at five widths', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectConsoleErrors(page);

    await openRunResult(page);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Run over', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.run-result__outcome')).toHaveText(
      /^You reached encounter \d+ of 4\.$/,
    );
    await expect(page.locator('.result__seal')).toHaveCount(1);
    await expect(page.locator('.result__ledger--totals')).toHaveCount(1);
    await expect(page.locator('.result__ledger--best')).toHaveCount(1);
    await expect(page.locator('.run-result__best')).toHaveText('New best');
    await expect(page.getByRole('button', { name: 'New Run', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const layout = await page.evaluate(() => {
        const outcome = document.querySelector('.result__outcome');
        const ledger = document.querySelector('.result__ledger--totals');
        const stats = document.querySelectorAll('.run-result__stats--totals .run-result__stat');
        const boxes = Array.from(stats).map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width };
        });

        return {
          outcomeBackground: outcome === null ? '' : getComputedStyle(outcome).backgroundColor,
          ledgerBackground: ledger === null ? '' : getComputedStyle(ledger).backgroundColor,
          cells: boxes,
          pageWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });

      // Slate verdict, parchment record.
      expect(layout.outcomeBackground, `${viewport.label}: the verdict is not paper`).not.toBe(
        'rgb(244, 232, 207)',
      );
      expect(layout.ledgerBackground, `${viewport.label}: the ledger is parchment`).toBe(
        'rgb(244, 232, 207)',
      );

      const rowCount = new Set(layout.cells.map((cell) => Math.round(cell.y))).size;
      const expectedRows = viewport.width >= 768 ? 1 : 2;

      expect(rowCount, `${viewport.label}: the totals grid wraps into ${expectedRows} row(s)`).toBe(
        expectedRows,
      );

      expect(layout.pageWidth, `${viewport.label}: no horizontal page scroll`).toBeLessThanOrEqual(
        layout.innerWidth + 1,
      );

      // Every action stays a 44px target at every width.
      for (const name of ['New Run', 'Menu']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box!.height, `${viewport.label}: ${name} is a 44px target`).toBeGreaterThanOrEqual(
          44,
        );
      }
    }

    const live = await liveRegionCount(page);
    expect(live.statuses).toBe(1);
    expect(live.inMain, 'the run result adds no live line').toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    expectNoConsoleErrors(errors, 'run result');
  });
});

/* -------------------------------------------------------------------------- */
/* Duel results — plaques with no paper                                      */
/* -------------------------------------------------------------------------- */

test.describe('duel results', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('the round result is a verdict plaque with the strip and next opener', async ({ page }) => {
    test.setTimeout(300_000);

    await openDuel(page);
    const settled = await playSettledRound(page);

    expect(settled).toBe('round-result');
    await expect(page.locator('[data-duel-result="round"]')).toHaveCount(1);
    await expect(page.locator('[data-duel-result="match"]')).toHaveCount(0);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/^Player [12] wins round 1$/);
    await expect(page.locator('.duel-result__score')).toHaveText(/^Series [0-9]\u2013[0-9]$/);

    // The deterministic public next opener, in words.
    await expect(page.locator('.duel-result__next-player')).toHaveText(
      /^Next round: Player [12] opens\.$/,
    );

    // The score is announced once, on arrival.
    const live = await liveRegionCount(page);
    expect(live.statuses).toBe(1);
    expect(live.text).toMatch(/^Player [12] wins round 1\. [0-9]\u2013[0-9]\.$/);

    // The series strip: three named pips, one played.
    const strip = page.getByRole('list', { name: 'Series score' });
    const pips = strip.locator('[data-series-pip]');

    await expect(pips).toHaveCount(3);
    await expect(pips.nth(0)).toHaveAttribute('data-round-winner', /^player[12]$/);
    await expect(pips.nth(1)).toHaveAttribute('data-round-winner', 'none');
    await expect(pips.nth(2)).toHaveAttribute('data-round-winner', 'none');
    await expect(pips.nth(0)).toContainText(/^Round 1: Player [12]$/);
    await expect(pips.nth(2)).toContainText('Round 3: not played');

    // No paper, no board, no hand, no card name, no log.
    const paper = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('#main-content *'));

      return {
        sheets: document.querySelectorAll('.document__sheet, .result__ledger').length,
        paperBackgrounds: nodes.filter(
          (node) => getComputedStyle(node).backgroundColor === 'rgb(244, 232, 207)',
        ).length,
        hand: document.querySelectorAll('.hand, .card-view, [data-card-id], [data-instance-id]').length,
        log: document.querySelectorAll('.battle-log, [data-battle-log]').length,
        board: document.querySelectorAll('[data-duel-battle], .battle-board').length,
      };
    });

    expect(paper.sheets, 'a duel result has no paper').toBe(0);
    expect(paper.paperBackgrounds, 'a duel result paints no parchment').toBe(0);
    expect(paper.hand).toBe(0);
    expect(paper.log).toBe(0);
    expect(paper.board).toBe(0);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const plaque = await page.locator('[data-duel-result="round"]').boundingBox();
      const innerWidth = await page.evaluate(() => window.innerWidth);

      expect(plaque!.width, `${viewport.label}: the plaque never exceeds 45rem`).toBeLessThanOrEqual(
        Math.min(720, innerWidth) + 1,
      );
      if (viewport.width >= 768) {
        expect(Math.abs(plaque!.width - 720), `${viewport.label}: the plaque is 720px`).toBeLessThanOrEqual(
          8,
        );
      }
      expect(plaque!.x, `${viewport.label}: the plaque keeps its page gutter`).toBeGreaterThanOrEqual(8);
      await expectNoHorizontalScroll(page);
    }

    await page.setViewportSize({ width: 390, height: 844 });

    // A best-of-three may need the 1-1 decider: keep taking Next Round until the
    // match result replaces the round result.
    let outcome = 'round-result';

    for (let round = 0; round < 3 && outcome === 'round-result'; round += 1) {
      await page.getByRole('button', { name: 'Next Round', exact: true }).click();
      await expect(page.locator('[data-duel-privacy="true"]')).toBeVisible();
      await page.getByRole('button', { name: "I'm ready", exact: true }).click();
      await expectScreen(page, 'battle', `duel round ${String(round + 2)}`);
      outcome = await playSettledRound(page);
    }

    expect(outcome).toBe('match-result');

    await expect(page.locator('[data-duel-result="match"]')).toHaveCount(1);
    await expect(page.locator('[data-duel-result="round"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^Player [12] wins the match$/,
    );
    await expect(page.locator('.duel-result__score')).toHaveText(
      /^Final score [0-9]\u2013[0-9]$/,
    );

    const matchStrip = page.getByRole('list', { name: 'Series score' });
    await expect(matchStrip.locator('[data-series-pip]')).toHaveCount(3);

    const pipWinners = await matchStrip
      .locator('[data-series-pip]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-round-winner') ?? ''));
    const played = pipWinners.filter((winner) => winner !== 'none');

    // A 2-0 sweep fills two pips; a 1-1 decider fills all three.
    expect(played.length).toBeGreaterThanOrEqual(2);
    expect(played.length).toBeLessThanOrEqual(3);
    for (const winner of played) {
      expect(winner).toMatch(/^player[12]$/);
    }
    expect(pipWinners.slice(played.length).every((winner) => winner === 'none')).toBe(true);

    for (const action of ['Rematch', 'Change decks', 'Menu']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible();
    }

    const matchLive = await liveRegionCount(page);
    expect(matchLive.statuses).toBe(1);
    expect(matchLive.text).toMatch(/^Player [12] wins the match\. [0-9]\u2013[0-9]\.$/);

    const matchPaper = await page.evaluate(
      () => document.querySelectorAll('.document__sheet, .result__ledger').length,
    );
    expect(matchPaper, 'the match result has no ledger').toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Axe — one scan per reading route at 375 and 1280                           */
/* -------------------------------------------------------------------------- */

test.describe('reading axe', () => {
  test.use({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });

  for (const route of ['how-to-play', 'settings'] as const) {
    test(`AB-A1 axe reports zero WCAG 2.1 A/AA violations on ${route}`, async ({ page }) => {
      if (route === 'how-to-play') {
        await openHowToPlay(page);
      } else {
        await openSettings(page);
      }

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target.join(' ')),
        })),
      ).toEqual([]);
    });
  }
});
