import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREEN_KINDS } from './App';

describe('App', () => {
  it('renders the composition root with the Fieldbound shell', () => {
    const { container } = render(<App />);

    expect(container.querySelector('#app-root')).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
    expect(screen.getByRole('main').id).toBe('main-content');
    expect(
      screen
        .getByRole('link', { name: 'Skip to main content' })
        .getAttribute('href'),
    ).toBe('#main-content');
    expect(
      screen.getByRole('region', { name: 'Workspace ready' }),
    ).toBeTruthy();
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
