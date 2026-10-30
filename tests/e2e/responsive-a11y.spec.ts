/**
 * Responsive layout, keyboard play and reduced motion (REL-FR-03).
 *
 * Everything here runs against the committed production build on Chromium,
 * Firefox and WebKit, with real viewport emulation rather than CSS overrides.
 * The spec measures the rendered DOM; it never asserts a screenshot, a pixel
 * colour or an app module's internals.
 *
 * Three viewports are covered: the 375x667 phone (VIS-NFR-07 iOS class), the
 * 768x1024 tablet and the 1280x800 desktop. At each one the spec proves:
 *
 *   - `document.scrollWidth` never exceeds the viewport, on the menu, the
 *     battle board and after a turn;
 *   - Tab reaches all five hand cards and the End Turn control, every focused
 *     card is on screen with a visible focus ring, and at 375px the hand row
 *     really is the horizontal scroller that reveals the fifth card;
 *   - every interactive target measures at least 44x44 CSS pixels;
 *   - Enter opens and plays a card, Escape closes the detail and returns focus
 *     to the invoking card, and E ends the turn;
 *   - a persisted Reduce motion choice survives a reload, keeps
 *     `data-reduced-motion` true, removes transforms and caps computed
 *     transition and animation durations at 1ms.
 *
 * The traversal is deliberately one forward Tab pass: Firefox traps focus on
 * the last control instead of wrapping, and WebKit skips the skip link when it
 * wraps, so replaying presses "from the top" is not portable. Acting while the
 * fifth card holds focus keeps the play keyboard-only on every engine.
 *
 * Missing elements and absent focus stops fail loudly with the seed, viewport
 * and expected value in the message; nothing here skips silently.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  assertPrivacyInvariant,
  collectConsoleErrors,
  dismissPrivacy,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
  playGreedyTurn,
  startSolo,
} from './helpers';

/** The three measured viewports, in phone-to-desktop order. */
interface ViewportCase {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

const VIEWPORTS: readonly ViewportCase[] = [
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x800', width: 1280, height: 800 },
];

/** Seeds are unsigned 32-bit values the run parser accepts. */
const LAYOUT_SEED_BASE = 20261101;
const MOTION_SEED_BASE = 20261102;

/** The documented minimum interactive target, in CSS pixels. */
const MIN_TARGET_PX = 44;

/**
 * The layout contract's maximum board width, centred on wide screens
 * (VIS-NFR-01). The router caps the battle surface at the same value.
 */
const BOARD_MAX_WIDTH_PX = 1080;

/** The reduced-motion cap from the game-shell motion contract. */
const REDUCED_MOTION_CAP_MS = 1;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One Tab stop, read straight from the document. `classList` and
 * `instanceId` are what identify a hand card or the End Turn control without
 * relying on accessible-name heuristics.
 */
interface FocusStop {
  readonly tag: string;
  readonly classList: readonly string[];
  readonly instanceId: string | null;
  readonly label: string;
  readonly box: Box | null;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
}

interface RenderedTarget {
  readonly tag: string;
  readonly className: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

interface MotionSample {
  readonly transitionDuration: string;
  readonly transform: string;
  readonly animationName: string;
  readonly animationDuration: string;
}

interface MotionSnapshot {
  readonly attribute: string | null;
  readonly card: MotionSample | null;
  readonly endTurn: MotionSample | null;
  readonly handItem: MotionSample | null;
  readonly fieldBanner: MotionSample | null;
  readonly playerPanel: MotionSample | null;
  readonly intent: MotionSample | null;
  readonly feedbackLayer: MotionSample | null;
  readonly impactNumber: MotionSample | null;
}

function stopDescription(stop: FocusStop): string {
  const classes = stop.classList.length === 0 ? '' : `.${stop.classList.join('.')}`;
  const id = stop.instanceId === null ? '' : `#${stop.instanceId}`;
  return `<${stop.tag}${classes}${id}> "${stop.label}"`;
}

/** Read the active element and its rendered box/outline. */
async function readFocus(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const active = document.activeElement;

    if (!(active instanceof HTMLElement)) {
      return {
        tag: '',
        classList: [],
        instanceId: null,
        label: '',
        box: null,
        outlineStyle: 'none',
        outlineWidth: '0px',
      };
    }

    const rect = active.getBoundingClientRect();
    const style = window.getComputedStyle(active);

    return {
      tag: active.tagName.toLowerCase(),
      classList: Array.from(active.classList),
      instanceId: active.dataset.instanceId ?? null,
      label: (active.getAttribute('aria-label') ?? active.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80),
      box: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

/**
 * Tab forward until the fifth distinct hand card owns focus, recording the
 * cards on the way. The bounded loop turns a broken tab order into a failure
 * instead of a hang. Nothing is focused programmatically: the traversal starts
 * from whatever focus the real Start Run click left behind.
 */
async function tabToFifthCard(
  page: Page,
  context: string,
): Promise<readonly FocusStop[]> {
  const stops: FocusStop[] = [];
  const cards: FocusStop[] = [];
  const limit = 120;

  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press('Tab');
    const stop = await readFocus(page);
    stops.push(stop);

    if (stop.tag === 'body' || stop.tag === 'html') {
      throw new Error(
        `${context}: Tab left the page content for <${stop.tag}> before all five cards were reached. Focus order so far: ${stops
          .map(stopDescription)
          .join(' -> ')}`,
      );
    }

    if (stop.classList.includes('battle-controls__end')) {
      throw new Error(
        `${context}: Tab reached End Turn after only ${cards.length} of five hand cards. Focus order: ${stops
          .map(stopDescription)
          .join(' -> ')}`,
      );
    }

    if (!stop.classList.includes('card-view')) {
      continue;
    }

    if (cards.some((card) => card.instanceId === stop.instanceId)) {
      throw new Error(
        `${context}: Tab revisited ${stopDescription(stop)} before the other hand cards. Focus order: ${stops
          .map(stopDescription)
          .join(' -> ')}`,
      );
    }

    cards.push(stop);

    if (cards.length === 5) {
      return cards;
    }
  }

  throw new Error(
    `${context}: Tab reached only ${cards.length} of five hand cards within ${limit} presses. Focus order: ${stops
      .map(stopDescription)
      .join(' -> ')}`,
  );
}

/** Keep tabbing forward from the current focus until End Turn is reached. */
async function tabToEndTurn(
  page: Page,
  context: string,
): Promise<readonly FocusStop[]> {
  const stops: FocusStop[] = [];
  const limit = 40;

  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press('Tab');
    const stop = await readFocus(page);
    stops.push(stop);

    if (stop.classList.includes('battle-controls__end')) {
      return stops;
    }
  }

  throw new Error(
    `${context}: Tab did not reach End Turn within ${limit} presses after playing a card. Focus order: ${stops
      .map(stopDescription)
      .join(' -> ')}`,
  );
}

/**
 * Every rendered interactive element measured by its box. Hidden
 * `display:none` / `visibility:hidden` nodes and zero-rect elements are
 * skipped; everything a user can hit is included.
 */
async function readRenderedTargets(page: Page): Promise<readonly RenderedTarget[]> {
  return page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [role="button"], [role="switch"], [tabindex]:not([tabindex="-1"])',
      ),
    );

    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);

        return {
          tag: node.tagName.toLowerCase(),
          className:
            typeof node.className === 'string' ? node.className : '',
          label: (node.getAttribute('aria-label') ?? node.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60),
          width: rect.width,
          height: rect.height,
          rendered:
            node.getClientRects().length > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden',
        };
      })
      .filter((target) => target.rendered)
      .map(({ tag, className, label, width, height }) => ({
        tag,
        className,
        label,
        width,
        height,
      }));
  });
}

/** Battle locks to 100svh: neither axis may scroll the document. */
async function expectNoPageScroll(
  page: Page,
  context: string,
): Promise<void> {
  const metrics = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    metrics.scrollHeight,
    `${context}: the battle document scrolls vertically (${metrics.scrollHeight}px content in a ${metrics.innerHeight}px viewport).`,
  ).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(
    metrics.scrollWidth,
    `${context}: the battle document scrolls horizontally (${metrics.scrollWidth}px content in a ${metrics.innerWidth}px viewport).`,
  ).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

/** Assert the 44x44 minimum on every rendered interactive element. */
async function expectMinimumTargets(
  page: Page,
  context: string,
): Promise<void> {
  const targets = await readRenderedTargets(page);

  expect(
    targets.length,
    `${context}: no interactive elements were found to measure.`,
  ).toBeGreaterThan(0);

  for (const target of targets) {
    const name = `<${target.tag} class="${target.className}"> "${target.label}"`;

    expect(
      target.width,
      `${context}: ${name} is ${target.width}px wide, below the ${MIN_TARGET_PX}px minimum interactive target.`,
    ).toBeGreaterThanOrEqual(MIN_TARGET_PX);

    expect(
      target.height,
      `${context}: ${name} is ${target.height}px tall, below the ${MIN_TARGET_PX}px minimum interactive target.`,
    ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
}

/** Read the motion-relevant computed styles of the board surfaces. */
async function readMotionSnapshot(page: Page): Promise<MotionSnapshot> {
  return page.evaluate(() => {
    const pick = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);

      if (element === null) {
        return null;
      }

      const style = window.getComputedStyle(element);

      return {
        transitionDuration: style.transitionDuration,
        transform: style.transform,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
      };
    };

    const root = document.getElementById('app-root');

    return {
      attribute: root?.getAttribute('data-reduced-motion') ?? null,
      card: pick('.hand .card-view'),
      endTurn: pick('.battle-controls__end'),
      handItem: pick('.hand__item'),
      fieldBanner: pick('.field-banner'),
      playerPanel: pick('.player-panel'),
      intent: pick('.enemy-panel__intent'),
      feedbackLayer: pick('.battle-feedback'),
      impactNumber: pick('[data-impact-number]'),
    };
  });
}

/** Convert a computed duration list ("0.001s, 0s") to milliseconds. */
function durationsInMilliseconds(value: string): number[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) =>
      part.endsWith('ms') ? Number.parseFloat(part) : Number.parseFloat(part) * 1000,
    );
}

/** Assert every computed duration in a list is inside the reduced-motion cap. */
function expectWithinReducedMotionCap(
  subject: string,
  value: string,
  context: string,
): void {
  const durations = durationsInMilliseconds(value);

  expect(
    durations.length,
    `${context}: ${subject} reported no duration ("${value}").`,
  ).toBeGreaterThan(0);

  for (const duration of durations) {
    expect(
      duration,
      `${context}: ${subject} reports ${duration}ms, above the ${REDUCED_MOTION_CAP_MS}ms reduced-motion cap.`,
    ).toBeLessThanOrEqual(REDUCED_MOTION_CAP_MS + 0.001);
  }
}

/** Assert a motion sample is fully still. */
function expectStilled(
  subject: string,
  sample: MotionSample | null,
  context: string,
): void {
  if (sample === null) {
    throw new Error(`${context}: ${subject} was not rendered.`);
  }

  expectWithinReducedMotionCap(
    `${subject} transition`,
    sample.transitionDuration,
    context,
  );
  expectWithinReducedMotionCap(
    `${subject} animation`,
    sample.animationDuration,
    context,
  );
  expect(
    sample.animationName,
    `${context}: ${subject} still runs the "${sample.animationName}" animation under reduced motion.`,
  ).toBe('none');
  expect(
    sample.transform,
    `${context}: ${subject} still applies transform "${sample.transform}" under reduced motion.`,
  ).toBe('none');
}

for (const [index, viewport] of VIEWPORTS.entries()) {
  const layoutSeed = LAYOUT_SEED_BASE + index;
  const motionSeed = MOTION_SEED_BASE + index;
  const layoutContext = `${viewport.label} seed ${layoutSeed}`;
  const motionContext = `${viewport.label} seed ${motionSeed}`;

  test.describe(`viewport ${viewport.label}`, () => {
    // Real viewport emulation only. Pinning the OS motion preference keeps the
    // initial settings state identical on every machine, so the toggle exercise
    // always starts from "motion on" and proves the explicit override.
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'no-preference',
    });

    test('no horizontal scroll, five reachable cards and keyboard play', async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await openApp(page, layoutSeed);
      await expectNoHorizontalScroll(page);
      await expectMinimumTargets(page, `${layoutContext} menu`);

      await startSolo(page, 'ember');
      await expectScreen(page, 'battle', layoutContext);
      await expectNoPageScroll(page, `${layoutContext} battle`);

      const hand = page.locator('.hand .card-view');
      await expect(
        hand,
        `${layoutContext}: the opening hand must hold five cards, but the DOM shows a different count.`,
      ).toHaveCount(5);

      const handIds = await hand.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).dataset.instanceId ?? ''),
      );

      expect(
        handIds.every((id) => id.length > 0),
        `${layoutContext}: every hand card must expose a data-instance-id; received ${JSON.stringify(handIds)}.`,
      ).toBe(true);

      await expectNoHorizontalScroll(page);

      const cards = await tabToFifthCard(page, layoutContext);
      const tabbedIds = cards.map((card) => card.instanceId ?? '(missing id)');

      expect(
        tabbedIds.length,
        `${layoutContext}: Tab reached ${tabbedIds.length} hand cards, expected five.`,
      ).toBe(5);

      expect(
        [...tabbedIds].sort(),
        `${layoutContext}: the tabbed cards do not match the five rendered hand cards. Tabbed: ${JSON.stringify(
          tabbedIds,
        )}; hand: ${JSON.stringify(handIds)}.`,
      ).toEqual([...handIds].sort());

      for (const stop of cards) {
        const box = stop.box;

        if (box === null) {
          throw new Error(
            `${layoutContext}: the focused card ${stopDescription(stop)} has no rendered box.`,
          );
        }

        expect(
          box.width,
          `${layoutContext}: ${stopDescription(stop)} is ${box.width}px wide, below the ${MIN_TARGET_PX}px minimum.`,
        ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(
          box.height,
          `${layoutContext}: ${stopDescription(stop)} is ${box.height}px tall, below the ${MIN_TARGET_PX}px minimum.`,
        ).toBeGreaterThanOrEqual(MIN_TARGET_PX);

        // Reachable means on screen while focused, in both axes. The hand row
        // reveals later cards by scrolling; a partially clipped card is still
        // reachable, so this checks a positive visible intersection rather than
        // a full reveal.
        const visibleWidth =
          Math.min(box.x + box.width, viewport.width) - Math.max(box.x, 0);
        const visibleHeight =
          Math.min(box.y + box.height, viewport.height) - Math.max(box.y, 0);

        expect(
          visibleWidth,
          `${layoutContext}: focusing ${stopDescription(stop)} left it off screen horizontally (x=${box.x}, width=${box.width}).`,
        ).toBeGreaterThan(0);
        expect(
          visibleHeight,
          `${layoutContext}: focusing ${stopDescription(stop)} left it off screen vertically (y=${box.y}, height=${box.height}).`,
        ).toBeGreaterThan(0);

        expect(
          stop.outlineStyle,
          `${layoutContext}: ${stopDescription(stop)} has no focus outline style, so keyboard focus is not visible.`,
        ).not.toBe('none');
        expect(
          Number.parseFloat(stop.outlineWidth),
          `${layoutContext}: ${stopDescription(stop)} reports outline width "${stop.outlineWidth}"; visible focus needs at least 1px.`,
        ).toBeGreaterThanOrEqual(1);
      }

      const fifthCard = cards[cards.length - 1];

      if (fifthCard === undefined || fifthCard.box === null) {
        throw new Error(
          `${layoutContext}: the fifth hand card was not reached by Tab, so keyboard play cannot start from it.`,
        );
      }

      const fifthBox = fifthCard.box;
      const fifthVisible =
        Math.min(fifthBox.x + fifthBox.width, viewport.width) -
        Math.max(fifthBox.x, 0);

      expect(
        fifthVisible,
        `${layoutContext}: focusing the fifth card left it clipped (x=${fifthBox.x}, width=${fifthBox.width}); the hand row did not scroll it fully into view.`,
      ).toBeGreaterThanOrEqual(fifthBox.width * 0.9);

      if (viewport.width <= 375) {
        const row = await page.locator('.hand__row').evaluate((node) => ({
          scrollLeft: node.scrollLeft,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }));

        expect(
          row.scrollWidth,
          `${layoutContext}: the hand row does not overflow at 375px, so the five cards cannot be reached by scrolling.`,
        ).toBeGreaterThan(row.clientWidth);
        expect(
          row.scrollLeft,
          `${layoutContext}: the hand row did not scroll while tabbing to the fifth card (scrollLeft=${row.scrollLeft}).`,
        ).toBeGreaterThan(0);
      }

      await expectMinimumTargets(page, `${layoutContext} battle`);

      if (viewport.width >= 1024) {
        // AB-T2: the interactive board content is capped at 1080px and centred
        // as a whole. The board *contains* the log rail in the new composition,
        // so the rail is inside the board's right edge and the board box itself
        // must be centred (battle-screen section 1.2).
        const board = await page.locator('.battle-board').boundingBox();
        const rail = await page
          .locator('[data-battle-log="true"]')
          .boundingBox();
        const hand = await page.locator('.battle-hand, .hand').boundingBox();

        if (board === null || rail === null) {
          throw new Error(
            `${layoutContext}: the battle board or its log rail has no rendered box.`,
          );
        }

        expect(
          board.width,
          `${layoutContext}: the battle board is ${board.width}px wide, above the ${BOARD_MAX_WIDTH_PX}px contract.`,
        ).toBeLessThanOrEqual(BOARD_MAX_WIDTH_PX + 1);

        const leftGap = board.x;
        const rightGap = viewport.width - (board.x + board.width);

        expect(
          Math.abs(leftGap - rightGap),
          `${layoutContext}: the battle board is not centred (left gap ${leftGap}px, right gap ${rightGap}px).`,
        ).toBeLessThanOrEqual(2);

        const expectedRail = viewport.width >= 1280 ? 288 : 240;

        expect(
          rail.width,
          `${layoutContext}: the log rail is ${rail.width}px wide; the spec fixes ${expectedRail}px at this width.`,
        ).toBeGreaterThanOrEqual(expectedRail - 1);
        expect(
          rail.width,
          `${layoutContext}: the log rail is ${rail.width}px wide; the spec fixes ${expectedRail}px at this width.`,
        ).toBeLessThanOrEqual(expectedRail + 1);

        expect(
          rail.x,
          `${layoutContext}: the log rail must sit inside the board's right column (rail x=${rail.x}, board right=${board.x + board.width}).`,
        ).toBeGreaterThan(board.x + board.width / 2);
        expect(
          rail.x + rail.width,
          `${layoutContext}: the log rail must stop at the board's right edge (rail right=${rail.x + rail.width}, board right=${board.x + board.width}).`,
        ).toBeLessThanOrEqual(board.x + board.width + 1);

        if (hand !== null) {
          expect(
            rail.y + rail.height,
            `${layoutContext}: the log rail runs ${rail.y + rail.height - hand.y}px past the hand line (hand top ${hand.y}).`,
          ).toBeLessThanOrEqual(hand.y + 1);
        }
      }

      // Keyboard-only card play. The fifth card currently owns focus from the
      // traversal above, so Enter, Escape, Tab and Enter are the only inputs.
      const detail = page.locator('[data-card-detail-layer="true"]');

      await page.keyboard.press('Enter');
      await expect(
        detail,
        `${layoutContext}: Enter on the focused card did not open the card detail.`,
      ).toBeVisible();

      const closeFocus = await readFocus(page);
      expect(
        closeFocus.classList,
        `${layoutContext}: the card detail did not move focus to its close control; focus is ${stopDescription(
          closeFocus,
        )}.`,
      ).toContain('card-detail__close');

      await expectMinimumTargets(page, `${layoutContext} card detail`);

      await page.keyboard.press('Escape');
      await expect(
        detail,
        `${layoutContext}: Escape did not close the card detail.`,
      ).toBeHidden();

      await expect
        .poll(async () => (await readFocus(page)).instanceId, {
          message: `${layoutContext}: Escape did not return focus to the invoking card ${stopDescription(
            fifthCard,
          )}.`,
          timeout: 5_000,
        })
        .toBe(fifthCard.instanceId);

      // Reopen with Enter and commit with Enter on the Play control: no pointer
      // and no programmatic focus anywhere in the sequence.
      await page.keyboard.press('Enter');
      await expect(
        detail,
        `${layoutContext}: Enter did not reopen the card detail after Escape.`,
      ).toBeVisible();

      await page.keyboard.press('Tab');
      const playFocus = await readFocus(page);
      expect(
        playFocus.classList,
        `${layoutContext}: Tab from the close control did not reach Play card; focus is ${stopDescription(
          playFocus,
        )}.`,
      ).toContain('card-detail__play');

      const playedId = fifthCard.instanceId;

      await page.keyboard.press('Enter');
      await expect(
        detail,
        `${layoutContext}: Enter on Play card did not close the card detail.`,
      ).toBeHidden();
      await expect(
        page.locator(`.hand .card-view[data-instance-id="${playedId}"]`),
        `${layoutContext}: the played card ${playedId} is still in the hand.`,
      ).toHaveCount(0);

      await tabToEndTurn(page, `${layoutContext} after playing a card`);
      await expect(
        page.getByRole('button', { name: 'End Turn', exact: true }),
        `${layoutContext}: End Turn must be reachable and enabled after the keyboard play.`,
      ).toBeEnabled();

      const turnBefore =
        (await page.locator('.battle-board__turn').first().textContent())?.trim() ??
        '';

      expect(
        turnBefore.length,
        `${layoutContext}: the battle board does not report its turn.`,
      ).toBeGreaterThan(0);

      await page.keyboard.press('e');

      await expect
        .poll(
          async () =>
            (await page.locator('.battle-board__turn').first().textContent())?.trim() ??
            '',
          {
            message: `${layoutContext}: E did not end the turn (turn stayed "${turnBefore}").`,
            timeout: 10_000,
          },
        )
        .not.toBe(turnBefore);

      await expectNoHorizontalScroll(page);

      expectNoConsoleErrors(errors, layoutContext);
    });

    test('a persisted Reduce motion choice stills the board after reload', async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await openApp(page, motionSeed);

      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expectScreen(page, 'settings', motionContext);
      await expectNoHorizontalScroll(page);

      const toggle = page.getByRole('switch', { name: 'Reduce motion' });

      await expect(
        toggle,
        `${motionContext}: Reduce motion must start off when the OS asks for motion.`,
      ).toHaveAttribute('aria-checked', 'false');

      await toggle.click();
      await expect(
        toggle,
        `${motionContext}: clicking Reduce motion did not switch it on.`,
      ).toHaveAttribute('aria-checked', 'true');
      await expect(
        page.locator('#app-root'),
        `${motionContext}: the app root did not reflect the explicit Reduce motion choice.`,
      ).toHaveAttribute('data-reduced-motion', 'true');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectScreen(page, 'menu', `${motionContext} after reload`);

      await expect(
        page.locator('#app-root'),
        `${motionContext}: the Reduce motion choice did not survive the reload.`,
      ).toHaveAttribute('data-reduced-motion', 'true');

      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expectScreen(page, 'settings', `${motionContext} after reload`);
      await expect(
        page.getByRole('switch', { name: 'Reduce motion' }),
        `${motionContext}: the reloaded settings screen does not report Reduce motion as on.`,
      ).toHaveAttribute('aria-checked', 'true');

      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expectScreen(page, 'menu', `${motionContext} returning from settings`);

      await startSolo(page, 'ember');
      await expectScreen(page, 'battle', motionContext);

      const motion = await readMotionSnapshot(page);

      expect(
        motion.attribute,
        `${motionContext}: the reloaded battle lost the reduced-motion attribute.`,
      ).toBe('true');

      expectStilled('the hand card', motion.card, motionContext);
      expectStilled('the End Turn control', motion.endTurn, motionContext);
      expectStilled('the hand row item', motion.handItem, motionContext);
      expectStilled('the field banner', motion.fieldBanner, motionContext);
      expectStilled('the player panel', motion.playerPanel, motionContext);
      expectStilled('the intent block', motion.intent, motionContext);

      /*
       * Motion-and-feedback section 10: the beat is an absolute branch. No
       * impact number, chip, flash, shift ring, handoff or feedback layer may
       * exist in the DOM — not hidden, not transparent, absent — so there is
       * nothing to still.
       */
      expect(
        motion.feedbackLayer,
        `${motionContext}: a feedback layer was rendered under reduced motion.`,
      ).toBeNull();
      expect(
        motion.impactNumber,
        `${motionContext}: an impact number was rendered under reduced motion.`,
      ).toBeNull();
      await expect(page.locator('[data-impact-flash]')).toHaveCount(0);
      await expect(page.locator('[data-defense-chip]')).toHaveCount(0);
      await expect(page.locator('[data-field-shift]')).toHaveCount(0);
      await expect(page.locator('[data-feedback-handoff]')).toHaveCount(0);

      // The same facts stay visible: play a card and read the value, the log
      // entry and the one polite sentence.
      const enemyHealth = page.getByRole('meter', {
        name: 'Cinder Warden health',
        exact: true,
      });
      const healthBefore = await enemyHealth.getAttribute('aria-valuenow');
      const affordable = page.locator('.hand .card-view[data-affordable="true"]');
      const affordableCount = await affordable.count();
      let attack = null;

      for (let index = 0; index < affordableCount; index += 1) {
        const candidate = affordable.nth(index);
        const label = (await candidate.getAttribute('aria-label')) ?? '';

        if (/\battack,/.test(label)) {
          attack = candidate;
          break;
        }
      }

      if (attack === null) {
        throw new Error(
          `${motionContext}: no affordable attack was on screen under reduced motion, so the settled transition cannot be measured.`,
        );
      }

      await attack.click();
      await page.getByRole('button', { name: 'Play card', exact: true }).click();
      await expect(
        page.locator('[data-card-detail-layer="true"]'),
        `${motionContext}: the detail sheet did not close after Play card.`,
      ).toBeHidden();

      await expect
        .poll(async () => enemyHealth.getAttribute('aria-valuenow'), {
          message: `${motionContext}: the settled transition did not change the meter.`,
          timeout: 5_000,
        })
        .not.toBe(healthBefore);

      await expect(page.locator('[data-impact-number]')).toHaveCount(0);
      await expect(page.locator('[data-feedback-key]')).toHaveCount(0);
      await expect(
        page.locator('[data-battle-log-entry]').last(),
        `${motionContext}: the log did not record the settled transition.`,
      ).toBeAttached();
      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(page.getByRole('status')).not.toHaveText('');

      await expectNoHorizontalScroll(page);

      expectNoConsoleErrors(errors, motionContext);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Reading screens (reading-screens �2��6, �8.4; ticket 6)                    */
/* -------------------------------------------------------------------------- */

/**
 * The reading routes are documents: they scroll vertically, never horizontally,
 * and nothing on them is pinned except the phone `Contents` strip. The five
 * viewports prove the rail/strip swap, the 44px targets and the reduced-motion
 * branch from both sources; the result surfaces are reached once and resized
 * across the same five targets rather than replayed five times.
 */
function readingViewports() {
  return VIEWPORTS;
}

async function openHowToPlay(page: Page): Promise<void> {
  await openApp(page, 20261102);
  await page.getByRole('button', { name: 'How to Play', exact: true }).click();
  await expectScreen(page, 'how-to-play', 'reading layout');
  await page.evaluate(() => document.fonts.ready);
}

async function openSettings(page: Page): Promise<void> {
  await openApp(page, 20261102);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectScreen(page, 'settings', 'reading layout');
  await page.evaluate(() => document.fonts.ready);
}

for (const viewport of readingViewports()) {
  test.describe(`reading ${viewport.label}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'no-preference',
    });

    test(`the documents scroll one way, keep 44px targets and swap the contents surface at ${viewport.label}`, async ({
      page,
    }) => {
      const context = `${viewport.label} reading documents`;
      const errors = collectConsoleErrors(page);

      await openHowToPlay(page);

      await expectNoHorizontalScroll(page);
      await expectMinimumTargets(page, `${context} how-to-play`);

      const contents = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('.contents');
        const bar = document.querySelector<HTMLElement>('.contents__bar');
        const list = document.querySelector<HTMLElement>('.contents__list');

        if (nav === null || bar === null || list === null) {
          return null;
        }

        return {
          position: getComputedStyle(nav).position,
          barDisplay: getComputedStyle(bar).display,
          listDisplay: getComputedStyle(list).display,
          railLinks: Array.from(list.querySelectorAll('a')).filter(
            (link) => link.getClientRects().length > 0,
          ).length,
        };
      });

      expect(contents, `${context}: the contents surface is missing`).not.toBeNull();
      expect(contents!.position, `${context}: the contents never pins?`).toBe('sticky');
      expect(
        contents!.barDisplay === 'none',
        `${context}: the phone strip must be gone at 1024 and above`,
      ).toBe(viewport.width >= 1024);
      expect(
        contents!.railLinks,
        `${context}: the rail is the contents below 1024 and above it`,
      ).toBe(viewport.width >= 1024 ? 6 : 0);

      await openSettings(page);

      await expectNoHorizontalScroll(page);
      await expectMinimumTargets(page, `${context} settings`);
      await expect(page.getByRole('switch')).toHaveCount(2);
      expectNoConsoleErrors(errors, context);
    });

    test(`the switch is stilled by the OS preference and by the stored override at ${viewport.label}`, async ({
      page,
    }) => {
      const context = `${viewport.label} reading motion`;

      // Source 1: the operating system asks for reduced motion.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openSettings(page);

      const os = await page.evaluate(() => {
        const thumb = document.querySelector<HTMLElement>('.settings__switch-thumb');
        return thumb === null
          ? null
          : { transition: getComputedStyle(thumb).transitionDuration, transform: getComputedStyle(thumb).transform };
      });

      expect(os, `${context}: the switch thumb is missing`).not.toBeNull();
      expectWithinReducedMotionCap('the switch thumb transition', os!.transition, context);

      // Source 2: the in-app Reduce motion switch writes the explicit override.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await openSettings(page);

      const toggle = page.getByRole('switch', { name: 'Reduce motion' });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#app-root')).toHaveAttribute('data-reduced-motion', 'true');

      const stored = await page.evaluate(() => {
        const thumb = document.querySelector<HTMLElement>('.settings__switch-thumb');
        return thumb === null ? null : getComputedStyle(thumb).transitionDuration;
      });

      expectWithinReducedMotionCap('the switch thumb transition', stored ?? '', context);
      await expectNoHorizontalScroll(page);
    });
  });
}

test.describe('reading results', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('the run result holds at all five widths', async ({ page }) => {
    test.setTimeout(300_000);

    const errors = collectConsoleErrors(page);

    await openApp(page, 20261102);
    await startSolo(page, 'ember');

    for (let turn = 0; turn < 30; turn += 1) {
      if ((await page.locator('#main-content').getAttribute('data-screen')) === 'run-result') {
        break;
      }

      await page.getByRole('button', { name: 'End Turn', exact: true }).click();
    }

    await expectScreen(page, 'run-result', 'reading result layout');

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expectNoHorizontalScroll(page);
      await expectMinimumTargets(page, `${viewport.label} run result`);
    }

    expectNoConsoleErrors(errors, 'the run result at five widths');
  });

  test('the round and match plaques hold at all five widths', async ({ page }) => {
    test.setTimeout(300_000);

    const errors = collectConsoleErrors(page);

    await openApp(page, 20261103);
    await page.getByRole('button', { name: 'Local Duel', exact: true }).click();

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
    await page.getByRole('button', { name: "I'm ready", exact: true }).click();
    await expectScreen(page, 'battle', 'the first duel round');

    let screen = 'battle';

    for (let step = 0; step < 160 && screen !== 'match-result'; step += 1) {
      screen = (await page.locator('#main-content').getAttribute('data-screen')) ?? '';

      if (screen === 'round-result' || screen === 'match-result') {
        const variant = screen === 'round-result' ? '[data-duel-result="round"]' : '[data-duel-result="match"]';

        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await expect(page.locator(variant), `${viewport.label}: ${screen} is missing`).toBeVisible();
          await expectNoHorizontalScroll(page);
          await expectMinimumTargets(page, `${viewport.label} ${screen}`);
        }

        await page.setViewportSize({ width: 390, height: 844 });

        if (screen === 'match-result') {
          break;
        }

        await page.getByRole('button', { name: 'Next Round', exact: true }).click();
        await page.getByRole('button', { name: "I'm ready", exact: true }).click();
        await expectScreen(page, 'battle', 'the next duel round');
        continue;
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

      throw new Error(`the duel left the known surfaces at "${screen}".`);
    }

    await expectScreen(page, 'match-result', 'the settled duel series');
    expectNoConsoleErrors(errors, 'the duel plaques at five widths');
  });
});


/* -------------------------------------------------------------------------- */
/* Duel flow: setup, privacy and board at all five widths                     */
/* -------------------------------------------------------------------------- */

async function chooseDuelDeck(
  page: Page,
  player: '1' | '2',
  deckName: string,
): Promise<void> {
  await page
    .getByRole('button', { name: `Choose the ${deckName} deck`, exact: true })
    .click();
  await page
    .getByRole('button', { name: `Confirm Player ${player} deck`, exact: true })
    .click();
}

async function openDuelPrivacy(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
  await chooseDuelDeck(page, '1', 'Ember');
  await chooseDuelDeck(page, '2', 'Frost');
  await page.getByRole('button', { name: 'Start Match', exact: true }).click();
  await expectScreen(page, 'privacy', 'the duel privacy handoff');
}

test.describe('duel flow', () => {
  test.use({ reducedMotion: 'reduce' });

  test('setup, privacy and the board hold at all five widths', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const errors = collectConsoleErrors(page);

    await openApp(page, LAYOUT_SEED_BASE);
    await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
    await expectScreen(page, 'duel-setup', 'the duel setup');

    // Setup step 1 on every width: no sideways scroll, 44px targets.
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expectNoHorizontalScroll(page);
      await expectMinimumTargets(page, `${viewport.label} duel setup`);
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Player 1, choose your deck',
          exact: true,
        }),
        `${viewport.label}: the duel setup deck question is missing.`,
      ).toBeVisible();
    }

    await page.setViewportSize({ width: 375, height: 667 });
    await chooseDuelDeck(page, '1', 'Ember');
    await chooseDuelDeck(page, '2', 'Frost');
    await expectScreen(page, 'duel-setup', 'the locked summary');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Both decks are locked', exact: true }),
      'The locked summary is missing after both confirmations.',
    ).toBeVisible();

    // Privacy: fixed, opaque, no page scroll, one 44px action.
    await page.getByRole('button', { name: 'Start Match', exact: true }).click();
    await expectScreen(page, 'privacy', 'Start Match');

    for (const viewport of VIEWPORTS) {
      const context = `${viewport.label} duel privacy`;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await assertPrivacyInvariant(page, 'Player 1', context);
      await expectNoHorizontalScroll(page);
      await expectNoPageScroll(page, context);
      await expectMinimumTargets(page, context);

      const style = await page
        .locator('.duel-privacy')
        .evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const computed = getComputedStyle(node);
          return {
            position: computed.position,
            width: rect.width,
            height: rect.height,
            background: computed.backgroundColor,
          };
        });

      expect(style.position, `${context}: privacy must be a fixed route.`).toBe('fixed');
      expect(style.width, `${context}: privacy must cover the width.`).toBeGreaterThanOrEqual(
        viewport.width - 1,
      );
      expect(style.height, `${context}: privacy must cover the height.`).toBeGreaterThanOrEqual(
        viewport.height - 1,
      );
      expect(style.background, `${context}: privacy must be opaque.`).toMatch(/^rgb\(/);
    }

    // The board locks to 100svh at every width.
    await dismissPrivacy(page, 'Player 1');

    for (const viewport of VIEWPORTS) {
      const context = `${viewport.label} duel board`;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expectScreen(page, 'battle', context);
      await expectNoPageScroll(page, context);
      await expectNoHorizontalScroll(page);
      await expectMinimumTargets(page, context);
      await expect(
        page.locator('.hand'),
        `${context}: exactly one hand may exist.`,
      ).toHaveCount(1);
      await expect(
        page.locator('.hand button.card-view'),
        `${context}: the active hand must hold five card buttons.`,
      ).toHaveCount(5);
      await expect(
        page.locator('.duel-panel--opponent button.card-view'),
        `${context}: the opponent hand must never render card faces.`,
      ).toHaveCount(0);
      await expect(
        page.locator('.duel-panel--opponent [data-hand-count]'),
        `${context}: the opponent must show a hand count.`,
      ).toHaveText(/^\d+ cards? in hand$/);

      if (viewport.width >= 1024) {
        const rail = await page.locator('[data-battle-log="true"]').boundingBox();
        const expected = viewport.width >= 1280 ? 288 : 240;

        expect(
          Math.abs((rail?.width ?? 0) - expected),
          `${context}: the log rail measured ${String(rail?.width)}px, expected ${String(
            expected,
          )}.`,
        ).toBeLessThanOrEqual(1);
      }
    }

    // Focus lands on the first incoming card with a visible ring, once.
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      const computed = active === null ? null : getComputedStyle(active);
      return {
        isCard: active instanceof HTMLElement && active.classList.contains('card-view'),
        inHand: active instanceof HTMLElement && active.closest('.hand') !== null,
        outlineWidth: computed?.outlineWidth ?? '0px',
        outlineStyle: computed?.outlineStyle ?? 'none',
      };
    });

    expect(focused.isCard, 'The incoming turn must focus the first card.').toBe(true);
    expect(focused.inHand, 'The focused card must belong to the active hand.').toBe(true);
    expect(
      focused.outlineWidth,
      'The focused card must show the two-tone focus ring.',
    ).not.toBe('0px');
    expect(focused.outlineStyle, 'The focus ring must be drawn.').not.toBe('none');

    expectNoConsoleErrors(errors, 'the five-viewport duel flow');
  });
});

test.describe('duel privacy motion: OS preference', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the OS reduced-motion preference stills the privacy plaque', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, MOTION_SEED_BASE);
    await openDuelPrivacy(page);

    const motion = await page.evaluate(() => {
      const plaque = document.querySelector('.duel-privacy__plaque');
      const app = document.querySelector('#app-root');

      return {
        attribute: app?.getAttribute('data-reduced-motion') ?? null,
        animationName: plaque === null ? '' : getComputedStyle(plaque).animationName,
      };
    });

    expect(motion.attribute, 'The OS preference must set data-reduced-motion').toBe(
      'true',
    );
    expect(motion.animationName, 'The plaque must not animate under OS reduce').toBe(
      'none',
    );
  });
});

test.describe('duel privacy motion: explicit override', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the explicit reduce-motion override stills the privacy plaque', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, MOTION_SEED_BASE);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();

    const motionSwitch = page.getByRole('switch', { name: 'Reduce motion' });

    await expect(motionSwitch, 'The Reduce motion switch is missing.').toHaveAttribute(
      'aria-checked',
      'false',
    );
    await motionSwitch.click();
    await expect(motionSwitch, 'The override did not switch on.').toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    await openDuelPrivacy(page);

    const motion = await page.evaluate(() => {
      const plaque = document.querySelector('.duel-privacy__plaque');
      const app = document.querySelector('#app-root');

      return {
        attribute: app?.getAttribute('data-reduced-motion') ?? null,
        animationName: plaque === null ? '' : getComputedStyle(plaque).animationName,
      };
    });

    expect(motion.attribute, 'The explicit override must set data-reduced-motion').toBe(
      'true',
    );
    expect(motion.animationName, 'The plaque must not animate under the override').toBe(
      'none',
    );
  });
});
