/**
 * App-level Continue Run tests (RUN-FR-05, RUN-FR-06, RUN-FR-08, VIS-NFR-06).
 *
 * Each test renders the real composition root and drives DOM events. The save
 * is always produced by the app itself and read back through the same validator
 * production uses (`loadRunSave`); nothing here builds a parallel payload.
 *
 * A reload is modelled the only honest way: `unmount()` the mounted app, whose
 * localStorage key is the durable save, then render `<App />` again. The second
 * mount performs the boot check the browser would perform on a refresh.
 *
 * Also covered: a corrupt or unknown-version key is removed at boot with only
 * the run key touched, the run key is the only thing Continue Run unlocks, and
 * a changed `?seed=` after the reload cannot re-seed the restored run.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { SETTINGS_STORAGE_KEY } from './persistence/settings';
import { STATS_STORAGE_KEY } from './persistence/stats';
import { RUN_SAVE_STORAGE_KEY, loadRunSave } from './persistence/run-save';
import { createEncounterConfig } from './state/run-controller';
import type { SoloEncounterFactory } from './state/run-controller';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Ten copies of the cheapest attack: the enemy plans three jabs for 9 damage. */
const JAB_DECK: readonly string[] = Array.from(
  { length: 10 },
  () => 'ember-cinder-jab',
);

/**
 * A five-card hand with a Shift, a Ward, a cheap attack and two bigger attacks,
 * so one turn can leave a non-default field, defense, energy and hand.
 */
const KNOWN_PLAYER_CARDS = [
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'ember-ember-lance',
  'ember-inferno',
] as const;

const SETTINGS_RAW = '{"schemaVersion":1,"muted":true,"reducedMotion":null}';

interface EncounterOverrides {
  readonly opponentHealth: number;
  readonly opponentCards?: readonly string[];
  readonly playerCards?: readonly string[];
}

function encounter(overrides: EncounterOverrides): SoloEncounterFactory {
  return (run, enemy) => {
    const base = createEncounterConfig(run, enemy);

    return {
      ...base,
      player: {
        ...base.player,
        ...(overrides.playerCards === undefined
          ? {}
          : { cards: overrides.playerCards }),
      },
      opponent: {
        ...base.opponent,
        health: Math.min(overrides.opponentHealth, enemy.maxHealth),
        ...(overrides.opponentCards === undefined
          ? {}
          : { cards: overrides.opponentCards }),
      },
    };
  };
}

const WEAK_ENEMY = encounter({ opponentHealth: 1 });
const JABBING_ENEMY = encounter({
  opponentHealth: 30,
  opponentCards: JAB_DECK,
});
const KNOWN_HAND_ENEMY = encounter({
  opponentHealth: 30,
  playerCards: KNOWN_PLAYER_CARDS,
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function currentScreen(): string {
  return screen.getByRole('main').getAttribute('data-screen') ?? '';
}

function chooseDeck(name: string): void {
  fireEvent.click(
    screen.getByRole('button', { name: `Choose the ${name} deck` }),
  );
}

/** Menu -> Play Solo -> choose a deck -> Start Run. */
function startRun(name = 'Ember'): void {
  fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));

  if (currentScreen() !== 'solo-setup') {
    throw new Error(`Play Solo opened ${currentScreen()}`);
  }

  chooseDeck(name);
  fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));
}

function handRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Your hand' });
}

function handCardIds(): Array<string | null> {
  return within(handRegion())
    .getAllByRole('button')
    .map((button) => button.getAttribute('data-card-id'));
}

function playCardButton(button: HTMLElement): void {
  fireEvent.click(button);
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Play card' }));
}

function playNamedCard(name: string): void {
  const button = within(handRegion())
    .getAllByRole('button')
    .find((candidate) => (candidate.textContent ?? '').includes(name));

  if (button === undefined) {
    throw new Error(`The hand is missing ${name}`);
  }

  playCardButton(button);
}

/** Plays every affordable card, ending the turn only when the hand is stuck. */
function playAffordableCards(): void {
  for (let step = 0; step < 40; step += 1) {
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

function clickEndTurn(): void {
  fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));
}

function meterValue(name: string): string | null {
  return screen.getByRole('meter', { name }).getAttribute('aria-valuetext');
}

function turnText(): string {
  return (
    screen.getByText(/^Turn \d+ · (Your turn|Enemy turn)$/).textContent ?? ''
  );
}

interface BoardFacts {
  readonly health: string | null;
  readonly defense: string | null;
  readonly enemyHealth: string | null;
  readonly energy: string | null;
  readonly hand: Array<string | null>;
  readonly field: string;
  readonly plan: string;
  readonly turn: string;
}

/** Everything the save is supposed to restore, read from the rendered board. */
function captureBoard(): BoardFacts {
  const controls = screen.getByRole('group', { name: 'Turn controls' });
  const plan = screen.queryByRole('list', { name: 'Enemy plan' });

  return {
    health: meterValue('Your health'),
    defense: meterValue('Your defense'),
    enemyHealth: meterValue('Cinder Warden health'),
    energy:
      within(controls).getByText(/^\d+ energy$/).textContent ?? '',
    hand: handCardIds(),
    field: screen.getByRole('region', { name: /field$/i }).textContent ?? '',
    plan: plan?.textContent ?? '',
    turn: turnText(),
  };
}

function rewardOptionLabels(): Array<string | null> {
  return screen
    .getAllByRole('button', { name: /^Choose / })
    .map((button) => button.getAttribute('aria-label'));
}

function statValue(label: string): string {
  const term = screen.getByText(label);
  const value = term.parentElement?.querySelector('dd');

  return value?.textContent ?? '';
}

function continueRunButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Continue Run' });
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

describe('App Continue Run gate', () => {
  it('omits Continue Run when no save exists', () => {
    render(<App />);

    expect(currentScreen()).toBe('menu');
    expect(continueRunButton()).toBeNull();
    expect(localStorage.getItem(RUN_SAVE_STORAGE_KEY)).toBeNull();
  });

  it('hides Continue Run and surfaces no error for an unparseable save', () => {
    localStorage.setItem(RUN_SAVE_STORAGE_KEY, '{"schemaVersion":1,');
    localStorage.setItem(SETTINGS_STORAGE_KEY, SETTINGS_RAW);

    render(<App />);

    expect(currentScreen()).toBe('menu');
    expect(continueRunButton()).toBeNull();
    expect(localStorage.getItem(RUN_SAVE_STORAGE_KEY)).toBeNull();
    // Only the run key is discarded; the settings choice survives.
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(SETTINGS_RAW);
    // Nothing was reported through the live region and no dialog appeared.
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Play still works after the discard.
    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));
    expect(currentScreen()).toBe('solo-setup');
  });

  it('removes an unknown-version save and keeps the other keys', () => {
    const statsRaw =
      '{"schemaVersion":1,"furthestEncounter":2,"bossClears":0,"bestCompletedTurns":null}';

    localStorage.setItem(
      RUN_SAVE_STORAGE_KEY,
      '{"schemaVersion":9,"seed":12,"run":{"phase":"battle"}}',
    );
    localStorage.setItem(SETTINGS_STORAGE_KEY, SETTINGS_RAW);
    localStorage.setItem(STATS_STORAGE_KEY, statsRaw);

    render(<App />);

    expect(continueRunButton()).toBeNull();
    expect(localStorage.getItem(RUN_SAVE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(SETTINGS_RAW);
    expect(localStorage.getItem(STATS_STORAGE_KEY)).toBe(statsRaw);
  });

  it('plays without offering Continue Run when storage is unavailable', () => {
    render(<App runSaveStorage={null} />);

    expect(continueRunButton()).toBeNull();

    startRun();

    expect(currentScreen()).toBe('battle');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Battle' }),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Restoring the exact surface                                                */
/* -------------------------------------------------------------------------- */

describe('App Continue Run restore', () => {
  it('restores the same mid-battle health, hand, energy, field and enemy plan', () => {
    window.history.replaceState({}, '', '/?seed=778899');

    const first = render(<App soloEncounter={KNOWN_HAND_ENEMY} />);
    startRun();

    playNamedCard('Ember Shift');
    playNamedCard('Ash Guard');
    playNamedCard('Cinder Jab');
    clickEndTurn();

    const before = captureBoard();
    const saved = loadRunSave(localStorage);

    expect(saved.status).toBe('ok');
    expect(saved.save?.run.phase).toBe('battle');
    expect(saved.battle?.turn).toBeGreaterThan(1);
    expect(before.hand).toHaveLength(5);

    first.unmount();

    render(<App />);

    // The menu advertises where Continue Run will land without opening it.
    expect(
      screen.getByText(/^Encounter 1 of 4 · \d+ of 40 health$/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue Run' }));

    expect(currentScreen()).toBe('battle');
    expect(captureBoard()).toEqual(before);

    // The resumed controller keeps autosaving: a completed turn advances the
    // stored battle, not a fresh one.
    const beforeTurn = loadRunSave(localStorage).save?.battle?.turn ?? 0;
    clickEndTurn();

    const after = loadRunSave(localStorage);

    expect(after.status).toBe('ok');
    expect(after.save?.battle?.turn).toBe(beforeTurn + 2);
    expect(after.save?.run.phase).toBe('battle');
  });

  it('restores the reward screen with the same three offers', () => {
    const first = render(<App soloEncounter={WEAK_ENEMY} />);
    startRun();
    playAffordableCards();

    expect(currentScreen()).toBe('reward');

    const offers = rewardOptionLabels();
    const health = screen.getByText(/^Health: \d+ \/ 40$/).textContent;

    expect(offers).toHaveLength(3);
    expect(loadRunSave(localStorage).save?.pendingReward).toHaveLength(3);

    first.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Run' }));

    expect(currentScreen()).toBe('reward');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Choose a reward' }),
    ).toBeTruthy();
    expect(rewardOptionLabels()).toEqual(offers);
    expect(screen.getByText(/^Health: \d+ \/ 40$/).textContent).toBe(health);

    // The restored offer list is still the live one: one choice advances the
    // ladder and writes the next save.
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Choose / })[0] as HTMLElement,
    );

    expect(currentScreen()).toBe('run-overview');
    expect(loadRunSave(localStorage).save?.run.phase).toBe('overview');
  });

  it('restores a finished run result without rewriting the best run', () => {
    const first = render(<App soloEncounter={JABBING_ENEMY} />);
    startRun();

    for (let turn = 0; turn < 5; turn += 1) {
      clickEndTurn();
    }

    expect(currentScreen()).toBe('run-result');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Run over' }),
    ).toBeTruthy();

    const totals = {
      cleared: statValue('Encounters cleared'),
      turns: statValue('Turns'),
      cards: statValue('Cards added'),
      damage: statValue('Damage taken'),
    };
    const statsRaw = localStorage.getItem(STATS_STORAGE_KEY);

    expect(statsRaw).not.toBeNull();

    first.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Run' }));

    expect(currentScreen()).toBe('run-result');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Run over' }),
    ).toBeTruthy();
    expect({
      cleared: statValue('Encounters cleared'),
      turns: statValue('Turns'),
      cards: statValue('Cards added'),
      damage: statValue('Damage taken'),
    }).toEqual(totals);
    // A restored result screen never records the run a second time.
    expect(localStorage.getItem(STATS_STORAGE_KEY)).toBe(statsRaw);
  });

  it('restores a run overview and its Next Battle intent', () => {
    const first = render(<App soloEncounter={WEAK_ENEMY} />);
    startRun();
    playAffordableCards();

    expect(currentScreen()).toBe('reward');

    fireEvent.click(
      screen.getAllByRole('button', { name: /^Choose / })[0] as HTMLElement,
    );

    expect(currentScreen()).toBe('run-overview');

    const deckText = `${loadRunSave(localStorage).save?.run.deck.length ?? 0} cards`;

    first.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Run' }));

    expect(currentScreen()).toBe('run-overview');
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getByText(deckText)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next Battle' }));

    expect(currentScreen()).toBe('battle');
    expect(screen.getByRole('region', { name: 'Rime Sentinel' })).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Seeded determinism across a reload                                         */
/* -------------------------------------------------------------------------- */

describe('App Continue Run seeding', () => {
  it('replays the same next draw after a reload for the stored seed', () => {
    window.history.replaceState({}, '', '/?seed=24680');

    // Reference: two completed turns without an interruption.
    const reference = render(<App />);
    startRun();
    clickEndTurn();
    clickEndTurn();

    const expectedHand = handCardIds();
    const expectedTurn = turnText();

    reference.unmount();
    localStorage.clear();

    // Interrupted: one completed turn, then a reload from the saved snapshot.
    const interrupted = render(<App />);
    startRun();
    clickEndTurn();

    const saved = loadRunSave(localStorage);

    expect(saved.status).toBe('ok');
    expect(saved.save?.seed).toBe(24_680);
    expect(saved.battle?.turn).toBeGreaterThan(1);

    interrupted.unmount();

    // The query parameter is read only at run creation; a different value on
    // the reload must not re-seed (or reshuffle) the restored run.
    window.history.replaceState({}, '', '/?seed=1');

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Run' }));

    expect(currentScreen()).toBe('battle');
    clickEndTurn();

    expect(handCardIds()).toEqual(expectedHand);
    expect(turnText()).toBe(expectedTurn);
    expect(loadRunSave(localStorage).save?.seed).toBe(24_680);
  });
});
