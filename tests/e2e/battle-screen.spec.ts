/**
 * Battle screen geometry, zones and state surface (battle-screen section 7.2,
 * acceptance bar AB-C4, AB-P3, AB-T3, AB-T4, AB-G2).
 *
 * Runs against the committed production build through the real menu journey.
 * Nothing is injected: the seed and the product's own navigation produce the
 * battle, and every measurement is a rendered box.
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  collectConsoleErrors,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
  startSolo,
} from './helpers';

const SEED = 20261102;
const MIN_TARGET_PX = 44;
const BOARD_MAX_WIDTH_PX = 1080;
const TOLERANCE_PX = 8;

interface ViewportCase {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly enemyMin: number;
  readonly enemyMax: number;
  readonly fieldMin: number;
  readonly handMin: number;
  readonly playerMin: number;
  readonly playerMax: number;
  readonly rail: number | null;
}

const VIEWPORTS: readonly ViewportCase[] = [
  {
    label: '375x667',
    width: 375,
    height: 667,
    cardWidth: 108,
    cardHeight: 136,
    enemyMin: 160,
    enemyMax: 200,
    fieldMin: 150,
    handMin: 150,
    playerMin: 44,
    playerMax: 64,
    rail: null,
  },
  {
    label: '390x844',
    width: 390,
    height: 844,
    cardWidth: 108,
    cardHeight: 152,
    enemyMin: 180,
    enemyMax: 200,
    fieldMin: 150,
    handMin: 166,
    playerMin: 44,
    playerMax: 64,
    rail: null,
  },
  {
    label: '768x1024',
    width: 768,
    height: 1024,
    cardWidth: 108,
    cardHeight: 152,
    enemyMin: 182,
    enemyMax: 208,
    fieldMin: 180,
    handMin: 196,
    playerMin: 72,
    playerMax: 88,
    rail: null,
  },
  {
    label: '1024x768',
    width: 1024,
    height: 768,
    cardWidth: 118,
    cardHeight: 168,
    enemyMin: 152,
    enemyMax: 168,
    fieldMin: 190,
    handMin: 196,
    playerMin: 62,
    playerMax: 78,
    rail: 240,
  },
  {
    label: '1280x800',
    width: 1280,
    height: 800,
    cardWidth: 138,
    cardHeight: 194,
    enemyMin: 152,
    enemyMax: 168,
    fieldMin: 190,
    handMin: 220,
    playerMin: 62,
    playerMax: 78,
    rail: 288,
  },
];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`No rendered box for ${locator.toString()}.`);
  }

  return box;
}

async function openBattle(page: Page): Promise<void> {
  await openApp(page, SEED);
  await startSolo(page, 'ember');
  await expectScreen(page, 'battle', 'battle-screen journey');
  await expect(page.locator('[data-battle-board="true"]')).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`battle ${viewport.label}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });

    test(`AB-G2 zone and card boxes match the battle spec at ${viewport.label}`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await openBattle(page);

      const metrics = await page.evaluate(() => ({
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(
        metrics.scrollHeight,
        `${viewport.label}: the battle document scrolls vertically (${metrics.scrollHeight} > ${metrics.innerHeight}).`,
      ).toBeLessThanOrEqual(metrics.innerHeight + 1);
      expect(
        metrics.scrollWidth,
        `${viewport.label}: the battle document scrolls horizontally (${metrics.scrollWidth} > ${metrics.innerWidth}).`,
      ).toBeLessThanOrEqual(metrics.innerWidth + 1);

      const header = await boxOf(page.locator('.battle-header'));
      expect(header.height, `${viewport.label}: header below 44px`).toBeGreaterThanOrEqual(
        MIN_TARGET_PX,
      );

      const board = await boxOf(page.locator('.battle-board'));
      expect(
        board.width,
        `${viewport.label}: board wider than 1080px (${board.width}).`,
      ).toBeLessThanOrEqual(BOARD_MAX_WIDTH_PX + 1);

      if (viewport.width >= 1024) {
        const leftGap = board.x;
        const rightGap = viewport.width - (board.x + board.width);
        expect(
          Math.abs(leftGap - rightGap),
          `${viewport.label}: board is not centred (${leftGap} vs ${rightGap}).`,
        ).toBeLessThanOrEqual(2);
      }

      const enemy = await boxOf(page.locator('.enemy-panel'));
      expect(
        enemy.height,
        `${viewport.label}: enemy band ${enemy.height}px outside ${viewport.enemyMin}-${viewport.enemyMax}.`,
      ).toBeGreaterThanOrEqual(viewport.enemyMin - TOLERANCE_PX);
      expect(
        enemy.height,
        `${viewport.label}: enemy band ${enemy.height}px outside ${viewport.enemyMin}-${viewport.enemyMax}.`,
      ).toBeLessThanOrEqual(viewport.enemyMax + TOLERANCE_PX);

      const field = await boxOf(page.locator('.field-banner'));
      expect(
        field.height,
        `${viewport.label}: field ${field.height}px below its ${viewport.fieldMin}px floor.`,
      ).toBeGreaterThanOrEqual(viewport.fieldMin - 1);

      const player = await boxOf(page.locator('.player-panel'));
      expect(
        player.height,
        `${viewport.label}: player summary ${player.height}px outside ${viewport.playerMin}-${viewport.playerMax}.`,
      ).toBeGreaterThanOrEqual(viewport.playerMin - TOLERANCE_PX);
      expect(
        player.height,
        `${viewport.label}: player summary ${player.height}px outside ${viewport.playerMin}-${viewport.playerMax}.`,
      ).toBeLessThanOrEqual(viewport.playerMax + TOLERANCE_PX);

      const hand = await boxOf(page.locator('.hand'));
      expect(
        hand.height,
        `${viewport.label}: hand ${hand.height}px below its ${viewport.handMin}px floor.`,
      ).toBeGreaterThanOrEqual(viewport.handMin - TOLERANCE_PX);

      const cards = page.locator('.hand .card-view');
      await expect(cards, `${viewport.label}: the hand must hold five cards.`).toHaveCount(5);

      for (const card of await cards.all()) {
        const cardBox = await boxOf(card);
        expect(
          cardBox.width,
          `${viewport.label}: card width ${cardBox.width}px, expected ${viewport.cardWidth}.`,
        ).toBeGreaterThanOrEqual(viewport.cardWidth - TOLERANCE_PX);
        expect(
          cardBox.width,
          `${viewport.label}: card width ${cardBox.width}px, expected ${viewport.cardWidth}.`,
        ).toBeLessThanOrEqual(viewport.cardWidth + TOLERANCE_PX);
        expect(
          cardBox.height,
          `${viewport.label}: card height ${cardBox.height}px, expected ${viewport.cardHeight}.`,
        ).toBeGreaterThanOrEqual(viewport.cardHeight - TOLERANCE_PX);
        expect(
          cardBox.height,
          `${viewport.label}: card height ${cardBox.height}px, expected ${viewport.cardHeight}.`,
        ).toBeLessThanOrEqual(viewport.cardHeight + TOLERANCE_PX);
      }

      if (viewport.rail !== null) {
        const rail = await boxOf(page.locator('[data-battle-log="true"]'));
        expect(
          rail.width,
          `${viewport.label}: rail ${rail.width}px, expected ${viewport.rail}px.`,
        ).toBeGreaterThanOrEqual(viewport.rail - 1);
        expect(
          rail.width,
          `${viewport.label}: rail ${rail.width}px, expected ${viewport.rail}px.`,
        ).toBeLessThanOrEqual(viewport.rail + 1);
      }

      await expectNoHorizontalScroll(page);
      expectNoConsoleErrors(errors, `${viewport.label} battle geometry`);
    });

    test(`AB-C4 the field roundel is the arena centre at ${viewport.label}`, async ({
      page,
    }) => {
      await openBattle(page);

      const roundels = page.locator('.field-banner__roundel');
      await expect(
        roundels,
        `${viewport.label}: exactly one field roundel must render.`,
      ).toHaveCount(1);

      const roundel = await boxOf(roundels.first());
      const arena = await boxOf(page.locator('.battle-arena'));
      const enemy = await boxOf(page.locator('.enemy-panel'));
      const player = await boxOf(page.locator('.player-panel'));

      const roundelCentre = roundel.x + roundel.width / 2;
      const arenaCentre = arena.x + arena.width / 2;

      expect(
        Math.abs(roundelCentre - arenaCentre),
        `${viewport.label}: roundel centre ${roundelCentre} is not the arena centre ${arenaCentre}.`,
      ).toBeLessThanOrEqual(1);

      expect(
        roundel.y,
        `${viewport.label}: the roundel starts above the enemy panel.`,
      ).toBeGreaterThanOrEqual(enemy.y - 1);
      expect(
        roundel.y + roundel.height,
        `${viewport.label}: the roundel overruns the player panel.`,
      ).toBeLessThanOrEqual(player.y + 1);
    });
  });
}

test.describe('battle phone rack', () => {
  test.use({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });

  test('AB-P3 the phone hand is a rack and all five cards are reachable', async ({
    page,
  }) => {
    await openBattle(page);

    const row = page.locator('.hand__row');
    const metrics = await row.evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));

    expect(
      metrics.scrollWidth,
      'the phone hand must be the only horizontally scrollable rack.',
    ).toBeGreaterThan(metrics.clientWidth);

    const scrollers = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter((node) => {
          const style = getComputedStyle(node);
          const scrolls =
            style.overflowX === 'auto' || style.overflowX === 'scroll';
          return scrolls && node.scrollWidth > node.clientWidth + 1;
        })
        .map((node) => node.className)
        .filter((value) => value.length > 0),
    );

    expect(
      scrollers.every((value) => value.includes('hand__row')),
      `unexpected horizontal scroller(s): ${scrollers.join(', ')}`,
    ).toBe(true);

    const fifth = page.locator('.hand .card-view').nth(4);
    await fifth.focus();

    await expect
      .poll(async () => row.evaluate((node) => node.scrollLeft), {
        message: 'focusing the fifth card did not scroll the rack.',
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    const fifthBox = await boxOf(fifth);
    const visible =
      Math.min(fifthBox.x + fifthBox.width, 375) - Math.max(fifthBox.x, 0);

    expect(
      visible,
      `the focused fifth card is clipped (${visible} of ${fifthBox.width}px visible).`,
    ).toBeGreaterThanOrEqual(fifthBox.width * 0.9);
  });
});

test.describe('battle game table', () => {
  for (const viewport of [
    { label: '1024x768', width: 1024, height: 768, rail: 240 },
    { label: '1280x800', width: 1280, height: 800, rail: 288 },
  ] as const) {
    test(`AB-T3 the rail measures ${viewport.rail} and stops at the hand line on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openBattle(page);

      const rail = await boxOf(page.locator('[data-battle-log="true"]'));
      const hand = await boxOf(page.locator('.hand'));
      const board = await boxOf(page.locator('.battle-board'));

      expect(rail.width).toBeGreaterThanOrEqual(viewport.rail - 1);
      expect(rail.width).toBeLessThanOrEqual(viewport.rail + 1);
      expect(
        rail.y + rail.height,
        `${viewport.label}: rail runs past the hand line (${rail.y + rail.height} > ${hand.y}).`,
      ).toBeLessThanOrEqual(hand.y + 1);
      expect(
        rail.x + rail.width,
        `${viewport.label}: rail is not the board's right edge.`,
      ).toBeLessThanOrEqual(board.x + board.width + 1);
    });

    test(`AB-T4 no phone composition at table width on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openBattle(page);

      await expect(
        page.locator('.battle-log__toggle'),
        `${viewport.label}: the Log toggle must be hidden at table width.`,
      ).toBeHidden();

      const arena = await boxOf(page.locator('.battle-arena'));
      const rail = await boxOf(page.locator('[data-battle-log="true"]'));
      const hand = await boxOf(page.locator('.hand'));
      const board = await boxOf(page.locator('.battle-board'));

      expect(
        rail.x,
        `${viewport.label}: the rail is not beside the arena.`,
      ).toBeGreaterThan(arena.x + arena.width - 1);
      expect(
        hand.x,
        `${viewport.label}: the hand does not start at the board's left edge.`,
      ).toBeLessThanOrEqual(board.x + 1);
      expect(
        hand.x + hand.width,
        `${viewport.label}: the hand does not span beneath the rail.`,
      ).toBeGreaterThanOrEqual(board.x + board.width - 1);
      expect(
        hand.y,
        `${viewport.label}: the hand is not below the arena and rail.`,
      ).toBeGreaterThanOrEqual(Math.max(arena.y + arena.height, rail.y + rail.height) - 1);
    });
  }
});

test.describe('battle states', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test('expands the public intent inline and collapses it again', async ({
    page,
  }) => {
    await openBattle(page);

    const expand = page.locator('.enemy-panel__expand');
    const steps = page.locator('.enemy-panel__steps');
    const preview = page.locator('.enemy-panel__preview');

    await expect(expand).toBeVisible();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(steps).toBeHidden();
    await expect(preview).toBeVisible();
    await expect(preview.locator('.enemy-panel__preview-step')).toHaveCount(3);

    await expand.click();

    await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect(steps).toBeVisible();
    await expect(preview).toBeHidden();
    await expect(page.locator('.enemy-panel__note')).toBeVisible();

    await page.locator('.enemy-panel__expand').click();
    await expect(page.locator('.enemy-panel__expand')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('opens the card detail, traps focus and returns it to the invoking card', async ({
    page,
  }) => {
    await openBattle(page);

    const card = page.locator('.hand .card-view[data-affordable="true"]').first();
    const cardId = await card.getAttribute('data-instance-id');
    await card.focus();
    await page.keyboard.press('Enter');

    const dialog = page.locator('[data-card-detail-layer="true"]');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();

    const close = page.getByRole('button', { name: 'Close card detail' });
    await expect(close).toBeFocused();

    const sheet = await boxOf(page.locator('.card-detail'));
    const viewportHeight = page.viewportSize()?.height ?? 844;
    expect(
      sheet.y + sheet.height,
      'phone sheet must be bottom-anchored.',
    ).toBeGreaterThan(viewportHeight - 40);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(
      page.locator(`.hand .card-view[data-instance-id="${cardId}"]`),
      'focus must return to the invoking card.',
    ).toBeFocused();
  });

  test('marks an unaffordable card in words and keeps End Turn enabled', async ({
    page,
  }) => {
    await openBattle(page);

    // Spend the turn's energy through the real sheet until a card is out of
    // reach. The opening hand and energy are seed-driven, so this does not
    // assume a particular card name.
    for (let play = 0; play < 4; play += 1) {
      const affordable = page.locator('.card-view[data-affordable="true"]').first();

      if ((await affordable.count()) === 0) {
        break;
      }

      await affordable.click();
      await page.getByRole('button', { name: 'Play card' }).click();
    }

    const unaffordable = page.locator('.card-view[data-affordable="false"]').first();
    await expect(unaffordable).toHaveAttribute('aria-disabled', 'true');
    await expect(unaffordable).toContainText(/Unaffordable/i);
    await expect(
      page.getByRole('button', { name: 'End Turn', exact: true }),
    ).toBeEnabled();
  });

  test('opens the log drawer above the control bar and closes it with Escape', async ({
    page,
  }) => {
    await openBattle(page);

    const toggle = page.locator('.battle-log__toggle');
    const history = page.locator('.battle-log__history');

    await expect(history).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(history).toBeVisible();

    const endTurn = page.getByRole('button', { name: 'End Turn', exact: true });
    await expect(endTurn).toBeVisible();
    await expect(endTurn).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(history).toBeHidden();
    await expect(toggle).toBeFocused();
  });
});
