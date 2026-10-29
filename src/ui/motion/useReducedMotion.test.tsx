import { readFileSync } from 'node:fs';
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

function readMotionCss(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/ui/motion/motion.css'),
    'utf8',
  );
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

describe('motion.css', () => {
  it('defines all five documented durations on the normal branch', () => {
    const css = readMotionCss();
    const reducedAt = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedAt).toBeGreaterThan(-1);

    const normal = css.slice(0, reducedAt);
    const durations = [
      ['--fb-motion-draw', '180ms'],
      ['--fb-motion-play', '160ms'],
      ['--fb-motion-damage', '400ms'],
      ['--fb-motion-shift', '300ms'],
      ['--fb-motion-lift', '120ms'],
    ] as const;

    for (const [token, duration] of durations) {
      expect(normal).toMatch(
        new RegExp(`var\\(${token},\\s*${duration}\\)`),
      );
    }
  });

  it('animates draw, play, damage and field shift in the normal branch', () => {
    const css = readMotionCss();
    const reducedAt = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const normal = css.slice(0, reducedAt);

    expect(normal).toMatch(/@keyframes fb-motion-draw/);
    expect(normal).toMatch(/@keyframes fb-motion-play/);
    expect(normal).toMatch(/@keyframes fb-motion-damage/);
    expect(normal).toMatch(/@keyframes fb-motion-shift/);
    expect(normal).toMatch(/\[data-motion='draw'\]/);
    expect(normal).toMatch(/\[data-motion='play'\]/);
    expect(normal).toMatch(/\[data-motion='damage'\]/);
    expect(normal).toMatch(/\[data-motion='shift'\]/);
    expect(normal).toMatch(/\.field-banner[^{]*\{[^}]*transition:/s);
  });

  it('caps transitions and removes transforms under the OS preference', () => {
    const css = readMotionCss();
    const reduced = cssBlock(css, '@media (prefers-reduced-motion: reduce)');

    expect(reduced).toMatch(/transition-duration:\s*1ms/);
    expect(reduced).toMatch(/transform:\s*none/);
    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).toMatch(
      /\[data-motion='damage'\]\s*\{[^}]*animation:\s*none[^}]*opacity:\s*1/,
    );
  });

  it('gives the explicit override both directions, with reduced rules capped', () => {
    const css = readMotionCss();
    const trueAt = css.indexOf("[data-reduced-motion='true']");
    const falseAt = css.indexOf("[data-reduced-motion='false']");

    expect(trueAt).toBeGreaterThan(-1);
    expect(falseAt).toBeGreaterThan(trueAt);

    const forcedReduced = css.slice(trueAt, falseAt);
    expect(forcedReduced).toMatch(/transition-duration:\s*1ms/);
    expect(forcedReduced).toMatch(/transform:\s*none/);
    expect(forcedReduced).toMatch(/animation:\s*none/);

    const forcedMotion = css.slice(falseAt);
    expect(forcedMotion).toMatch(/animation:\s*fb-motion-draw/);
    expect(forcedMotion).toMatch(/animation:\s*fb-motion-play/);
    expect(forcedMotion).toMatch(/animation:\s*fb-motion-damage/);
    expect(forcedMotion).toMatch(
      /transition-duration:\s*var\(--fb-motion-shift,\s*300ms\)/,
    );
  });
});
