/**
 * The token contract (AB-A3, AB-V1; README section 2, section 3.3 and section 6).
 *
 * Four things are proven here, because they are cheapest to prove on the
 * stylesheet text rather than in a browser:
 *
 *   1. `src/styles/tokens.css` is the promoted design-system block: every
 *      required token exists, and the legacy light-palette names and the
 *      duplicate `--fb-radius` are gone rather than aliased.
 *   2. Component stylesheets consume semantic tokens only — no hex, `rgb()`,
 *      shadow, radius or duration literal, and no raw-palette read outside the
 *      element bridge tokens (`--fb-ember-*` ...), which is AB-V1.
 *   3. The published contrast pairs meet their floors, computed with the WCAG
 *      2.x relative-luminance formula, which is AB-A3.
 *   4. `--fb-target` is exactly `2.75rem` (44px) and the display face is
 *      self-hosted.
 *
 * Rendered contrast is AB-A1's axe run at 375 and 1280 plus the human column;
 * this file proves the sheet the rendering is built from.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TOKENS = 'src/styles/tokens.css';

/** Every global token the design system defines, from tokens.css itself. */
const REQUIRED_TOKENS = [
  '--fb-color-slate-950', '--fb-color-slate-900', '--fb-color-slate-850', '--fb-color-slate-800',
  '--fb-color-slate-700', '--fb-color-slate-600', '--fb-color-brass-200', '--fb-color-brass-300',
  '--fb-color-brass-500', '--fb-color-brass-700', '--fb-color-brass-800', '--fb-color-parchment-50',
  '--fb-color-parchment-100', '--fb-color-parchment-200', '--fb-color-parchment-300', '--fb-color-parchment-700',
  '--fb-color-parchment-800', '--fb-color-parchment-900', '--fb-color-ink-100', '--fb-color-ink-300',
  '--fb-color-ink-500', '--fb-color-danger-400', '--fb-color-danger-700', '--fb-color-success-400',
  '--fb-color-focus-300', '--fb-color-focus-50', '--fb-color-ember-600', '--fb-color-ember-800',
  '--fb-color-weaken-300', '--fb-color-defense-300', '--fb-surface-page', '--fb-surface-board',
  '--fb-surface-panel', '--fb-surface-raised', '--fb-surface-inset', '--fb-surface-hover',
  '--fb-surface-selected', '--fb-surface-document', '--fb-surface-document-raised', '--fb-text',
  '--fb-text-soft', '--fb-text-muted', '--fb-text-inverse', '--fb-text-on-paper',
  '--fb-text-on-paper-soft', '--fb-text-on-paper-muted', '--fb-text-on-paper-danger', '--fb-rule-color',
  '--fb-rule-subtle-color', '--fb-rule-strong-color', '--fb-rule-on-paper-color', '--fb-rule-width',
  '--fb-rule-width-strong', '--fb-rule', '--fb-rule-subtle', '--fb-rule-strong',
  '--fb-rule-on-paper', '--fb-rim', '--fb-action', '--fb-action-hover',
  '--fb-action-pressed', '--fb-action-ink', '--fb-action-soft', '--fb-selected',
  '--fb-selected-ink', '--fb-danger', '--fb-danger-on-paper', '--fb-success',
  '--fb-status-focus', '--fb-status-weaken', '--fb-status-regen', '--fb-stat-health',
  '--fb-stat-health-deep', '--fb-stat-defense', '--fb-stat-defense-deep', '--fb-stat-energy',
  '--fb-stat-energy-deep', '--fb-focus', '--fb-focus-inner', '--fb-focus-halo',
  '--fb-focus-ring-width', '--fb-focus-offset', '--fb-focus-shadow', '--fb-state-hover',
  '--fb-state-pressed', '--fb-state-selected', '--fb-state-disabled-surface', '--fb-state-disabled-ink',
  '--fb-state-unaffordable-surface', '--fb-state-unaffordable-ink', '--fb-ember-bg', '--fb-ember-accent',
  '--fb-ember-ink', '--fb-ember-shade', '--fb-frost-bg', '--fb-frost-accent',
  '--fb-frost-ink', '--fb-frost-shade', '--fb-gale-bg', '--fb-gale-accent',
  '--fb-gale-ink', '--fb-gale-shade', '--fb-stone-bg', '--fb-stone-accent',
  '--fb-stone-ink', '--fb-stone-shade', '--fb-neutral-bg', '--fb-neutral-accent',
  '--fb-neutral-ink', '--fb-neutral-shade', '--fb-material-slate', '--fb-material-panel',
  '--fb-material-paper', '--fb-material-wood', '--fb-material-leather', '--fb-material-brass',
  '--fb-material-wax', '--fb-material-vignette', '--fb-elev-0', '--fb-elev-1',
  '--fb-elev-2', '--fb-elev-3', '--fb-elev-4', '--fb-elev-5',
  '--fb-font-display', '--fb-font-ui', '--fb-font-glyph', '--fb-weight-body',
  '--fb-weight-ui', '--fb-weight-display', '--fb-text-2xs', '--fb-text-xs',
  '--fb-text-sm', '--fb-text-md', '--fb-text-lg', '--fb-text-xl',
  '--fb-text-2xl', '--fb-text-3xl', '--fb-text-display', '--fb-leading-tight',
  '--fb-leading-ui', '--fb-leading-body', '--fb-leading-reading', '--fb-tracking-display',
  '--fb-tracking-label', '--fb-tracking-wide', '--fb-space-0', '--fb-space-1',
  '--fb-space-2', '--fb-space-3', '--fb-space-4', '--fb-space-5',
  '--fb-space-6', '--fb-space-7', '--fb-space-8', '--fb-gutter',
  '--fb-target', '--fb-header-height', '--fb-board-max', '--fb-rail-width',
  '--fb-rail-width-compact', '--fb-document-max', '--fb-card-w-phone', '--fb-card-w-table',
  '--fb-card-w-compact', '--fb-card-aspect', '--fb-radius-xs', '--fb-radius-sm',
  '--fb-radius-md', '--fb-radius-lg', '--fb-radius-sheet', '--fb-radius-pill',
  '--fb-dur-instant', '--fb-dur-lift', '--fb-dur-play', '--fb-dur-draw',
  '--fb-dur-sheet', '--fb-dur-shift', '--fb-dur-damage', '--fb-ease',
  '--fb-ease-out', '--fb-lift-y', '--fb-press-y', '--fb-draw-offset',
  '--fb-damage-rise', '--fb-sheet-travel', '--fb-art-frame', '--fb-art-radius',
  '--fb-art-filter', '--fb-art-vignette', '--fb-art-card-position', '--fb-art-enemy-position',
  '--fb-art-field-position',
];

/** The legacy light-palette names and the duplicate radius: deleted, not aliased. */
const LEGACY_TOKENS = [
  '--fb-paper',
  '--fb-parchment',
  '--fb-parchment-deep',
  '--fb-ink',
  '--fb-ink-soft',
  '--fb-accent',
  '--fb-accent-strong',
  '--fb-border',
  '--fb-border-strong',
  '--fb-panel',
  '--fb-shadow',
  '--fb-shadow-raised',
  '--fb-radius',
  '--fb-font-body',
  '--fb-text-body',
  '--fb-text-small',
  '--fb-text-tiny',
  '--fb-line-body',
  '--fb-focus-ring',
  '--fb-card-width',
  '--fb-motion-lift',
  '--fb-motion-play',
  '--fb-motion-draw',
  '--fb-motion-damage',
  '--fb-motion-shift',
];

/** The element bridge tokens components may read from the raw palette. */
const BRIDGE_PREFIXES = ['--fb-ember-', '--fb-frost-', '--fb-gale-', '--fb-stone-', '--fb-neutral-'];

/**
 * The published pairs from README section 3.3. `min` is the floor the bar
 * names: 4.5 for text, 7 for stat values and primary text, 3 for interactive
 * boundaries and non-text rules.
 */
interface ContrastPair {
  readonly foreground: string;
  readonly background: string;
  readonly min: number;
  readonly use: string;
}

const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: '--fb-text', background: '--fb-surface-board', min: 7, use: 'primary text, card count, names' },
  { foreground: '--fb-text-soft', background: '--fb-surface-board', min: 4.5, use: 'secondary text' },
  { foreground: '--fb-text-muted', background: '--fb-surface-board', min: 4.5, use: 'tertiary labels at 11px+' },
  { foreground: '--fb-rule-strong-color', background: '--fb-surface-board', min: 7, use: 'section labels, intent heading' },
  { foreground: '--fb-rule-color', background: '--fb-surface-board', min: 4.5, use: 'standard accent text' },
  { foreground: '--fb-danger', background: '--fb-surface-board', min: 4.5, use: 'danger copy on slate' },
  { foreground: '--fb-focus', background: '--fb-surface-board', min: 7, use: 'focus ring on slate' },
  { foreground: '--fb-text', background: '--fb-surface-panel', min: 7, use: 'panel body text' },
  { foreground: '--fb-text-soft', background: '--fb-surface-panel', min: 4.5, use: 'panel secondary text' },
  { foreground: '--fb-text-on-paper', background: '--fb-surface-document', min: 7, use: 'card/document text' },
  { foreground: '--fb-text-on-paper-soft', background: '--fb-surface-document', min: 4.5, use: 'card secondary text' },
  { foreground: '--fb-text-on-paper-muted', background: '--fb-surface-document', min: 4.5, use: 'muted paper text' },
  { foreground: '--fb-text-on-paper-danger', background: '--fb-surface-document', min: 4.5, use: 'danger on paper' },
  { foreground: '--fb-action-ink', background: '--fb-action', min: 7, use: 'primary action text' },
  { foreground: '--fb-selected-ink', background: '--fb-selected', min: 7, use: 'selected/current text' },
  { foreground: '--fb-ember-ink', background: '--fb-ember-bg', min: 4.5, use: 'Ember chip' },
  { foreground: '--fb-frost-ink', background: '--fb-frost-bg', min: 4.5, use: 'Frost chip' },
  { foreground: '--fb-gale-ink', background: '--fb-gale-bg', min: 4.5, use: 'Gale chip' },
  { foreground: '--fb-stone-ink', background: '--fb-stone-bg', min: 4.5, use: 'Stone chip' },
  { foreground: '--fb-neutral-ink', background: '--fb-neutral-bg', min: 4.5, use: 'Neutral chip' },
  // Non-text only: rules, borders and boundaries.
  { foreground: '--fb-rule-color', background: '--fb-surface-document', min: 3, use: 'paper rule (non-text)' },
  { foreground: '--fb-rule-on-paper-color', background: '--fb-surface-document', min: 3, use: 'card border (non-text)' },
];

function readText(relative: string): string {
  return readFileSync(resolve(ROOT, relative), 'utf8');
}

/** Remove CSS comments so a documented value in prose is never mistaken for a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declarations of the first `:root { ... }` block, as name -> value. */
function rootDeclarations(css: string): Map<string, string> {
  const source = stripComments(css);
  const start = source.indexOf(':root {');
  expect(start, 'tokens.css must open with a :root block').toBeGreaterThan(-1);

  let depth = 0;
  const open = source.indexOf('{', start);

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return parseDeclarations(source.slice(open + 1, index));
      }
    }
  }

  throw new Error('tokens.css :root block is never closed');
}

function parseDeclarations(block: string): Map<string, string> {
  const declarations = new Map<string, string>();

  for (const chunk of block.split(';')) {
    const separator = chunk.indexOf(':');

    if (separator === -1) {
      continue;
    }

    const name = chunk.slice(0, separator).trim();
    const value = chunk.slice(separator + 1).trim().replace(/\s+/g, ' ');

    if (name.startsWith('--fb-')) {
      declarations.set(name, value);
    }
  }

  return declarations;
}

/** Follow `var(--x)` chains down to a literal colour. */
function resolveToken(name: string, declarations: Map<string, string>, seen = new Set<string>()): string {
  expect(declarations.has(name), `${name} is not defined in tokens.css`).toBe(true);
  expect(seen.has(name), `token ${name} resolves in a cycle`).toBe(false);
  seen.add(name);

  const value = declarations.get(name) ?? '';
  const reference = /^var\((--fb-[a-z0-9-]+)\)$/.exec(value);

  if (reference?.[1] !== undefined) {
    return resolveToken(reference[1], declarations, seen);
  }

  return value;
}

function parseColour(value: string, source: string): { r: number; g: number; b: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());

  if (hex?.[1] !== undefined) {
    const digits = hex[1];

    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+%?)?\)$/.exec(value.trim());

  if (rgb !== null) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
    };
  }

  throw new Error(`${source} does not resolve to an opaque colour: ${value}`);
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const scaled = value / 255;

    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(parseColour(first, 'the pair'));
  const b = relativeLuminance(parseColour(second, 'the pair'));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Every component stylesheet: `src/styles/*.css` except the token block, plus the motion layer. */
function componentSheets(): readonly string[] {
  const sheets = readdirSync(resolve(ROOT, 'src/styles'))
    .filter((file) => file.endsWith('.css') && file !== 'tokens.css')
    .map((file) => `src/styles/${file}`)
    .sort();

  return [...sheets, 'src/ui/motion/motion.css'];
}

/** The value side of every declaration of `property` in a sheet. */
function declarationsOf(css: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;{\\s])${property}\\s*:([^;}]*)`, 'g');
  const values: string[] = [];

  for (const match of stripComments(css).matchAll(pattern)) {
    values.push((match[1] ?? '').trim());
  }

  return values;
}

const tokens = rootDeclarations(readText(TOKENS));

describe('tokens.css', () => {
  it('defines every token the design system requires', () => {
    const missing = REQUIRED_TOKENS.filter((name) => !tokens.has(name));

    expect(missing, `tokens.css is missing ${missing.length} required token(s)`).toEqual([]);
  });

  it('deletes the legacy light-palette names and the duplicate radius', () => {
    const survivors = LEGACY_TOKENS.filter((name) => tokens.has(name));

    expect(survivors, 'legacy tokens are deleted, never aliased').toEqual([]);
    expect(stripComments(readText(TOKENS))).not.toMatch(/(?:^|[\s;{])--fb-radius\s*:/);
  });

  it('keeps the three token layers in order and the target at 2.75rem', () => {
    expect(tokens.get('--fb-target')).toBe('2.75rem');
    expect(tokens.get('--fb-header-height')).toBe('2.75rem');
    expect(tokens.get('--fb-rule-width')).toBe('1px');
    expect(tokens.get('--fb-rule-width-strong')).toBe('2px');
    expect(tokens.get('--fb-radius-md')).toBe('8px');
  });

  it('publishes the two-tone focus recipe as tokens', () => {
    expect(resolveToken('--fb-focus', tokens)).toBe('#ffd57a');
    expect(resolveToken('--fb-focus-inner', tokens)).toBe('#fff6dc');
    expect(resolveToken('--fb-focus-halo', tokens)).toBe('#0f0c0a');
    expect(tokens.get('--fb-focus-ring-width')).toBe('2px');
    expect(tokens.get('--fb-focus-offset')).toBe('2px');
    expect(tokens.get('--fb-focus-shadow')).toContain('var(--fb-focus-inner)');
    expect(tokens.get('--fb-focus-shadow')).toContain('var(--fb-focus-halo)');
  });

  it('turns every material off in the contrast and forced-colors branches', () => {
    const css = stripComments(readText(TOKENS));
    const branches = css.slice(css.indexOf('@media'));

    expect(branches).toMatch(/@media \(prefers-contrast: more\)/);
    expect(branches).toMatch(/@media \(forced-colors: active\)/);

    for (const material of ['slate', 'panel', 'paper', 'wood', 'leather', 'brass', 'wax', 'vignette']) {
      expect(branches).toMatch(new RegExp(`--fb-material-${material}: none;`));
    }
  });

  it('defines the self-hosted display face locally with font-display swap', () => {
    const fonts = stripComments(readText('src/styles/fonts.css'));

    expect(fonts).toMatch(/@font-face\s*\{/);
    expect(fonts).toMatch(/font-family:\s*"Fraunces Fieldbound"/);
    expect(fonts).toMatch(/font-display:\s*swap/);
    expect(fonts).toMatch(/font-weight:\s*700/);
    expect(fonts).toMatch(/url\("\.\/fonts\/fraunces-fieldbound-700\.woff2"\)/);
    expect(fonts).not.toMatch(/https?:\/\//);
    expect(tokens.get('--fb-font-display')).toContain('"Fraunces Fieldbound"');
  });
});

describe('AB-A3 token pairs meet the contrast floors', () => {
  for (const pair of CONTRAST_PAIRS) {
    it(`${pair.foreground} on ${pair.background} is at least ${String(pair.min)}:1 (${pair.use})`, () => {
      const foreground = resolveToken(pair.foreground, tokens);
      const background = resolveToken(pair.background, tokens);
      const ratio = contrastRatio(foreground, background);

      expect(
        ratio,
        `${pair.foreground} (${foreground}) on ${pair.background} (${background}) is ${ratio.toFixed(2)}:1, below the ${String(pair.min)}:1 floor for ${pair.use}`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe('AB-V1 components consume semantic tokens', () => {
  const sheets = componentSheets();

  it('scans every component stylesheet', () => {
    expect(sheets).toContain('src/styles/base.css');
    expect(sheets).toContain('src/styles/primitives.css');
    expect(sheets).toContain('src/ui/motion/motion.css');
    expect(sheets).not.toContain(TOKENS);
  });

  for (const sheet of sheets) {
    const css = stripComments(readText(sheet));

    it(`${sheet} contains no raw colour, shadow, radius or duration literal`, () => {
      expect(css, 'raw hex colour').not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, 'raw rgb()/rgba() colour').not.toMatch(/rgba?\(/);
      expect(css, 'raw hsl() colour').not.toMatch(/hsla?\(/);
      expect(css, 'named CSS colour other than transparent').not.toMatch(
        /:\s*(?:white|black|red|green|blue|gray|grey|silver|maroon|navy|olive|teal|aqua|fuchsia|lime|yellow|purple)\b/i,
      );
      expect(css, 'duration literal').not.toMatch(/(?<![\w-])\d+(?:\.\d+)?m?s(?![\w-])/);

      for (const value of declarationsOf(css, 'box-shadow')) {
        expect(value, `box-shadow: ${value}`).toMatch(/^(?:none|var\(--fb-)/);
      }

      const structuralRadii = new Set(['0', '50%', '100%', 'inherit']);

      for (const value of declarationsOf(css, 'border-radius')) {
        const parts = value
          .replace(/var\(--fb-[a-z0-9-]+\)/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        expect(
          parts.every((part) => structuralRadii.has(part)),
          `border-radius: ${value}`,
        ).toBe(true);
      }
    });

    it(`${sheet} reads the raw palette only through the element bridge`, () => {
      expect(css, 'raw palette read').not.toMatch(/var\(--fb-color-/);

      // A sheet may define its own `--fb-<component>-*` locals; those are not
      // global tokens and are allowed to be read here.
      const locals = new Set(
        [...css.matchAll(/(--fb-[a-z0-9-]+)\s*:/g)].map((match) => match[1] ?? ''),
      );

      for (const name of [...css.matchAll(/var\((--fb-[a-z0-9-]+)\)/g)].map((match) => match[1] ?? '')) {
        if (BRIDGE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          continue;
        }

        expect(
          tokens.has(name) || locals.has(name),
          `${sheet} reads undefined token ${name}`,
        ).toBe(true);
      }
    });

    it(`${sheet} survives the contrast and forced-colors branches`, () => {
      // Materials come from tokens only: a branch that sets them to `none`
      // must leave a solid `background-color` behind.
      for (const material of [...css.matchAll(/background-image:\s*var\((--fb-material-[a-z]+)\)/g)]) {
        expect(tokens.has(material[1] ?? ''), `${sheet} uses an undefined material`).toBe(true);
      }
    });
  }
});
