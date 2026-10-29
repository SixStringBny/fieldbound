/**
 * Battle-log browser proof (LOG-08, LOG-FR-04..LOG-FR-07, LOG-NF-02,
 * LOG-NF-03).
 *
 * Everything here runs against the committed production build served by
 * `playwright.config.ts`. The spec drives the real UI only: it never imports an
 * app module, never writes localStorage and never injects game state. Seeding
 * goes through `?seed=` so the app's own seed parser is exercised.
 *
 * Four surfaces are proved:
 *
 *   1. Solo, Chromium, 375x667: a fresh battle opens with the battle-start
 *      line; one affordable card play appends exactly one line naming the card
 *      and `You`; completing the turn appends the handoff lines; the Log
 *      drawer opens with Enter, closes with Escape and returns focus; a
 *      mid-battle reload then Continue Run restores the exact same ordered
 *      history text (not merely its count).
 *   2. Duel, Chromium: the privacy interstitial exposes no log region, no
 *      latest strip, no history entries and no Log toggle, and asserts that
 *      while the interstitial is still visible. After the explicit dismissal
 *      the active turn shows the shared public log, and playing a card appends
 *      one public entry naming only that played card - no other catalog name
 *      may appear anywhere inside the log.
 *   3. 375x667 (all three projects): no horizontal page scroll with the drawer
 *      closed and open, a 44px Log toggle, the newest entry reachable, End
 *      Turn still reachable, and Escape returning focus to the toggle.
 *   4. 1280x800 (all three projects): the history column is visible without
 *      opening a drawer, sits to the right of the board and the mobile toggle
 *      is hidden.
 *
 * The log is a labelled region and an ordered list, never an `aria-live`
 * surface: the existing single polite summary stays the only announcement, so
 * nothing here asserts a live-log message. Every expectation fails loudly with
 * the seed, viewport and expected value; nothing is conditionally skipped.
 *
 * Only the two long journeys are Chromium-only (release-verification.md 4.1).
 * The 375px and 1280px layout checks run on Chromium, Firefox and WebKit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  collectConsoleErrors,
  dismissPrivacy,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
  startSolo,
} from './helpers';

/* -------------------------------------------------------------------------- */
/* Frozen references                                                           */
/* -------------------------------------------------------------------------- */

/** Known-good Ember seed (REL-02 uses it for the same opening turn). */
const SOLO_SEED = 80;

/** Harness navigation seed; the duel match seed is drawn by the built app. */
const DUEL_SEED = 20261031;

/** Layout seeds are unsigned 32-bit values the run seed parser accepts. */
const MOBILE_LAYOUT_SEED = 20261101;
const DESKTOP_LAYOUT_SEED = 20261102;

/** The documented minimum interactive target, in CSS pixels. */
const MIN_TOGGLE_PX = 44;

/** The versioned key the solo run controller writes after every settled action. */
const RUN_SAVE_KEY = 'fieldbound.run.v1';

const LOG_REGION_SELECTOR = '[data-battle-log="true"]';
const LATEST_SELECTOR = '[data-battle-log-latest="true"]';
const ITEM_SELECTOR = '.battle-log__item';
const TOGGLE_SELECTOR = '.battle-log__toggle';
const HISTORY_SELECTOR = '.battle-log__history';
const LIST_SELECTOR = 'ol.battle-log__list';

interface CatalogCard {
  readonly id: string;
  readonly name: string;
}

/**
 * The frozen card catalog, read as test-side data so the public-only scan is
 * tied to the real names rather than a hand-maintained copy. This is not an app
 * module import and it injects nothing.
 */
const CATALOG_PATH = join(process.cwd(), 'src', 'content', 'cards.json');
const CATALOG = JSON.parse(
  readFileSync(CATALOG_PATH, 'utf8'),
) as readonly CatalogCard[];

if (CATALOG.length < 20) {
  throw new Error(
    `The card catalog at ${CATALOG_PATH} looks truncated (${String(
      CATALOG.length,
    )} entries); the public-log scan needs the full name list.`,
  );
}

const CARD_NAMES: readonly string[] = CATALOG.map((card) => card.name);

interface PlayedCard {
  readonly name: string;
  readonly cardId: string;
}

/* -------------------------------------------------------------------------- */
/* DOM readers and keyboard helpers                                            */
/* -------------------------------------------------------------------------- */

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Assert the labelled log region, its ordered history and the single latest
 * strip exist, and that the log is not a live region. Returns the region so a
 * caller can measure it.
 */
async function expectLogRegion(page: Page, context: string): Promise<Locator> {
  const region = page.getByRole('region', { name: 'Battle log' });

  await expect(
    region,
    `${context}: the labelled Battle log region is missing.`,
  ).toBeVisible();

  await expect(
    page.locator(LATEST_SELECTOR),
    `${context}: the always-visible latest-entry strip is missing.`,
  ).toBeVisible();

  await expect(
    page.locator(LIST_SELECTOR),
    `${context}: the history must be one ordered list of entries.`,
  ).toHaveCount(1);

  await expect(
    region,
    `${context}: the log region must not be an aria-live area.`,
  ).not.toHaveAttribute('aria-live', /.+/);
  await expect(
    page.locator(`${LOG_REGION_SELECTOR} [aria-live]`),
    `${context}: no descendant of the log may carry aria-live.`,
  ).toHaveCount(0);
  await expect(
    page.locator('[data-live-region="true"]'),
    `${context}: exactly one polite summary must remain the only live region.`,
  ).toHaveCount(1);

  return region;
}

/** Read the one always-visible latest sentence. */
async function readLatestText(page: Page, context: string): Promise<string> {
  const latest = page.locator(LATEST_SELECTOR);

  await expect(
    latest,
    `${context}: the latest-entry strip is missing or hidden.`,
  ).toBeVisible();

  const text = normalizeText(await latest.innerText());

  if (text.length === 0) {
    throw new Error(`${context}: the latest-entry strip is empty.`);
  }

  return text;
}

/**
 * Read every entry in chronological DOM order as its full visible text
 * (turn marker, factual sentence and optional dialogue). Reading text rather
 * than ids means a regenerated but different log cannot pass.
 */
async function readLogEntries(
  page: Page,
  context: string,
): Promise<string[]> {
  const items = page.locator(ITEM_SELECTOR);
  const count = await items.count();

  if (count === 0) {
    throw new Error(
      `${context}: the battle log rendered no entries; at least the battle-start entry must exist.`,
    );
  }

  return items.evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()),
  );
}

/** True when focus currently sits on the log toggle. */
function toggleHasFocus(page: Page): Promise<boolean> {
  return page.evaluate(
    (selector) => document.activeElement === document.querySelector(selector),
    TOGGLE_SELECTOR,
  );
}

/** Open the drawer with Enter only, proving keyboard operation. */
async function openDrawerWithKeyboard(
  page: Page,
  context: string,
): Promise<void> {
  const toggle = page.locator(TOGGLE_SELECTOR);

  await expect(
    toggle,
    `${context}: the Log toggle is not visible, so the drawer cannot be opened.`,
  ).toBeVisible();
  await expect(
    toggle,
    `${context}: the Log toggle must start collapsed.`,
  ).toHaveAttribute('aria-expanded', 'false');

  await toggle.focus();
  await page.keyboard.press('Enter');

  await expect(
    toggle,
    `${context}: Enter did not expand the Log toggle.`,
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.locator(HISTORY_SELECTOR),
    `${context}: the history drawer is not visible after Enter.`,
  ).toBeVisible();
}

/** Close the drawer with Escape and prove focus returned to the toggle. */
async function closeDrawerWithEscape(
  page: Page,
  context: string,
): Promise<void> {
  const toggle = page.locator(TOGGLE_SELECTOR);

  await page.keyboard.press('Escape');

  await expect(
    toggle,
    `${context}: Escape did not collapse the Log toggle.`,
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.locator(HISTORY_SELECTOR),
    `${context}: the history drawer stayed visible after Escape.`,
  ).toBeHidden();
  await expect
    .poll(() => toggleHasFocus(page), {
      message: `${context}: Escape did not return focus to the Log toggle.`,
      timeout: 5_000,
    })
    .toBe(true);
}

/**
 * Play exactly one affordable card through the real card detail sheet and
 * return the printed name the log must echo. Missing affordance is a finding,
 * not a skip: the deck's maximum cost is below the opening energy.
 */
async function playOneAffordableCard(
  page: Page,
  context: string,
): Promise<PlayedCard> {
  const affordable = page.locator('.hand .card-view[data-affordable="true"]');
  const affordableCount = await affordable.count();

  if (affordableCount === 0) {
    const handCount = await page.locator('.hand .card-view').count();
    throw new Error(
      `${context}: the hand holds ${String(
        handCount,
      )} card(s) but none is affordable, so no card play can write a log line.`,
    );
  }

  const card = affordable.first();
  const cardId = (await card.getAttribute('data-card-id')) ?? '';

  if (cardId.length === 0) {
    throw new Error(
      `${context}: the chosen affordable card has no data-card-id attribute.`,
    );
  }

  await card.click();

  const detail = page.locator('[data-card-detail-layer="true"]');
  await expect(
    detail,
    `${context}: the card detail for ${cardId} did not open.`,
  ).toBeVisible();

  const name = normalizeText(
    await page.locator('#card-detail-title').innerText(),
  );

  if (name.length === 0) {
    throw new Error(
      `${context}: the card detail for ${cardId} showed no printed name.`,
    );
  }

  await page.getByRole('button', { name: 'Play card', exact: true }).click();
  await expect(
    detail,
    `${context}: the card detail stayed open after Play card.`,
  ).toBeHidden();

  return { name, cardId };
}

/** The raw solo save, read (never written) to prove the action persisted. */
function readRawRunSave(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), RUN_SAVE_KEY);
}

/** The three documented versioned keys; a feature may not add a fourth. */
const KNOWN_STORAGE_KEYS = new Set([
  'fieldbound.run.v1',
  'fieldbound.settings.v1',
  'fieldbound.stats.v1',
]);

/**
 * Record every request made after the document load that resolves off-origin.
 * Call once the app is on the menu, so the initial document request (which
 * necessarily precedes the listener) is excluded exactly as the origin audit
 * requires. `data:` and `blob:` URLs never leave the browser.
 */
function collectOffOriginRequests(page: Page): string[] {
  const origin = new URL(page.url()).origin;
  const offOrigin: string[] = [];

  page.on('request', (request) => {
    const url = request.url();

    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return;
    }

    try {
      if (new URL(url).origin !== origin) {
        offOrigin.push(url);
      }
    } catch {
      offOrigin.push(url);
    }
  });

  return offOrigin;
}

/** Assert the feature stayed local: no remote request and no extra key. */
async function expectLocalOnly(
  page: Page,
  offOriginRequests: readonly string[],
  context: string,
): Promise<string[]> {
  expect(
    [...offOriginRequests],
    `${context}: the log feature must not request anything off-origin after the document load.`,
  ).toEqual([]);

  const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
  const unknown = keys.filter((key) => !KNOWN_STORAGE_KEYS.has(key));

  expect(
    unknown,
    `${context}: the log feature added a storage key beyond the three versioned keys: ${unknown.join(
      ', ',
    )}.`,
  ).toEqual([]);

  return keys;
}

/* -------------------------------------------------------------------------- */
/* Duel setup                                                                  */
/* -------------------------------------------------------------------------- */

async function chooseDeck(page: Page, deckName: string): Promise<void> {
  const deck = page.getByRole('button', {
    name: `Choose the ${deckName} deck`,
    exact: true,
  });

  await expect(
    deck,
    `The ${deckName} deck button is missing from the duel setup.`,
  ).toBeVisible();
  await deck.click();
  await expect(
    deck,
    `The ${deckName} deck did not report itself as selected.`,
  ).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Menu -> Local Duel -> Player 1 deck -> Player 2 deck -> Start Match. Every
 * step must reach its next surface; a missing heading fails with the context.
 */
async function startDuel(
  page: Page,
  player1Deck: string,
  player2Deck: string,
): Promise<void> {
  await expectScreen(page, 'menu', 'starting a local duel');
  await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
  await expectScreen(page, 'duel-setup', 'the duel setup');

  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Player 1, choose your deck',
      exact: true,
    }),
    'The duel setup must open on the Player 1 deck step.',
  ).toBeVisible();
  await chooseDeck(page, player1Deck);
  await page
    .getByRole('button', { name: 'Confirm Player 1 deck', exact: true })
    .click();

  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Player 2, choose your deck',
      exact: true,
    }),
    'Player 1 confirmation must advance to the Player 2 deck step.',
  ).toBeVisible();
  await chooseDeck(page, player2Deck);
  await page
    .getByRole('button', { name: 'Confirm Player 2 deck', exact: true })
    .click();

  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Both decks are locked',
      exact: true,
    }),
    'Both confirmations must reveal the locked summary.',
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start Match', exact: true }).click();
}

/* -------------------------------------------------------------------------- */
/* 1. Solo journey (Chromium, 375x667)                                         */
/* -------------------------------------------------------------------------- */

test.describe('battle log in the solo run', () => {
  // The long journey is Chromium-only by design (release-verification.md 4.1).
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The full solo log journey runs on Chromium only.',
  );

  // The drawer form is the sub-1024px surface; 375x667 is the phone contract.
  test.use({ viewport: { width: 375, height: 667 }, reducedMotion: 'no-preference' });

  test('records a card and a turn, answers the keyboard and restores its history after reload', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const context = `solo seed ${String(SOLO_SEED)} at 375x667`;
    const errors = collectConsoleErrors(page);

    await openApp(page, SOLO_SEED);
    const offOriginRequests = collectOffOriginRequests(page);
    await startSolo(page, 'ember');
    await expectScreen(page, 'battle', context);

    // A fresh battle starts with exactly one battle-start entry.
    await expectLogRegion(page, context);

    const openingLatest = await readLatestText(page, context);
    expect(
      openingLatest,
      `${context}: a fresh battle must open with the battle-start sentence, but the strip read "${openingLatest}".`,
    ).toMatch(/^The battle begins\b/);

    const openingEntries = await readLogEntries(page, context);
    expect(
      openingEntries.length,
      `${context}: a fresh battle must hold exactly the battle-start entry, not ${String(
        openingEntries.length,
      )}.`,
    ).toBe(1);

    // One affordable card play appends exactly one entry naming card and actor.
    const played = await playOneAffordableCard(page, context);
    await expectScreen(page, 'battle', `${context} after playing ${played.name}`);

    const latest = page.locator(LATEST_SELECTOR);
    await expect(
      latest,
      `${context}: the latest strip must name the played card "${played.name}".`,
    ).toContainText(played.name);
    await expect(
      latest,
      `${context}: the latest strip must name the acting player "You".`,
    ).toContainText('You');

    const cardLatest = await readLatestText(page, context);
    expect(
      cardLatest,
      `${context}: the newest line must be the player's card play, but it read "${cardLatest}".`,
    ).toMatch(/^You play\b/);

    const afterCardEntries = await readLogEntries(page, context);

    expect(
      afterCardEntries.length,
      `${context}: playing one card must append exactly one log entry (${String(
        openingEntries.length,
      )} -> ${String(afterCardEntries.length)}).`,
    ).toBe(openingEntries.length + 1);

    expect(
      afterCardEntries[afterCardEntries.length - 1],
      `${context}: the newest history entry must contain the played card name "${played.name}".`,
    ).toContain(played.name);

    // The card play must be durable before the turn and the reload.
    await expect
      .poll(() => readRawRunSave(page), {
        message: `${context}: the settled card play did not write ${RUN_SAVE_KEY}.`,
        timeout: 5_000,
      })
      .not.toBeNull();

    const saveAfterCard = await readRawRunSave(page);

    // Complete the turn. The controller appends the handoff and the enemy plan.
    const endTurn = page.locator('.battle-controls__end');
    await expect(
      endTurn,
      `${context}: End Turn must be reachable and enabled before the turn ends.`,
    ).toBeEnabled();
    await endTurn.click();

    await expect
      .poll(async () => page.locator(ITEM_SELECTOR).count(), {
        message: `${context}: completing the turn appended no log entry.`,
        timeout: 10_000,
      })
      .toBeGreaterThan(afterCardEntries.length);

    const afterTurnEntries = await readLogEntries(page, context);
    const newEntries = afterTurnEntries.slice(afterCardEntries.length);

    expect(
      newEntries.length,
      `${context}: completing the turn must append at least the handoff entry.`,
    ).toBeGreaterThan(0);

    const handoffLines = newEntries.filter((line) =>
      /\bends? the turn\b/.test(line),
    );

    expect(
      handoffLines.length,
      `${context}: completing the turn added no turn-handoff line. New lines: ${JSON.stringify(
        newEntries,
      )}`,
    ).toBeGreaterThan(0);

    const turnLatest = await readLatestText(page, context);

    expect(
      turnLatest,
      `${context}: the latest strip must change after the completed turn (still "${cardLatest}").`,
    ).not.toBe(cardLatest);

    const newestEntry = afterTurnEntries[afterTurnEntries.length - 1] ?? '';

    expect(
      newestEntry,
      `${context}: the latest strip "${turnLatest}" must be the newest history entry "${newestEntry}".`,
    ).toContain(turnLatest);

    // The completed turn must also be durable before the reload.
    await expect
      .poll(
        async () =>
          saveAfterCard !== null &&
          (await readRawRunSave(page)) !== saveAfterCard,
        {
          message: `${context}: the completed turn did not update ${RUN_SAVE_KEY}.`,
          timeout: 5_000,
        },
      )
      .toBe(true);

    // Keyboard drawer: Enter opens, Escape closes and restores focus.
    await openDrawerWithKeyboard(page, context);
    await expectNoHorizontalScroll(page);

    const historyAtNewest = await page
      .locator(HISTORY_SELECTOR)
      .evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight <= 2,
      );

    expect(
      historyAtNewest,
      `${context}: the open drawer did not reach its newest settled entry.`,
    ).toBe(true);

    await expect(
      page.locator('.battle-controls__end'),
      `${context}: End Turn must remain reachable while the drawer is open.`,
    ).toBeEnabled();

    const beforeReloadEntries = await readLogEntries(page, context);

    expect(
      beforeReloadEntries,
      `${context}: the open drawer must show the whole settled history.`,
    ).toEqual(afterTurnEntries);

    await closeDrawerWithEscape(page, context);
    await expectNoHorizontalScroll(page);

    // Reload mid-battle and resume through the product's own Continue Run.
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(
      page,
      `${context}: the seeded URL must survive a mid-battle reload.`,
    ).toHaveURL((url) => url.searchParams.get('seed') === String(SOLO_SEED));
    await expectScreen(page, 'menu', `${context} after reload`);

    const continueRun = page.getByRole('button', {
      name: 'Continue Run',
      exact: true,
    });

    await expect(
      continueRun,
      `${context}: a valid mid-battle save must offer Continue Run after the reload.`,
    ).toBeVisible();
    await continueRun.click();
    await expectScreen(page, 'battle', `${context} after Continue Run`);

    await expectLogRegion(page, context);

    const resumedLatest = await readLatestText(page, context);

    expect(
      resumedLatest,
      `${context}: Continue Run must restore the same latest line.`,
    ).toBe(turnLatest);

    await openDrawerWithKeyboard(page, `${context} after resume`);

    const resumedEntries = await readLogEntries(page, context);

    expect(
      resumedEntries,
      `${context}: Continue Run must restore the same entry text in the same order (before: ${JSON.stringify(
        beforeReloadEntries,
      )}, after: ${JSON.stringify(resumedEntries)}).`,
    ).toEqual(beforeReloadEntries);

    await closeDrawerWithEscape(page, `${context} after resume`);
    await expectNoHorizontalScroll(page);

    await expect(
      page.locator('.battle-controls__end'),
      `${context}: End Turn must be reachable after resuming.`,
    ).toBeEnabled();

    await expectLocalOnly(page, offOriginRequests, context);

    expectNoConsoleErrors(errors, context);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Duel privacy and public entries (Chromium)                               */
/* -------------------------------------------------------------------------- */

test.describe('battle log in the local duel', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The duel log journey runs on Chromium only.',
  );

  test('exposes no log behind privacy and only public entries on the active turn', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const context = `duel seed ${String(DUEL_SEED)}`;
    const errors = collectConsoleErrors(page);

    await openApp(page, DUEL_SEED);
    const offOriginRequests = collectOffOriginRequests(page);
    await startDuel(page, 'Ember', 'Frost');
    await expectScreen(page, 'privacy', `${context}: Start Match`);

    const privacy = page.locator('[data-duel-privacy="true"]');

    await expect(
      privacy,
      `${context}: the full-screen privacy handoff is not visible.`,
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Pass to Player 1',
        exact: true,
      }),
      `${context}: the handoff must name the seat that takes the device.`,
    ).toBeVisible();

    // No log surface of any kind may exist while privacy is displayed.
    const forbidden = [
      LOG_REGION_SELECTOR,
      '.battle-log',
      LATEST_SELECTOR,
      ITEM_SELECTOR,
      TOGGLE_SELECTOR,
      HISTORY_SELECTOR,
    ];

    for (const selector of forbidden) {
      await expect(
        page.locator(selector),
        `${context}: ${selector} must be absent while the privacy handoff is shown, not merely hidden.`,
      ).toHaveCount(0);
    }

    await expect(
      page.getByRole('button', { name: 'Log', exact: true }),
      `${context}: the privacy screen must not expose a Log toggle.`,
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Battle log' }),
      `${context}: the privacy screen must not expose the log region.`,
    ).toHaveCount(0);

    const privacyText = normalizeText(
      await page.evaluate(() => document.body.textContent ?? ''),
    );

    expect(
      privacyText,
      `${context}: the privacy screen must not mention the battle log.`,
    ).not.toContain('Battle log');
    expect(
      privacyText,
      `${context}: the privacy screen must not leak the battle-start log line.`,
    ).not.toContain('The battle begins');

    // The assertions above only mean something while the gate is still up.
    await expect(
      privacy,
      `${context}: the privacy assertions must run while the interstitial is visible.`,
    ).toBeVisible();

    // Dismiss explicitly, then prove the active turn carries the public log.
    await dismissPrivacy(page, 'Player 1');
    await expectLogRegion(page, `${context} active turn`);

    const openingLatest = await readLatestText(page, context);
    expect(
      openingLatest,
      `${context}: each round must start with the battle-start sentence, but the strip read "${openingLatest}".`,
    ).toMatch(/^The battle begins\b/);

    const openingEntries = await readLogEntries(page, context);

    expect(
      openingEntries.length,
      `${context}: a fresh round's battle view must hold exactly the battle-start entry.`,
    ).toBe(1);

    // Play one public card and assert the new entry names it and the actor.
    const played = await playOneAffordableCard(page, `${context} active turn`);
    await expectScreen(
      page,
      'battle',
      `${context} after playing ${played.name}`,
    );

    const latest = page.locator(LATEST_SELECTOR);
    await expect(
      latest,
      `${context}: the latest strip must name the played card "${played.name}".`,
    ).toContainText(played.name);
    await expect(
      latest,
      `${context}: the latest strip must name the acting seat "Player 1".`,
    ).toContainText('Player 1');

    const cardLatest = await readLatestText(page, context);
    expect(
      cardLatest,
      `${context}: the newest line must be Player 1's public card play, but it read "${cardLatest}".`,
    ).toMatch(/^Player 1 plays\b/);

    const entries = await readLogEntries(page, context);

    expect(
      entries.length,
      `${context}: one settled duel play must append exactly one public entry.`,
    ).toBe(openingEntries.length + 1);

    // Public-only scan: no catalog name other than the played card may appear
    // anywhere inside the log, including dialogue lines.
    const logText = normalizeText(
      await page
        .locator(LOG_REGION_SELECTOR)
        .evaluate((node) => node.textContent ?? ''),
    );
    const allowed = new Set<string>([played.name]);
    const leaked = CARD_NAMES.filter(
      (name) => !allowed.has(name) && logText.includes(name),
    );

    expect(
      leaked,
      leaked.length === 0
        ? `${context}: only the played card's name may appear in the public log.`
        : `${context}: the public log names cards that were not played: ${leaked.join(
            ', ',
          )}.`,
    ).toEqual([]);

    expect(
      logText.toLowerCase(),
      `${context}: the public log must never state a hand count.`,
    ).not.toContain('in hand');

    const storageKeys = await expectLocalOnly(
      page,
      offOriginRequests,
      context,
    );

    expect(
      storageKeys,
      `${context}: a duel must never write the solo run key; duel logs are never persisted.`,
    ).not.toContain(RUN_SAVE_KEY);

    expectNoConsoleErrors(errors, context);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Phone layout: no horizontal scroll, keyboard drawer (all projects)       */
/* -------------------------------------------------------------------------- */

test.describe('battle log at 375x667', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    reducedMotion: 'no-preference',
  });

  test('the drawer is keyboard operable with no horizontal page scroll', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const context = `375x667 seed ${String(MOBILE_LAYOUT_SEED)}`;
    const errors = collectConsoleErrors(page);

    await openApp(page, MOBILE_LAYOUT_SEED);
    await startSolo(page, 'ember');
    await expectScreen(page, 'battle', context);
    await expectLogRegion(page, context);

    // Closed drawer: the one-line strip must not widen the page.
    await expectNoHorizontalScroll(page);

    const toggle = page.locator(TOGGLE_SELECTOR);

    await expect(
      toggle,
      `${context}: the Log toggle must be visible below the 1024px column breakpoint.`,
    ).toBeVisible();

    const toggleBox = await toggle.boundingBox();

    if (toggleBox === null) {
      throw new Error(`${context}: the Log toggle has no rendered box.`);
    }

    expect(
      toggleBox.width,
      `${context}: the Log toggle is ${toggleBox.width}px wide, below the ${String(
        MIN_TOGGLE_PX,
      )}px minimum.`,
    ).toBeGreaterThanOrEqual(MIN_TOGGLE_PX);
    expect(
      toggleBox.height,
      `${context}: the Log toggle is ${toggleBox.height}px tall, below the ${String(
        MIN_TOGGLE_PX,
      )}px minimum.`,
    ).toBeGreaterThanOrEqual(MIN_TOGGLE_PX);

    // Open with Enter only; the page still may not scroll sideways.
    await openDrawerWithKeyboard(page, context);
    await expectNoHorizontalScroll(page);

    // The newest entry is reachable: the history is scrolled to its bottom.
    const historyAtNewest = await page
      .locator(HISTORY_SELECTOR)
      .evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight <= 2,
      );

    expect(
      historyAtNewest,
      `${context}: the open drawer did not reach its newest entry.`,
    ).toBe(true);

    await expect(
      page.locator(ITEM_SELECTOR).last(),
      `${context}: the newest log entry is not rendered.`,
    ).toBeVisible();

    const endTurn = page.locator('.battle-controls__end');

    await expect(
      endTurn,
      `${context}: End Turn must stay visible while the drawer is open.`,
    ).toBeVisible();
    await expect(
      endTurn,
      `${context}: End Turn must stay enabled while the drawer is open.`,
    ).toBeEnabled();

    // Escape closes and focus returns to the toggle; still no overflow.
    await closeDrawerWithEscape(page, context);
    await expectNoHorizontalScroll(page);

    await expect(
      endTurn,
      `${context}: End Turn must stay reachable after the drawer closes.`,
    ).toBeEnabled();

    expectNoConsoleErrors(errors, context);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Desktop column at 1280x800 (all projects)                                */
/* -------------------------------------------------------------------------- */

test.describe('battle log at 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows the history column without opening a drawer', async ({ page }) => {
    test.setTimeout(90_000);

    const context = `1280x800 seed ${String(DESKTOP_LAYOUT_SEED)}`;
    const errors = collectConsoleErrors(page);

    await openApp(page, DESKTOP_LAYOUT_SEED);
    await startSolo(page, 'ember');
    await expectScreen(page, 'battle', context);

    const region = await expectLogRegion(page, context);

    // The mobile toggle has no job at this width.
    await expect(
      page.locator(TOGGLE_SELECTOR),
      `${context}: the Log drawer toggle must be hidden at 1024px and wider.`,
    ).toBeHidden();

    // The history is a visible column without any activation.
    await expect(
      page.locator(HISTORY_SELECTOR),
      `${context}: the log history column must be visible without opening a drawer.`,
    ).toBeVisible();
    await expect(
      page.locator(ITEM_SELECTOR).first(),
      `${context}: the desktop column must render the battle-start entry.`,
    ).toBeVisible();
    await expect(
      page.locator(LATEST_SELECTOR),
      `${context}: the latest-entry strip must remain visible at 1280px.`,
    ).toBeVisible();

    // The column sits to the right of the board, not stacked under it.
    const boardBox = await page.locator('.battle-board').boundingBox();
    const regionBox = await region.boundingBox();

    if (boardBox === null || regionBox === null) {
      throw new Error(
        `${context}: the board or the log has no rendered box, so the two-column layout cannot be measured.`,
      );
    }

    expect(
      regionBox.x,
      `${context}: the log starts at x=${regionBox.x}, left of the board's right edge ${
        boardBox.x + boardBox.width
      }; it must be the right-hand column.`,
    ).toBeGreaterThanOrEqual(boardBox.x + boardBox.width - 1);

    await expectNoHorizontalScroll(page);

    expectNoConsoleErrors(errors, context);
  });
});
