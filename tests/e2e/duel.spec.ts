/**
 * Seeded best-of-three duel journey with privacy assertions (REL-03,
 * REL-FR-02, DUEL-FR-03).
 *
 * The spec drives the built application through the real UI only:
 *
 *   - menu -> Local Duel -> Player 1 locks Ember -> Player 2 locks Frost ->
 *     Start Match
 *   - for every turn of every round: the full-screen handoff must name the seat
 *     that now owns the device, the battle DOM and every known card name must be
 *     absent, an explicit action dismisses it, and only then does exactly one
 *     hand of five card buttons appear with the opponent reduced to a count
 *   - the greedy policy from `helpers.ts` plays the turn and ends it
 *   - a settled round must show exactly one round result with the score that the
 *     recorded winners imply, and the match must end at two wins
 *   - Rematch must keep both locked decks, reset the score to 0-0 and open the
 *     Player 1 handoff
 *
 * Seeding goes through `?seed=`, which the harness requires and which exercises
 * the app's own seed parsing. The duel's *match* seed is drawn by the built app
 * (`freshDuelSeed` in `App.tsx`) because `src/duel/match.ts` has no URL seed
 * contract, so this journey accepts a 2-0 or a 2-1 series and validates the
 * scoreboard against the winners it actually observes rather than assuming a
 * fixed series. It never touches localStorage, never skips a round and never
 * weakens a privacy assertion.
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  CARD_NAMES,
  CARD_NAME_BY_ID,
  assertPrivacyInvariant,
  collectConsoleErrors,
  currentScreen,
  dismissPrivacy,
  expectNoCardNames,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
  playGreedyTurn,
} from './helpers';

/* -------------------------------------------------------------------------- */
/* Frozen references                                                           */
/* -------------------------------------------------------------------------- */

type Seat = 'Player 1' | 'Player 2';

interface SeriesWins {
  player1: number;
  player2: number;
}

/** Fixed seed for the harness navigation; the app draws the match seed. */
const SEED = 20261031;

/** Whole-journey budget for the Chromium run, in milliseconds. */
const DUEL_BUDGET_MS = 300_000;

/** One iteration per turn; a legal series never gets near this. */
const MAX_TURNS = 240;

/** Best-of-three: the first seat to this many round wins takes the match. */
const WINS_REQUIRED = 2;

/** How long the first handoff is left alone to prove it never self-dismisses. */
const AUTO_DISMISS_WATCH_MS = 750;

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

function otherSeat(seat: Seat): Seat {
  return seat === 'Player 1' ? 'Player 2' : 'Player 1';
}

function seatSlug(seat: Seat): 'player1' | 'player2' {
  return seat === 'Player 1' ? 'player1' : 'player2';
}

/** Documented order: round 1 Player 1, round 2 Player 2, round 3 Player 1. */
function firstPlayerOfRound(round: number): Seat {
  return round === 2 ? 'Player 2' : 'Player 1';
}

function seriesScore(wins: SeriesWins): string {
  return `Series ${String(wins.player1)}\u2013${String(wins.player2)}`;
}

function finalScore(wins: SeriesWins): string {
  return `Final score ${String(wins.player1)}\u2013${String(wins.player2)}`;
}

function winsFor(wins: SeriesWins, seat: Seat): number {
  return seat === 'Player 1' ? wins.player1 : wins.player2;
}

function addWin(wins: SeriesWins, seat: Seat): void {
  if (seat === 'Player 1') {
    wins.player1 += 1;
    return;
  }

  wins.player2 += 1;
}

/* -------------------------------------------------------------------------- */
/* Privacy                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Assert the full privacy handoff for `viewer` through the shared invariant
 * helper (duel-flow §3.2/§8.3): the right title, no board/hand/count/back/meter/
 * field/log, no catalog card name and exactly one dismissal control. Returns
 * the handoff locator so the caller can watch it for auto-dismissal.
 */
async function assertPrivacyScreen(
  page: Page,
  viewer: Seat,
  context: string,
): Promise<Locator> {
  const privacy = await assertPrivacyInvariant(page, viewer, context);

  await expect(
    page.getByRole('heading', { level: 1 }),
    `${context}: the handoff must carry exactly one title.`,
  ).toHaveCount(1);

  return privacy;
}

/* -------------------------------------------------------------------------- */
/* The active turn                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Assert the revealed turn belongs to `viewer` and to nobody else: one hand of
 * five card buttons, every card face inside that hand, an opponent panel with a
 * count and no card faces, and no known card name from outside the active hand.
 */
async function assertActiveTurn(
  page: Page,
  viewer: Seat,
  round: number,
  turn: number,
): Promise<void> {
  const context = `round ${String(round)} turn ${String(turn)}: ${viewer}'s active turn`;

  await expectScreen(page, 'battle', context);

  const board = page.locator('.duel-battle');
  await expect(board, `${context}: the duel board is not rendered.`).toHaveCount(
    1,
  );
  await expect(
    board,
    `${context}: the board must be showing ${viewer}'s side.`,
  ).toHaveAttribute('data-viewer', seatSlug(viewer));
  await expect(
    page.getByRole('heading', { level: 1, name: `${viewer}'s turn`, exact: true }),
    `${context}: the board heading must name ${viewer}.`,
  ).toBeVisible();

  await expect(
    page.locator('.hand'),
    `${context}: exactly one hand may be rendered (the opponent has no hand DOM).`,
  ).toHaveCount(1);
  await expect(
    page.locator('.duel-battle .hand'),
    `${context}: the active hand must be visible.`,
  ).toBeVisible();

  const handCards = page.locator('.duel-battle .hand button.card-view');
  await expect(
    handCards,
    `${context}: the active hand must hold five card buttons.`,
  ).toHaveCount(5);

  const allFaces = await page.locator('button.card-view').count();
  const handFaces = await handCards.count();

  expect(
    allFaces,
    `${context}: ${String(
      allFaces,
    )} card faces exist in the DOM but only the active hand's five may be rendered.`,
  ).toBe(5);
  expect(
    handFaces,
    `${context}: every card face must live inside the active hand; ${String(
      allFaces - handFaces,
    )} were rendered elsewhere.`,
  ).toBe(allFaces);

  const opponent = page.locator('.duel-panel--opponent');
  await expect(
    opponent,
    `${context}: the opponent panel is missing.`,
  ).toHaveCount(1);
  await expect(
    opponent.locator('button.card-view'),
    `${context}: the inactive hand must never render card faces.`,
  ).toHaveCount(0);

  const handCount = opponent.locator('[data-hand-count]');
  await expect(
    handCount,
    `${context}: the opponent must be shown a hand count.`,
  ).toHaveCount(1);
  await expect(
    handCount,
    `${context}: the opponent count must be visible.`,
  ).toBeVisible();
  await expect(
    handCount,
    `${context}: the opponent count must read "<n> card(s) in hand".`,
  ).toHaveText(/^\d+ cards? in hand$/);

  // Any card name in the page must belong to a card in the active hand.
  const activeCardIds = await handCards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-card-id') ?? ''),
  );
  const allowed = new Set<string>();

  for (const cardId of activeCardIds) {
    const name = CARD_NAME_BY_ID.get(cardId);

    if (name === undefined) {
      throw new Error(
        `${context}: the hand shows card id "${cardId}", which is not in the frozen catalog.`,
      );
    }

    allowed.add(name);
  }

  /*
   * The public battle log is part of the active-turn surface by contract
   * (duel-flow §4.10, OVERHAUL §5.9): it names the cards that were *played in
   * the open*, so those names are public facts, not hidden information. The
   * scan therefore reads every surface except the log region; the log's own
   * public-only guarantee is asserted separately in `battle-log.spec.ts`, which
   * proves it can name only the card just played.
   */
  const pageText = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;

    for (const log of Array.from(
      clone.querySelectorAll('[data-battle-log="true"]'),
    )) {
      log.remove();
    }

    return clone.textContent ?? '';
  });
  const appearing = CARD_NAMES.filter((name) => pageText.includes(name));

  // The active hand's names must be visible to the scan; otherwise the privacy
  // check that uses the same scan would pass without reading the DOM at all.
  expect(
    appearing.length,
    `${context}: the card-name scan found no hand name in the rendered DOM, so it cannot be trusted.`,
  ).toBeGreaterThan(0);

  const leaked = appearing.filter((name) => !allowed.has(name));

  expect(
    leaked,
    leaked.length === 0
      ? `${context}: only the active hand's card names may appear.`
      : `${context}: card names from outside the active hand are in the DOM: ${leaked.join(
          ', ',
        )}.`,
  ).toEqual([]);
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Read and validate a round result that does not end the series. Exactly one
 * result surface may be visible, no hand or card face may survive, and the
 * heading must name the settled round. Returns the parsed winner so the caller
 * can score it.
 */
async function readRoundResult(
  page: Page,
  round: number,
  context: string,
): Promise<Seat> {
  await expectScreen(page, 'round-result', context);
  await expect(
    page.locator('[data-duel-result="round"]'),
    `${context}: a settled round must show exactly one round result.`,
  ).toHaveCount(1);
  await expect(
    page.locator('[data-duel-result="match"]'),
    `${context}: a round that leaves the series alive must not show the match result.`,
  ).toHaveCount(0);
  await expect(
    page.locator('.hand'),
    `${context}: the round result must not render a hand.`,
  ).toHaveCount(0);
  await expect(
    page.locator('button.card-view'),
    `${context}: the round result must not render card faces.`,
  ).toHaveCount(0);
  await expectNoCardNames(page, context);

  const headings = page.getByRole('heading', { level: 1 });
  await expect(
    headings,
    `${context}: the round result must carry exactly one heading.`,
  ).toHaveCount(1);

  const heading = (await headings.innerText()).trim();
  const parsed = /^(Player [12]) wins round (\d+)$/.exec(heading);

  if (parsed === null) {
    throw new Error(
      `${context}: the round result heading "${heading}" does not name a winner and round.`,
    );
  }

  const winner = parsed[1] as Seat;
  const reportedRound = parsed[2];

  expect(
    reportedRound,
    `${context}: the result must report round ${String(round)}, not ${String(
      reportedRound,
    )}.`,
  ).toBe(String(round));

  // The deterministic public next opener is text, never a pip interpretation.
  await expect(
    page.getByText(
      `Next round: ${firstPlayerOfRound(round + 1)} opens.`,
      { exact: true },
    ),
    `${context}: the round result must name the deterministic next opener.`,
  ).toBeVisible();

  // The same three-pip strip as the board, with this round's winner recorded.
  const strip = page.getByRole('list', { name: 'Series score' });

  await expect(
    strip,
    `${context}: the round result must carry exactly one series strip.`,
  ).toHaveCount(1);

  const pips = strip.locator('[data-series-pip]');
  await expect(
    pips,
    `${context}: the series strip must have exactly three named pips.`,
  ).toHaveCount(3);

  for (let index = 0; index < 3; index += 1) {
    await expect(
      pips.nth(index),
      `${context}: pip ${String(index + 1)} must be named by its round.`,
    ).toContainText(`Round ${String(index + 1)}:`);
  }

  return winner;
}

/**
 * Read and validate the match result. The displayed final score must equal the
 * recorded wins plus the round just settled, end at two for the winner, and the
 * settled-round count must match the number of round results already seen.
 */
function checkMatchResult(
  heading: string,
  scoreText: string,
  recorded: SeriesWins,
  roundResultsSeen: number,
  context: string,
): { readonly winner: Seat; readonly final: SeriesWins } {
  const headingMatch = /^(Player [12]) wins the match$/.exec(heading);

  if (headingMatch === null) {
    throw new Error(
      `${context}: the match result heading "${heading}" does not name the series winner.`,
    );
  }

  const winner = headingMatch[1] as Seat;
  const loser = otherSeat(winner);
  const scoreMatch = /^Final score (\d+)\u2013(\d+)$/.exec(scoreText);

  if (scoreMatch === null) {
    throw new Error(
      `${context}: the match result score "${scoreText}" is not "Final score a-b".`,
    );
  }

  const final: SeriesWins = {
    player1: Number(scoreMatch[1]),
    player2: Number(scoreMatch[2]),
  };
  const recordedWinner = winsFor(recorded, winner);
  const recordedLoser = winsFor(recorded, loser);

  expect(
    winsFor(final, winner),
    `${context}: ${winner} wins the match with two round wins.`,
  ).toBe(WINS_REQUIRED);
  expect(
    winsFor(final, loser),
    `${context}: the losing seat must finish on 0 or 1 round wins.`,
  ).toBeLessThan(WINS_REQUIRED);
  expect(
    winsFor(final, loser),
    `${context}: the score must keep ${loser}'s recorded ${String(
      recordedLoser,
    )} round win(s).`,
  ).toBe(recordedLoser);
  expect(
    winsFor(final, winner),
    `${context}: the score must credit ${winner} with the recorded ${String(
      recordedWinner,
    )} win(s) plus the round just settled.`,
  ).toBe(recordedWinner + 1);

  const roundsPlayed = final.player1 + final.player2;

  expect(
    roundsPlayed,
    `${context}: a best-of-three ends after two or three rounds.`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    roundsPlayed,
    `${context}: a best-of-three ends after two or three rounds.`,
  ).toBeLessThanOrEqual(3);
  expect(
    roundsPlayed,
    `${context}: ${String(
      roundsPlayed,
    )} rounds were played but only ${String(
      roundResultsSeen,
    )} round results were shown before the match result.`,
  ).toBe(roundResultsSeen + 1);

  return { winner, final };
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                       */
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
 * Menu -> Local Duel -> Player 1 deck -> Player 2 deck -> Start Match. The
 * second step must not reveal the first pick, and the summary must name both.
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
  await expect(
    page.locator('.duel-setup .solo-decks [aria-pressed="true"]'),
    "Player 2's step must not reveal or pre-select Player 1's deck.",
  ).toHaveCount(0);

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

  const picks = page.locator('.duel-setup__picks');
  await expect(
    picks,
    `The locked summary must name Player 1's ${player1Deck} deck.`,
  ).toContainText(`Player 1: ${player1Deck}`);
  await expect(
    picks,
    `The locked summary must name Player 2's ${player2Deck} deck.`,
  ).toContainText(`Player 2: ${player2Deck}`);

  await page.getByRole('button', { name: 'Start Match', exact: true }).click();
}

/* -------------------------------------------------------------------------- */
/* The journey                                                                 */
/* -------------------------------------------------------------------------- */

test.describe('seeded best-of-three duel', () => {
  // The long journey is Chromium-only by design (release-verification.md 4.1).
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The full best-of-three duel journey runs on Chromium only.',
  );

  test('holds the setup, privacy and board geometry at all five viewports', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const errors = collectConsoleErrors(page);
    const viewports = [
      { label: '375x667', width: 375, height: 667 },
      { label: '390x844', width: 390, height: 844 },
      { label: '768x1024', width: 768, height: 1024 },
      { label: '1024x768', width: 1024, height: 768 },
      { label: '1280x800', width: 1280, height: 800 },
    ] as const;

    const noPageScroll = async (context: string) => {
      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }));

      expect(
        metrics.scrollWidth,
        `${context}: the page scrolled sideways (${String(
          metrics.scrollWidth,
        )} > ${String(metrics.innerWidth)}).`,
      ).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(
        metrics.scrollHeight,
        `${context}: the surface page-scrolled (${String(
          metrics.scrollHeight,
        )} > ${String(metrics.innerHeight)}).`,
      ).toBeLessThanOrEqual(metrics.innerHeight + 1);
    };

    const minimumTargets = async (context: string) => {
      const boxes = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('#main-content button'))
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              label:
                node.getAttribute('aria-label') ??
                (node.textContent ?? '').trim().slice(0, 40),
              width: rect.width,
              height: rect.height,
            };
          }),
      );

      for (const box of boxes) {
        expect(
          box.width,
          `${context}: "${box.label}" is ${String(box.width)}px wide.`,
        ).toBeGreaterThanOrEqual(43.5);
        expect(
          box.height,
          `${context}: "${box.label}" is ${String(box.height)}px tall.`,
        ).toBeGreaterThanOrEqual(43.5);
      }
    };

    await openApp(page, SEED);
    await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
    await expectScreen(page, 'duel-setup', 'the five-viewport sweep');

    // Step 1: four physical deck cards, all ten names, the look-away banner.
    for (const viewport of viewports) {
      const context = `setup step 1 at ${viewport.label}`;
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Player 1, choose your deck',
          exact: true,
        }),
        `${context}: the step question is missing.`,
      ).toBeVisible();
      await expect(
        page.getByText('Player 2, look away.', { exact: true }),
        `${context}: the look-away banner is missing.`,
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^Choose the .* deck$/ }),
        `${context}: the deck table must offer four deck cards.`,
      ).toHaveCount(4);
      await expect(
        page.locator('.duel-setup .solo-deck').first(),
        `${context}: the first deck card does not list ten printed names.`,
      ).toContainText('10 cards');
      await minimumTargets(context);
    }

    // Step 2: the sealed marker names nothing, and no deck is pre-selected.
    await page.setViewportSize(viewports[0]);
    await chooseDeck(page, 'Ember');
    await page
      .getByRole('button', { name: 'Confirm Player 1 deck', exact: true })
      .click();

    for (const viewport of viewports) {
      const context = `setup step 2 at ${viewport.label}`;
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Player 2, choose your deck',
          exact: true,
        }),
        `${context}: the step question is missing.`,
      ).toBeVisible();
      await expect(
        page.getByText('Player 1 has chosen.', { exact: true }),
        `${context}: the step banner is missing.`,
      ).toBeVisible();
      await expect(
        page.locator('.duel-setup .solo-decks [aria-pressed="true"]'),
        `${context}: Player 1's pick must not be selected or revealed.`,
      ).toHaveCount(0);

      const sealed = page.locator('[data-duel-sealed="true"]');

      await expect(
        sealed,
        `${context}: the sealed pick marker is missing.`,
      ).toBeVisible();
      await expect(
        sealed,
        `${context}: the sealed marker must say the deck is locked.`,
      ).toContainText("Player 1's deck is locked");
      expect(
        await sealed.getAttribute('data-element'),
        `${context}: the sealed marker must carry no element attribution.`,
      ).toBeNull();
      await expect(
        sealed.locator('[aria-label]'),
        `${context}: the sealed marker must not name the pick in aria-label.`,
      ).toHaveCount(0);
      await minimumTargets(context);
    }

    // Summary: both locked cards and the exact public lines.
    await page.setViewportSize(viewports[0]);
    await chooseDeck(page, 'Frost');
    await page
      .getByRole('button', { name: 'Confirm Player 2 deck', exact: true })
      .click();

    for (const viewport of viewports) {
      const context = `setup summary at ${viewport.label}`;
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Both decks are locked',
          exact: true,
        }),
        `${context}: the locked summary is missing.`,
      ).toBeVisible();
      await expect(
        page.locator('.duel-setup__picks'),
        `${context}: the summary must name both locked decks.`,
      ).toContainText('Player 1: Ember');
      await expect(
        page.locator('.duel-setup__picks'),
        `${context}: the summary must name both locked decks.`,
      ).toContainText('Player 2: Frost');
      await expect(
        page.locator('.duel-locked'),
        `${context}: the summary must show two locked deck cards.`,
      ).toHaveCount(2);
      await minimumTargets(context);
    }

    // Privacy: fixed, opaque, one action, no board at every width.
    await page.setViewportSize(viewports[0]);
    await page.getByRole('button', { name: 'Start Match', exact: true }).click();

    for (const viewport of viewports) {
      const context = `privacy at ${viewport.label}`;
      await page.setViewportSize(viewport);

      const privacy = await assertPrivacyInvariant(page, 'Player 1', context);

      await privacy.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished));
      });

      const cover = await page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>('.duel-privacy');
        const rect = surface?.getBoundingClientRect();
        const style = surface === null ? null : getComputedStyle(surface);

        return {
          position: style?.position ?? '',
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          background: style?.backgroundColor ?? '',
          buttons: document.querySelectorAll('.duel-privacy button').length,
        };
      });

      expect(cover.position, `${context}: privacy must be a fixed surface.`).toBe(
        'fixed',
      );
      expect(
        cover.width,
        `${context}: the privacy surface must cover the viewport width.`,
      ).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(
        cover.height,
        `${context}: the privacy surface must cover the viewport height.`,
      ).toBeGreaterThanOrEqual(viewport.height - 1);
      expect(
        cover.background,
        `${context}: the privacy surface must be fully opaque.`,
      ).toMatch(/^rgb\(/);
      expect(
        cover.buttons,
        `${context}: privacy must offer exactly one action.`,
      ).toBe(1);
      await noPageScroll(context);
      await minimumTargets(context);
    }

    // The board: no page scroll, one hand, the documented bands and rail.
    await dismissPrivacy(page, 'Player 1');

    for (const viewport of viewports) {
      const context = `duel board at ${viewport.label}`;
      await page.setViewportSize(viewport);
      await expectScreen(page, 'battle', context);
      await expectNoHorizontalScroll(page);
      await noPageScroll(context);
      await minimumTargets(context);

      await expect(
        page.locator('.duel-battle'),
        `${context}: exactly one duel board may be mounted.`,
      ).toHaveCount(1);
      await expect(
        page.locator('.hand'),
        `${context}: only the viewer's hand may exist.`,
      ).toHaveCount(1);
      await expect(
        page.locator('.hand button.card-view'),
        `${context}: the active hand must hold five card buttons.`,
      ).toHaveCount(5);
      await expect(
        page.locator('.duel-panel--opponent button.card-view'),
        `${context}: the opponent must never render card faces.`,
      ).toHaveCount(0);
      await expect(
        page.locator('[data-hand-count]'),
        `${context}: the opponent hand count is missing.`,
      ).toHaveText(/^\d+ cards? in hand$/);
      await expect(
        page.locator('.duel-panel--self'),
        `${context}: the self panel must name the locked Ember deck.`,
      ).toContainText('Ember deck');
      await expect(
        page.locator('.duel-panel--opponent'),
        `${context}: the opponent panel must name the locked Frost deck.`,
      ).toContainText('Frost deck');
      await expect(
        page.locator('.duel-header__eyebrow .shell__eyebrow'),
        `${context}: the header must carry Round 1 and the score.`,
      ).toContainText('Round 1 · Series 0–0');
      await expect(
        page.locator('.duel-header [data-series-pip]'),
        `${context}: the header must carry the three-pip strip.`,
      ).toHaveCount(3);
      await expect(
        page.getByRole('button', { name: 'End Turn', exact: true }),
        `${context}: End Turn must be live on the active turn.`,
      ).toBeEnabled();

      const bands = await page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (element === null) {
            return null;
          }
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        };

        return {
          opponent: box('.duel-panel--opponent'),
          hand: box('.hand'),
          rail: box('[data-battle-log="true"]'),
          card: box('.hand__item'),
        };
      });

      const expectedOpponent =
        viewport.width === 375
          ? 132
          : viewport.width === 390
            ? 150
            : viewport.width === 768
              ? 160
              : 140;

      expect(
        Math.abs((bands.opponent?.height ?? 0) - expectedOpponent),
        `${context}: the opponent band measured ${String(
          bands.opponent?.height,
        )}px, expected ${String(expectedOpponent)} ±8.`,
      ).toBeLessThanOrEqual(8);

      const expectedCard =
        viewport.width >= 1280
          ? { width: 138, height: 194 }
          : viewport.width >= 1024
            ? { width: 118, height: 168 }
            : viewport.width >= 768
              ? { width: 118, height: 168 }
              : viewport.width <= 375
                ? { width: 108, height: 136 }
                : { width: 108, height: 152 };

      expect(
        Math.abs((bands.card?.width ?? 0) - expectedCard.width),
        `${context}: the card width measured ${String(bands.card?.width)}px.`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs((bands.card?.height ?? 0) - expectedCard.height),
        `${context}: the card height measured ${String(bands.card?.height)}px.`,
      ).toBeLessThanOrEqual(2);

      if (viewport.width >= 1024) {
        const expectedRail = viewport.width >= 1280 ? 288 : 240;

        expect(
          Math.abs((bands.rail?.width ?? 0) - expectedRail),
          `${context}: the log rail measured ${String(
            bands.rail?.width,
          )}px, expected ${String(expectedRail)}.`,
        ).toBeLessThanOrEqual(1);
      } else {
        await expect(
          page.locator('[data-battle-log="true"]'),
          `${context}: the log is a footer strip plus drawer below 1024.`,
        ).toHaveCSS('display', 'contents');
      }
    }

    expectNoConsoleErrors(errors, 'the five-viewport duel sweep');
  });

  test('completes a best-of-three with a privacy handoff before every turn', async ({
    page,
  }) => {
    test.setTimeout(DUEL_BUDGET_MS);

    const startedAt = Date.now();
    const errors = collectConsoleErrors(page);

    await openApp(page, SEED);

    // No duel is offered before the match starts; a duel is ephemeral.
    await expect(
      page.getByRole('button', { name: 'Continue Run', exact: true }),
      'A fresh context must not offer a resumable duel or run.',
    ).toHaveCount(0);

    await startDuel(page, 'Ember', 'Frost');
    await expectScreen(page, 'privacy', 'Start Match');

    const wins: SeriesWins = { player1: 0, player2: 0 };
    const journeyLog: string[] = [];
    let round = 1;
    let turn = 0;
    let handoffs = 0;
    let roundResultsSeen = 0;
    let expectedViewer: Seat = firstPlayerOfRound(1);
    let matchFinished = false;
    let finalWinner: Seat | null = null;

    for (let index = 0; index < MAX_TURNS; index += 1) {
      turn += 1;
      const context = `round ${String(round)} turn ${String(
        turn,
      )} (${expectedViewer})`;

      // 1. Every turn, without exception, begins behind the privacy handoff.
      const privacy = await assertPrivacyScreen(page, expectedViewer, context);

      if (handoffs === 0) {
        // The handoff must never dismiss itself and Escape must be inert.
        await page.waitForTimeout(AUTO_DISMISS_WATCH_MS);
        await expect(
          privacy,
          `${context}: the handoff dismissed itself without an explicit action.`,
        ).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(
          privacy,
          `${context}: Escape must not dismiss the privacy handoff.`,
        ).toBeVisible();
        await expectScreen(page, 'privacy', `${context} after Escape`);
        await expect(
          page.locator('.duel-battle'),
          `${context}: Escape revealed the board; the handoff must stay opaque.`,
        ).toHaveCount(0);

        // Enter is the documented second explicit path; the first handoff uses
        // it so both activation routes are exercised, not just the tap.
        const ready = page.getByRole('button', {
          name: "I'm ready",
          exact: true,
        });
        await ready.focus();
        await page.keyboard.press('Enter');
        await expect(
          privacy,
          `${context}: Enter did not dismiss the handoff.`,
        ).toHaveCount(0);
        await expectScreen(page, 'battle', `${context} after Enter`);
      } else {
        await dismissPrivacy(page, expectedViewer);
      }

      handoffs += 1;

      // 2. Only the active viewer's five-card hand may be present.
      await assertActiveTurn(page, expectedViewer, round, turn);

      // 3. Play the turn for real; a settled or handed-off turn is the only
      //    legal way out of the board.
      const played = await playGreedyTurn(page);
      const after = await currentScreen(page);

      if (after === 'battle') {
        throw new Error(
          `${context}: the turn did not end (${String(
            played.cardsPlayed,
          )} cards played) and the board is still active.`,
        );
      }

      journeyLog.push(
        `${context}: ${String(played.cardsPlayed)} card(s), ended=${
          played.endedTurn ? 'yes' : 'battle settled'
        } -> ${String(after)}`,
      );

      if (after === 'privacy') {
        // The turn passed to the other seat; the next loop starts at its gate.
        expectedViewer = otherSeat(expectedViewer);
        continue;
      }

      if (after === 'round-result') {
        const winner = await readRoundResult(page, round, context);
        addWin(wins, winner);
        roundResultsSeen += 1;

        await expect(
          page.locator('.duel-result__score'),
          `${context}: the round result must show the series score implied by the recorded winners (${seriesScore(
            wins,
          )}).`,
        ).toHaveText(seriesScore(wins));

        if (winsFor(wins, winner) >= WINS_REQUIRED) {
          throw new Error(
            `${context}: ${winner} reached ${String(
              WINS_REQUIRED,
            )} wins but a round result was shown instead of the match result.`,
          );
        }

        const nextRound = round + 1;
        await page.getByRole('button', { name: 'Next Round', exact: true }).click();
        await expectScreen(
          page,
          'privacy',
          `${context}: Next Round must open round ${String(
            nextRound,
          )}'s handoff before its first turn`,
        );

        round = nextRound;
        expectedViewer = firstPlayerOfRound(round);
        continue;
      }

      if (after === 'match-result') {
        await expect(
          page.locator('[data-duel-result="match"]'),
          `${context}: the match result must be rendered exactly once.`,
        ).toHaveCount(1);
        await expect(
          page.locator('[data-duel-result="round"]'),
          `${context}: the match result must replace the round result.`,
        ).toHaveCount(0);
        await expect(
          page.locator('.hand'),
          `${context}: the match result must not render a hand.`,
        ).toHaveCount(0);
        await expect(
          page.locator('button.card-view'),
          `${context}: the match result must not render card faces.`,
        ).toHaveCount(0);
        await expectNoCardNames(page, context);

        const headings = page.getByRole('heading', { level: 1 });
        await expect(
          headings,
          `${context}: the match result must carry exactly one heading.`,
        ).toHaveCount(1);
        const heading = (await headings.innerText()).trim();
        const scoreText = (
          await page.locator('.duel-result__score').innerText()
        ).trim();

        const decided = checkMatchResult(
          heading,
          scoreText,
          wins,
          roundResultsSeen,
          `${context} match result`,
        );
        finalWinner = decided.winner;
        wins.player1 = decided.final.player1;
        wins.player2 = decided.final.player2;
        matchFinished = true;

        for (const action of ['Rematch', 'Change decks', 'Menu']) {
          await expect(
            page.getByRole('button', { name: action, exact: true }),
            `${context}: the match result must offer ${action}.`,
          ).toBeVisible();
        }

        // The match strip is the same public record as the board: one played
        // pip per completed round, each named by its round winner.
        const matchPips = page.locator(
          '[data-duel-result="match"] [data-series-pip]',
        );

        await expect(
          matchPips,
          `${context}: the match result must carry exactly three pips.`,
        ).toHaveCount(3);

        const pipWinners = await matchPips.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-round-winner') ?? ''),
        );

        expect(
          pipWinners.filter((winner) => winner === 'player1').length,
          `${context}: the strip must credit Player 1 with ${String(
            wins.player1,
          )} round win(s).`,
        ).toBe(wins.player1);
        expect(
          pipWinners.filter((winner) => winner === 'player2').length,
          `${context}: the strip must credit Player 2 with ${String(
            wins.player2,
          )} round win(s).`,
        ).toBe(wins.player2);

        for (let index = 0; index < 3; index += 1) {
          await expect(
            matchPips.nth(index),
            `${context}: pip ${String(index + 1)} must be named by its round.`,
          ).toContainText(`Round ${String(index + 1)}:`);
        }

        break;
      }

      throw new Error(
        `${context}: the duel left the known surfaces at "${String(
          after,
        )}".\nJourney so far:\n${journeyLog.join('\n')}`,
      );
    }

    if (!matchFinished || finalWinner === null) {
      throw new Error(
        `The duel did not reach a match result within ${String(
          MAX_TURNS,
        )} turns (recorded score ${String(wins.player1)}-${String(
          wins.player2,
        )}).\nJourney so far:\n${journeyLog.join('\n')}`,
      );
    }

    // 4. Rematch keeps both locked decks, resets the score and returns to the
    //    Player 1 handoff. The privacy screen carries no score, so the reset is
    //    proved on the board that follows the explicit dismissal.
    await page.getByRole('button', { name: 'Rematch', exact: true }).click();

    await assertPrivacyScreen(page, 'Player 1', 'the rematch handoff');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pass to Player 1', exact: true }),
      'A rematch must open with the Player 1 privacy handoff (round 1, Player 1 first).',
    ).toBeVisible();

    await dismissPrivacy(page, 'Player 1');
    await assertActiveTurn(page, 'Player 1', 1, 1);

    // The eyebrow is CSS-uppercased for presentation, so read the authored DOM
    // text rather than the painted `innerText`.
    const rematchHeader = (
      (await page.locator('.duel-battle .shell__eyebrow').textContent()) ?? ''
    ).trim();

    expect(
      rematchHeader,
      `A rematch must return to Round 1 with a 0-0 series, but the board header read "${rematchHeader}".`,
    ).toContain('Round 1');
    expect(
      rematchHeader,
      `A rematch must reset the series to 0\u20130, but the board header read "${rematchHeader}".`,
    ).toContain('Series 0\u20130');

    await expect(
      page.locator('.duel-battle .duel-header__turn'),
      'A rematch must start again on turn 1.',
    ).toHaveText(/^Turn 1$/i);
    await expect(
      page.locator('.duel-panel--self'),
      "A rematch must keep Player 1's locked Ember deck.",
    ).toContainText('Ember deck');
    await expect(
      page.locator('.duel-panel--opponent'),
      "A rematch must keep Player 2's locked Frost deck.",
    ).toContainText('Frost deck');

    // 5. Leaving is immediate: no confirmation dialog, the series discarded and
    //    the menu without a Continue Run entry. A duel never writes storage.
    await page.getByRole('button', { name: 'Leave duel', exact: true }).click();
    await expectScreen(page, 'menu', 'leaving the duel');
    await expect(
      page.getByRole('button', { name: 'Continue Run', exact: true }),
      'Leaving a duel must not leave a resumable entry behind.',
    ).toHaveCount(0);

    const storageKeys = await page.evaluate(() => Object.keys(localStorage));

    expect(
      storageKeys.filter((key) => key.toLowerCase().includes('duel')),
      'A duel must never write a storage key.',
    ).toEqual([]);

    expectNoConsoleErrors(
      errors,
      `the best-of-three duel (${String(wins.player1)}\u2013${String(
        wins.player2,
      )}, ${String(handoffs)} handoffs)`,
    );

    expect(
      Date.now() - startedAt,
      `The Chromium duel journey exceeded its ${String(
        DUEL_BUDGET_MS,
      )}ms budget.`,
    ).toBeLessThan(DUEL_BUDGET_MS);
  });
});
