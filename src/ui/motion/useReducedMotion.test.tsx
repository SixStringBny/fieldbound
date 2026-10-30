import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReducedMotionOverride } from './useReducedMotion';
import {
  getSystemReducedMotion,
  REDUCED_MOTION_QUERY,
  reducedMotionAttribute,
  resolveReducedMotion,
  useReducedMotion,
} from './useReducedMotion';

/* -------------------------------------------------------------------------- */
/* matchMedia fake                                                            */
/* -------------------------------------------------------------------------- */

type ChangeListener = (event: MediaQueryListEvent) => void;

interface FakeMedia {
  readonly query: MediaQueryList;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly listeners: Set<ChangeListener>;
  setMatches: (matches: boolean) => void;
}

/**
 * jsdom's MediaQueryList never changes on its own, so each test installs a
 * controllable one. The same object is returned for every call, mirroring a
 * browser where matchMedia caches per query.
 */
function installMatchMedia(initialMatches: boolean): FakeMedia {
  const listeners = new Set<ChangeListener>();

  const addEventListener = vi.fn((type: string, listener: ChangeListener) => {
    if (type === 'change') {
      listeners.add(listener);
    }
  });

  const removeEventListener = vi.fn((type: string, listener: ChangeListener) => {
    if (type === 'change') {
      listeners.delete(listener);
    }
  });

  const query = {
    matches: initialMatches,
    media: REDUCED_MOTION_QUERY,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: addEventListener,
    removeListener: removeEventListener,
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;

  const matchMedia = vi.fn((media: string) => {
    expect(media).toBe(REDUCED_MOTION_QUERY);
    return query;
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  return {
    query,
    addEventListener,
    removeEventListener,
    listeners,
    setMatches(next: boolean) {
      (query as { matches: boolean }).matches = next;
      const event = {
        matches: next,
        media: REDUCED_MOTION_QUERY,
      } as MediaQueryListEvent;

      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

describe('useReducedMotion', () => {
  it('returns true when the system query matches on first render', () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('returns false when the system query does not match', () => {
    installMatchMedia(false);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('lets an explicit true override beat a non-matching system preference', () => {
    installMatchMedia(false);

    const { result } = renderHook(
      ({ override }: { override: ReducedMotionOverride }) =>
        useReducedMotion(override),
      { initialProps: { override: true as ReducedMotionOverride } },
    );

    expect(result.current).toBe(true);
  });

  it('lets an explicit false override beat a matching system preference', () => {
    installMatchMedia(true);

    const { result } = renderHook(
      ({ override }: { override: ReducedMotionOverride }) =>
        useReducedMotion(override),
      { initialProps: { override: false as ReducedMotionOverride } },
    );

    expect(result.current).toBe(false);
  });

  it('falls back to the system preference when the override is cleared', () => {
    installMatchMedia(true);

    const { result, rerender } = renderHook(
      ({ override }: { override: ReducedMotionOverride }) =>
        useReducedMotion(override),
      { initialProps: { override: false as ReducedMotionOverride } },
    );

    expect(result.current).toBe(false);

    rerender({ override: null });
    expect(result.current).toBe(true);
  });

  it('follows media-query change events and removes its listener on unmount', () => {
    const fake = installMatchMedia(false);

    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    expect(fake.listeners.size).toBe(1);
    expect(fake.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    act(() => {
      fake.setMatches(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      fake.setMatches(false);
    });
    expect(result.current).toBe(false);

    unmount();

    expect(fake.listeners.size).toBe(0);
    expect(fake.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('treats a missing matchMedia as motion allowed and still returns', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(getSystemReducedMotion()).toBe(false);

    const systemOnly = renderHook(() => useReducedMotion());
    expect(systemOnly.result.current).toBe(false);

    // An explicit override still works even without a media-query source.
    const forced = renderHook(() => useReducedMotion(true));
    expect(forced.result.current).toBe(true);
  });

  it('exposes the resolved boolean as the app-root data attribute value', () => {
    installMatchMedia(true);

    function Harness({ override }: { readonly override: ReducedMotionOverride }) {
      const reduced = useReducedMotion(override);
      return <div data-testid="root" data-reduced-motion={reducedMotionAttribute(reduced)} />;
    }

    const { getByTestId, rerender } = render(<Harness override={null} />);
    expect(getByTestId('root').getAttribute('data-reduced-motion')).toBe('true');

    rerender(<Harness override={false} />);
    expect(getByTestId('root').getAttribute('data-reduced-motion')).toBe(
      'false',
    );
  });

  it('resolves the precedence rule identically in pure form', () => {
    expect(resolveReducedMotion(true, null)).toBe(true);
    expect(resolveReducedMotion(true, undefined)).toBe(true);
    expect(resolveReducedMotion(false, true)).toBe(true);
    expect(resolveReducedMotion(true, false)).toBe(false);
    expect(reducedMotionAttribute(true)).toBe('true');
    expect(reducedMotionAttribute(false)).toBe('false');
  });
});

/* -------------------------------------------------------------------------- */
/* Stylesheet contract                                                        */
/* -------------------------------------------------------------------------- */

function readStylesheet(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

function readMotionCss(): string {
  return readStylesheet('src/ui/motion/motion.css');
}

/** Every component stylesheet: `src/styles/*.css` plus the motion layer. */
function componentSheets(): readonly string[] {
  const styles = readdirSync(resolve(process.cwd(), 'src/styles'))
    .filter((file) => file.endsWith('.css'))
    .map((file) => `src/styles/${file}`);

  return [...styles, 'src/ui/motion/motion.css'];
}

/** Return the declarations inside the first block opened by `opener`. */
function cssBlock(css: string, opener: string): string {
  const start = css.indexOf(opener);
  expect(start, `expected ${opener} in motion.css`).toBeGreaterThan(-1);

  const open = css.indexOf('{', start);
  let depth = 0;

  for (let index = open; index < css.length; index += 1) {
    const character = css[index];

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return css.slice(open + 1, index);
      }
    }
  }

  throw new Error(`Unclosed block for ${opener}`);
}

/** The property list of every `transition` / `transition-property` value. */
function transitionedProperties(css: string): string[] {
  const properties: string[] = [];
  const pattern = /transition(?:-property)?\s*:\s*([^;}]+)/g;

  for (const match of css.matchAll(pattern)) {
    const value = match[1] ?? '';

    for (const part of value.split(',')) {
      const property = part.trim().split(/\s+/)[0] ?? '';

      if (property !== '') {
        properties.push(property);
      }
    }
  }

  return properties;
}

/** The animated properties of every `@keyframes` step. */
function animatedProperties(css: string): string[] {
  const properties: string[] = [];

  for (const match of css.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
    const from = match.index ?? 0;
    let depth = 0;
    let end = from;

    for (let index = css.indexOf('{', from); index < css.length; index += 1) {
      if (css[index] === '{') {
        depth += 1;
      } else if (css[index] === '}') {
        depth -= 1;

        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    for (const declaration of css
      .slice(from, end)
      .matchAll(/([a-z-]+)\s*:\s*[^;}]+[;}]/g)) {
      const property = declaration[1] ?? '';

      if (property !== '' && property !== 'from' && property !== 'to') {
        properties.push(property);
      }
    }
  }

  return properties;
}

describe('motion.css', () => {
  /*
   * Motion-and-feedback section 4: one beat vocabulary, every part starting at
   * t = 0 and ending by 400ms. The normal branch is everything before the first
   * reduced-motion block.
   */
  it('declares the whole beat vocabulary with the documented duration tokens', () => {
    const css = readMotionCss();
    const reducedAt = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedAt).toBeGreaterThan(-1);

    const normal = css.slice(0, reducedAt);
    const keyframes = [
      'fb-feedback-draw',
      'fb-feedback-flash',
      'fb-feedback-impact',
      'fb-feedback-chip',
      'fb-feedback-shift',
      'fb-feedback-intent',
      'fb-feedback-handoff',
    ];

    for (const name of keyframes) {
      expect(normal, name).toMatch(new RegExp(`@keyframes ${name}`));
      expect(normal, name).toMatch(
        new RegExp(`animation:\\s*${name} var\\(--fb-dur-`),
      );
    }

    const tokens = [
      '--fb-dur-draw',
      '--fb-dur-play',
      '--fb-dur-damage',
      '--fb-dur-shift',
      '--fb-dur-lift',
    ];

    for (const token of tokens) {
      expect(normal, token).toMatch(new RegExp(`var\\(${token}\\)`));
    }
  });

  it('binds every beat element to its data attribute', () => {
    const css = readMotionCss();

    expect(css).toMatch(/\.hand\[data-dealt='true'\] \.hand__item/);
    expect(css).toMatch(/\.battle-feedback\s*\{/);
    expect(css).toMatch(/\.battle-feedback__flash\s*\{/);
    expect(css).toMatch(/\.battle-feedback__impact\s*\{/);
    expect(css).toMatch(/\.battle-feedback__chip\s*\{/);
    expect(css).toMatch(/\.field-banner__shift\s*\{/);
    expect(css).toMatch(
      /\.enemy-panel__intent\[data-intent-reveal='true'\]\s*\{/,
    );
    expect(css).toMatch(/\[data-feedback-handoff='true'\]\s*\{/);
  });

  it('retires the dead [data-motion] hooks', () => {
    expect(readMotionCss()).not.toMatch(/data-motion/);
  });

  it('animates only transform and opacity (section 9.1 allowlist)', () => {
    expect(animatedProperties(readMotionCss()).every((property) =>
      ['opacity', 'transform'].includes(property),
    )).toBe(true);
  });

  it('caps transitions and removes transforms under the OS preference', () => {
    const css = readMotionCss();
    const reduced = cssBlock(css, '@media (prefers-reduced-motion: reduce)');
    const beatSelectors = [
      '.hand__item',
      '.battle-feedback',
      '.battle-feedback__flash',
      '.battle-feedback__impact',
      '.battle-feedback__chip',
      '.field-banner__shift',
      ".enemy-panel__intent[data-intent-reveal='true']",
      "[data-feedback-handoff='true']",
    ];

    for (const selector of beatSelectors) {
      expect(reduced, selector).toContain(selector);
    }

    expect(reduced).toMatch(/transition-duration:\s*var\(--fb-dur-instant\)/);
    expect(reduced).toMatch(/transform:\s*none/);
    expect(reduced).toMatch(/animation:\s*none/);

    // Nothing decorative renders in a reduced form at all.
    expect(reduced).toMatch(
      /\.battle-feedback,\s*\.field-banner__shift\s*\{\s*display:\s*none/,
    );
  });

  it('gives the explicit override both directions, with reduced rules capped', () => {
    const css = readMotionCss();
    const trueAt = css.indexOf("[data-reduced-motion='true'] .hand__item");
    const falseAt = css.indexOf("[data-reduced-motion='false'] .hand");

    expect(trueAt).toBeGreaterThan(-1);
    expect(falseAt).toBeGreaterThan(trueAt);

    const forcedReduced = css.slice(trueAt, falseAt);

    expect(forcedReduced).toMatch(/transition-duration:\s*var\(--fb-dur-instant\)/);
    expect(forcedReduced).toMatch(/transform:\s*none/);
    expect(forcedReduced).toMatch(/animation:\s*none/);
    expect(forcedReduced).toMatch(
      /\.battle-feedback,\s*\[data-reduced-motion='true'\] \.field-banner__shift/,
    );

    const forcedMotion = css.slice(falseAt);

    expect(forcedMotion).toMatch(/animation:\s*fb-feedback-draw/);
    expect(forcedMotion).toMatch(/animation:\s*fb-feedback-impact/);
    expect(forcedMotion).toMatch(/animation:\s*fb-feedback-handoff/);
    expect(forcedMotion).toMatch(/transition-duration:\s*var\(--fb-dur-shift\)/);

    // "Motion on" is restored last, after every reduced block.
    expect(css.lastIndexOf("[data-reduced-motion='false']")).toBeGreaterThan(
      css.indexOf('[data-feedback-handoff=\'true\'] {\n  animation'),
    );
  });
});

describe('the motion performance envelope', () => {
  it('leaves no box-shadow transition in any component stylesheet', () => {
    for (const sheet of componentSheets()) {
      expect(transitionedProperties(readStylesheet(sheet)), sheet).not.toContain(
        'box-shadow',
      );
    }
  });

  it('transitions no layout or filter property anywhere', () => {
    const forbidden = [
      'box-shadow',
      'filter',
      'background-position',
      'width',
      'height',
      'top',
      'left',
      'right',
      'bottom',
      'margin',
      'padding',
      'font-size',
    ];

    for (const sheet of componentSheets()) {
      for (const property of transitionedProperties(readStylesheet(sheet))) {
        expect(forbidden, `${sheet}: transition on ${property}`).not.toContain(
          property,
        );
      }
    }
  });
});
