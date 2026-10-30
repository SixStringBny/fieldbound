import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cross-route consistency contract (ticket #31).
 *
 * The polish pass leaves one uppercase-label rule and one rule language on the
 * remaining routes. These are source checks: the rendered checks stay in the
 * route specs and the five-viewport sweep.
 */

const STYLE_DIR = resolve(process.cwd(), 'src/styles');

function styleFiles(): readonly string[] {
  return readdirSync(STYLE_DIR)
    .filter((file) => file.endsWith('.css'))
    .map((file) => join(STYLE_DIR, file));
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

interface CssBlock {
  readonly selector: string;
  readonly body: string;
}

function blocksOf(css: string): readonly CssBlock[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim().split('\n').pop()?.trim() ?? '',
    body: match[2] ?? '',
  }));
}

/** Display type and button copy are not labels. */
const UPPERCASE_EXEMPT = [
  '.menu__wordmark',
  '.field-banner__title',
  '.battle-controls__end',
  '.battle-log__toggle',
];

describe('route consistency', () => {
  it('allows no dashed or dotted rule except the labelled art fallback', () => {
    for (const file of styleFiles()) {
      const css = withoutComments(readFileSync(file, 'utf8')).replace(
        /\.asset-image__fallback\s*\{[^}]*\}/g,
        '',
      );

      expect(css, `${file} still draws a dashed or dotted rule`).not.toMatch(
        /\b(?:dashed|dotted)\b/,
      );
    }
  });

  it('keeps one uppercase-label rule: 11px, 700, 0.1em', () => {
    const violations: string[] = [];

    for (const file of styleFiles()) {
      for (const { selector, body } of blocksOf(
        withoutComments(readFileSync(file, 'utf8')),
      )) {
        if (!/text-transform:\s*uppercase/.test(body)) {
          continue;
        }

        if (UPPERCASE_EXEMPT.some((exempt) => selector.includes(exempt))) {
          continue;
        }

        const size = /font-size:\s*([^;]+)/.exec(body)?.[1]?.trim();

        if (size !== undefined && size !== 'var(--fb-text-2xs)') {
          violations.push(`${file} :: ${selector} :: font-size ${size}`);
        }

        if (!/font-weight:\s*700/.test(body)) {
          violations.push(`${file} :: ${selector} :: weight is not 700`);
        }

        if (!/letter-spacing:\s*var\(--fb-tracking-label\)/.test(body)) {
          violations.push(`${file} :: ${selector} :: tracking is not label`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
