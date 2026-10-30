import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App, SCREEN_KINDS } from './App';
import { RUN_SAVE_STORAGE_KEY } from './persistence/run-save';

afterEach(() => {
  localStorage.removeItem(RUN_SAVE_STORAGE_KEY);
});

describe('App', () => {
  it('mounts the composition root around the menu', () => {
    const { container } = render(<App />);

    expect(container.querySelector('#app-root')).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();

    const main = screen.getByRole('main');
    expect(main.id).toBe('main-content');
    expect(main.getAttribute('data-screen')).toBe('menu');

    expect(
      screen
        .getByRole('link', { name: 'Skip to main content' })
        .getAttribute('href'),
    ).toBe('#main-content');
  });

  it('focuses the menu h1 on mount and marks it as the route focus target', () => {
    render(<App />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Fieldbound',
    });

    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(heading.hasAttribute('data-route-focus')).toBe(true);
  });

  it('exposes the five-entry hub contract without form furniture', () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Main menu' });

    expect(within(nav).getAllByRole('button')).toHaveLength(4);
    expect(
      document.querySelectorAll(
        '#main-content form, #main-content input, #main-content select, #main-content textarea, #main-content table, #main-content dl',
      ),
    ).toHaveLength(0);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('treats a corrupt save as no save with no error surface', () => {
    localStorage.setItem(RUN_SAVE_STORAGE_KEY, '{"schemaVersion":1,');

    render(<App />);

    expect(
      screen.queryByRole('button', { name: 'Continue Run' }),
    ).toBeNull();
    expect(screen.getByText('No run in progress')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(localStorage.getItem(RUN_SAVE_STORAGE_KEY)).toBeNull();
  });

  it('declares every routed surface in one screen union', () => {
    expect(SCREEN_KINDS).toEqual([
      'menu',
      'how-to-play',
      'settings',
      'solo-setup',
      'run-overview',
      'battle',
      'reward',
      'run-result',
      'duel-setup',
      'privacy',
      'round-result',
      'match-result',
    ]);
  });
});
