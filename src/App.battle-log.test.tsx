/**
 * App-level battle-log integration tests (LOG-FR-02, LOG-FR-04, LOG-FR-05,
 * LOG-FR-07, LOG-NF-02).
 *
 * Every test renders the real composition root, reaches the battle through the
 * product's own navigation and drives DOM events. Nothing reaches into a
 * controller: the assertions are the rendered prose, DOM order, ARIA and the
 * one live region App mounts.
 *
 * The fixtures only shape the encounter the way a reward would (a known five
 * card hand) so a specific card can be addressed without depending on shuffle
 * order. Rules still run entirely through the engine and the battle controller.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { byId as cardCatalog } from './content/cards';
import { createEncounterConfig } from './state/run-controller';
import type { SoloEncounterFactory } from './state/run-controller';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Five unique cards: a known attack, Ward, Shift, a cost-2 and a cost-3. A
 * five-card deck deals the whole hand, so `Cinder Jab` is always present.
 */
const KNOWN_PLAYER_CARDS = [
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'ember-ember-lance',
  'ember-inferno',
] as const;

/** The real ladder enemy and deck, with only the player's hand fixed. */
function knownHandEncounter(): SoloEncounterFactory {
  return (run, enemy) => {
    const base = createEncounterConfig(run, enemy);

    return {
      ...base,
      player: { ...base.player, cards: KNOWN_PLAYER_CARDS },
    };
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function currentScreen(): string {
  return screen.getByRole('main').getAttribute('data-screen') ?? '';
}

/** Menu -> Play Solo -> the Ember deck -> Start Run. */
function startSoloBattle(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose the Ember deck' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));
}

/** Menu -> Local Duel -> both confirmations -> Start Match. */
function startDuel(): void {
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

function logRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Battle log' });
}

/** The always-visible one-line strip, outside the drawer. */
function latestStrip(): HTMLElement {
  return within(logRegion()).getByRole('group', {
    name: 'Latest battle log entry',
  });
}

function logToggle(): HTMLElement {
  return within(logRegion()).getByRole('button', { name: 'Log' });
}

function logItems(): HTMLElement[] {
  return within(
    screen.getByRole('list', { name: 'Battle log entries' }),
  ).getAllByRole('listitem');
}

function handRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Your hand' });
}

/** Opens a known card's detail sheet and plays it from there. */
function playFromHand(name: RegExp): void {
  fireEvent.click(within(handRegion()).getByRole('button', { name }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/?seed=13579');
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

/* -------------------------------------------------------------------------- */
/* Solo battle                                                                */
/* -------------------------------------------------------------------------- */

describe('App solo battle log', () => {
  it('shows the battle start, a played card and an enemy entry, and is keyboard operable', () => {
    render(<App soloEncounter={knownHandEncounter()} />);
    startSoloBattle();

    expect(currentScreen()).toBe('battle');

    // The opening entry is rendered from the controller's own log, with the
    // enemy name and the engine's reported opening health.
    expect(latestStrip().textContent).toContain('The battle begins');
    expect(latestStrip().textContent).toContain('Cinder Warden');
    expect(latestStrip().textContent).toContain('30 health');

    playFromHand(/Cinder Jab/);

    // One settled play appends one card entry; the strip shows it immediately.
    expect(latestStrip().textContent).toContain('You play Cinder Jab');
    expect(latestStrip().textContent).toContain('27/30');

    // The single polite summary still carries the damage once, and the log is
    // not a second announcement source.
    const status = screen.getByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status.textContent).toContain('Cinder Warden takes 3 damage');
    expect(status.textContent?.match(/Cinder Warden takes 3 damage/g)).toHaveLength(
      1,
    );

    const region = logRegion();
    expect(region.hasAttribute('aria-live')).toBe(false);
    expect(within(region).queryByRole('status')).toBeNull();
    expect(region.querySelector('[aria-live]')).toBeNull();

    // Enter opens the history and the settled card is the newest list item.
    const toggle = logToggle();
    toggle.focus();
    fireEvent.keyDown(toggle, { key: 'Enter' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const afterPlay = logItems();
    expect(afterPlay).toHaveLength(2);
    expect(afterPlay[1]?.textContent).toContain('You play Cinder Jab');

    // Escape closes the drawer and returns focus to its toggle.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    // The handoff back to the player is the newest settled entry, and the
    // enemy's executed plan is readable in the same history.
    expect(latestStrip().textContent).toContain('Cinder Warden ends the turn');

    fireEvent.keyDown(toggle, { key: ' ' });
    fireEvent.keyUp(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const afterTurn = logItems();
    expect(
      afterTurn.some((item) => item.textContent?.includes('Cinder Warden plays')),
    ).toBe(true);
    expect(afterTurn.length).toBeGreaterThan(afterPlay.length);

    // End Turn is still a reachable, enabled control with the drawer open, and
    // the log is a sibling surface that cannot overlay it.
    const endTurn = screen.getByRole('button', {
      name: 'End Turn',
    }) as HTMLButtonElement;
    expect(endTurn.disabled).toBe(false);
    expect(logRegion().contains(endTurn)).toBe(false);

    // The turn still announces exactly one summary.
    const afterTurnStatus = screen.getByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(afterTurnStatus.textContent).toContain('Enemy turn');
    expect(afterTurnStatus.textContent).toContain('Your turn');
  });
});

/* -------------------------------------------------------------------------- */
/* Local duel                                                                 */
/* -------------------------------------------------------------------------- */

describe('App duel battle log', () => {
  it('exposes no log on privacy and only public entries after dismissal', () => {
    render(<App />);
    startDuel();

    // The handoff carries no log node at all, not even a hidden one.
    expect(currentScreen()).toBe('privacy');
    expect(screen.queryByRole('region', { name: 'Battle log' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log' })).toBeNull();
    expect(document.querySelector('[data-battle-log]')).toBeNull();
    expect(document.body.textContent).not.toContain('The battle begins');

    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));

    expect(currentScreen()).toBe('battle');
    expect(latestStrip().textContent).toContain('The battle begins');
    expect(latestStrip().textContent).toContain('Player 2 has 40 health');

    // Play the first affordable card and read its name from the frozen catalog,
    // so the assertion names exactly the card the engine settled.
    const affordable = within(handRegion())
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-disabled') !== 'true');

    if (affordable === undefined) {
      throw new Error('The opening duel hand has no affordable card');
    }

    const cardId = affordable.getAttribute('data-card-id');
    const cardName = cardId === null ? undefined : cardCatalog[cardId]?.name;

    if (cardName === undefined) {
      throw new Error('The played card is missing from the catalog');
    }

    fireEvent.click(affordable);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));

    // Only the public card entry is added; the opponent's hand never appears.
    expect(latestStrip().textContent).toContain(`Player 1 plays ${cardName}`);
    const afterPlay = logItems();
    expect(afterPlay).toHaveLength(2);
    expect(afterPlay[1]?.textContent).toContain(`Player 1 plays ${cardName}`);
    expect(logRegion().textContent).not.toContain('Player 2 plays');

    const status = screen.getByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status.textContent).toBe('Player 1 played a card.');
    expect(logRegion().hasAttribute('aria-live')).toBe(false);
    expect(within(logRegion()).queryByRole('status')).toBeNull();

    // A handoff hides the log again; the same public entries return to the
    // other seat, renamed relative to that viewer.
    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    expect(currentScreen()).toBe('privacy');
    expect(document.querySelector('[data-battle-log]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));

    expect(currentScreen()).toBe('battle');
    expect(latestStrip().textContent).toContain('Player 1 ends the turn');
    expect(logItems()).toHaveLength(3);
    expect(document.querySelector('[data-viewer="player2"]')).not.toBeNull();
  });
});
