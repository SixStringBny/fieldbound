/**
 * Smoke coverage for the built Fieldbound app (REL-01).
 *
 * The smoke spec is the only browser check that runs on Chromium, Firefox and
 * WebKit by default; it proves the production bundle boots, the router lands on
 * the menu from a seeded URL and a plain navigation round-trip renders without
 * a console error or horizontal overflow.
 *
 * The long solo and duel journeys are deliberately not here.
 */
import { expect, test } from '@playwright/test';
import {
  collectConsoleErrors,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
} from './helpers';

/** Fixed seeds keep the smoke run deterministic without touching storage. */
const MENU_SEED = 20261029;
const NAVIGATION_SEED = 20261030;

const MENU_ENTRIES = ['Play Solo', 'Local Duel', 'How to Play', 'Settings'];

test.describe('smoke', () => {
  test('seeded menu loads without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await openApp(page, MENU_SEED);

    await expect(
      page,
      `The seeded smoke URL must keep the numeric seed ${MENU_SEED}.`,
    ).toHaveURL((url) => url.searchParams.get('seed') === String(MENU_SEED));

    await expectScreen(page, 'menu', `smoke seed ${MENU_SEED}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fieldbound', exact: true }),
    ).toBeVisible();

    for (const entry of MENU_ENTRIES) {
      await expect(
        page.getByRole('button', { name: entry, exact: true }),
        `The ${entry} menu entry is missing at seed ${MENU_SEED}.`,
      ).toBeVisible();
    }

    await expect(
      page.getByRole('link', { name: 'Skip to main content', exact: true }),
      'The skip link must be present on the first screen.',
    ).toBeVisible();

    await expectNoHorizontalScroll(page);
    expectNoConsoleErrors(errors, `the menu at seed ${MENU_SEED}`);
  });

  test('menu navigation reaches the rules reference and returns', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await openApp(page, NAVIGATION_SEED);

    await page
      .getByRole('button', { name: 'How to Play', exact: true })
      .click();
    await expectScreen(page, 'how-to-play', `smoke seed ${NAVIGATION_SEED}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'How to Play', exact: true }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    // A contents jump moves focus to the section heading and writes no hash
    // (reading-screens §3.3); the rail is open at the default desktop width.
    const contents = page.getByRole('navigation', { name: 'On this page' });

    if (!(await contents.getByRole('link').first().isVisible())) {
      await page.getByRole('button', { name: 'Contents', exact: true }).click();
    }

    await page.getByRole('link', { name: 'Defense', exact: true }).click();

    expect(
      await page.evaluate(() => document.activeElement?.id),
      'the contents jump must focus the section heading',
    ).toBe('rules-defense-title');
    expect(new URL(page.url()).hash).toBe('');
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectScreen(page, 'menu', `returning from How to Play`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fieldbound', exact: true }),
    ).toBeVisible();

    expectNoConsoleErrors(errors, `navigation at seed ${NAVIGATION_SEED}`);
  });
});
