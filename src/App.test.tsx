import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREEN_KINDS } from './App';

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
