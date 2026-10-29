/**
 * Shared Playwright helpers for the Fieldbound release suite.
 *
 * Every helper drives the committed production UI: no app module is imported,
 * no storage is written directly and no game state is injected. Seed selection
 * goes through `?seed=` so the run's own seeding path is exercised.
 *
 * Missing elements are failures, not skips. Each assertion carries the seed,
 * viewport or action being attempted so a failing rerun is actionable.
 */
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** The four starter elements a solo run or duel deck can use. */
export type FieldElement = 'ember' | 'frost' | 'gale' | 'stone';

/** A duel seat, accepted in the forms the UI and specs use. */
export type DuelSeat =
  | 'player1'
  | 'player2'
  | 'Player 1'
  | 'Player 2'
  | 1
  | 2;

/** Printed card types, read back from a hand card's accessible name. */
export type VisibleCardType = 'attack' | 'ward' | 'utility' | 'shift' | 'unknown';

export interface VisibleHandCard {
  readonly instanceId: string;
  readonly element: string;
  readonly affordable: boolean;
  readonly type: VisibleCardType;
  readonly label: string;
}

export interface GreedyTurnResult {
  readonly cardsPlayed: number;
  readonly endedTurn: boolean;
}

const DECK_NAMES: Readonly<Record<FieldElement, string>> = {
  ember: 'Ember',
  frost: 'Frost',
  gale: 'Gale',
  stone: 'Stone',
};

/** Largest unsigned 32-bit seed the run seed parser accepts. */
const MAX_SEED = 0xffff_ffff;

/**
 * The URL for a seeded session. Rejects anything that is not an unsigned
 * 32-bit integer so a test cannot accidentally smuggle a non-numeric seed past
 * the app's parser and pass by luck.
 */
export function seededPath(seed: number): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new Error(
      `openApp needs an unsigned 32-bit integer seed; received ${String(seed)}.`,
    );
  }

  return `/?seed=${seed}`;
}

/** Fail with every collected browser error, never a silent pass. */
export function expectNoConsoleErrors(
  errors: readonly string[],
  label = 'the page',
): void {
  expect(
    [...errors],
    `Console or page errors were recorded while exercising ${label}:\n${
      errors.length === 0 ? '(none)' : errors.join('\n')
    }`,
  ).toEqual([]);
}

/**
 * Record `console.error` output and uncaught page errors for the rest of the
 * session. Call before `openApp` so startup failures are included. The returned
 * array keeps growing; assert it only after the scenario has finished.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }

    const location = message.location();
    const at = location.url
      ? ` (${location.url}:${String(location.lineNumber)})`
      : '';
    errors.push(`console.error: ${message.text()}${at}`);
  });

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  return errors;
}

/** Read the router's current surface from the main landmark. */
export async function currentScreen(page: Page): Promise<string | null> {
  return page.locator('#main-content').getAttribute('data-screen');
}

/** Assert the router is on one surface, naming it in the failure message. */
export async function expectScreen(
  page: Page,
  kind: string,
  detail = '',
): Promise<void> {
  const suffix = detail === '' ? '' : ` for ${detail}`;
  await expect(
    page.locator('#main-content'),
    `Expected the ${kind} screen${suffix}, but the main landmark reported a different data-screen.`,
  ).toHaveAttribute('data-screen', kind);
}

/**
 * Navigate to `/?seed=<n>` and prove the app landed on the menu with that exact
 * numeric seed still in the URL.
 */
export async function openApp(page: Page, seed: number): Promise<void> {
  const path = seededPath(seed);
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

  if (response === null || !response.ok()) {
    throw new Error(
      `Seeded navigation to ${path} did not return a document (status ${
        response === null ? 'no response' : String(response.status())
      }). Is the production build being served?`,
    );
  }

  await expect(
    page,
    `The numeric seed ${seed} must survive navigation to the menu.`,
  ).toHaveURL((url) => {
    const raw = url.searchParams.get('seed');
    return raw !== null && /^\d+$/.test(raw) && Number(raw) === seed;
  });

  await expectScreen(page, 'menu', `seed ${seed}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    `The menu heading is missing for seed ${seed}.`,
  ).toBeVisible();
}

/**
 * Menu -> Solo Run setup -> choose the starter deck -> Start Run -> battle.
 * Throws if any step does not reach its next surface.
 */
export async function startSolo(
  page: Page,
  element: FieldElement,
): Promise<void> {
  const deckName = DECK_NAMES[element];

  if (deckName === undefined) {
    throw new Error(
      `startSolo needs one of ember, frost, gale or stone; received ${String(element)}.`,
    );
  }

  await expectScreen(page, 'menu', 'startSolo');
  await page.getByRole('button', { name: 'Play Solo', exact: true }).click();
  await expectScreen(page, 'solo-setup', `choosing ${deckName}`);

  const deck = page.getByRole('button', {
    name: `Choose the ${deckName} deck`,
    exact: true,
  });
  await deck.click();
  await expect(
    deck,
    `The ${deckName} deck did not report itself as selected.`,
  ).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Start Run', exact: true }).click();
  await expectScreen(page, 'battle', `${deckName} run`);
  await expect(
    page.locator('.battle-board'),
    `The ${deckName} run opened without a battle board.`,
  ).toBeVisible();
}

function seatName(player: DuelSeat): 'Player 1' | 'Player 2' {
  if (player === 1 || player === 'player1' || player === 'Player 1') {
    return 'Player 1';
  }

  if (player === 2 || player === 'player2' || player === 'Player 2') {
    return 'Player 2';
  }

  throw new Error(
    `dismissPrivacy needs Player 1 or Player 2; received ${String(player)}.`,
  );
}

/**
 * Wait for the privacy handoff addressed to `player`, then activate the only
 * dismissal control. The battle must be mounted afterwards; a privacy screen
 * that silently disappears or a handoff for the wrong seat fails loudly.
 */
export async function dismissPrivacy(
  page: Page,
  player: DuelSeat,
): Promise<void> {
  const expected = seatName(player);
  const privacy = page.locator('[data-duel-privacy="true"]');

  await expect(
    privacy,
    `Expected the privacy handoff before ${expected}'s turn.`,
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: `Pass to ${expected}` }),
    `The privacy screen did not name ${expected}.`,
  ).toBeVisible();

  const ready = page.getByRole('button', { name: "I'm ready", exact: true });
  await ready.click();

  await expect(
    privacy,
    `The privacy handoff for ${expected} did not close after activating I'm ready.`,
  ).toHaveCount(0);
  await expectScreen(page, 'battle', `${expected}'s turn`);
}

/** Assert the page itself never scrolls sideways at the current viewport. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  const widest = Math.max(metrics.scrollWidth, metrics.bodyScrollWidth);

  expect(
    widest,
    `Horizontal overflow at a ${metrics.innerWidth}px viewport: document.scrollWidth=${metrics.scrollWidth}, body.scrollWidth=${metrics.bodyScrollWidth}.`,
  ).toBeLessThanOrEqual(metrics.innerWidth);
}

/** Read the active hand exactly as the DOM presents it. */
async function readHand(page: Page): Promise<VisibleHandCard[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hand .card-view')).map(
      (element) => {
        const label = element.getAttribute('aria-label') ?? '';
        const match = label.match(
          /\b(?:ember|frost|gale|stone|neutral)\s+(attack|ward|utility|shift)\b/i,
        );

        return {
          instanceId: element.dataset.instanceId ?? '',
          element: element.dataset.element ?? '',
          affordable: element.dataset.affordable === 'true',
          type: (match?.[1]?.toLowerCase() ?? 'unknown') as VisibleCardType,
          label,
        };
      },
    ),
  );
}

/** The active field, as stated by the shared field banner. */
async function readField(page: Page): Promise<string> {
  const field = await page.locator('.field-banner').first().getAttribute('data-field');

  return field ?? 'neutral';
}

const CARD_TYPE_ORDER: Readonly<Record<VisibleCardType, number>> = {
  attack: 0,
  ward: 1,
  utility: 2,
  shift: 3,
  unknown: 4,
};

/**
 * Greedy ordering: cards matching the active field first, then attacks before
 * wards, then the fixed utility/shift order, preserving DOM order otherwise.
 */
function greedyOrder(
  cards: readonly VisibleHandCard[],
  field: string,
): VisibleHandCard[] {
  return [...cards].sort((left, right) => {
    const leftField = left.element === field ? 0 : 1;
    const rightField = right.element === field ? 0 : 1;

    if (leftField !== rightField) {
      return leftField - rightField;
    }

    return CARD_TYPE_ORDER[left.type] - CARD_TYPE_ORDER[right.type];
  });
}

async function boardIsOpen(page: Page): Promise<boolean> {
  if ((await currentScreen(page)) !== 'battle') {
    return false;
  }

  return (await page.locator('.battle-board, .duel-battle').count()) > 0;
}

function handSignature(cards: readonly VisibleHandCard[], energy: string): string {
  return `${energy}|${cards.map((card) => card.instanceId).join(',')}`;
}

/** One state marker that changes whenever the turn or surface changes. */
async function turnMarker(page: Page): Promise<string> {
  return page.evaluate(() => {
    const screen =
      document.querySelector('#main-content')?.getAttribute('data-screen') ??
      'no-screen';
    const turn =
      document.querySelector('.battle-board__turn, .duel-battle__turn')
        ?.textContent ?? 'no-turn';

    return `${screen}|${turn}`;
  });
}

/**
 * Play a turn with a fixed greedy policy, then end it.
 *
 * Affordable cards are played one at a time through the real card detail sheet,
 * ordered by field match and card type. The turn ends with the End Turn button
 * (or is left alone when the battle settled). Every play must change the hand
 * or energy; otherwise the helper throws instead of spinning.
 */
export async function playGreedyTurn(page: Page): Promise<GreedyTurnResult> {
  if (!(await boardIsOpen(page))) {
    throw new Error(
      `playGreedyTurn needs the battle screen; the router currently reports "${String(
        await currentScreen(page),
      )}".`,
    );
  }

  const maxPlays = 24;
  let cardsPlayed = 0;

  while (cardsPlayed < maxPlays) {
    if (!(await boardIsOpen(page))) {
      break;
    }

    const cards = await readHand(page);
    const affordable = cards.filter((card) => card.affordable);

    if (affordable.length === 0) {
      break;
    }

    const field = await readField(page);
    const chosen = greedyOrder(affordable, field)[0];

    if (chosen === undefined) {
      throw new Error('Greedy ordering returned no card despite an affordable hand.');
    }

    const energyText =
      (await page.locator('.battle-controls__energy').first().textContent()) ?? '';
    const before = handSignature(cards, energyText);

    const card = page.locator(
      `.hand .card-view[data-instance-id="${chosen.instanceId}"]`,
    );
    await expect(
      card,
      `The chosen hand card ${chosen.instanceId} ("${chosen.label}") disappeared before it could be played.`,
    ).toHaveCount(1);
    await card.click();

    const detail = page.locator('[data-card-detail-layer="true"]');
    await expect(
      detail,
      `The card detail for ${chosen.instanceId} ("${chosen.label}") did not open.`,
    ).toBeVisible();
    await page.getByRole('button', { name: 'Play card', exact: true }).click();
    await expect(
      detail,
      `The card detail for ${chosen.instanceId} stayed open after Play card.`,
    ).toBeHidden();

    cardsPlayed += 1;

    if (!(await boardIsOpen(page))) {
      break;
    }

    const afterCards = await readHand(page);
    const afterEnergy =
      (await page.locator('.battle-controls__energy').first().textContent()) ?? '';

    if (handSignature(afterCards, afterEnergy) === before) {
      throw new Error(
        `Playing ${chosen.instanceId} ("${chosen.label}") did not change the hand or energy; the greedy turn would loop.`,
      );
    }
  }

  if (cardsPlayed >= maxPlays) {
    throw new Error(
      `Greedy turn played ${maxPlays} cards without settling; refusing to loop.`,
    );
  }

  if (!(await boardIsOpen(page))) {
    return { cardsPlayed, endedTurn: false };
  }

  const endTurn = page.locator('.battle-controls__end').first();

  if ((await endTurn.count()) === 0 || !(await endTurn.isEnabled())) {
    return { cardsPlayed, endedTurn: false };
  }

  const before = await turnMarker(page);
  await endTurn.click();

  await expect
    .poll(() => turnMarker(page), {
      message: `Ending the turn did not advance the battle (was "${before}").`,
      timeout: 5_000,
    })
    .not.toBe(before);

  return { cardsPlayed, endedTurn: true };
}

/** The hand section, exported for specs that need to count cards. */
export function handSection(page: Page): Locator {
  return page.locator('.hand');
}
