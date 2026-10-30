/**
 * Cross-route UI bar (acceptance bar section 4, ticket #18).
 *
 * These are the checks that hold for every route independently of the screen
 * tickets: axe at 375 and 1280 (AB-A1), glyph-plus-word state cues (AB-A2), no
 * form furniture on play routes (AB-C3), no horizontal page scroll (AB-G4),
 * 44px targets (AB-G5), one slate table and one parchment material (AB-V2) and
 * the self-hosted display face (AB-V4).
 *
 * Foundation scope: the routes below are every route reachable from the menu in
 * a few real clicks. `reward`, `run-result`, `round-result` and `match-result`
 * need a settled battle or a whole run to reach, and their journeys belong to
 * `solo-run.spec.ts` and `duel.spec.ts` (solo and duel tickets). They are listed
 * in this file's report as deferred so the check-to-test mapping stays honest
 * rather than covering them twice with a duplicated journey.
 *
 * Everything is measured on the committed production build through the real UI:
 * no app module is imported, no state is injected. Missing elements fail loudly
 * with the route and viewport in the message; nothing skips silently.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  assertPrivacyInvariant,
  collectConsoleErrors,
  currentScreen,
  expectNoConsoleErrors,
  expectNoHorizontalScroll,
  expectScreen,
  openApp,
  playGreedyTurn,
  startSolo,
} from './helpers';

interface ViewportCase {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** The five mechanical targets from the bar; axe only runs at the two extremes. */
const VIEWPORTS: readonly ViewportCase[] = [
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x800', width: 1280, height: 800 },
];

const AXE_VIEWPORTS: readonly ViewportCase[] = [
  { label: '375x667', width: 375, height: 667 },
  { label: '1280x800', width: 1280, height: 800 },
];

/** Unsigned 32-bit seeds the run parser accepts. */
const SEED = 20261102;

const MIN_TARGET_PX = 44;

/** The head of the six-layer identity: page slate and the two brass rules. */
const SLATE_PAGE = 'rgb(15, 12, 10)';
const BRASS_RULE = '#a87c3f';
const EMBER_ACTION = '#8f1d1d';

type RouteKind = 'play' | 'reading';

/**
 * The one axe rule these two routes cannot turn green themselves.
 *
 * `label-content-name-mismatch` (WCAG 2.5.3 Label in Name) fires on the deck
 * and hand-card buttons: their `aria-label` is the frozen accessible name
 * ("Choose the Ember deck", the card's name-and-numbers sentence) while the
 * visible text is the block of content inside the button.
 *
 * Measured at solo-setup and reward by ticket 5: the deck card must contain all
 * ten printed card names (solo-flow §3.1, §9.1) and each dealt offer's face is
 * the card itself (§5.1), so no accessible name that keeps the frozen
 * "Choose the <Deck> deck" / "Choose <name>" strings can contain the visible
 * text. Moving either face outside its button would break the whole-object
 * target, so the rule stays excluded here and on the duel table that reuses the
 * same deck component. Every other rule - contrast, roles, names, structure -
 * is still enforced on all three routes.
 *
 * The battle entry stays: ticket #20 keeps the frozen card accessible name and
 * the visible face inside the same button (the unchanged `CardView.test.tsx`
 * contract, outside the ticket's test allowlist), and on shift/draw cards the
 * visible "to Frost" / "1 draw" words are not a contiguous token run of "shifts
 * the field to Frost" / "draws 1". Once the duel ticket lands, delete its entry
 * and the rule is enforced there with nothing excluded.
 */
const DEFERRED_AXE_RULES: Readonly<Record<string, { readonly rule: string; readonly owner: string }>> = {
  'solo-setup': { rule: 'label-content-name-mismatch', owner: '#22 (solo flow)' },
  reward: { rule: 'label-content-name-mismatch', owner: '#22 (solo flow)' },
  'duel-setup': { rule: 'label-content-name-mismatch', owner: '#22 (duel flow)' },
  battle: { rule: 'label-content-name-mismatch', owner: '#20 (battle screen)' },
};

interface RouteCase {
  /** The router's `data-screen` value. */
  readonly name: string;
  readonly kind: RouteKind;
  /** Drive the real UI from the menu to this route. */
  readonly visit: (page: Page) => Promise<void>;
}

/**
 * `AB-C3` bans `dl` on a play route. `run-overview` used to render its run
 * status as a `dl`; ticket 5 restyled that block as a `ul`, so every play route
 * is now measured with no exclusion.
 */

const ROUTES: readonly RouteCase[] = [
  {
    name: 'menu',
    kind: 'play',
    visit: async (page) => {
      await openApp(page, SEED);
    },
  },
  {
    name: 'how-to-play',
    kind: 'reading',
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'How to Play', exact: true }).click();
    },
  },
  {
    name: 'settings',
    kind: 'reading',
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    },
  },
  {
    name: 'solo-setup',
    kind: 'play',
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'Play Solo', exact: true }).click();
    },
  },
  {
    name: 'duel-setup',
    kind: 'play',
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
    },
  },
  {
    name: 'battle',
    kind: 'play',
    visit: async (page) => {
      await openApp(page, SEED);
      await startSolo(page, 'ember');
    },
  },
  {
    name: 'run-overview',
    kind: 'play',
    visit: async (page) => {
      await openApp(page, SEED);
      await startSolo(page, 'ember');
      await page.getByRole('button', { name: 'Run overview', exact: true }).click();
    },
  },
  {
    name: 'privacy',
    kind: 'play',
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'Local Duel', exact: true }).click();

      for (const [player, deck] of [
        ['1', 'Ember'],
        ['2', 'Frost'],
      ] as const) {
        await page.getByRole('button', { name: `Choose the ${deck} deck`, exact: true }).click();
        await page.getByRole('button', { name: `Confirm Player ${player} deck`, exact: true }).click();
      }

      await page.getByRole('button', { name: 'Start Match', exact: true }).click();
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Measurement helpers                                                        */
/* -------------------------------------------------------------------------- */

interface RenderedTarget {
  readonly tag: string;
  readonly className: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** Every rendered interactive element, with its box. */
async function readTargets(page: Page): Promise<readonly RenderedTarget[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="link"], [tabindex]:not([tabindex="-1"])',
      ),
    )
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);

        return {
          tag: node.tagName.toLowerCase(),
          className: typeof node.className === 'string' ? node.className : '',
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
      .filter((target) => target.rendered),
  );
}

interface StateCue {
  readonly selector: string;
  readonly text: string;
  readonly glyph: string;
  /** Element and status meaning always carries a glyph as well as a word. */
  readonly needsGlyph: boolean;
}

/**
 * Read the four state vocabularies that carry meaning on a route: element
 * identity, status chips, affordability and the current ladder step.
 *
 * Element and status cues are glyph plus word (README section 11). Affordability
 * and the current step are never colour-only either, but their spec gives them a
 * word rather than a glyph, so the vocabulary is asserted as the bar states it:
 * never colour alone, glyph plus word wherever the system defines a glyph.
 */
async function readStateCues(page: Page): Promise<readonly StateCue[]> {
  return page.evaluate(() => {
    const cues: StateCue[] = [];

    for (const cue of Array.from(document.querySelectorAll<HTMLElement>('.element-cue'))) {
      cues.push({
        selector: 'element cue',
        text: (cue.textContent ?? '').replace(/\s+/g, ' ').trim(),
        glyph:
          cue.querySelector<HTMLElement>('.element-cue__glyph')?.textContent?.trim() ?? '',
        needsGlyph: true,
      });
    }

    for (const chip of Array.from(document.querySelectorAll<HTMLElement>('.status-list__item'))) {
      cues.push({
        selector: 'status chip',
        text: (chip.textContent ?? '').replace(/\s+/g, ' ').trim(),
        glyph: chip.querySelector<HTMLElement>('.status-list__glyph')?.textContent?.trim() ?? '',
        needsGlyph: true,
      });
    }

    for (const card of Array.from(
      document.querySelectorAll<HTMLElement>('.card-view[data-affordable="false"]'),
    )) {
      cues.push({
        selector: 'unaffordable card',
        text: (card.textContent ?? '').replace(/\s+/g, ' ').trim(),
        glyph: '',
        needsGlyph: false,
      });
    }

    for (const step of Array.from(
      document.querySelectorAll<HTMLElement>('[aria-current="step"]'),
    )) {
      cues.push({
        selector: 'current step',
        text: (step.textContent ?? '').replace(/\s+/g, ' ').trim(),
        glyph: '',
        needsGlyph: false,
      });
    }

    return cues;
  });
}

async function analyse(page: Page, route: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const deferred = DEFERRED_AXE_RULES[route];
  const violations = results.violations.filter((violation) => violation.id !== deferred?.rule);

  expect(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
    `axe reported WCAG 2.1 A/AA violations on ${route}${deferred === undefined ? '' : ` (excluding ${deferred.rule})`}`,
  ).toEqual([]);
}

/* -------------------------------------------------------------------------- */
/* AB-A1 — axe at 375 and 1280                                                */
/* -------------------------------------------------------------------------- */

for (const viewport of AXE_VIEWPORTS) {
  test.describe(`axe ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    for (const route of ROUTES) {
      test(`AB-A1 axe reports zero WCAG 2.1 A/AA violations on ${route.name} at ${viewport.label}`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);

        await route.visit(page);
        await expectScreen(page, route.name, `${viewport.label} axe`);
        await page.evaluate(() => document.fonts.ready);

        await analyse(page, route.name);

        expectNoConsoleErrors(errors, `${route.name} at ${viewport.label}`);
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/* AB-A2 / AB-C3 / AB-G4 / AB-G5 at all five viewports                        */
/* -------------------------------------------------------------------------- */

for (const viewport of VIEWPORTS) {
  test.describe(`bar ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    for (const route of ROUTES) {
      test(`AB-G4 no horizontal page scroll on ${route.name} at ${viewport.label}`, async ({ page }) => {
        await route.visit(page);
        await expectScreen(page, route.name, `${viewport.label} overflow`);

        const metrics = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }));

        const widest = Math.max(metrics.scrollWidth, metrics.bodyScrollWidth);

        expect(
          widest,
          `${route.name} at ${viewport.label}: document.scrollWidth=${metrics.scrollWidth}, body.scrollWidth=${metrics.bodyScrollWidth}, viewport=${metrics.innerWidth}`,
        ).toBeLessThanOrEqual(metrics.innerWidth + 1);
      });

      test(`AB-G5 every target is at least 44px on ${route.name} at ${viewport.label}`, async ({ page }) => {
        await route.visit(page);
        await expectScreen(page, route.name, `${viewport.label} target size`);

        const targets = await readTargets(page);

        expect(targets.length, `${route.name} at ${viewport.label}: no interactive elements`).toBeGreaterThan(0);

        for (const target of targets) {
          const name = `<${target.tag} class="${target.className}"> "${target.label}"`;

          expect(
            target.width,
            `${route.name} at ${viewport.label}: ${name} is ${target.width}px wide`,
          ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(
            target.height,
            `${route.name} at ${viewport.label}: ${name} is ${target.height}px tall`,
          ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
      });

      test(`AB-C3 no form furniture on play routes (${route.name} at ${viewport.label})`, async ({ page }) => {
        await route.visit(page);
        await expectScreen(page, route.name, `${viewport.label} form furniture`);

        const counts = await page.evaluate(() => ({
          form: document.querySelectorAll('#main-content form').length,
          input: document.querySelectorAll('#main-content input').length,
          select: document.querySelectorAll('#main-content select').length,
          textarea: document.querySelectorAll('#main-content textarea').length,
          table: document.querySelectorAll('#main-content table').length,
          dl: document.querySelectorAll('#main-content dl').length,
          switches: document.querySelectorAll('#main-content [role="switch"]').length,
        }));

        expect(counts.form, `${route.name}: a play surface must carry no form`).toBe(0);
        expect(counts.input, `${route.name}: no input element`).toBe(0);
        expect(counts.select, `${route.name}: no select element`).toBe(0);
        expect(counts.textarea, `${route.name}: no textarea`).toBe(0);
        expect(counts.table, `${route.name}: no table`).toBe(0);

        if (route.kind === 'play') {
          expect(counts.dl, `${route.name}: no dl on a play route`).toBe(0);
          expect(counts.switches, `${route.name}: no switches on a play route`).toBe(0);
        }

        if (route.name === 'settings') {
          expect(counts.switches, 'Settings: exactly the two documented switches').toBe(2);
        }
      });

      test(`AB-A2 every stateful control is glyph plus word (${route.name} at ${viewport.label})`, async ({ page }) => {
        await route.visit(page);
        await expectScreen(page, route.name, `${viewport.label} state cue`);

        const cues = await readStateCues(page);

        for (const cue of cues) {
          if (cue.needsGlyph) {
            expect(
              cue.glyph.length,
              `${route.name}: the ${cue.selector} "${cue.text}" carries no glyph`,
            ).toBeGreaterThan(0);
          }

          expect(
            cue.text.replace(/[^\p{L}]/gu, '').length,
            `${route.name}: the ${cue.selector} "${cue.text}" carries no word`,
          ).toBeGreaterThanOrEqual(2);
        }

        for (const card of await page.locator('.card-view[data-affordable="false"]').all()) {
          await expect(
            card,
            `${route.name}: an unaffordable card must say so in words, not only in colour`,
          ).toContainText(/unaffordable/i);
        }
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/* AB-V2 — one slate table, one parchment material                            */
/* -------------------------------------------------------------------------- */

test.describe('identity', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('AB-V2 one slate table and one parchment material on every route', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    for (const route of ROUTES) {
      await route.visit(page);
      await expectScreen(page, route.name, 'AB-V2 identity');

      const identity = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);

        const lightSchemes: string[] = [];

        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;

          try {
            rules = sheet.cssRules;
          } catch {
            lightSchemes.push('cross-origin stylesheet');
            continue;
          }

          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-color-scheme: light')) {
              lightSchemes.push(rule.conditionText);
            }
          }
        }

        return {
          colorScheme: root.colorScheme,
          bodyBackground: body.backgroundColor,
          ruleColour: root.getPropertyValue('--fb-rule-color').trim(),
          action: root.getPropertyValue('--fb-action').trim(),
          surfaceDocument: root.getPropertyValue('--fb-surface-document').trim(),
          lightSchemes,
        };
      });

      expect(identity.colorScheme, `${route.name}: the document must declare a dark colour scheme`).toContain('dark');
      expect(identity.bodyBackground, `${route.name}: the page ground is warm slate`).toBe(SLATE_PAGE);
      expect(identity.ruleColour, `${route.name}: brass is the only rule colour`).toBe(BRASS_RULE);
      expect(identity.action, `${route.name}: ember is the primary action fill`).toBe(EMBER_ACTION);
      expect(identity.surfaceDocument, `${route.name}: one parchment material`).toBe('#f4e8cf');
      expect(identity.lightSchemes, `${route.name}: no light-theme branch may exist`).toEqual([]);
    }

    expectNoConsoleErrors(errors, 'AB-V2 identity sweep');
  });

  test('AB-V4 self-hosted display face and system UI stack', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const fontRequests: string[] = [];

    page.on('request', (request) => {
      if (request.resourceType() === 'font') {
        fontRequests.push(request.url());
      }
    });

    await openApp(page, SEED);
    await page.evaluate(() => document.fonts.ready);

    const fonts = await page.evaluate(() => {
      const heading = document.querySelector('#main-content h1');
      const body = getComputedStyle(document.body);

      return {
        displayFamily: heading === null ? '' : getComputedStyle(heading).fontFamily,
        bodyFamily: body.fontFamily,
        loaded: document.fonts.check('700 16px "Fraunces Fieldbound"'),
        faces: Array.from(document.fonts).map((face) => `${face.family} ${String(face.weight)} ${face.status}`),
        remoteLinks: Array.from(document.querySelectorAll('link[href]'))
          .map((link) => link.getAttribute('href') ?? '')
          .filter((href) => /^https?:/i.test(href)),
      };
    });

    expect(fonts.displayFamily, 'the route heading uses the display face').toContain('Fraunces Fieldbound');
    expect(fonts.loaded, 'the display face must actually load from this origin').toBe(true);
    expect(fonts.faces.join(' | '), 'the display face is 700 and loaded').toContain(
      'Fraunces Fieldbound 700 loaded',
    );
    expect(fonts.bodyFamily, 'body and UI copy use the system sans stack').toMatch(/system-ui|Segoe UI/);
    expect(fonts.bodyFamily, 'body copy must not use the display face').not.toContain('Fraunces Fieldbound');
    expect(fonts.remoteLinks, 'no remote stylesheet or font link').toEqual([]);

    const origin = new URL(page.url()).origin;

    for (const url of fontRequests) {
      expect(new URL(url).origin, `font request leaves the origin: ${url}`).toBe(origin);
    }

    expectNoConsoleErrors(errors, 'AB-V4 display face');
  });
});

/* -------------------------------------------------------------------------- */
/* Battle-scope extension (ticket #20)                                        */
/* -------------------------------------------------------------------------- */

const BATTLE_SEED = 20261102;

test.describe('battle bar', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('AB-C1 battle named objects render', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openApp(page, BATTLE_SEED);
    await startSolo(page, 'ember');

    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { level: 1, name: 'Battle' })).toBeAttached();
    await expect(
      main.getByRole('region', { name: 'Battle', exact: true }),
    ).toBeVisible();
    await expect(main.getByRole('region', { name: 'Cinder Warden' })).toBeVisible();
    await expect(
      main.getByRole('region', { name: /field/i }).first(),
    ).toBeVisible();
    await expect(
      main.getByRole('region', { name: 'You', exact: true }),
    ).toBeVisible();
    await expect(
      main.getByRole('region', { name: 'Your hand', exact: true }),
    ).toBeVisible();
    await expect(main.getByRole('group', { name: 'Turn controls' })).toBeAttached();
    await expect(main.getByRole('region', { name: 'Battle log' })).toBeAttached();
    await expect(
      main.getByRole('group', { name: 'Latest battle log entry' }),
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Run overview', exact: true }),
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Leave battle', exact: true }),
    ).toBeVisible();

    expectNoConsoleErrors(errors, 'battle AB-C1');
  });

  test('AB-A4 one polite live region and one announcement per settle', async ({
    page,
  }) => {
    await openApp(page, BATTLE_SEED);
    await startSolo(page, 'ember');

    const status = page.getByRole('status');
    await expect(page.getByRole('status')).toHaveCount(1);
    const opening = (await status.textContent()) ?? '';

    const log = page.getByRole('region', { name: 'Battle log' });
    await expect(log).not.toHaveAttribute('aria-live');
    await expect(log.locator('[aria-live]')).toHaveCount(0);

    await page.getByRole('button', { name: 'End Turn', exact: true }).click();

    await expect
      .poll(async () => (await status.textContent()) ?? '', {
        message: 'ending the turn did not announce the settled transition.',
        timeout: 5_000,
      })
      .toContain('Turn 3');

    const first = (await status.textContent()) ?? '';
    expect(first).not.toBe(opening);
    expect(first).toContain('Your turn');
    expect(first.match(/Your turn/g)).toHaveLength(1);
    await expect(page.getByRole('status')).toHaveCount(1);
  });

  test('AB-V3 battle art resolves only through the local manifest loader', async ({
    page,
  }) => {
    await openApp(page, BATTLE_SEED);
    await startSolo(page, 'ember');

    const art = await page.evaluate(() => {
      const sources = Array.from(document.querySelectorAll<HTMLImageElement>('#main-content img')).map(
        (image) => image.getAttribute('src') ?? '',
      );
      const remote = sources.filter((src) => /^https?:/i.test(src));
      const local = sources.filter((src) => /\/assets\/(?:cards|enemies|fields)\//.test(src));
      const inlineSvg = document.querySelectorAll('#main-content svg').length;

      return { sources, remote, local, inlineSvg };
    });

    expect(art.sources.length, 'the battle renders manifest art').toBeGreaterThan(0);
    expect(art.remote, 'battle art must be same-origin').toEqual([]);
    expect(art.local, 'battle art must resolve under assets/').toHaveLength(
      art.sources.length,
    );
    expect(art.inlineSvg, 'battle art is never an inline SVG').toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Menu-scope extension (ticket #19)                                          */
/* -------------------------------------------------------------------------- */

/**
 * The menu owns the checks above for every route and, from ticket #19, the
 * route-specific half of the bar: its named objects and DOM order (`AB-C1`),
 * the single action seal (`AB-C2`), the phone thumb envelope (`AB-P1`), text
 * floors and truncation (`AB-P4`), the hero + hub pair and measured widths
 * (`AB-T1`/`AB-T2`), route focus (`AB-G6`), one live region (`AB-A4`) and the
 * rendered identity/art/ban checks (`AB-V2`/`AB-V3`/`AB-V5`).
 *
 * The save state is produced through the product: start a solo run, leave the
 * battle and reload, so the menu is served by the boot-time save validator.
 */

const MENU_SAVE_SEED = 20261103;

const MENU_ENTRIES_NO_SAVE = ['Play Solo', 'Local Duel', 'How to Play', 'Settings'] as const;
const MENU_ENTRIES_SAVE = ['Play Solo', 'Local Duel', 'Continue Run', 'How to Play', 'Settings'] as const;

/** The menu button names, resolved the way assistive technology resolves them. */
async function menuButtonNames(page: Page): Promise<readonly string[]> {
  return page.locator('.menu__hub button').evaluateAll((nodes) =>
    nodes.map((node) => {
      const labelledBy = node.getAttribute('aria-labelledby');
      const label = labelledBy === null ? null : document.getElementById(labelledBy);

      return (label?.textContent ?? node.textContent ?? '').replace(/\s+/g, ' ').trim();
    }),
  );
}

/** Menu with a validated save: leave a real battle, then reload through boot. */
async function openMenuWithSave(page: Page): Promise<void> {
  await openApp(page, MENU_SAVE_SEED);
  await startSolo(page, 'ember');
  await page.getByRole('button', { name: 'Leave battle', exact: true }).click();
  await expectScreen(page, 'menu', 'leaving a solo run');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectScreen(page, 'menu', 'the reloaded validated save');
  await page.evaluate(() => document.fonts.ready);
}

/** Menu with a corrupt run key: the store discards it and renders the no-save state. */
async function openMenuWithCorruptSave(page: Page): Promise<void> {
  await openApp(page, SEED);
  await page.evaluate(() => {
    localStorage.setItem('fieldbound.run.v1', '{"schemaVersion":1,');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectScreen(page, 'menu', 'the corrupt-save reload');
}

test.describe('menu', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('AB-C1 named objects render on the menu', async ({ page }) => {
    await openApp(page, SEED);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Fieldbound', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main menu', exact: true })).toBeVisible();
    expect(await menuButtonNames(page)).toEqual(MENU_ENTRIES_NO_SAVE);
    await expect(
      page.getByRole('button', { name: 'Play Solo', exact: true }),
    ).toHaveAttribute('aria-describedby', 'menu-play-solo-hint');
    await expect(page.locator('#menu-play-solo-hint')).toHaveText(
      'Four fights, one 40-health run.',
    );
    await expect(page.locator('#menu-local-duel-hint')).toHaveText(
      'Best of three, pass and play.',
    );
    await expect(page.getByText('No run in progress', { exact: true })).toBeVisible();

    // Hero is not focusable; no loading state and no empty Continue slot.
    expect(
      await page
        .locator('.menu__hero')
        .locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        .count(),
      'the hero must carry no focusable control',
    ).toBe(0);
    expect(await page.locator('#main-content [aria-busy="true"]').count()).toBe(0);
    expect(await page.getByRole('progressbar').count()).toBe(0);
    await expect(page.getByRole('button', { name: 'Continue Run', exact: true })).toHaveCount(0);
  });

  test('AB-C1 named objects render on the menu with a validated save', async ({ page }) => {
    await openMenuWithSave(page);

    expect(await menuButtonNames(page)).toEqual(MENU_ENTRIES_SAVE);
    await expect(page.locator('#menu-continue-run-hint')).toHaveText(
      /^Encounter [1-4] of 4 · \d+ of 40 health$/,
    );
    await expect(page.locator('#menu-continue-run-deck')).toHaveText(
      /^Ember deck · \d+ cards$/,
    );
    await expect(page.getByText('No run in progress', { exact: true })).toHaveCount(0);
  });

  test('AB-C1 a corrupt save renders the no-save menu with no error surface', async ({ page }) => {
    await openMenuWithCorruptSave(page);

    expect(await menuButtonNames(page)).toEqual(MENU_ENTRIES_NO_SAVE);
    await expect(page.getByText('No run in progress', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue Run', exact: true })).toHaveCount(0);
    expect(await page.getByRole('alertdialog').count()).toBe(0);
    expect(await page.getByRole('alert').count()).toBe(0);
    await expect(page.locator('[role="status"]')).toHaveText('');
  });

  test('AB-G3 no menu text or focusable control is clipped', async ({ page }) => {
    await openApp(page, SEED);

    const clipped = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      const problems: string[] = [];

      if (main === null) {
        return ['the menu has no #main-content'];
      }

      for (const control of Array.from(main.querySelectorAll('button, a[href]'))) {
        if (control.scrollWidth > control.clientWidth + 1) {
          problems.push(
            `${control.tagName}.${control.className}: scrollWidth ${control.scrollWidth} > clientWidth ${control.clientWidth}`,
          );
        }

        if (control.scrollHeight > control.clientHeight + 1) {
          problems.push(
            `${control.tagName}.${control.className}: scrollHeight ${control.scrollHeight} > clientHeight ${control.clientHeight}`,
          );
        }
      }

      for (const text of Array.from(main.querySelectorAll('h1, p, span'))) {
        const style = getComputedStyle(text);

        if (style.display === 'none' || style.visibility === 'hidden') {
          continue;
        }

        if (style.textOverflow === 'ellipsis') {
          problems.push(
            `${text.tagName}.${text.className}: ellipsis on menu text`,
          );
        }
      }

      return problems;
    });

    expect(clipped).toEqual([]);
  });

  test('AB-A7 the menu takes the forced-colors and high-contrast branches', async ({ page }) => {
    await openApp(page, SEED);

    await page.emulateMedia({ forcedColors: 'active' });

    const forced = await page.evaluate(() => {
      const card = document.querySelector('.menu__card');

      if (card === null) {
        return null;
      }

      const style = getComputedStyle(card);

      return {
        image: style.backgroundImage,
        rule: Number.parseFloat(style.borderTopWidth),
        text: style.color,
      };
    });

    expect(forced, 'the menu must render a mode card').not.toBeNull();
    expect(forced?.image, 'forced-colors must drop the material').toBe('none');
    expect(forced?.rule, 'forced-colors must keep a visible rule').toBeGreaterThanOrEqual(1);

    await page.emulateMedia({ forcedColors: 'none' });
    await page.emulateMedia({ contrast: 'more' });

    const more = await page.evaluate(() => {
      const card = document.querySelector('.menu__card');

      if (card === null) {
        return null;
      }

      const style = getComputedStyle(card);

      return {
        image: style.backgroundImage,
        rule: Number.parseFloat(style.borderTopWidth),
        page: getComputedStyle(document.documentElement).getPropertyValue(
          '--fb-surface-page',
        ),
      };
    });

    expect(more?.image, 'prefers-contrast must drop the material').toBe('none');
    expect(more?.rule, 'prefers-contrast must harden the rule').toBeGreaterThanOrEqual(2);
    expect(
      more?.page.trim(),
      'prefers-contrast must use the hardened page',
    ).toMatch(/^#0{3}(0{3})?$/i);
  });

  test('AB-C2 exactly one action seal and it is the Play Solo button', async ({ page }) => {
    await openApp(page, SEED);

    await expect(page.locator('.menu__seal--ember')).toHaveCount(1);

    const solo = page.getByRole('button', { name: 'Play Solo', exact: true });
    await expect(solo).toHaveCount(1);
    expect(await solo.evaluate((node) => node.tagName)).toBe('BUTTON');
    await expect(solo).toHaveClass(/menu__card--solo/);
    expect(await page.locator('.menu__card--solo').count()).toBe(1);
  });

  test('AB-T1 the hero and hub are side by side', async ({ page }) => {
    await openApp(page, SEED);

    const hero = await page.locator('.menu__hero').boundingBox();
    const hub = await page.locator('.menu__hub').boundingBox();

    expect(hero).not.toBeNull();
    expect(hub).not.toBeNull();

    expect(hero!.x + hero!.width).toBeLessThanOrEqual(hub!.x + 1);
    expect(Math.min(hero!.y + hero!.height, hub!.y + hub!.height)).toBeGreaterThan(
      Math.max(hero!.y, hub!.y),
    );
  });

  test('AB-T2 the hub measures 512 inside a centred 1080 column', async ({ page }) => {
    await openApp(page, SEED);

    const boxes = await page.evaluate(() => {
      const read = (selector: string) => {
        const node = document.querySelector(selector);
        if (node === null) {
          return null;
        }
        const rect = node.getBoundingClientRect();
        return { x: rect.x, width: rect.width };
      };

      return {
        menu: read('.menu'),
        hero: read('.menu__hero'),
        hub: read('.menu__hub'),
        innerWidth: window.innerWidth,
      };
    });

    expect(boxes.menu).not.toBeNull();
    expect(boxes.hero).not.toBeNull();
    expect(boxes.hub).not.toBeNull();

    expect(boxes.menu!.width, 'the menu content column is 1080 at 1280').toBeCloseTo(1080, 0);
    expect(Math.abs(boxes.hub!.width - 512), 'the hub is 512 at 1280').toBeLessThanOrEqual(8);
    expect(Math.abs(boxes.hero!.width - 520), 'the hero takes the rest of 1080').toBeLessThanOrEqual(8);

    const leftGap = boxes.menu!.x;
    const rightGap = boxes.innerWidth - (boxes.menu!.x + boxes.menu!.width);
    expect(Math.abs(leftGap - rightGap), 'the column is centred').toBeLessThanOrEqual(2);
  });

  test('AB-G6 route focus lands on the h1 with the two-tone ring', async ({ page }) => {
    await openApp(page, SEED);

    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        text: element.textContent?.trim() ?? '',
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineOffset: style.outlineOffset,
        shadow: style.boxShadow,
      };
    });

    expect(focus).not.toBeNull();
    expect(focus!.tag).toBe('H1');
    expect(focus!.text).toBe('Fieldbound');
    expect(focus!.outlineWidth).toBe('2px');
    expect(focus!.outlineStyle).toBe('solid');
    expect(focus!.outlineOffset).toBe('2px');
    expect(focus!.shadow, 'the two-tone ring includes the inner halo').not.toBe('none');

    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-labelledby')),
      'the first tab stop after the route heading is Play Solo',
    ).toBe('menu-play-solo-label');
  });

  test('AB-A4 exactly one polite live region and no menu announcement', async ({ page }) => {
    await openApp(page, SEED);

    const live = await page.evaluate(() => ({
      statuses: document.querySelectorAll('[role="status"]').length,
      liveRegions: document.querySelectorAll('[aria-live]').length,
      inMain: document.querySelectorAll('#main-content [role="status"], #main-content [aria-live]').length,
      text: document.querySelector('[role="status"]')?.textContent?.trim() ?? '',
    }));

    expect(live.statuses, 'one app-wide polite status').toBe(1);
    expect(live.liveRegions, 'no second live region').toBe(1);
    expect(live.inMain, 'the menu adds no live region of its own').toBe(0);
    expect(live.text, 'opening the menu is not a settled transition').toBe('');
  });

  test('AB-V3 the menu renders no art outside the manifest loader', async ({ page }) => {
    await openApp(page, SEED);

    const art = await page.evaluate(() => {
      const artwork = Array.from(document.querySelectorAll<HTMLElement>('#main-content img, #main-content svg'));
      const remote = Array.from(document.querySelectorAll<HTMLElement>('#main-content [src], #main-content [href]'))
        .map((node) => node.getAttribute('src') ?? node.getAttribute('href') ?? '')
        .filter((value) => /^https?:/i.test(value));

      return {
        artwork: artwork.length,
        remote,
        backgroundUrls: Array.from(document.querySelectorAll<HTMLElement>('#main-content *'))
          .map((node) => getComputedStyle(node).backgroundImage)
          .filter((value) => /url\(/i.test(value)),
      };
    });

    expect(art.artwork, 'the menu has no art').toBe(0);
    expect(art.remote).toEqual([]);
    expect(art.backgroundUrls).toEqual([]);
  });

  test('AB-V5 no banned motif renders on the menu', async ({ page }) => {
    await openApp(page, SEED);

    const banned = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('#main-content *'));

      return {
        tables: document.querySelectorAll('#main-content table, #main-content form').length,
        filters: nodes.filter((node) => getComputedStyle(node).filter !== 'none').length,
        backdrops: nodes.filter((node) => getComputedStyle(node).backdropFilter !== 'none').length,
        trueBlack: nodes.filter((node) => getComputedStyle(node).backgroundColor === 'rgb(0, 0, 0)').length,
      };
    });

    expect(banned.tables, 'no table or form furniture').toBe(0);
    expect(banned.filters, 'no CSS filter motif').toBe(0);
    expect(banned.backdrops, 'no glassmorphism').toBe(0);
    expect(banned.trueBlack, 'true black is not a surface').toBe(0);
  });
});

/* Phone-only checks: the thumb envelope and the text floors. */
for (const viewport of [
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
] as const) {
  test.describe(`menu phone ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    test(`AB-P1 the primary action sits inside the 288px thumb envelope at ${viewport.label}`, async ({
      page,
    }) => {
      await openApp(page, SEED);

      const box = await page.getByRole('button', { name: 'Play Solo', exact: true }).boundingBox();
      expect(box).not.toBeNull();

      const thumbTop = viewport.height - 288;

      expect(box!.y, 'Play Solo must start inside the thumb envelope').toBeGreaterThanOrEqual(thumbTop);
      expect(box!.y + box!.height, 'Play Solo must stay inside the viewport').toBeLessThanOrEqual(
        viewport.height,
      );
      expect(box!.x, 'at least 8px from the left edge').toBeGreaterThanOrEqual(8);
      expect(box!.x + box!.width, 'at least 8px from the right edge').toBeLessThanOrEqual(
        viewport.width - 8,
      );
    });

    test(`AB-P4 no ellipsis and the text floors hold at ${viewport.label}`, async ({ page }) => {
      await openMenuWithSave(page);

      const text = await page.evaluate(() => {
        const selectors = [
          '.menu__eyebrow',
          '.menu__tagline',
          '.menu__plaque',
          '.menu__card-title',
          '.menu__card-hint',
          '.menu__bookmark-title',
          '.menu__bookmark-hint',
          '.menu__bookmark-deck',
          '.menu__row',
        ];

        return selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector)).map((node) => ({
            selector,
            text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
            fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
            textOverflow: getComputedStyle(node).textOverflow,
            clipped: node.scrollWidth > node.clientWidth + 1,
          })),
        );
      });

      expect(text.length).toBeGreaterThan(0);

      for (const item of text) {
        expect(item.textOverflow, `${item.selector} must not use ellipsis`).not.toBe('ellipsis');
        expect(item.clipped, `${item.selector} "${item.text}" is clipped`).toBe(false);
        expect(item.fontSize, `${item.selector} "${item.text}" is below 12px`).toBeGreaterThanOrEqual(
          item.selector === '.menu__eyebrow' ? 11 : 12,
        );
      }
    });
  });
}

/* The 1024 composition and the saved-state target/overflow checks. */
test.describe('menu 1024', () => {
  test.use({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });

  test('AB-T1 the hero and hub are side by side at 1024', async ({ page }) => {
    await openApp(page, SEED);

    const hero = await page.locator('.menu__hero').boundingBox();
    const hub = await page.locator('.menu__hub').boundingBox();

    expect(hero).not.toBeNull();
    expect(hub).not.toBeNull();
    expect(hero!.x + hero!.width).toBeLessThanOrEqual(hub!.x + 1);
  });

  test('AB-T2 the hub measures 440 inside a centred 976 column', async ({ page }) => {
    await openApp(page, SEED);

    const boxes = await page.evaluate(() => {
      const read = (selector: string) => {
        const node = document.querySelector(selector);
        if (node === null) {
          return null;
        }
        const rect = node.getBoundingClientRect();
        return { x: rect.x, width: rect.width };
      };

      return {
        menu: read('.menu'),
        hero: read('.menu__hero'),
        hub: read('.menu__hub'),
        innerWidth: window.innerWidth,
      };
    });

    expect(boxes.menu).not.toBeNull();
    expect(boxes.hub).not.toBeNull();
    expect(boxes.hero).not.toBeNull();

    expect(boxes.menu!.width, 'the menu content column is 976 at 1024').toBeCloseTo(976, 0);
    expect(Math.abs(boxes.hub!.width - 440), 'the hub is 440 at 1024').toBeLessThanOrEqual(8);
    expect(Math.abs(boxes.hero!.width - 504), 'the hero takes the rest of 976').toBeLessThanOrEqual(8);

    const leftGap = boxes.menu!.x;
    const rightGap = boxes.innerWidth - (boxes.menu!.x + boxes.menu!.width);
    expect(Math.abs(leftGap - rightGap), 'the column is centred').toBeLessThanOrEqual(2);
  });
});

for (const viewport of [
  { label: '375x667', width: 375, height: 667 },
  { label: '1280x800', width: 1280, height: 800 },
] as const) {
  test.describe(`menu saved ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    test(`AB-G4 no horizontal page scroll on the menu with a save at ${viewport.label}`, async ({
      page,
    }) => {
      await openMenuWithSave(page);
      await expectNoHorizontalScroll(page);
    });

    test(`AB-G5 every target is at least 44px on the menu with a save at ${viewport.label}`, async ({
      page,
    }) => {
      await openMenuWithSave(page);
      const targets = await readTargets(page);
      expect(targets.length).toBeGreaterThan(0);

      for (const target of targets) {
        expect(target.width, `${target.label} is ${target.width}px wide`).toBeGreaterThanOrEqual(
          MIN_TARGET_PX,
        );
        expect(target.height, `${target.label} is ${target.height}px tall`).toBeGreaterThanOrEqual(
          MIN_TARGET_PX,
        );
      }
    });
  });
}

test.describe('menu axe saved', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('AB-A1 axe reports zero WCAG 2.1 A/AA violations on the menu with a save', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await openMenuWithSave(page);
    await page.evaluate(() => document.fonts.ready);
    await analyse(page, 'menu');

    expectNoConsoleErrors(errors, 'menu with a validated save');
  });
});


/* -------------------------------------------------------------------------- */
/* Solo flow — deck table, ladder and dealt reward (ticket 5)                  */
/* -------------------------------------------------------------------------- */

/**
 * The three solo surfaces from `solo-flow.md` §3–§5, measured at the same five
 * viewports as the rest of the bar. Setup and overview are one click (or one
 * battle start) from the menu; the reward needs a settled fight, so the spec
 * plays the seeded run with the shared greedy policy until the reward phase
 * mounts. Nothing writes storage and no app module is imported.
 */
type SoloRouteName = 'solo-setup' | 'run-overview' | 'reward';

interface SoloRouteCase {
  readonly name: SoloRouteName;
  /** The route's named primary action, as the bar requires it (AB-C2). */
  readonly primary: RegExp;
  readonly visit: (page: Page) => Promise<void>;
}

async function visitSetup(page: Page): Promise<void> {
  await openApp(page, SEED);
  await page.getByRole('button', { name: 'Play Solo', exact: true }).click();
  await expectScreen(page, 'solo-setup', 'solo setup');
}

async function visitOverview(page: Page): Promise<void> {
  await openApp(page, SEED);
  await startSolo(page, 'ember');
  await page.getByRole('button', { name: 'Run overview', exact: true }).click();
  await expectScreen(page, 'run-overview', 'run overview');
}

/** Play the seeded fight out until the reward phase is on screen. */
async function visitReward(page: Page): Promise<void> {
  await openApp(page, SEED);
  await startSolo(page, 'ember');

  for (let step = 0; step < 80; step += 1) {
    const screen = await currentScreen(page);

    if (screen === 'reward') {
      return;
    }

    if (screen !== 'battle') {
      throw new Error(
        `The seeded solo run left the battle for "${String(screen)}" before the reward phase.`,
      );
    }

    await playGreedyTurn(page);
  }

  throw new Error(
    'The seeded solo run did not reach the reward within 80 greedy turns.',
  );
}

const SOLO_ROUTES: readonly SoloRouteCase[] = [
  { name: 'solo-setup', primary: /^Start Run$/, visit: visitSetup },
  { name: 'run-overview', primary: /^(Next Battle|Back to battle)$/, visit: visitOverview },
  { name: 'reward', primary: /^Take (reward|Heal \d+|[A-Z].*)$/, visit: visitReward },
];

/** The reward confirms only after a selection, so its label starts generic. */
const REWARD_PROMPT = 'Select one reward to continue.';

interface SoloTextBox {
  readonly text: string;
  readonly size: number;
  readonly uppercase: boolean;
}

/** Every rendered text node on the route, with its computed size and case. */
async function readTextFloors(page: Page): Promise<readonly SoloTextBox[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#main-content *'))
      .map((element) => {
        const text = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => (node.textContent ?? '').trim())
          .join(' ')
          .trim();
        const style = window.getComputedStyle(element);

        return {
          text,
          size: Number.parseFloat(style.fontSize),
          uppercase: style.textTransform === 'uppercase',
          rendered:
            text !== '' &&
            element.getClientRects().length > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden',
        };
      })
      .filter((entry) => entry.rendered)
      .map(({ text, size, uppercase }) => ({ text, size, uppercase })),
  );
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(page: Page, selector: string, index = 0): Promise<Box> {
  const box = await page.evaluate(
    ({ selector: target, index: position }) => {
      const element = document.querySelectorAll<HTMLElement>(target)[position];

      if (element === undefined) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    },
    { selector, index },
  );

  if (box === null) {
    throw new Error(`no element matched "${selector}" at index ${String(index)}`);
  }

  return box;
}

for (const viewport of VIEWPORTS) {
  test.describe(`solo bar ${viewport.label}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });

    for (const route of SOLO_ROUTES) {
      test(`solo ${route.name} at ${viewport.label}: objects, seal, focus, text and targets`, async ({
        page,
      }) => {
        test.setTimeout(route.name === 'reward' ? 180_000 : 60_000);

        const mobile = viewport.width < 768;

        await route.visit(page);
        await expectScreen(page, route.name, viewport.label);

        // AB-G6 - the route change lands on the destination h1 with the ring.
        const focus = await page.evaluate(() => {
          const active = document.activeElement;

          if (!(active instanceof HTMLElement)) {
            return null;
          }

          const style = window.getComputedStyle(active);

          return {
            tag: active.tagName,
            text: (active.textContent ?? '').trim(),
            marked: active.hasAttribute('data-route-focus'),
            outline: style.outlineStyle,
            outlineWidth: style.outlineWidth,
          };
        });

        expect(focus, `${route.name}: focus must land on the route heading`).not.toBeNull();
        expect(focus?.tag, `${route.name}: the route heading is the focused element`).toBe('H1');
        expect(focus?.marked, `${route.name}: the heading carries data-route-focus`).toBe(true);
        expect(focus?.outline, `${route.name}: the focus ring is visible`).not.toBe('none');
        expect(focus?.outlineWidth, `${route.name}: the ring is 2px`).toBe('2px');

        // AB-C1 - the route's named objects.
        if (route.name === 'solo-setup') {
          const decks = page.getByRole('button', { name: /^Choose the .* deck$/ });

          await expect(decks, 'solo-setup: four deck cards').toHaveCount(4);
          await expect(page.getByText(/^10 cards$/, { exact: true })).toHaveCount(4);
          await expect(page.getByText(/^2 Shift cards$/, { exact: true })).toHaveCount(4);
          await expect(page.locator('.solo-deck__tag')).toHaveCount(8);

          for (const id of ['ember', 'frost', 'gale', 'stone']) {
            const contents = page.locator(`[id="solo-setup-deck-${id}-contents"]`);

            await expect(contents, `solo-setup: the ${id} contents block`).toHaveCount(1);
            await expect(contents.locator('.solo-deck__card')).toHaveCount(10);
            await expect(contents.locator('.solo-deck__tag')).toHaveCount(2);
            await expect(contents.locator('.solo-deck__tag').first()).toContainText('Shift');
          }

          // One selection at a time, and Start only enables with one.
          const start = page.getByRole('button', { name: 'Start Run', exact: true });
          await expect(start, 'solo-setup: Start is disabled before a choice').toBeDisabled();
          await expect(page.getByText(/^Select one of the four decks/)).toBeVisible();

          await decks.nth(0).click();
          await expect(page.locator('.solo-deck[aria-pressed="true"]')).toHaveCount(1);
          await expect(start, 'solo-setup: Start enables with a choice').toBeEnabled();

          await decks.nth(1).click();
          await expect(page.locator('.solo-deck[aria-pressed="true"]')).toHaveCount(1);
        }

        if (route.name === 'run-overview') {
          await expect(page.getByText('1 of 4', { exact: true })).toBeVisible();

          const ladder = page.locator('.run-progress__step');
          await expect(ladder, 'run-overview: four ladder steps').toHaveCount(4);
          await expect(
            page.locator('[aria-current="step"]'),
            'run-overview: exactly one current step',
          ).toHaveCount(1);
          await expect(page.locator('.run-progress__step--current')).toContainText('Current');
          await expect(ladder.locator('.run-progress__status')).toHaveCount(4);
          await expect(ladder.first()).toContainText('health');

          await expect(page.getByRole('meter', { name: 'Run health' })).toBeVisible();
          await expect(page.locator('.run-overview__stat-value').first()).toHaveText(
            /^\d+ cards$/,
          );
          await expect(
            page.getByRole('heading', { name: /^(Next|Current) enemy$/ }),
            'run-overview: the enemy panel is titled for the live phase',
          ).toBeVisible();
        }

        if (route.name === 'reward') {
          const offers = page.locator('.reward__options button.reward-option');

          await expect(offers, 'reward: exactly three offers').toHaveCount(3);

          const labels = await offers.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute('aria-label') ?? ''),
          );

          expect(
            new Set(labels).size,
            `reward: the three offers must be distinct, received ${labels.join(', ')}`,
          ).toBe(3);
          await expect(page.getByText(/^Health: \d+ \/ 40$/)).toBeVisible();

          // The deliberate two-step interaction (§5.2).
          const confirm = page.locator('.solo-bar__primary');
          await expect(confirm, 'reward: nothing is selected yet').toHaveText('Take reward');
          await expect(confirm).toBeDisabled();
          await expect(page.locator('.solo-bar__status, #reward-summary')).toContainText(
            REWARD_PROMPT,
          );

          await offers.nth(0).click();
          await expect(offers.nth(0), 'reward: the offer reports itself selected').toHaveAttribute(
            'aria-pressed',
            'true',
          );
          await expectScreen(page, 'reward', 'after selecting a reward');
          await expect(confirm, 'reward: the confirm is labelled with the choice').toHaveText(
            /^Take /,
          );
          await expect(confirm).toBeEnabled();
        }

        // AB-C2 - exactly one action seal, a native button with a name.
        const seals = page.locator('#main-content .shell__button');
        await expect(seals, `${route.name}: one action seal`).toHaveCount(1);
        const seal = seals.first();
        await expect(seal).toHaveJSProperty('tagName', 'BUTTON');
        await expect(seal).toHaveAccessibleName(route.primary);

        // AB-A4 - one polite region for the whole app.
        await expect(page.getByRole('status')).toHaveCount(1);

        // AB-P4 - no ellipsis and the type floors hold.
        const boxes = await readTextFloors(page);

        expect(boxes.length, `${route.name}: no rendered text was measured`).toBeGreaterThan(0);

        for (const entry of boxes) {
          expect(
            entry.uppercase ? entry.size >= 11 : entry.size >= 12,
            `${route.name}: "${entry.text}" renders at ${String(entry.size)}px${
              entry.uppercase ? ' (uppercase label)' : ''
            }`,
          ).toBe(true);
        }

        const ellipsis = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('#main-content *'))
            .filter((element) => window.getComputedStyle(element).textOverflow === 'ellipsis')
            .map((element) => (element.textContent ?? '').trim().slice(0, 40)),
        );

        expect(ellipsis, `${route.name}: no text is truncated with an ellipsis`).toEqual([]);

        // AB-G4 / AB-G5 - no side scroll and every target is 44px.
        await expectNoHorizontalScroll(page);

        const targets = await readTargets(page);
        expect(targets.length, `${route.name}: no interactive elements`).toBeGreaterThan(0);

        for (const target of targets) {
          expect(
            target.width,
            `${route.name} at ${viewport.label}: <${target.tag}> "${target.label}" is ${target.width}px wide`,
          ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(
            target.height,
            `${route.name} at ${viewport.label}: <${target.tag}> "${target.label}" is ${target.height}px tall`,
          ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }

        // AB-P1 - the primary action sits in the lowest 288px, inside the frame.
        if (mobile) {
          const sealBox = await boxOf(page, '#main-content .shell__button');

          expect(
            sealBox.y,
            `${route.name}: the primary action starts at ${String(sealBox.y)}px, above the ${String(
              viewport.height - 288,
            )}px thumb envelope`,
          ).toBeGreaterThanOrEqual(viewport.height - 288);
          expect(
            sealBox.y + sealBox.height,
            `${route.name}: the primary action must be fully inside the viewport`,
          ).toBeLessThanOrEqual(viewport.height + 1);
          expect(sealBox.x, `${route.name}: at least 8px from the left edge`).toBeGreaterThanOrEqual(8);
          expect(
            sealBox.x + sealBox.width,
            `${route.name}: at least 8px from the right edge`,
          ).toBeLessThanOrEqual(viewport.width - 8 + 1);
        }

        // AB-T2 - the route box is centred inside the cap.
        const routeBox = await boxOf(page, '#main-content');
        const cap = viewport.width >= 1280 ? 1080 : 984;

        expect(
          routeBox.width,
          `${route.name}: the content box is ${String(routeBox.width)}px, wider than the ${String(
            cap,
          )}px cap`,
        ).toBeLessThanOrEqual(cap + 1);

        const leftGap = routeBox.x;
        const rightGap = viewport.width - (routeBox.x + routeBox.width);

        expect(
          Math.abs(leftGap - rightGap),
          `${route.name}: left gap ${String(leftGap)}px and right gap ${String(rightGap)}px differ`,
        ).toBeLessThanOrEqual(2);

        // AB-T1 / AB-T2 - the documented pair and card boxes at table width.
        if (viewport.width >= 1024) {
          const table =
            viewport.width >= 1280
              ? { deck: 512, ladder: 720, offers: 708 }
              : { deck: 460, ladder: 660, offers: 640 };

          if (route.name === 'solo-setup') {
            const first = await boxOf(page, '.solo-deck', 0);
            const second = await boxOf(page, '.solo-deck', 1);

            expect(first.width, 'solo-setup: the first deck card width').toBeCloseTo(
              table.deck,
              -1,
            );
            expect(first.y, 'solo-setup: the first two cards share a row').toBeCloseTo(
              second.y,
              -1,
            );
            expect(second.x, 'solo-setup: the second card is beside the first').toBeGreaterThan(
              first.x + first.width,
            );
          }

          if (route.name === 'run-overview') {
            const ladder = await boxOf(page, '.run-progress');
            const side = await boxOf(page, '.run-overview__side');

            expect(
              side.x,
              'run-overview: the status column sits beside the ladder, not below it',
            ).toBeGreaterThan(ladder.x + ladder.width);
            expect(ladder.width, 'run-overview: the ladder column width').toBeCloseTo(
              table.ladder,
              -1,
            );
          }

          if (route.name === 'reward') {
            const offers = await boxOf(page, '.reward__options');

            expect(offers.width, 'reward: the dealt row width').toBeCloseTo(table.offers, -1);
          }
        }
      });
    }

    if (viewport.width === 375 || viewport.width === 1280) {
      test(`solo reward axe at ${viewport.label}`, async ({ page }) => {
        test.setTimeout(180_000);

        const errors = collectConsoleErrors(page);

        await visitReward(page);
        await expectScreen(page, 'reward', `${viewport.label} reward axe`);
        await page.evaluate(() => document.fonts.ready);

        await analyse(page, 'reward');

        expectNoConsoleErrors(errors, `reward at ${viewport.label}`);
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Reading scope — documents and results (ticket 6)                           */
/* -------------------------------------------------------------------------- */

/**
 * The reading half of the bar, from `reading-screens.md` §2–§6 and §10.1.
 *
 * How to Play and Settings are measured at all five viewports here: their
 * named objects (`AB-C1`), the single action seal (`AB-C2`), the text floors
 * (`AB-P4`), no clipped text or control (`AB-G3`), route focus (`AB-G6`), the
 * one live region (`AB-A4`), the measured pair and widths (`AB-T1`/`AB-T2`), the
 * contrast branches (`AB-A7`) and the rendered identity and ban checks
 * (`AB-V2`/`AB-V5`).
 *
 * `AB-P1` does not apply on these two routes: the bar scopes the 288px thumb
 * envelope to play routes, and §3.3 pins only the phone `Contents` strip, so the
 * `Back to menu` action is deliberately at the end of a scrolling document rather
 * than under the thumb. That exemption is asserted here rather than left silent.
 *
 * The result routes are reached by playing, so their bar checks live in
 * `reading-screens.spec.ts`, which measures all five viewports by resizing the
 * one settled route instead of replaying the run and the duel five times.
 */

type DocumentRouteName = 'how-to-play' | 'settings';

interface DocumentRoute {
  readonly name: DocumentRouteName;
  /** `AB-C2`: the one action seal, or null when the route has no ember fill. */
  readonly primary: RegExp | null;
  readonly visit: (page: Page) => Promise<void>;
}

const READING_DOCUMENTS: readonly DocumentRoute[] = [
  {
    name: 'how-to-play',
    primary: /^Back to menu$/,
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'How to Play', exact: true }).click();
      await expectScreen(page, 'how-to-play', 'reading bar');
    },
  },
  {
    name: 'settings',
    primary: null,
    visit: async (page) => {
      await openApp(page, SEED);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expectScreen(page, 'settings', 'reading bar');
    },
  },
];

/** Every text-bearing element's rendered size, for the `AB-P4` floors. */
async function readReadingText(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#main-content *'))
      .map((element) => {
        const text = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => (node.textContent ?? '').trim())
          .join(' ')
          .trim();
        const style = window.getComputedStyle(element);

        return {
          selector: `${element.tagName.toLowerCase()}.${element.className}`,
          text,
          size: Number.parseFloat(style.fontSize),
          uppercase: style.textTransform === 'uppercase',
          overflow: style.textOverflow,
          clipped: element.scrollWidth > element.clientWidth + 1,
          rendered:
            text !== '' &&
            element.getClientRects().length > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.position !== 'absolute',
        };
      })
      .filter((entry) => entry.rendered),
  );
}

for (const viewport of VIEWPORTS) {
  test.describe(`reading bar ${viewport.label}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });

    for (const route of READING_DOCUMENTS) {
      test(`${route.name} at ${viewport.label}: objects, seal, focus, text, targets and widths`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);

        await route.visit(page);
        await page.evaluate(() => document.fonts.ready);

        // AB-C1 - the masthead, the reading document and, on How to Play, the
        // contents surface. Settings has no contents by design (§4.1).
        await expect(page.locator('.document__masthead')).toHaveCount(1);
        await expect(page.locator('.document__eyebrow')).toBeVisible();
        await expect(page.locator('.document__title')).toBeVisible();
        await expect(page.locator('.document__tagline')).toBeVisible();
        await expect(page.locator('.document__sheet')).toHaveCount(1);
        await expect(page.locator('.document__sheet').first()).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Back', exact: true }),
        ).toHaveCount(1);

        if (route.name === 'how-to-play') {
          await expect(page.locator('.contents')).toHaveCount(1);
          await expect(page.locator('.document__sheet h2')).toHaveCount(6);
        } else {
          await expect(page.locator('.contents')).toHaveCount(0);
          await expect(page.getByRole('switch')).toHaveCount(2);
        }

        // AB-G6 - the route change lands on the destination h1 with the ring.
        const focus = await page.evaluate(() => {
          const active = document.activeElement;

          if (!(active instanceof HTMLElement)) {
            return null;
          }

          const style = getComputedStyle(active);

          return {
            tag: active.tagName,
            marked: active.hasAttribute('data-route-focus'),
            outline: style.outlineStyle,
            width: style.outlineWidth,
          };
        });

        expect(focus?.tag, `${route.name}: the route heading takes focus`).toBe('H1');
        expect(focus?.marked).toBe(true);
        expect(focus?.outline).toBe('solid');
        expect(focus?.width).toBe('2px');

        // AB-C2 - one ember action seal on How to Play, none on Settings (its
        // only action is the quiet masthead Back).
        const seals = page.locator('#main-content .shell__button');

        if (route.primary === null) {
          await expect(seals, `${route.name}: no ember action seal`).toHaveCount(0);
          await expect(
            page.getByRole('button', { name: 'Back', exact: true }),
            `${route.name}: exactly one Back`,
          ).toHaveCount(1);
        } else {
          await expect(seals, `${route.name}: one action seal`).toHaveCount(1);
          await expect(seals.first()).toHaveJSProperty('tagName', 'BUTTON');
          await expect(seals.first()).toHaveAccessibleName(route.primary);
        }

        // AB-A4 - exactly one polite live region and no live line on the route.
        const live = await page.evaluate(() => ({
          statuses: document.querySelectorAll('[role="status"]').length,
          liveRegions: document.querySelectorAll('[aria-live]').length,
          inMain: document.querySelectorAll(
            '#main-content [role="status"], #main-content [aria-live]',
          ).length,
          text: document.querySelector('[role="status"]')?.textContent?.trim() ?? '',
        }));

        expect(live.statuses, `${route.name}: one app-wide polite status`).toBe(1);
        expect(live.liveRegions, `${route.name}: no second live region`).toBe(1);
        expect(live.inMain, `${route.name}: the reading route adds no live line`).toBe(0);
        expect(live.text, `${route.name}: arriving is not a settled transition`).toBe('');

        // AB-P4 / AB-G3 - text floors, no ellipsis, nothing clipped.
        const text = await readReadingText(page);

        expect(text.length, `${route.name}: no rendered text was measured`).toBeGreaterThan(0);

        for (const entry of text) {
          expect(
            entry.uppercase ? entry.size >= 11 : entry.size >= 12,
            `${route.name}: "${entry.text}" renders at ${String(entry.size)}px${
              entry.uppercase ? ' (uppercase label)' : ''
            }`,
          ).toBe(true);
          expect(entry.overflow, `${route.name}: "${entry.text}" uses an ellipsis`).not.toBe(
            'ellipsis',
          );
          expect(entry.clipped, `${route.name}: "${entry.text}" is clipped`).toBe(false);
        }

        const clippedControls = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('#main-content button, #main-content a[href]'))
            .filter(
              (node) =>
                node.getClientRects().length > 0 &&
                (node.scrollWidth > node.clientWidth + 1 ||
                  node.scrollHeight > node.clientHeight + 1),
            )
            .map((node) => (node.textContent ?? '').trim().slice(0, 40)),
        );

        expect(clippedControls, `${route.name}: a focusable control is clipped`).toEqual([]);

        // AB-G4 / AB-G5 - no side scroll, every target 44px.
        await expectNoHorizontalScroll(page);

        for (const target of await readTargets(page)) {
          expect(
            target.width,
            `${route.name} at ${viewport.label}: <${target.tag}> "${target.label}" is ${target.width}px wide`,
          ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(
            target.height,
            `${route.name} at ${viewport.label}: <${target.tag}> "${target.label}" is ${target.height}px tall`,
          ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }

        // AB-P1 exemption: the reading routes pin only the contents strip.
        if (viewport.width < 768 && route.name === 'how-to-play') {
          const sticky = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLElement>('#main-content *'))
              .filter((node) => ['sticky', 'fixed'].includes(getComputedStyle(node).position))
              .map((node) => node.className),
          );

          expect(sticky, 'only the Contents strip is pinned').toEqual(['contents']);
        }

        // AB-T2 - the route column never exceeds the cap and stays centred.
        const routeBox = await boxOf(page, '#main-content');
        const cap = viewport.width >= 1280 ? 1080 : viewport.width >= 1024 ? 984 : viewport.width;

        expect(routeBox.width).toBeLessThanOrEqual(cap + 1);

        const leftGap = routeBox.x;
        const rightGap = viewport.width - (routeBox.x + routeBox.width);
        expect(Math.abs(leftGap - rightGap), `${route.name}: the column is centred`).toBeLessThanOrEqual(2);

        // AB-T1 / AB-T2 - the named boxes in §13.4.
        if (viewport.width >= 1024) {
          const sheet = await boxOf(page, '.document__sheet');
          expect(Math.abs(sheet.width - 672), `${route.name}: the sheet is 42rem`).toBeLessThanOrEqual(8);

          if (route.name === 'how-to-play') {
            const rail = await boxOf(page, '.contents');
            expect(Math.abs(rail.width - 224), 'the contents rail is 224px').toBeLessThanOrEqual(8);
            expect(rail.x + rail.width, 'the rail sits left of the sheet').toBeLessThan(sheet.x);
          } else {
            const sheetCentre = sheet.x + sheet.width / 2;
            expect(
              Math.abs(sheetCentre - viewport.width / 2),
              'the settings sheet is centred',
            ).toBeLessThanOrEqual(2);
          }
        }

        // AB-A7 - the contrast and forced-colors branches drop the materials.
        await page.emulateMedia({ forcedColors: 'active' });

        const forced = await page.evaluate(() => {
          const sheet = document.querySelector('.document__sheet');
          if (sheet === null) {
            return null;
          }
          const style = getComputedStyle(sheet);
          return { image: style.backgroundImage, rule: Number.parseFloat(style.borderTopWidth) };
        });

        expect(forced?.image, 'forced-colors must drop the paper material').toBe('none');
        expect(forced?.rule, 'forced-colors must keep a visible rule').toBeGreaterThanOrEqual(1);

        await page.emulateMedia({ forcedColors: 'none' });
        await page.emulateMedia({ contrast: 'more' });

        const more = await page.evaluate(() => {
          const sheet = document.querySelector('.document__sheet');
          if (sheet === null) {
            return null;
          }
          const style = getComputedStyle(sheet);
          return { image: style.backgroundImage, rule: Number.parseFloat(style.borderTopWidth) };
        });

        expect(more?.image, 'prefers-contrast must drop the paper material').toBe('none');
        expect(more?.rule, 'prefers-contrast must harden the rule').toBeGreaterThanOrEqual(2);

        await page.emulateMedia({ contrast: 'no-preference' });

        // AB-V2 / AB-V5 - slate page, parchment sheet, no banned motif.
        const identity = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>('#main-content *'));
          const sheet = document.querySelector('.document__sheet');

          return {
            page: getComputedStyle(document.body).backgroundColor,
            sheet: sheet === null ? '' : getComputedStyle(sheet).backgroundColor,
            filters: nodes.filter((node) => getComputedStyle(node).filter !== 'none').length,
            backdrops: nodes.filter((node) => getComputedStyle(node).backdropFilter !== 'none').length,
            trueBlack: nodes.filter((node) => getComputedStyle(node).backgroundColor === 'rgb(0, 0, 0)')
              .length,
            tables: document.querySelectorAll('#main-content table, #main-content form').length,
          };
        });

        expect(identity.page, `${route.name}: the page ground is warm slate`).toBe(SLATE_PAGE);
        expect(identity.sheet, `${route.name}: the one parchment material`).toBe(
          'rgb(244, 232, 207)',
        );
        expect(identity.filters, `${route.name}: no CSS filter motif`).toBe(0);
        expect(identity.backdrops, `${route.name}: no glassmorphism`).toBe(0);
        expect(identity.trueBlack, `${route.name}: true black is not a surface`).toBe(0);
        expect(identity.tables, `${route.name}: no table or form furniture`).toBe(0);

        expectNoConsoleErrors(errors, `${route.name} reading bar`);
      });
    }
  });
}


/* -------------------------------------------------------------------------- */
/* Duel scope (AB-C1, C2, A1, A4, A5, P2, G1, G4, G5)                         */
/* -------------------------------------------------------------------------- */

const DUEL_BAR_SEED = 20261104;

async function openDuelSetup(page: Page): Promise<void> {
  await openApp(page, DUEL_BAR_SEED);
  await page.getByRole('button', { name: 'Local Duel', exact: true }).click();
  await expectScreen(page, 'duel-setup', 'the duel setup');
}

async function lockDuelDecks(page: Page): Promise<void> {
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
}

async function revealDuelBoard(page: Page): Promise<void> {
  await lockDuelDecks(page);
  await page.getByRole('button', { name: 'Start Match', exact: true }).click();
  await expectScreen(page, 'privacy', 'Start Match');
  await page.getByRole('button', { name: "I'm ready", exact: true }).click();
  await expectScreen(page, 'battle', "I'm ready");
  await expect(
    page.locator('[data-duel-battle="true"]'),
    'The duel board did not mount after the ready action.',
  ).toBeVisible();
}

for (const viewport of AXE_VIEWPORTS) {
  test.describe(`duel axe ${viewport.label}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });

    test(`AB-A1 axe reports zero WCAG 2.1 A/AA violations on the duel setup at ${viewport.label}`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await openDuelSetup(page);
      await page.evaluate(() => document.fonts.ready);
      await analyse(page, 'duel-setup');

      expectNoConsoleErrors(errors, `duel setup at ${viewport.label}`);
    });

    test(`AB-A1 axe reports zero WCAG 2.1 A/AA violations on privacy at ${viewport.label}`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await openDuelSetup(page);
      await lockDuelDecks(page);
      await page.getByRole('button', { name: 'Start Match', exact: true }).click();
      await expectScreen(page, 'privacy', 'duel privacy axe');
      await page.evaluate(() => document.fonts.ready);

      // Privacy must stay green with no deferred rule at all.
      await analyse(page, 'privacy');

      expectNoConsoleErrors(errors, `duel privacy at ${viewport.label}`);
    });

    test(`AB-A1 axe reports zero WCAG 2.1 A/AA violations on the duel board at ${viewport.label}`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await openDuelSetup(page);
      await revealDuelBoard(page);
      await page.evaluate(() => document.fonts.ready);

      // The board keeps the battle hand-card exemption (AB-A1 recorded).
      await analyse(page, 'battle');

      expectNoConsoleErrors(errors, `duel board at ${viewport.label}`);
    });
  });
}

test.describe('duel bar 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('AB-C1/C2 setup, privacy and board named objects', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await openDuelSetup(page);

    await expect(
      page.getByRole('button', { name: /^Choose the .* deck$/ }),
      'AB-C1: the duel setup must offer four deck cards.',
    ).toHaveCount(4);
    await expect(
      page.getByText('Player 2, look away.', { exact: true }),
      'AB-C1: the look-away banner is missing.',
    ).toBeVisible();

    await lockDuelDecks(page);

    await expect(
      page.getByRole('heading', { level: 2, name: 'Both decks are locked', exact: true }),
      'AB-C1: the locked summary is missing.',
    ).toBeVisible();
    await expect(
      page.locator('.duel-locked'),
      'AB-C1: the summary must show both locked deck cards.',
    ).toHaveCount(2);

    // AB-C2: exactly one action seal on setup, and it is the Start button.
    const setupSeals = page.locator('#main-content .duel-bar__primary');

    await expect(setupSeals, 'AB-C2: the setup has one action seal.').toHaveCount(1);
    await expect(setupSeals).toHaveAccessibleName('Start Match');

    await page.getByRole('button', { name: 'Start Match', exact: true }).click();
    await expectScreen(page, 'privacy', 'the duel privacy');

    // AB-A5 and AB-C1: the arriving seat, the look-away line, the public score
    // and exactly one action, with no board/hand/count/back/meter/field/log.
    await assertPrivacyInvariant(page, 'Player 1', 'AB-A5 duel privacy');
    await expect(
      page.getByRole('button', { name: "I'm ready", exact: true }),
      'AB-C2: privacy has exactly one action.',
    ).toHaveCount(1);
    await expect(
      page.locator('.duel-privacy__ready'),
      'AB-C2: the ready action carries the action seal.',
    ).toHaveCount(1);

    await page.getByRole('button', { name: "I'm ready", exact: true }).click();
    await expectScreen(page, 'battle', 'the duel board');

    // AB-C1: the board's named objects.
    await expect(
      page.getByRole('region', { name: 'Battle', exact: true }),
      'AB-C1: the duel board region is missing.',
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Player 1 (you)' }),
      'AB-C1: the self region is missing.',
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Player 2' }),
      'AB-C1: the opponent region is missing.',
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Your hand' }),
      'AB-C1: the active hand region is missing.',
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Battle log' }),
      'AB-C1: the public log region is missing.',
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Turn controls' }),
      'AB-C1: the turn controls are missing.',
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Series score' }),
      'AB-C1: the series strip is missing.',
    ).toHaveCount(1);
    await expect(
      page.locator('[data-series-pip]'),
      'AB-C1: the strip must carry three named pips.',
    ).toHaveCount(3);
    await expect(
      page.locator('[data-hand-count]'),
      'AB-C1: the opponent hand count is missing.',
    ).toHaveText(/^\d+ cards? in hand$/);

    // AB-C2: one action seal on the board.
    await expect(
      page.locator('#main-content .battle-controls__end'),
      'AB-C2: the board has exactly one turn action.',
    ).toHaveCount(1);

    expectNoConsoleErrors(errors, 'duel named objects at 390');
  });

  test('AB-A4 one polite live region and no live log', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await openDuelSetup(page);
    await revealDuelBoard(page);

    await expect(
      page.getByRole('status'),
      'AB-A4: exactly one polite live region may exist.',
    ).toHaveCount(1);
    await expect(
      page.locator('[data-battle-log="true"] [aria-live]'),
      'AB-A4: the duel log must never be live.',
    ).toHaveCount(0);

    expectNoConsoleErrors(errors, 'duel live region at 390');
  });

  test('AB-G1/P2/G4/G5 the board and privacy never page-scroll', async ({
    page,
  }) => {
    await openDuelSetup(page);
    await lockDuelDecks(page);
    await page.getByRole('button', { name: 'Start Match', exact: true }).click();
    await expectScreen(page, 'privacy', 'the privacy lock');

    const privacyMetrics = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    expect(privacyMetrics.scrollWidth, 'AB-G4: privacy must not scroll sideways').toBeLessThanOrEqual(
      privacyMetrics.width + 1,
    );
    expect(privacyMetrics.scrollHeight, 'AB-G1: privacy must not page-scroll').toBeLessThanOrEqual(
      privacyMetrics.height + 1,
    );

    await page.getByRole('button', { name: "I'm ready", exact: true }).click();
    await expectScreen(page, 'battle', 'the duel board lock');

    const boardMetrics = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    expect(boardMetrics.scrollWidth, 'AB-G4: the board must not scroll sideways').toBeLessThanOrEqual(
      boardMetrics.width + 1,
    );
    expect(boardMetrics.scrollHeight, 'AB-G1/AB-P2: the board must lock to 100svh').toBeLessThanOrEqual(
      boardMetrics.height + 1,
    );

    const targets = await readTargets(page);

    for (const target of targets) {
      expect(
        target.width,
        `AB-G5: <${target.tag} class="${target.className}"> "${target.label}" is ${target.width}px wide`,
      ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(
        target.height,
        `AB-G5: <${target.tag} class="${target.className}"> "${target.label}" is ${target.height}px tall`,
      ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });
});
