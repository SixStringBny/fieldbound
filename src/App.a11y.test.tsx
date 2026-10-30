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
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  serializeSettings,
} from './persistence/settings';
import type { SettingsStorage } from './persistence/settings';
import type { BattleControllerConfig } from './state/battle-controller';
import { createEncounterConfig } from './state/run-controller';
import type { SoloEncounterFactory } from './state/run-controller';

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

/**
 * The same battle with an explicit in-app "reduce motion" choice, so the
 * absolute reduced branch is exercised without a real OS preference.
 */
function renderBattleReduced(config: BattleControllerConfig = battleConfig()) {
  const stored = new Map<string, string>([
    [
      SETTINGS_STORAGE_KEY,
      serializeSettings({ ...DEFAULT_SETTINGS, reducedMotion: true }),
    ],
  ]);
  const storage: SettingsStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => {
      stored.set(key, value);
    },
    removeItem: (key) => {
      stored.delete(key);
    },
  };

  return render(
    <App
      initialScreen={SCREENS.battle}
      battleConfig={config}
      settingsStorage={storage}
    />,
  );
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
  it('reaches every hand card, Log and End Turn in visual order with no positive tabindex', () => {
    renderBattle();

    const hand = handRegion();
    const cards = within(hand).getAllByRole('button');
    expect(cards).toHaveLength(5);

    const main = mainRegion();
    const battleControls = Array.from(
      main.querySelectorAll<HTMLElement>('button'),
    ).filter(
      (button) =>
        hand.contains(button) ||
        button.classList.contains('battle-log__toggle') ||
        button.classList.contains('battle-controls__end'),
    );

    // The five cards keep their dealt order; Log precedes the primary action.
    expect(battleControls.slice(0, 5)).toEqual(cards);
    expect(battleControls[5]?.classList.contains('battle-log__toggle')).toBe(
      true,
    );
    expect(
      battleControls[6]?.classList.contains('battle-controls__end'),
    ).toBe(true);

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

describe('App feedback accessibility', () => {
  it('keeps impact numbers out of the accessibility tree and adds no live region', () => {
    renderBattle();

    expect(screen.getAllByRole('status')).toHaveLength(1);

    openCard(/Cinder Jab/);
    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));

    const number = document.querySelector('[data-impact-number]');

    expect(number).not.toBeNull();
    expect(number?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(number?.getAttribute('tabindex')).toBeNull();

    // Exactly one live region still, and it speaks the fact rather than the
    // decoration.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(liveRegion().textContent).toContain('Cinder Warden takes 3 damage');
    expect(liveRegion().textContent).not.toContain('\u22123');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('renders no beat at all under reduced motion and keeps every fact visible', () => {
    renderBattleReduced();

    openCard(/Cinder Jab/);
    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));

    expect(document.querySelector('[data-impact-number]')).toBeNull();
    expect(document.querySelector('[data-feedback-key]')).toBeNull();
    expect(document.querySelector('[data-impact-flash]')).toBeNull();
    expect(document.querySelector('[data-defense-chip]')).toBeNull();
    expect(document.querySelector('[data-field-shift]')).toBeNull();
    expect(document.querySelector('[data-feedback-handoff]')).toBeNull();

    // The same facts remain: the meter value, the log entry and the sentence.
    expect(enemyHealth()).toBe('27 of 30 health');
    expect(
      screen.getByRole('region', { name: 'Battle log' }).textContent,
    ).toContain('Cinder Jab');
    expect(liveRegion().textContent).toContain('Cinder Warden takes 3 damage');
  });
});

/* -------------------------------------------------------------------------- */
/* Escape, focus trap and skip link                                           */
/* -------------------------------------------------------------------------- */
describe('App solo route focus and announcements', () => {
  const soloEncounter: SoloEncounterFactory = (run, enemy) => {
    const base = createEncounterConfig(run, enemy);

    return {
      ...base,
      opponent: { ...base.opponent, health: 1 },
    };
  };

  function currentScreen(): string {
    return mainRegion().getAttribute('data-screen') ?? '';
  }

  /** Play the deterministic one-health encounter until the route changes. */
  function settleBattle(): void {
    for (let step = 0; step < 30; step += 1) {
      if (currentScreen() !== 'battle') {
        return;
      }

      const hand = screen.queryByRole('region', { name: 'Your hand' });

      if (hand === null) {
        return;
      }

      const playable = within(hand)
        .queryAllByRole('button')
        .find((button) => button.getAttribute('aria-disabled') !== 'true');

      if (playable === undefined) {
        fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));
        continue;
      }

      fireEvent.click(playable);
      const dialog = screen.queryByRole('dialog');

      if (dialog === null) {
        continue;
      }

      const play = within(dialog).getByRole('button', { name: 'Play card' });

      if ((play as HTMLButtonElement).disabled) {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Close card detail' }),
        );
        return;
      }

      fireEvent.click(play);
    }
  }

  function startSoloRun(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose the Ember deck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));
  }

  it('focuses the Solo Run heading and announces one deck selection once', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));

    expect(currentScreen()).toBe('solo-setup');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Solo Run' }),
    );

    const status = screen.getByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Choose the Frost deck' }));

    expect(status.textContent).toBe(
      'Frost deck selected. Start Run is enabled.',
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);

    // Still the same route, and the selection does not steal or move focus.
    expect(currentScreen()).toBe('solo-setup');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Solo Run' }),
    );
  });

  it('announces the reward selection and advances only on confirmation', () => {
    render(<App soloEncounter={soloEncounter} />);
    startSoloRun();

    expect(currentScreen()).toBe('battle');
    settleBattle();

    expect(currentScreen()).toBe('reward');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Choose a reward' }),
    );

    const status = screen.getByRole('status');
    const option = screen.getAllByRole('button', {
      name: /^Choose /,
    })[0] as HTMLElement;
    const name = (option.getAttribute('aria-label') ?? '').replace(
      /^Choose /,
      '',
    );

    fireEvent.click(option);

    expect(status.textContent).toBe(
      `${name} selected. Take reward is enabled.`,
    );
    expect(currentScreen()).toBe('reward');

    fireEvent.click(screen.getByRole('button', { name: `Take ${name}` }));

    expect(currentScreen()).toBe('run-overview');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Run overview' }),
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

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

/* -------------------------------------------------------------------------- */
/* Reading routes (reading-screens §8)                                        */
/* -------------------------------------------------------------------------- */

describe('App reading routes', () => {
  it('focuses the route heading on How to Play and Settings', () => {
    const howToPlay = render(<App initialScreen={SCREENS['how-to-play']} />);
    const howToPlayHeading = screen.getByRole('heading', {
      level: 1,
      name: 'How to Play',
    });

    expect(document.activeElement).toBe(howToPlayHeading);
    expect(howToPlayHeading.getAttribute('tabindex')).toBe('-1');
    howToPlay.unmount();

    render(<App initialScreen={SCREENS.settings} />);

    const settingsHeading = screen.getByRole('heading', {
      level: 1,
      name: 'Settings',
    });

    expect(document.activeElement).toBe(settingsHeading);
    expect(settingsHeading.getAttribute('tabindex')).toBe('-1');
  });

  it('opens the contents, focuses the section heading and closes the disclosure', () => {
    render(<App initialScreen={SCREENS['how-to-play']} />);

    const toggle = screen.getByRole('button', { name: 'Contents' });
    const defense = screen.getByRole('heading', { level: 2, name: 'Defense' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('link', { name: 'Defense' }));

    expect(document.activeElement).toBe(defense);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(window.location.hash).toBe('');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('closes the contents with Escape and returns focus to the button', () => {
    render(<App initialScreen={SCREENS['how-to-play']} />);

    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const toggle = screen.getByRole('button', { name: 'Contents' });

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(contents, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('keeps one live region while the storage notice is shown', () => {
    render(<App initialScreen={SCREENS.settings} settingsStorage={null} />);

    const notice = screen.getByText(/This browser cannot save settings/);

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    );
    expect(notice.getAttribute('role')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('');

    // The switch still works in memory; nothing announces the failure.
    const sound = screen.getByRole('switch', { name: 'Sound' });

    fireEvent.click(sound);

    expect(sound.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

/* -------------------------------------------------------------------------- */
/* Duel privacy and board keyboard                                            */
/* -------------------------------------------------------------------------- */

/** Menu -> Local Duel -> both decks -> Start Match; stops at the handoff. */
function openDuelPrivacy(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Local Duel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose the Ember deck' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm Player 1 deck' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose the Frost deck' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm Player 2 deck' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
}

describe('App duel privacy and board keyboard', () => {
  it('offers one trapped action, ignores Escape and E, and hands focus to the first card', () => {
    render(<App />);

    openDuelPrivacy();

    expect(mainRegion().getAttribute('data-screen')).toBe('privacy');

    const ready = screen.getByRole('button', { name: "I'm ready" });

    // Exactly one action on the route; the skip link is not a button.
    expect(screen.getAllByRole('button')).toEqual([ready]);
    expect(document.activeElement).toBe(ready);
    expect(screen.getAllByRole('status')).toHaveLength(1);

    fireEvent.keyDown(ready, { key: 'Tab' });
    expect(document.activeElement).toBe(ready);
    fireEvent.keyDown(ready, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ready);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(ready, { key: 'e' });
    expect(mainRegion().getAttribute('data-screen')).toBe('privacy');

    fireEvent.click(ready);

    // The board mounts and focus lands on the first card of the incoming hand.
    expect(mainRegion().getAttribute('data-screen')).toBe('battle');
    const hand = handRegion();
    const cards = within(hand).getAllByRole('button');
    expect(document.activeElement).toBe(cards[0]);

    // Phone/tablet DOM order: cards -> Log -> End Turn. At the table the rail
    // toggle is display:none, so the same order collapses to cards -> End Turn.
    const controls = Array.from(
      mainRegion().querySelectorAll<HTMLElement>('button'),
    ).filter(
      (button) =>
        hand.contains(button) ||
        button.classList.contains('battle-log__toggle') ||
        button.classList.contains('battle-controls__end'),
    );

    expect(controls.slice(0, 5)).toEqual(cards);
    expect(controls[5]?.classList.contains('battle-log__toggle')).toBe(true);
    expect(controls[6]?.classList.contains('battle-controls__end')).toBe(true);

    // The duel log is not live and the app still has exactly one live region.
    expect(
      mainRegion().querySelectorAll('[data-battle-log="true"] [aria-live]'),
    ).toHaveLength(0);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
