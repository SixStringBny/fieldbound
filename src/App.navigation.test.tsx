import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREEN_KINDS, SCREENS } from './App';
import { CUE_NAMES, createUiEventBus, uiEvents } from './ui/events';
import type { CueName, UiEvent } from './ui/events';

function menuEntryNames(): Array<string | null> {
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  return within(menu)
    .getAllByRole('button')
    .map((button) => button.textContent);
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
