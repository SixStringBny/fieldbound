import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BattleLog } from './BattleLog';
import type { BattleLogLineView } from './BattleLog';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function line(
  id: string,
  ordinal: number,
  turn: number,
  factual: string,
  dialogue: string | null = null,
): BattleLogLineView {
  return { id, ordinal, turn, factual, dialogue };
}

const FIRST_LINE = line(
  't1-e0',
  0,
  1,
  'The battle begins: Cinder Warden has 30 health; the field is Neutral (nothing is empowered or countered).',
  'The field is mine to take.',
);
const SECOND_LINE = line(
  't2-e1',
  1,
  2,
  'You play Cinder Jab: 3 damage to Cinder Warden (27/30).',
);
const THIRD_LINE = line(
  't2-e2',
  2,
  2,
  'You end the turn.',
  'You steady your breath.',
);

const LINES: readonly BattleLogLineView[] = [FIRST_LINE, SECOND_LINE, THIRD_LINE];

function latestGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'Latest battle log entry' });
}

function toggleButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Log' });
}

function historyFor(toggle: HTMLElement): HTMLElement | null {
  const id = toggle.getAttribute('aria-controls');

  return id === null ? null : document.getElementById(id);
}

/* -------------------------------------------------------------------------- */
/* Empty and populated states                                                 */
/* -------------------------------------------------------------------------- */

describe('BattleLog content', () => {
  it('renders a labelled empty state and no latest sentence for an empty log', () => {
    const { container } = render(<BattleLog lines={[]} toggleLabel="Log" />);

    const region = screen.getByRole('region', { name: 'Battle log' });
    expect(region).toBe(container.querySelector('[data-battle-log="true"]'));

    const empty = screen.getByRole('note', { name: 'Battle log empty' });
    expect(empty.textContent).toContain('The battle log is empty.');

    expect(screen.queryByRole('list')).toBeNull();
    expect(container.querySelector('[data-battle-log-latest]')).toBeNull();
    expect(latestGroup().textContent?.trim()).toBe('');
  });

  it('shows the newest sentence in the always-visible strip', () => {
    const { container } = render(
      <BattleLog lines={LINES} toggleLabel="Log" />,
    );

    const latest = latestGroup();
    expect(latest.textContent).toContain(THIRD_LINE.factual);
    expect(latest.textContent).not.toContain(FIRST_LINE.factual);

    const strip = container.querySelector('[data-battle-log-latest="true"]');
    expect(strip?.textContent).toBe(THIRD_LINE.factual);

    // The strip stays visible while the history drawer is open.
    fireEvent.click(toggleButton());
    expect(within(latestGroup()).getByText(THIRD_LINE.factual)).toBeTruthy();
  });

  it('renders the history as an ordered list in chronological DOM order', () => {
    render(<BattleLog lines={LINES} toggleLabel="Log" />);

    const list = screen.getByRole('list', { name: 'Battle log entries' });
    expect(list.tagName).toBe('OL');

    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.getAttribute('data-battle-log-entry'))).toEqual(
      LINES.map((entry) => entry.id),
    );

    items.forEach((item, index) => {
      const entry = LINES[index];

      if (entry === undefined) {
        throw new Error('Fixture and rendered list disagree');
      }

      expect(item.textContent).toContain(`Turn ${entry.turn}`);
      expect(item.textContent).toContain(entry.factual);
    });

    const firstDialogue = items[0]?.querySelector('.battle-log__dialogue');
    expect(firstDialogue?.textContent).toBe('The field is mine to take.');
    expect(items[1]?.querySelector('.battle-log__dialogue')).toBeNull();
  });

  it('renders eighty entries with the last one newest', () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      line(`t1-e${String(index)}`, index, 1, `Entry ${String(index + 1)}`),
    );

    const { container } = render(
      <BattleLog lines={many} toggleLabel="Log" />,
    );

    const items = within(
      screen.getByRole('list', { name: 'Battle log entries' }),
    ).getAllByRole('listitem');

    expect(items).toHaveLength(80);
    expect(items[0]?.textContent).toContain('Entry 1');
    expect(items[79]?.textContent).toContain('Entry 80');
    expect(
      container.querySelector('[data-battle-log-latest="true"]')?.textContent,
    ).toBe('Entry 80');
  });
});

/* -------------------------------------------------------------------------- */
/* Live-region boundary                                                       */
/* -------------------------------------------------------------------------- */

describe('BattleLog announcement boundary', () => {
  it('is a labelled region and ordered list, never a live region', () => {
    const { container } = render(
      <BattleLog lines={LINES} toggleLabel="Log" />,
    );

    const region = screen.getByRole('region', { name: 'Battle log' });
    expect(region.hasAttribute('aria-live')).toBe(false);
    expect(region.getAttribute('role')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="log"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Toggle, drawer and focus                                                   */
/* -------------------------------------------------------------------------- */

describe('BattleLog toggle and drawer', () => {
  it('uses a native button with a 44px-capable box and no positive tabindex', () => {
    render(<BattleLog lines={LINES} toggleLabel="Log" />);

    const toggle = toggleButton();
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('tabindex')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).not.toBeNull();
    expect(historyFor(toggle)?.getAttribute('data-open')).toBe('false');
  });

  it('opens and closes by pointer with aria-expanded tracking the drawer', () => {
    render(<BattleLog lines={LINES} toggleLabel="Log" />);

    const toggle = toggleButton();
    const history = historyFor(toggle);
    expect(history).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(history?.getAttribute('data-open')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(history?.getAttribute('data-open')).toBe('false');
  });

  it('keeps the toggle and every entry reachable at a 375px viewport', () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    });
    window.dispatchEvent(new Event('resize'));

    try {
      render(<BattleLog lines={LINES} toggleLabel="Log" />);

      const toggle = toggleButton();
      expect(toggle.getAttribute('tabindex')).toBeNull();

      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      const list = screen.getByRole('list', { name: 'Battle log entries' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  it('opens on Enter and on Space through the button itself', () => {
    render(<BattleLog lines={LINES} toggleLabel="Log" />);

    const toggle = toggleButton();

    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // Space activates on release, after its keydown default is cancelled.
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyUp(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    // A stray keyup without a keydown is not a second activation.
    fireEvent.keyUp(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape and returns focus to the toggle', () => {
    render(<BattleLog lines={LINES} toggleLabel="Log" />);

    const toggle = toggleButton();
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('leaves Escape to an open modal dialog', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);

    try {
      render(<BattleLog lines={LINES} toggleLabel="Log" />);

      const toggle = toggleButton();
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    } finally {
      modal.remove();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Stylesheet and import contract                                             */
/* -------------------------------------------------------------------------- */

describe('BattleLog layout contract', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/styles/battle-log.css'),
    'utf8',
  );
  const source = readFileSync(
    resolve(process.cwd(), 'src/ui/components/BattleLog.tsx'),
    'utf8',
  );

  function block(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  }

  it('gives the toggle a 44px hit box and a visible focus ring', () => {
    const toggle = block('.battle-log__toggle');

    expect(toggle).toMatch(/min-width:\s*var\(--fb-target\)/);
    expect(toggle).toMatch(/min-height:\s*var\(--fb-target\)/);
    expect(css).toMatch(
      /\.battle-log__toggle:focus-visible\s*\{[^}]*outline:/,
    );
  });

  it('reserves the latest strip line so a longer entry cannot reflow the board', () => {
    expect(block('.battle-log__latest')).toMatch(/min-height:/);
    expect(block('.battle-log__latest')).toMatch(/overflow:\s*hidden/);
    expect(block('.battle-log__latest-text')).toMatch(
      /white-space:\s*nowrap/,
    );
    expect(block('.battle-log__latest-text')).toMatch(
      /text-overflow:\s*ellipsis/,
    );
  });

  it('makes the drawer the only scroll container in the log', () => {
    const scrollers = css.match(/overflow-y:\s*(?:auto|scroll)/g) ?? [];
    expect(scrollers).toHaveLength(1);

    expect(block('.battle-log__history')).toMatch(/overflow-y:\s*auto/);
    expect(block('.battle-log__history')).toMatch(
      /overscroll-behavior:\s*contain/,
    );

    // The surface itself never becomes a scroller or clips focus rings.
    expect(block('.battle-log')).not.toMatch(/overflow/);

    // The hand remains the only other horizontal scroller in the product; the
    // log must not add page-level overflow suppression.
    expect(css).not.toMatch(
      /(?:^|\n)\s*(?:html|body)[^{]*\{[^}]*overflow-x\s*:/,
    );
    expect(block('.battle-log')).toMatch(/max-width:\s*100%/);
    expect(block('.battle-log')).toMatch(/min-width:\s*0/);
  });

  it('turns the same history into a right-hand column at 1024px', () => {
    const desktopStart = css.indexOf('@media (min-width: 1024px)');
    expect(desktopStart).toBeGreaterThan(-1);

    const desktop = css.slice(desktopStart);

    expect(desktop).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(15rem,\s*20rem\)/,
    );
    expect(desktop).toMatch(
      /\[data-battle-log='true'\]\s*\{[^}]*position:\s*sticky/,
    );
    expect(desktop).toMatch(
      /\[data-battle-log='true'\]\s+\.battle-log__history\[data-open='false'\]\s*\{[^}]*display:\s*block/,
    );
    expect(desktop).toMatch(
      /\[data-battle-log='true'\]\s+\.battle-log__toggle\s*\{[^}]*display:\s*none/,
    );
  });

  it('makes entry appearance instant under reduced motion in both directions', () => {
    const reducedStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedStart).toBeGreaterThan(-1);

    const osReduced = css.slice(
      reducedStart,
      css.indexOf('[data-reduced-motion=', reducedStart),
    );

    expect(osReduced).toMatch(
      /\.battle-log__item\s*\{[^}]*animation:\s*none/,
    );
    expect(osReduced).toMatch(
      /\.battle-log__item\s*\{[^}]*transform:\s*none/,
    );
    expect(osReduced).toMatch(
      /transition-duration:\s*var\(--fb-dur-instant\)/,
    );

    expect(css).toMatch(
      /\[data-reduced-motion='true'\]\s+\.battle-log__item\s*\{[^}]*animation:\s*none/,
    );
    expect(css).toMatch(
      /\[data-reduced-motion='false'\]\s+\.battle-log__item\s*\{[^}]*animation:\s*fb-battle-log-entry/,
    );
  });

  it('imports no engine, content, controller, storage or text-renderer module', () => {
    expect(source).not.toMatch(
      /from '[^']*(?:engine\/|content\/|state\/|persistence\/|battle-log\/)[^']*'/,
    );
    expect(source).not.toMatch(/aria-live/);
    expect(source).not.toMatch(/role=["']log["']/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it('adds no runtime dependency', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      'react',
      'react-dom',
    ]);
  });
});
