import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREEN_KINDS, SCREENS } from './App';
import { MenuScreen } from './ui/screens/MenuScreen';
import { CUE_NAMES, createUiEventBus, uiEvents } from './ui/events';
import type { CueName, UiEvent } from './ui/events';

/**
 * The menu entry's accessible name, not its text content: the whole card is
 * one button, so the hint and the decorative arrow live inside the object but
 * the name is frozen to the title (solo-flow section 9.1).
 */
function accessibleEntryName(button: HTMLElement): string | null {
  const labelledBy = button.getAttribute('aria-labelledby');
  const label = labelledBy === null ? null : document.getElementById(labelledBy);
  const name = (label?.textContent ?? button.textContent ?? '').trim();

  return name === '' ? null : name;
}

function menuEntryNames(): Array<string | null> {
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  return within(menu).getAllByRole('button').map(accessibleEntryName);
}

describe('App navigation', () => {
  it('renders the menu with its entry points', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('data-screen')).toBe('menu');
    expect(menuEntryNames()).toEqual([
      'Play Solo',
      'Local Duel',
      'How to Play',
      'Settings',
    ]);
  });

  it('adds Continue Run only when a validated save exists', () => {
    render(<App hasSave />);

    expect(menuEntryNames()).toEqual([
      'Play Solo',
      'Local Duel',
      'Continue Run',
      'How to Play',
      'Settings',
    ]);
  });

  it('opens How to Play and returns to the menu with Back', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'How to Play' }));

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe(
      'how-to-play',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'How to Play' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe('menu');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Solo' })).toBeTruthy();
  });

  it('follows the menu through the Screen union', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));
    expect(screen.getByRole('main').getAttribute('data-screen')).toBe(
      'solo-setup',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Local Duel' }));
    expect(screen.getByRole('main').getAttribute('data-screen')).toBe(
      'duel-setup',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('main').getAttribute('data-screen')).toBe(
      'settings',
    );
  });

  it('routes every screen kind in the union', () => {
    for (const kind of SCREEN_KINDS) {
      const { unmount } = render(<App initialScreen={SCREENS[kind]} />);

      expect(screen.getByRole('main').getAttribute('data-screen')).toBe(kind);
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();

      unmount();
    }
  });
});

describe('MenuScreen table hub', () => {
  const noop = () => undefined;

  function renderMenu({
    hasSave = false,
    resumeHint,
    deckSummary,
  }: {
    readonly hasSave?: boolean;
    readonly resumeHint?: string;
    readonly deckSummary?: string;
  } = {}) {
    return render(
      <MenuScreen
        hasSave={hasSave}
        {...(resumeHint === undefined ? {} : { resumeHint })}
        {...(deckSummary === undefined ? {} : { deckSummary })}
        onPlaySolo={noop}
        onLocalDuel={noop}
        onContinueRun={noop}
        onHowToPlay={noop}
        onSettings={noop}
      />,
    );
  }

  it('renders the four always-present entries in DOM order with no empty slot', () => {
    const { container } = renderMenu();

    expect(menuEntryNames()).toEqual([
      'Play Solo',
      'Local Duel',
      'How to Play',
      'Settings',
    ]);
    expect(screen.getByText('No run in progress')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Continue Run' }),
      'a missing save must not leave a Continue placeholder',
    ).toBeNull();
    expect(container.querySelector('#menu-continue-run-hint')).toBeNull();
  });

  it('adds the Continue bookmark between Local Duel and How to Play with its exact hint and deck line', () => {
    renderMenu({
      hasSave: true,
      resumeHint: 'Encounter 2 of 4 · 28 of 40 health',
      deckSummary: 'Ember deck · 11 cards',
    });

    expect(menuEntryNames()).toEqual([
      'Play Solo',
      'Local Duel',
      'Continue Run',
      'How to Play',
      'Settings',
    ]);
    expect(
      document.getElementById('menu-continue-run-hint')?.textContent,
    ).toBe('Encounter 2 of 4 · 28 of 40 health');
    expect(document.getElementById('menu-continue-run-deck')?.textContent).toBe(
      'Ember deck · 11 cards',
    );
    expect(screen.queryByText('No run in progress')).toBeNull();
  });

  it('omits the deck line when the composition root has no deck view', () => {
    renderMenu({
      hasSave: true,
      resumeHint: 'Encounter 1 of 4 · 40 of 40 health',
    });

    expect(document.getElementById('menu-continue-run-hint')?.textContent).toBe(
      'Encounter 1 of 4 · 40 of 40 health',
    );
    expect(document.getElementById('menu-continue-run-deck')).toBeNull();
  });

  it('keeps the mode card itself as the native button and the hero out of the tab order', () => {
    const { container } = renderMenu();
    const solo = container.querySelector('.menu__card--solo');
    const hero = container.querySelector('.menu__hero');

    expect(solo?.tagName).toBe('BUTTON');
    expect(screen.getByRole('button', { name: 'Play Solo' })).toBe(solo);
    expect(
      hero?.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).toHaveLength(0);
    expect(container.querySelector('.menu__wordmark')?.textContent).toBe(
      'Fieldbound',
    );
  });

  it('renders no loading state', () => {
    const { container } = renderMenu();

    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
  });
});

describe('How to Play rules reference', () => {
  it('covers the field cycle, energy, defense, statuses and both modes', () => {
    const { container } = render(
      <App initialScreen={SCREENS['how-to-play']} />,
    );

    for (const heading of [
      'A turn in three steps',
      'Energy',
      'The field cycle',
      'Defense',
      'Statuses',
      'Modes',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    }

    const rules = container.textContent ?? '';

    // The four elements and the full cycle, in words.
    for (const element of ['Ember', 'Frost', 'Gale', 'Stone']) {
      expect(rules).toContain(element);
    }
    for (const step of [
      'Ember beats Frost',
      'Frost beats Gale',
      'Gale beats Stone',
      'Stone beats Ember',
    ]) {
      expect(rules).toContain(step);
    }

    // The three-energy rule and the shared-field consequences.
    expect(rules).toContain('three energy');
    expect(rules).toContain('Empowered');
    expect(rules).toContain('Countered');
    expect(rules).toContain('caps at 8');

    // The three statuses and one line about each.
    for (const status of ['Focus', 'Weaken', 'Regen']) {
      expect(rules).toContain(status);
    }

    // Both modes are explained.
    expect(rules).toContain('Solo run');
    expect(rules).toContain('Local duel');
    expect(rules).toContain('best of three');
  });

  it('returns to the menu from the footer action', () => {
    render(<App initialScreen={SCREENS['how-to-play']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe('menu');
  });

  it('lists the six sections in reading order and reports the disclosure state', () => {
    render(<App initialScreen={SCREENS['how-to-play']} />);

    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(contents).getAllByRole('link');

    expect(
      links.map((link) => link.getAttribute('href')),
    ).toEqual([
      '#rules-turn-title',
      '#rules-energy-title',
      '#rules-field-title',
      '#rules-defense-title',
      '#rules-status-title',
      '#rules-modes-title',
    ]);

    for (const name of [
      'A turn in three steps',
      'Energy',
      'The field cycle',
      'Defense',
      'Statuses',
      'Modes',
    ]) {
      expect(
        within(contents).getByRole('link', { name }),
        `the contents is missing the ${name} link`,
      ).toBeTruthy();
    }

    // Section order in the document matches the contents order.
    const headings = within(screen.getByRole('main')).getAllByRole('heading', {
      level: 2,
    });
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual([
      'A turn in three steps',
      'Energy',
      'The field cycle',
      'Defense',
      'Statuses',
      'Modes',
    ]);

    // The section ids stay on the headings, which are the anchor targets.
    expect(headings.map((heading) => heading.id)).toEqual([
      'rules-turn-title',
      'rules-energy-title',
      'rules-field-title',
      'rules-defense-title',
      'rules-status-title',
      'rules-modes-title',
    ]);
    for (const heading of headings) {
      expect(heading.getAttribute('tabindex')).toBe('-1');
    }

    const toggle = screen.getByRole('button', { name: 'Contents' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('how-to-play-contents');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('jumps to a section heading, closes the disclosure and writes no hash', () => {
    render(<App initialScreen={SCREENS['how-to-play']} />);

    const toggle = screen.getByRole('button', { name: 'Contents' });
    const energyHeading = screen.getByRole('heading', { level: 2, name: 'Energy' });

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('link', { name: 'Energy' }));

    expect(document.activeElement).toBe(energyHeading);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('main').getAttribute('data-screen')).toBe(
      'how-to-play',
    );
  });

  it('focuses the How to Play heading on arrival', () => {
    render(<App initialScreen={SCREENS['how-to-play']} />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'How to Play',
    });

    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(
      heading.getAttribute('data-route-focus'),
      'a route mounted with no input yet is the cold first paint',
    ).toBe('initial');
  });
});

describe('ui event bus', () => {
  it('delivers every cue name to subscribers and unsubscribes cleanly', () => {
    const bus = createUiEventBus();
    const received: CueName[] = [];
    const first = (event: UiEvent) => received.push(event.cue);
    const second = (event: UiEvent) => received.push(event.cue);

    const unsubscribeFirst = bus.subscribe(first);
    const unsubscribeSecond = bus.subscribe(second);

    bus.emitCue('damage');
    expect(received).toEqual(['damage', 'damage']);

    unsubscribeFirst();
    unsubscribeFirst();
    bus.emitCue('ward');
    expect(received).toEqual(['damage', 'damage', 'ward']);

    unsubscribeSecond();
    bus.emitCue('victory');
    expect(received).toEqual(['damage', 'damage', 'ward']);
  });

  it('exposes exactly the synthesized cue set', () => {
    expect(CUE_NAMES).toEqual([
      'card-play',
      'damage',
      'ward',
      'shift',
      'victory',
      'defeat',
      'ui',
    ]);
  });

  it('keeps other subscribers alive when one throws', () => {
    const bus = createUiEventBus();
    const received: CueName[] = [];

    bus.subscribe(() => {
      throw new Error('speaker offline');
    });
    bus.subscribe((event) => received.push(event.cue));

    expect(() => bus.emitCue('ui')).not.toThrow();
    expect(received).toEqual(['ui']);
  });

  it('emits a ui cue when App navigates', () => {
    const received: CueName[] = [];
    const unsubscribe = uiEvents.subscribe((event) => received.push(event.cue));

    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'How to Play' }));

      expect(received).toEqual(['ui']);
    } finally {
      unsubscribe();
    }
  });
});
