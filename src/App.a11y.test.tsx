/**
 * App-level keyboard and announcement tests (SHL-FR-06, VIS-NFR-03).
 *
 * Every test renders the real composition root, navigates to the battle through
 * the `initialScreen` seam and drives DOM events. Nothing reaches into the
 * controller's state: the assertions are user-visible text, ARIA roles, focus
 * and the one live region App mounts.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREENS } from './App';
import { byId as cardCatalog } from './content/cards';
import { enemyById } from './content/enemies';
import type { BattleControllerConfig } from './state/battle-controller';

/* -------------------------------------------------------------------------- */
/* Fixture                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The same deterministic five-card hand used by the battle suite. Keeping the
 * fixture local means this file still fails for the right reason if the battle
 * suite's fixture changes.
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

function mainRegion(): HTMLElement {
  return screen.getByRole('main');
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

function liveRegion(): HTMLElement {
  return screen.getByRole('status');
}

function playerEnergy(): string {
  return within(playerRegion()).getByText(/\d+ energy/).textContent ?? '';
}

function enemyHealth(): string {
  return (
    within(enemyRegion())
      .getByRole('meter', { name: 'Cinder Warden health' })
      .getAttribute('aria-valuetext') ?? ''
  );
}

function turnLabel(): string {
  return screen.getByText(/^Turn \d+ · /).textContent ?? '';
}

/** Opens the detail sheet for a card without moving focus first. */
function openCard(name: RegExp): HTMLElement {
  const card = cardButton(name);
  card.focus();
  fireEvent.keyDown(card, { key: 'Enter' });

  return card;
}

/* -------------------------------------------------------------------------- */
/* Tab order                                                                  */
/* -------------------------------------------------------------------------- */

describe('App keyboard reachability', () => {
  it('reaches every hand card and End Turn in visual order with no positive tabindex', () => {
    renderBattle();

    const hand = handRegion();
    const cards = within(hand).getAllByRole('button');
    expect(cards).toHaveLength(5);

    const main = mainRegion();
    const battleControls = Array.from(
      main.querySelectorAll<HTMLElement>('button'),
    ).filter(
      (button) => hand.contains(button) || button.textContent === 'End Turn',
    );

    // The five cards keep their dealt order and End Turn follows them.
    expect(battleControls.slice(0, 5)).toEqual(cards);
    expect(battleControls[5]?.textContent).toBe('End Turn');

    for (const control of battleControls) {
      expect(control.tabIndex).toBe(0);
      expect(control.getAttribute('aria-hidden')).toBeNull();
    }

    // No authored positive tab index anywhere on the surface. `main` is the
    // only element with a tabindex, and it is -1 so the skip link can focus it.
    const positive = Array.from(
      main.querySelectorAll<HTMLElement>('[tabindex]'),
    ).filter((element) => element.tabIndex > 0);
    expect(positive).toEqual([]);
    expect(main.getAttribute('tabindex')).toBe('-1');
  });
});

/* -------------------------------------------------------------------------- */
/* Enter plays, E ends the turn                                               */
/* -------------------------------------------------------------------------- */

describe('App keyboard actions', () => {
  it('plays a focused card with Enter and keeps the damage total in the live region', () => {
    renderBattle();

    expect(liveRegion().textContent).toBe('');

    const card = openCard(/Cinder Jab/);
    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(playerEnergy()).toBe('3 energy');
    expect(enemyHealth()).toBe('30 of 30 health');

    // The dialog opens on Close; one Tab reaches its primary action.
    fireEvent.keyDown(document, { key: 'Tab' });
    const play = within(dialog).getByRole('button', { name: 'Play card' });
    expect(document.activeElement).toBe(play);

    fireEvent.keyDown(play, { key: 'Enter' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(playerEnergy()).toBe('2 energy');
    expect(enemyHealth()).toBe('27 of 30 health');

    const announcement = liveRegion().textContent ?? '';
    expect(announcement).toContain('Cinder Warden takes 3 damage');
    expect(announcement).toContain('27 of 30 health');
    expect(announcement.match(/Cinder Warden takes/g)).toHaveLength(1);

    // Focus returns to a surviving hand card rather than the removed invoker.
    expect(handRegion().contains(document.activeElement)).toBe(true);
    expect(card.isConnected).toBe(false);
  });

  it('ends the turn with E outside a text field but not inside one', () => {
    renderBattle();

    expect(turnLabel()).toBe('Turn 1 · Your turn');

    fireEvent.keyDown(document.body, { key: 'e' });

    expect(turnLabel()).toBe('Turn 3 · Your turn');
    expect(playerEnergy()).toBe('3 energy');
    expect(
      within(playerRegion())
        .getByRole('meter', { name: 'Your health' })
        .getAttribute('aria-valuetext'),
    ).toBe('34 of 40 health');

    const textField = document.createElement('input');
    textField.type = 'text';
    document.body.appendChild(textField);

    try {
      textField.focus();
      fireEvent.keyDown(textField, { key: 'e' });

      expect(turnLabel()).toBe('Turn 3 · Your turn');
      expect(
        within(playerRegion())
          .getByRole('meter', { name: 'Your health' })
          .getAttribute('aria-valuetext'),
      ).toBe('34 of 40 health');
    } finally {
      textField.remove();
    }

    fireEvent.keyDown(document.body, { key: 'E' });
    expect(turnLabel()).toBe('Turn 5 · Your turn');
  });
});

/* -------------------------------------------------------------------------- */
/* Announcements                                                              */
/* -------------------------------------------------------------------------- */

describe('App live announcements', () => {
  it('announces turn changes and damage totals once per transition', () => {
    renderBattle();

    const status = liveRegion();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status.textContent).toBe('');

    fireEvent.keyDown(document.body, { key: 'e' });

    const first = status.textContent ?? '';
    expect(first).toContain('Enemy turn');
    expect(first).toContain('You take 6 damage');
    expect(first).toContain('34 of 40 health');
    expect(first).toContain('Your turn');
    expect(first).toContain('Turn 3');
    expect(first.match(/Your turn/g)).toHaveLength(1);
    expect(first.match(/You take 6 damage/g)).toHaveLength(1);

    fireEvent.keyDown(document.body, { key: 'e' });

    const second = status.textContent ?? '';
    expect(second).not.toBe(first);
    expect(second).toContain('Turn 5');
    expect(second).not.toContain('Turn 3');
    expect(second.match(/Your turn/g)).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('announces a field shift with words, not colour', () => {
    renderBattle();

    openCard(/Ember Shift/);
    const dialog = screen.getByRole('dialog', { name: 'Ember Shift' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));

    const announcement = liveRegion().textContent ?? '';
    expect(announcement).toContain('Field shifts to Ember');
    expect(announcement).toContain('Ember is empowered');
    expect(announcement).toContain('Frost is countered');
  });

  it('announces a settled battle once', () => {
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

    openCard(/Cinder Jab/);
    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));

    const announcement = liveRegion().textContent ?? '';
    expect(announcement).toContain('Victory.');
    expect(announcement.match(/Victory\./g)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Escape, focus trap and skip link                                           */
/* -------------------------------------------------------------------------- */

describe('App dialogs and skip link', () => {
  it('traps focus in the card detail, ignores E there and restores the invoker on Escape', () => {
    renderBattle();

    const card = openCard(/Cinder Jab/);
    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });
    const close = within(dialog).getByRole('button', {
      name: 'Close card detail',
    });
    const play = within(dialog).getByRole('button', { name: 'Play card' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(close);

    // E must not end the turn while a modal owns attention.
    fireEvent.keyDown(document, { key: 'e' });
    expect(turnLabel()).toBe('Turn 1 · Your turn');

    // Shift+Tab from the first control wraps to the last.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(play);

    // Tab from the last control wraps back to the first.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    // Focus that escaped is pulled back to the first control.
    screen.getByRole('button', { name: 'Leave battle' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(card);
    expect(turnLabel()).toBe('Turn 1 · Your turn');
  });

  it('moves focus to the main board region with the skip link', () => {
    renderBattle();

    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip.getAttribute('href')).toBe('#main-content');

    const main = mainRegion();
    fireEvent.click(skip);

    expect(document.activeElement).toBe(main);
    expect(main.id).toBe('main-content');
    expect(within(main).getByRole('region', { name: 'Battle' })).toBeTruthy();
    expect(
      within(main).getByRole('region', { name: 'Your hand' }),
    ).toBeTruthy();
  });
});
