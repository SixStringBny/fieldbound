import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREENS } from './App';
import { byId as cardCatalog } from './content/cards';
import { enemyById } from './content/enemies';
import type { BattleControllerConfig } from './state/battle-controller';
import type { CueName } from './ui/events';
import { uiEvents } from './ui/events';

/* -------------------------------------------------------------------------- */
/* Fixture                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Five unique cards are dealt in full, so every test can address a known card
 * without depending on shuffle order. The set covers an attack, a Ward, a
 * Shift, and the cost-2 then cost-3 unaffordable path.
 */
const PLAYER_CARDS = [
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'ember-ember-lance',
  'ember-inferno',
] as const;

const ENEMY_CARDS = [
  'ember-cinder-jab',
  'ember-inferno',
  'ember-kindled-fury',
  'neutral-plain-strike',
  'ember-ash-guard',
] as const;

function requiredEnemy(id: string) {
  const enemy = enemyById(id);

  if (enemy === undefined) {
    throw new Error(`Test fixture is missing enemy ${id}`);
  }

  return enemy;
}

function battleConfig(
  overrides: Partial<BattleControllerConfig> = {},
): BattleControllerConfig {
  return {
    seed: 11,
    player: { element: 'ember', cards: PLAYER_CARDS },
    opponent: {
      element: 'ember',
      cards: ENEMY_CARDS,
      maxHealth: 30,
    },
    cards: cardCatalog,
    enemy: requiredEnemy('enemy-cinder-warden'),
    ...overrides,
  };
}

function renderBattle(config: BattleControllerConfig = battleConfig()) {
  return render(<App initialScreen={SCREENS.battle} battleConfig={config} />);
}

function handRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Your hand' });
}

function playerRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'You' });
}

function enemyRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Cinder Warden' });
}

function cardButton(name: RegExp): HTMLElement {
  return within(handRegion()).getByRole('button', { name });
}

/** Opens a card's detail sheet and plays it from there. */
function playFromHand(name: RegExp): void {
  fireEvent.click(cardButton(name));

  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));
}

/* -------------------------------------------------------------------------- */
/* Opening state                                                              */
/* -------------------------------------------------------------------------- */

describe('App battle screen', () => {
  it('shows the hand, energy, both health values, the plan and the field', () => {
    renderBattle();

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe('battle');
    expect(screen.getByRole('heading', { level: 1, name: 'Battle' })).toBeTruthy();

    expect(within(handRegion()).getAllByRole('button')).toHaveLength(5);
    expect(within(playerRegion()).getByText('3 energy')).toBeTruthy();
    expect(
      within(playerRegion())
        .getByRole('meter', { name: 'Your health' })
        .getAttribute('aria-valuetext'),
    ).toBe('40 of 40 health');
    expect(
      within(enemyRegion())
        .getByRole('meter', { name: 'Cinder Warden health' })
        .getAttribute('aria-valuetext'),
    ).toBe('30 of 30 health');

    const field = screen.getByRole('region', { name: 'Neutral field' });
    expect(field.textContent).toContain(
      'Neutral field. No element is empowered; no card is countered.',
    );

    const intent = within(enemyRegion()).getByRole('list', {
      name: 'Enemy plan',
    });
    const steps = within(intent).getAllByRole('listitem');

    expect(steps).toHaveLength(3);
    expect(steps[0]?.textContent).toContain('Cinder Jab');
    expect(steps[1]?.textContent).toContain('Plain Strike');
    expect(steps[2]?.textContent).toContain('Ash Guard');
    expect(enemyRegion().textContent).toContain(
      'Incoming: 6 damage, 2 defense.',
    );
  });

  it('plays an affordable card and applies the engine result', () => {
    renderBattle();

    playFromHand(/Cinder Jab/);

    expect(within(playerRegion()).getByText('2 energy')).toBeTruthy();
    expect(
      within(enemyRegion())
        .getByRole('meter', { name: 'Cinder Warden health' })
        .getAttribute('aria-valuetext'),
    ).toBe('27 of 30 health');
    expect(within(handRegion()).getAllByRole('button')).toHaveLength(4);
  });

  it('opens an unaffordable card for inspection but cannot play it', () => {
    renderBattle();

    playFromHand(/Ember Lance/);
    expect(within(playerRegion()).getByText('1 energy')).toBeTruthy();

    const inferno = cardButton(/Inferno/);
    expect(inferno.getAttribute('aria-disabled')).toBe('true');
    expect(inferno.textContent).toContain('Unaffordable');

    fireEvent.click(inferno);

    const dialog = screen.getByRole('dialog');
    const play = within(dialog).getByRole('button', { name: 'Play card' });

    expect((play as HTMLButtonElement).disabled).toBe(true);
    expect(within(playerRegion()).getByText('1 energy')).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close card detail' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ends the turn, runs the enemy plan and returns control', () => {
    renderBattle();

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    expect(screen.getByText('Turn 3 · Your turn')).toBeTruthy();
    expect(within(playerRegion()).getByText('3 energy')).toBeTruthy();
    expect(within(handRegion()).getAllByRole('button')).toHaveLength(5);
    expect(
      within(playerRegion())
        .getByRole('meter', { name: 'Your health' })
        .getAttribute('aria-valuetext'),
    ).toBe('34 of 40 health');

    // A fresh telegraph is ready for the enemy's next turn.
    expect(
      within(enemyRegion()).getByRole('list', { name: 'Enemy plan' }),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Cues                                                                       */
/* -------------------------------------------------------------------------- */

describe('App battle cues', () => {
  it('emits card-play, damage, ward and shift for the matching actions', () => {
    const received: CueName[] = [];
    const unsubscribe = uiEvents.subscribe((event) => received.push(event.cue));

    try {
      renderBattle();

      playFromHand(/Cinder Jab/);
      expect(received).toEqual(['card-play', 'damage']);

      playFromHand(/Ash Guard/);
      expect(received).toEqual([
        'card-play',
        'damage',
        'card-play',
        'ward',
      ]);
      expect(enemyRegion().textContent).toContain(
        'Incoming: 2 damage, 2 defense.',
      );

      playFromHand(/Ember Shift/);
      expect(received).toEqual([
        'card-play',
        'damage',
        'card-play',
        'ward',
        'card-play',
        'shift',
      ]);

      const field = screen.getByRole('region', { name: 'Ember field' });
      expect(field.textContent).toContain('Ember is empowered');
      expect(field.textContent).toContain('Frost is countered');
      expect(field.textContent).toContain('Stone beats Ember');
    } finally {
      unsubscribe();
    }
  });

  it('emits the enemy actions when End Turn resolves the plan', () => {
    const received: CueName[] = [];
    const unsubscribe = uiEvents.subscribe((event) => received.push(event.cue));

    try {
      renderBattle();
      received.length = 0;

      fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

      expect(received).toContain('card-play');
      expect(received).toContain('damage');
      expect(received.filter((cue) => cue === 'card-play')).toHaveLength(3);
    } finally {
      unsubscribe();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Feedback beat                                                              */
/* -------------------------------------------------------------------------- */

describe('App battle feedback', () => {
  function impactNumbers(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('[data-impact-number]'),
    );
  }

  it('shows no impact number on the opening render', () => {
    renderBattle();

    expect(impactNumbers()).toHaveLength(0);
    expect(document.querySelector('[data-feedback-key]')).toBeNull();
    expect(
      document.querySelector('.hand')?.getAttribute('data-dealt'),
    ).toBe('false');
  });

  it('shows one signed, aria-hidden number for the target that lost health', () => {
    renderBattle();

    playFromHand(/Cinder Jab/);

    const numbers = impactNumbers();

    expect(numbers).toHaveLength(1);
    expect(numbers[0]?.textContent).toBe('\u22123');
    expect(numbers[0]?.getAttribute('data-side')).toBe('opponent');
    expect(numbers[0]?.getAttribute('data-kind')).toBe('damage');
    expect(numbers[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(enemyRegion().contains(numbers[0] ?? null)).toBe(true);
    expect(document.querySelector('.hand')?.getAttribute('data-dealt')).toBe(
      'true',
    );
  });

  it('replaces the running number on a fast second play and keeps both log entries', () => {
    renderBattle();

    playFromHand(/Cinder Jab/);
    const first = document.querySelector('[data-feedback-key]')?.getAttribute(
      'data-feedback-key',
    );

    playFromHand(/Ember Lance/);

    const numbers = impactNumbers();

    // Exactly one number is on screen: the newer beat replaced the older one.
    expect(numbers).toHaveLength(1);
    expect(numbers[0]?.textContent).toBe('\u22124');
    expect(
      document.querySelector('[data-feedback-key]')?.getAttribute(
        'data-feedback-key',
      ),
    ).not.toBe(first);

    const log = screen.getByRole('region', { name: 'Battle log' });
    expect(log.textContent).toContain('Cinder Jab');
    expect(log.textContent).toContain('Ember Lance');
  });

  it('shows the defense chip instead of a number for a Ward', () => {
    renderBattle();

    playFromHand(/Ash Guard/);

    const chip = document.querySelector('[data-defense-chip]');

    expect(chip?.textContent).toBe('+2 DEF');
    expect(chip?.getAttribute('aria-hidden')).toBe('true');
    expect(impactNumbers()).toHaveLength(0);
  });

  it('marks the field shift and the turn handoff on their own beats', () => {
    renderBattle();

    expect(document.querySelector('[data-field-shift]')).toBeNull();
    expect(
      document.querySelector('.battle-header__turn')?.getAttribute(
        'data-feedback-handoff',
      ),
    ).toBeNull();

    playFromHand(/Ember Shift/);

    expect(document.querySelector('[data-field-shift]')?.getAttribute('data-to')).toBe(
      'ember',
    );
    // A card play does not change the turn, so it is not a handoff beat.
    expect(
      document.querySelector('.battle-header__turn')?.getAttribute(
        'data-feedback-handoff',
      ),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    expect(
      document.querySelector('.battle-header__turn')?.getAttribute(
        'data-feedback-handoff',
      ),
    ).toBe('true');
  });

  it('reveals the intent block when a new plan arrives with the player turn', () => {
    renderBattle();

    expect(
      document.querySelector('.enemy-panel__intent')?.getAttribute(
        'data-intent-reveal',
      ),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    expect(
      document.querySelector('.enemy-panel__intent')?.getAttribute(
        'data-intent-reveal',
      ),
    ).toBe('true');
  });
});

/* -------------------------------------------------------------------------- */
/* Victory, rejection and leaving                                             */
/* -------------------------------------------------------------------------- */

describe('App battle outcome', () => {
  it('shows victory and refuses to keep playing', () => {
    renderBattle(
      battleConfig({
        opponent: {
          element: 'ember',
          cards: ENEMY_CARDS,
          maxHealth: 30,
          health: 3,
        },
      }),
    );

    playFromHand(/Cinder Jab/);

    const board = screen.getByRole('region', { name: 'Battle' });
    expect(board).toBeTruthy();
    expect(screen.getByText('Victory')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    const end = screen.getByRole('button', {
      name: 'End Turn',
    }) as HTMLButtonElement;
    expect(end.disabled).toBe(true);
  });

  it('returns to the menu with Leave battle', () => {
    renderBattle();

    fireEvent.click(screen.getByRole('button', { name: 'Leave battle' }));

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe('menu');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
  });
});
