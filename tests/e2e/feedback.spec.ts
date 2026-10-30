/**
 * Motion and feedback on the battle board (acceptance bar AB-F1..AB-F5, motion-
 * and-feedback sections 3, 4, 5, 9 and 12.3).
 *
 * Everything runs against the committed production build through the real menu
 * journey at the two compositions that matter for the number's clamp: the 375px
 * phone rack and the 1280px game table. A beat is 160-400ms by design, so the
 * spec never screenshots: it reads the settled DOM (the beat's nodes persist
 * until the next transition) and, where it can, the live animation list.
 *
 * The one thing that cannot be produced through the committed UI is a typed
 * refusal: Play and End Turn are disabled exactly when the engine would refuse,
 * so a refusal is unreachable from the browser. That branch is pinned by
 * `src/ui/feedback/useFeedbackBeat.test.ts`; here AB-F1 proves the visible
 * halves instead — one beat per settled transition, and no new beat for a
 * non-action such as expanding the intent or reading the log.
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

const SEED = 20261104;

/** The two viewports this spec measures (phone rack, game table). */
const VIEWPORTS = [
  { label: '375x667', width: 375, height: 667 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

/** AB-F5: at most this many animated beat elements and impact numbers. */
const MAX_BEAT_ELEMENTS = 8;
const MAX_IMPACT_NUMBERS = 2;

async function openBattle(page: Page): Promise<void> {
  await openApp(page, SEED);
  await startSolo(page, 'ember');
  await expectScreen(page, 'battle', 'feedback journey');
  await expect(page.locator('[data-battle-board="true"]')).toBeVisible();
}

/**
 * Play one affordable card through the real detail sheet. `kind` prefers a card
 * whose frozen accessible name carries that card type, so a health or defense
 * beat can be requested instead of whatever the shuffle dealt first.
 */
async function playAffordableCard(
  page: Page,
  kind: 'attack' | 'ward' | null = null,
): Promise<{ readonly instanceId: string; readonly label: string }> {
  const affordable = page.locator('.hand .card-view[data-affordable="true"]');
  const count = await affordable.count();
  let target: Locator | null = null;
  let label = '';

  for (let index = 0; index < count; index += 1) {
    const candidate = affordable.nth(index);
    const candidateLabel = (await candidate.getAttribute('aria-label')) ?? '';

    if (
      kind === null ||
      new RegExp(`\\b${kind},`).test(candidateLabel)
    ) {
      target = candidate;
      label = candidateLabel;
      break;
    }
  }

  if (target === null) {
    throw new Error(
      `No affordable${kind === null ? '' : ` ${kind}`} card was in hand; the journey cannot continue.`,
    );
  }

  const instanceId = (await target.getAttribute('data-instance-id')) ?? '';

  await target.click();

  const detail = page.locator('[data-card-detail-layer="true"]');
  await expect(
    detail,
    `The card detail for ${instanceId} did not open.`,
  ).toBeVisible();
  await page.getByRole('button', { name: 'Play card', exact: true }).click();
  await expect(
    detail,
    `The card detail for ${instanceId} stayed open after Play card.`,
  ).toBeHidden();

  return { instanceId, label };
}

async function meter(page: Page, name: string): Promise<number> {
  const value = await page
    .getByRole('meter', { name, exact: true })
    .getAttribute('aria-valuenow');

  return Number(value);
}

/** True when an affordable attack is in the active hand right now. */
async function hasAffordableAttack(page: Page): Promise<boolean> {
  const affordable = page.locator('.hand .card-view[data-affordable="true"]');
  const count = await affordable.count();

  for (let index = 0; index < count; index += 1) {
    const label =
      (await affordable.nth(index).getAttribute('aria-label')) ?? '';

    if (/\battack,/.test(label)) {
      return true;
    }
  }

  return false;
}

/**
 * Produce one damaging settled transition. The seeded deck does not always deal
 * an affordable attack, so the turn is ended (one handoff beat) and the next
 * hand is tried; the loop is bounded and fails loudly rather than spinning.
 */
async function playAttack(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await hasAffordableAttack(page)) {
      await playAffordableCard(page, 'attack');
      return;
    }

    await page.getByRole('button', { name: 'End Turn', exact: true }).click();
    await expect(
      page.locator('.battle-header__turn'),
      'ending the turn did not hand control back to the player.',
    ).toContainText('Your turn');
  }

  throw new Error(
    'No affordable attack arrived in six turns; the feedback journey cannot continue.',
  );
}

/** Produce one more settled transition: an attack when possible, else a handoff. */
async function playNextBeat(page: Page): Promise<void> {
  if (await hasAffordableAttack(page)) {
    await playAffordableCard(page, 'attack');
    return;
  }

  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  await expect(page.locator('.battle-header__turn')).toContainText('Your turn');
}

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

/** True when `inner` is fully inside `outer` with an inset. */
function inside(inner: Box, outer: Box, inset = 0): boolean {
  return (
    inner.x >= outer.x + inset - 0.5 &&
    inner.y >= outer.y + inset - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width - inset + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height - inset + 0.5
  );
}

interface Animated {
  readonly kind: 'animation' | 'transition';
  readonly name: string;
  readonly properties: readonly string[];
  readonly durationMs: number;
  readonly target: string;
}

/** Every live CSS animation and transition, with what it touches. */
async function readAnimations(page: Page): Promise<readonly Animated[]> {
  return page.evaluate(() => {
    return document.getAnimations().map((animation) => {
      const properties = new Set<string>();
      const effect = animation.effect;
      let durationMs = 0;

      if (effect !== null && 'getKeyframes' in effect) {
        for (const frame of (effect as KeyframeEffect).getKeyframes() as Record<
          string,
          unknown
        >[]) {
          for (const key of Object.keys(frame)) {
            if (
              key !== 'offset' &&
              key !== 'computedOffset' &&
              key !== 'easing' &&
              key !== 'composite'
            ) {
              properties.add(key);
            }
          }
        }

        const timing = effect.getTiming().duration;
        durationMs = typeof timing === 'number' ? timing : 0;
      }

      const isAnimation = animation instanceof CSSAnimation;
      const target = effect?.target ?? null;

      return {
        kind: isAnimation ? 'animation' : 'transition',
        name: isAnimation ? animation.animationName : 'transition',
        properties: [...properties],
        durationMs,
        target:
          target instanceof Element
            ? `${target.tagName.toLowerCase()}.${String(
                target.getAttribute('class') ?? '',
              )}`
            : 'none',
      };
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`feedback ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('AB-F1 one beat per settled transition', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await openBattle(page);

      // The opening deal is not a beat, and no impact number exists yet.
      await expect(page.locator('[data-feedback-key]')).toHaveCount(0);
      await expect(page.locator('[data-impact-number]')).toHaveCount(0);
      await expect(page.locator('.hand')).toHaveAttribute('data-dealt', 'false');

      const opponentBefore = await meter(page, 'Cinder Warden health');
      await playAttack(page);
      const opponentAfter = await meter(page, 'Cinder Warden health');

      expect(
        opponentAfter,
        'the chosen attack did not resolve, so no beat could be measured.',
      ).toBeLessThan(opponentBefore);

      // Exactly one beat is on screen: the newest transition owns the layer.
      await expect(page.locator('[data-feedback-key]')).toHaveCount(1);
      await expect(page.locator('.hand')).toHaveAttribute('data-dealt', 'true');
      await expect(page.locator('[data-impact-number]')).toHaveCount(1);
      await expect(page.locator('[data-impact-flash]')).toHaveCount(1);

      // No beat is invented by a non-action: expanding the plan and reading the
      // log leave the settled beat exactly where it was.
      const key = await page
        .locator('[data-feedback-key]')
        .first()
        .getAttribute('data-feedback-key');
      const expand = page.locator('.enemy-panel__expand').first();

      if (await expand.isVisible()) {
        await expand.click();
      }

      const toggle = page.locator('.battle-log__toggle').first();

      if (await toggle.isVisible()) {
        await toggle.click();
        await page.keyboard.press('Escape');
      }

      await expect(page.locator('[data-feedback-key]')).toHaveCount(1);
      await expect(page.locator('[data-feedback-key]').first()).toHaveAttribute(
        'data-feedback-key',
        key ?? '',
      );

      expectNoConsoleErrors(errors, `${viewport.label} AB-F1`);
    });

    test('AB-F2 impact number is net, signed, clamped and aria-hidden', async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await openBattle(page);

      const scrollBefore = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight,
        board: document.querySelector('.battle-board')?.scrollHeight ?? 0,
      }));

      await playAttack(page);

      const numbers = page.locator('[data-impact-number]');
      await expect(numbers).toHaveCount(1);

      const number = numbers.first();
      const side = await number.getAttribute('data-side');
      const panel = page
        .locator(side === 'opponent' ? '.enemy-panel' : '.player-panel')
        .first();

      await expect(number).toHaveAttribute('aria-hidden', 'true');

      const text = (await number.textContent())?.trim() ?? '';
      expect(
        /^[\u2212+]\d+$/.test(text),
        `the number "${text}" must be a sign and a numeral only, with U+2212 for damage.`,
      ).toBe(true);

      // Clamped inside the target panel with the documented 6px inset.
      const numberBox = await boxOf(number);
      const panelBox = await boxOf(panel);
      expect(
        inside(numberBox, panelBox, 6),
        `the ${String(viewport.width)}px number box ${JSON.stringify(
          numberBox,
        )} escapes its panel ${JSON.stringify(panelBox)}.`,
      ).toBe(true);

      // It covers no meter value, intent block, control, energy text or the
      // field roundel.
      const protectedBoxes = await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll(
            '.stat-meter__value, .enemy-panel__intent, button, .battle-controls__energy, .field-banner__roundel',
          ),
        );

        return nodes.map((node) => {
          const rect = node.getBoundingClientRect();

          return {
            name: node.className,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });
      });

      for (const rect of protectedBoxes) {
        const overlaps =
          numberBox.x < rect.x + rect.width &&
          numberBox.x + numberBox.width > rect.x &&
          numberBox.y < rect.y + rect.height &&
          numberBox.y + numberBox.height > rect.y;

        expect(
          overlaps,
          `the impact number overlaps ${rect.name} (${JSON.stringify(rect)}).`,
        ).toBe(false);
      }

      const scrollAfter = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight,
        board: document.querySelector('.battle-board')?.scrollHeight ?? 0,
      }));

      expect(
        scrollAfter.doc,
        'a beat must not change the document height.',
      ).toBe(scrollBefore.doc);
      expect(
        scrollAfter.board,
        'a beat must not change the board height.',
      ).toBe(scrollBefore.board);

      await expectNoHorizontalScroll(page);
      expectNoConsoleErrors(errors, `${viewport.label} AB-F2`);
    });

    test('AB-F3 handoff, intent reveal and draw gating', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await openBattle(page);

      // The opening hand never animates and the opening plan is not a reveal.
      await expect(page.locator('.hand')).toHaveAttribute('data-dealt', 'false');
      await expect(page.locator('[data-intent-reveal]')).toHaveCount(0);

      await page.getByRole('button', { name: 'End Turn', exact: true }).click();

      // One handoff beat: the header label and the footer energy are marked.
      await expect(page.locator('.battle-header__turn')).toHaveAttribute(
        'data-feedback-handoff',
        'true',
      );
      await expect(page.locator('.battle-controls__energy')).toHaveAttribute(
        'data-feedback-handoff',
        'true',
      );

      // The plan that arrived with the player turn reveals as one block.
      await expect(page.locator('[data-intent-reveal="true"]')).toHaveCount(1);

      // Every drawn card mounted once, and the hand is now dealt.
      await expect(page.locator('.hand')).toHaveAttribute('data-dealt', 'true');
      await expect(page.locator('.hand')).toHaveAttribute('data-draw', 'true');

      // Expanding the list never re-animates it: neither the reveal attribute
      // nor the beat key changes.
      const key = await page
        .locator('[data-feedback-key]')
        .first()
        .getAttribute('data-feedback-key');
      const expand = page.locator('.enemy-panel__expand').first();

      if (await expand.isVisible()) {
        await expand.click();
        await expect(page.locator('[data-intent-reveal="true"]')).toHaveCount(1);
        await expect(page.locator('[data-feedback-key]').first()).toHaveAttribute(
          'data-feedback-key',
          key ?? '',
        );
      }

      expectNoConsoleErrors(errors, `${viewport.label} AB-F3`);
    });

    test('AB-F4 the two-channel feedback floor', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await openBattle(page);

      const status = page.getByRole('status');
      await expect(status).toHaveCount(1);
      const announcedBefore = (await status.textContent()) ?? '';
      const playerBefore = await meter(page, 'Your health');
      const opponentBefore = await meter(page, 'Cinder Warden health');

      await playAttack(page);

      // Channel 1: the durable, non-live log.
      const log = page.getByRole('region', { name: 'Battle log' });
      await expect(log).not.toHaveAttribute('aria-live');
      await expect(
        page.locator('[data-battle-log-entry]').last(),
        'the settled transition must add one durable log entry.',
      ).toBeAttached();

      // Channel 2: exactly one polite sentence, replaced rather than appended.
      await expect
        .poll(async () => (await status.textContent()) ?? '', {
          message: 'the settled transition was not announced.',
          timeout: 5_000,
        })
        .not.toBe(announcedBefore);
      await expect(page.getByRole('status')).toHaveCount(1);

      // Channel 3 for health: the transient figure beside the record.
      const playerAfter = await meter(page, 'Your health');
      const opponentAfter = await meter(page, 'Cinder Warden health');

      expect(
        playerAfter !== playerBefore || opponentAfter !== opponentBefore,
        'the chosen attack did not change any health, so no transient figure can be measured.',
      ).toBe(true);
      await expect(
        page.locator('[data-impact-number]'),
        'a health change must answer with a transient number.',
      ).toHaveCount(1);

      expectNoConsoleErrors(errors, `${viewport.label} AB-F4`);
    });

    test('AB-F5 CSS-only beats, allowlist and newest-wins', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await openBattle(page);

      await playAttack(page);
      const firstKey = await page
        .locator('[data-feedback-key]')
        .first()
        .getAttribute('data-feedback-key');
      const animated = await readAnimations(page);

      // A second settled transition replaces the first beat instead of stacking it.
      await playNextBeat(page);

      await expect(
        page.locator('[data-feedback-key]'),
        'only the newest beat may be on screen.',
      ).toHaveCount(1);
      await expect(
        page.locator('[data-feedback-key]').first(),
        'the newest beat must replace the previous one.',
      ).not.toHaveAttribute('data-feedback-key', firstKey ?? '');
      expect(
        await page.locator('[data-impact-number]').count(),
        `a beat may show at most ${String(MAX_IMPACT_NUMBERS)} impact numbers.`,
      ).toBeLessThanOrEqual(MAX_IMPACT_NUMBERS);

      // The log keeps both settled transitions.
      expect(
        await page.locator('[data-battle-log-entry]').count(),
      ).toBeGreaterThanOrEqual(2);

      // Only transform and opacity animate; the only keyframes are the beat's,
      // and the only colour transitions are the ≤300ms small-surface ones.
      const kebab = (property: string): string =>
        property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

      for (const animation of animated) {
        if (animation.kind === 'animation') {
          expect(
            animation.name,
            `an unexpected animation "${animation.name}" ran on ${animation.target}.`,
          ).toMatch(/^(?:fb-feedback-|fb-battle-log-entry$)/);

          for (const property of animation.properties.map(kebab)) {
            expect(
              ['transform', 'opacity'],
              `"${animation.name}" animates ${property} on ${animation.target}.`,
            ).toContain(property);
          }

          expect(
            animation.durationMs,
            `"${animation.name}" runs for ${String(animation.durationMs)}ms, above the 400ms beat ceiling.`,
          ).toBeLessThanOrEqual(400);
          continue;
        }

        for (const property of animation.properties.map(kebab)) {
          const allowed =
            property === 'transform' ||
            property === 'opacity' ||
            /(?:^|-)color$/.test(property);

          expect(
            allowed,
            `a transition on ${property} ran on ${animation.target}; only transform, opacity and colour are allowed.`,
          ).toBe(true);
        }

        expect(
          animation.durationMs,
          `a transition on ${animation.target} runs for ${String(animation.durationMs)}ms, above the 300ms small-surface ceiling.`,
        ).toBeLessThanOrEqual(300);
      }

      // No beat exceeds the element budget, and no box-shadow transition
      // remains on any battle surface.
      const beatElements = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[data-feedback-key] > *, [data-field-shift], [data-intent-reveal="true"], [data-feedback-handoff="true"]',
          ),
        ).length,
      );
      expect(
        beatElements,
        `a beat may animate at most ${String(MAX_BEAT_ELEMENTS)} elements.`,
      ).toBeLessThanOrEqual(MAX_BEAT_ELEMENTS);

      const shadowTransitions = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.battle-board *')).filter((node) =>
          window
            .getComputedStyle(node)
            .transitionProperty.split(',')
            .map((part) => part.trim())
            .includes('box-shadow'),
        ).length,
      );
      expect(
        shadowTransitions,
        'a box-shadow transition is still declared on the battle board.',
      ).toBe(0);

      expectNoConsoleErrors(errors, `${viewport.label} AB-F5`);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

test.describe('feedback reduced motion', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });

  test('AB-F2 no impact-number element exists and the facts stay visible', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await openBattle(page);

    await expect(page.locator('#app-root')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );

    const opponentBefore = await meter(page, 'Cinder Warden health');
    await playAttack(page);
    const opponentAfter = await meter(page, 'Cinder Warden health');

    await expect(page.locator('[data-impact-number]')).toHaveCount(0);
    await expect(page.locator('[data-defense-chip]')).toHaveCount(0);
    await expect(page.locator('[data-impact-flash]')).toHaveCount(0);
    await expect(page.locator('[data-feedback-key]')).toHaveCount(0);
    await expect(page.locator('[data-field-shift]')).toHaveCount(0);
    await expect(page.locator('[data-feedback-handoff]')).toHaveCount(0);

    // Two non-motion channels carry the same facts: the value in place, the
    // durable log entry and the single polite sentence.
    expect(opponentAfter).toBeLessThan(opponentBefore);
    await expect(
      page.locator('[data-battle-log-entry]').last(),
    ).toBeAttached();
    await expect(page.locator('[data-battle-log-latest]')).not.toHaveText('');
    await expect(page.getByRole('status')).toHaveCount(1);
    await expect(page.getByRole('status')).not.toHaveText('');

    await expectNoHorizontalScroll(page);
    expectNoConsoleErrors(errors, '390x844 reduced-motion feedback');
  });
});
