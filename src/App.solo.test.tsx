/**
 * App-level solo-run interaction tests (RUN-FR-01, RUN-FR-02, RUN-FR-04,
 * RUN-FR-08).
 *
 * Every test renders the real composition root, starts at the menu, and drives
 * DOM events. Nothing reaches into the controller's state: the assertions are
 * user-visible text, ARIA, presence or absence of the board, the save payload
 * read through the same validator the app uses, and the stored stats key.
 *
 * Deterministic victory
 * ---------------------
 *
 * Battles are real engine battles. The `soloEncounter` seam only changes the
 * enemy's starting health and deck, the same way a fixture would, so a test can
 * force a victory or a defeat without playing a 60-health boss for forty turns.
 * All rules still run through the engine and the run model.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
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
 * A five-card hand with a known attack, Ward, Shift and a cost-2 then cost-3
 * pair. A five-card deck also refills to the same hand every turn.
 */
const KNOWN_PLAYER_CARDS = [
  'ember-cinder-jab',
  'ember-ash-guard',
  'shift-ember',
  'ember-ember-lance',
  'ember-inferno',
] as const;

/** The five attack names in the Ember starter deck. */
const ATTACK_NAMES = [
  'Cinder Jab',
  'Ember Lance',
  'Kindled Fury',
  'Inferno',
  'Plain Strike',
] as const;

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
const LOW_HEALTH_VICTORY = encounter({
  opponentHealth: 1,
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

/**
 * Win the current fight without ending the turn: play an attack, or a 0-cost
 * draw/energy card to reach one. Used at 4 health, where another enemy turn
 * would end the run.
 */
function winWithoutEndingTurn(): void {
  for (let step = 0; step < 12; step += 1) {
    if (currentScreen() !== 'battle') {
      return;
    }

    const hand = screen.queryByRole('region', { name: 'Your hand' });

    if (hand === null) {
      return;
    }

    const buttons = within(hand).queryAllByRole('button');
    const attack = buttons.find(
      (button) =>
        button.getAttribute('aria-disabled') !== 'true' &&
        ATTACK_NAMES.some((name) => (button.textContent ?? '').includes(name)),
    );

    if (attack !== undefined) {
      playCardButton(attack);
      continue;
    }

    const utility = buttons.find(
      (button) =>
        /Probe|Channel/.test(button.textContent ?? '') &&
        button.getAttribute('aria-disabled') !== 'true',
    );

    if (utility === undefined) {
      return;
    }

    playCardButton(utility);
  }
}

function clickEndTurn(): void {
  fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));
}

function firstRewardOption(): HTMLElement {
  return screen.getAllByRole('button', { name: /^Choose / })[0] as HTMLElement;
}

/** The confirm control's label follows the selected offer (solo-flow §5.2). */
function selectedRewardName(): string {
  return (firstRewardOption().getAttribute('aria-label') ?? '').replace(
    /^Choose /,
    '',
  );
}

function takeRewardButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^Take / }) as HTMLButtonElement;
}

/**
 * The deliberate two-step interaction (solo-flow §5.2): the first activation
 * only selects, so the screen must still be the reward until the labelled
 * confirm action is used.
 */
function chooseFirstReward(): void {
  const option = firstRewardOption();
  const name = selectedRewardName();

  fireEvent.click(option);
  expect(option.getAttribute('aria-pressed')).toBe('true');
  expect(currentScreen()).toBe('reward');

  const take = takeRewardButton();
  expect(take.disabled).toBe(false);
  expect(take.textContent).toBe(`Take ${name}`);

  fireEvent.click(take);
}

function statValue(label: string): string {
  const term = screen.getByText(label);
  const value = term.parentElement?.querySelector('dd');

  return value?.textContent ?? '';
}

function storedStats(): Record<string, unknown> | null {
  const raw = localStorage.getItem(STATS_STORAGE_KEY);

  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
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
/* Setup and navigation                                                       */
/* -------------------------------------------------------------------------- */

describe('App solo setup', () => {
  it('lists four decks and opens the first battle from Start Run', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));

    expect(currentScreen()).toBe('solo-setup');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Solo Run' }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /^Choose the .* deck$/ }),
    ).toHaveLength(4);
    expect(screen.getByText(/Ember: aggressive, piercing/)).toBeTruthy();

    const start = screen.getByRole('button', {
      name: 'Start Run',
    }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    chooseDeck('Ember');
    expect(start.disabled).toBe(false);
    fireEvent.click(start);

    expect(currentScreen()).toBe('battle');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Battle' }),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Cinder Warden' })).toBeTruthy();
    expect(within(handRegion()).getAllByRole('button')).toHaveLength(5);

    const save = loadRunSave(localStorage);
    expect(save.status).toBe('ok');
    expect(save.save?.run.phase).toBe('battle');
    expect(save.save?.run.encounterIndex).toBe(0);
    expect(save.save?.run.health).toBe(40);
    expect(save.save?.run.deck).toHaveLength(10);
    expect(save.battle?.sides.player.hand).toHaveLength(5);
  });

  it('renders the physical deck table with every printed card name', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));

    const cards = screen.getAllByRole('button', {
      name: /^Choose the .* deck$/,
    });

    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Choose the Ember deck',
      'Choose the Frost deck',
      'Choose the Gale deck',
      'Choose the Stone deck',
    ]);

    // The contents block is the description, so the deck is readable without
    // inflating the frozen accessible name (solo-flow §3.1, §9.1).
    for (const card of cards) {
      const describedBy = card.getAttribute('aria-describedby');
      const contents =
        describedBy === null ? null : document.getElementById(describedBy);

      expect(contents, `${String(card.getAttribute('aria-label'))}`).not.toBeNull();
      expect(contents?.textContent).toContain('10 cards');
      expect(contents?.textContent).toContain('2 Shift cards');
      expect(
        contents?.querySelectorAll('.solo-deck__card'),
        'all ten printed card names are listed',
      ).toHaveLength(10);
      expect(
        contents?.querySelectorAll('.solo-deck__tag'),
        'both Shift cards are tagged in words',
      ).toHaveLength(2);
      expect(contents?.querySelector('.solo-deck__tag')?.textContent).toContain(
        'Shift',
      );
    }

    const ember = screen.getByRole('button', { name: 'Choose the Ember deck' });
    const frost = screen.getByRole('button', { name: 'Choose the Frost deck' });

    chooseDeck('Ember');
    expect(ember.getAttribute('aria-pressed')).toBe('true');
    expect(frost.getAttribute('aria-pressed')).toBe('false');

    // One selection at a time.
    chooseDeck('Frost');
    expect(ember.getAttribute('aria-pressed')).toBe('false');
    expect(frost.getAttribute('aria-pressed')).toBe('true');
  });

  it('returns to the menu with Back to menu', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Solo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));

    expect(currentScreen()).toBe('menu');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
  });

  it('shows 1 of 4, health and deck size on the run overview during a battle', () => {
    render(<App />);
    startRun();

    fireEvent.click(screen.getByRole('button', { name: 'Run overview' }));

    expect(currentScreen()).toBe('run-overview');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Run overview' }),
    ).toBeTruthy();
    expect(screen.getByText('1 of 4')).toBeTruthy();
    expect(
      screen
        .getByRole('meter', { name: 'Run health' })
        .getAttribute('aria-valuetext'),
    ).toBe('40 of 40 health');
    expect(screen.getByText('10 cards')).toBeTruthy();
    expect(screen.getByText('Cinder Warden', { selector: '.run-progress__name' })).toBeTruthy();

    // The ladder is a status map: four steps, one current step with
    // aria-current, and every state stated in words (solo-flow §4.1).
    const ladder = screen.getByRole('list', { name: 'Run progress' });
    expect(within(ladder).getAllByRole('listitem')).toHaveLength(4);

    const current = ladder.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain('Cinder Warden');
    expect(current[0]?.textContent).toContain('Current');

    expect(
      ladder.textContent,
      'every step status is stated in words',
    ).toContain('Upcoming');

    fireEvent.click(screen.getByRole('button', { name: 'Back to battle' }));

    expect(currentScreen()).toBe('battle');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Battle' }),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Victory, low-health reward and the next battle                             */
/* -------------------------------------------------------------------------- */

describe('App solo reward flow', () => {
  it('shows the three options and the heal rule at low health', () => {
    render(<App soloEncounter={LOW_HEALTH_VICTORY} />);
    startRun();

    // Four enemy turns at 9 damage leave 4 health; the fifth would end the run.
    for (let turn = 0; turn < 4; turn += 1) {
      clickEndTurn();
      expect(currentScreen()).toBe('battle');
    }

    expect(
      screen
        .getByRole('meter', { name: 'Your health' })
        .getAttribute('aria-valuetext'),
    ).toBe('4 of 40 health');

    winWithoutEndingTurn();

    expect(currentScreen()).toBe('reward');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Choose a reward' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Choose / })).toHaveLength(3);
    expect(screen.getByText('Heal 12')).toBeTruthy();
    expect(screen.getByText('Health: 16 / 40')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose Heal 12' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /skip/i }),
    ).toBeNull();
  });

  it('selects a reward before confirming it, and confirms exactly once', () => {
    render(<App soloEncounter={WEAK_ENEMY} />);
    startRun();
    playAffordableCards();

    expect(currentScreen()).toBe('reward');

    const take = takeRewardButton();
    expect(take.disabled).toBe(true);
    expect(take.textContent).toBe('Take reward');
    expect(screen.getByText('Select one reward to continue.')).toBeTruthy();

    const options = screen.getAllByRole('button', { name: /^Choose / });
    const first = options[0] as HTMLElement;
    const firstName = (first.getAttribute('aria-label') ?? '').replace(
      /^Choose /,
      '',
    );

    fireEvent.click(first);

    // The deliberate change: the first activation only selects.
    expect(currentScreen()).toBe('reward');
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Select one reward to continue.')).toBeNull();
    expect(takeRewardButton().disabled).toBe(false);
    expect(takeRewardButton().textContent).toBe(`Take ${firstName}`);

    // Changing the selection is allowed before confirming.
    const second = options[1] as HTMLElement;
    const secondName = (second.getAttribute('aria-label') ?? '').replace(
      /^Choose /,
      '',
    );

    fireEvent.click(second);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(takeRewardButton().textContent).toBe(`Take ${secondName}`);

    const deckBefore = loadRunSave(localStorage).save?.run.deck.length ?? 0;
    fireEvent.click(takeRewardButton());

    expect(currentScreen()).toBe('run-overview');

    const save = loadRunSave(localStorage);
    expect(save.save?.run.cardsAdded).toBe(1);
    expect(save.save?.run.deck).toHaveLength(deckBefore + 1);
    expect(save.save?.run.phase).toBe('overview');
  });

  it('adds the chosen card and opens the next battle from the overview', () => {
    render(<App soloEncounter={WEAK_ENEMY} />);
    startRun();

    playAffordableCards();

    expect(currentScreen()).toBe('reward');

    const deckBefore = loadRunSave(localStorage).save?.run.deck.length ?? 0;
    chooseFirstReward();

    expect(currentScreen()).toBe('run-overview');
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getByText(`${deckBefore + 1} cards`)).toBeTruthy();

    const overviewSave = loadRunSave(localStorage);
    expect(overviewSave.save?.run.phase).toBe('overview');
    expect(overviewSave.save?.run.cardsAdded).toBe(1);
    expect(overviewSave.save?.run.deck.length).toBe(deckBefore + 1);
    expect(overviewSave.save?.pendingReward).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next Battle' }));

    expect(currentScreen()).toBe('battle');
    expect(screen.getByRole('region', { name: 'Rime Sentinel' })).toBeTruthy();
    expect(
      within(handRegion()).getAllByRole('button'),
    ).toHaveLength(5);

    const battleSave = loadRunSave(localStorage);
    expect(battleSave.save?.run.phase).toBe('battle');
    expect(battleSave.save?.run.encounterIndex).toBe(1);
    expect(battleSave.save?.battle).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Result screens                                                             */
/* -------------------------------------------------------------------------- */

describe('App solo result', () => {
  it('completes the four-encounter ladder and records the best run once', () => {
    render(<App soloEncounter={WEAK_ENEMY} />);
    startRun();

    for (let step = 0; step < 40; step += 1) {
      const current = currentScreen();

      if (current === 'run-result') {
        break;
      }

      if (current === 'battle') {
        playAffordableCards();
        continue;
      }

      if (current === 'reward') {
        chooseFirstReward();
        continue;
      }

      if (current === 'run-overview') {
        fireEvent.click(screen.getByRole('button', { name: 'Next Battle' }));
        continue;
      }

      throw new Error(`The run reached an unexpected screen: ${current}`);
    }

    expect(currentScreen()).toBe('run-result');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Run complete' }),
    ).toBeTruthy();

    // The route heading owns focus; the result surface adds no live line of its
    // own, so the app keeps exactly the one region it mounts.
    const runResultHeading = screen.getByRole('heading', {
      level: 1,
      name: 'Run complete',
    });

    expect(document.activeElement).toBe(runResultHeading);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelectorAll('.run-result [aria-live]')).toHaveLength(0);
    expect(document.querySelectorAll('.run-result [role="status"]')).toHaveLength(
      0,
    );

    // Verdict plaque above two parchment ledgers: totals, then the record.
    const ledgers = Array.from(document.querySelectorAll('.result__ledger'));

    expect(ledgers).toHaveLength(2);
    expect(ledgers[0]?.classList.contains('result__ledger--totals')).toBe(true);
    expect(ledgers[1]?.classList.contains('result__ledger--best')).toBe(true);
    expect(
      Array.from(document.querySelectorAll('.result__ledger--totals dt')).map(
        (term) => term.textContent,
      ),
    ).toEqual(['Encounters cleared', 'Turns', 'Cards added', 'Damage taken']);
    expect(
      Array.from(document.querySelectorAll('.result__ledger--best dt')).map(
        (term) => term.textContent,
      ),
    ).toEqual(['Furthest encounter', 'Boss clears', 'Fewest completed turns']);

    expect(statValue('Encounters cleared')).toBe('4 of 4');
    expect(statValue('Cards added')).toBe('3');
    expect(statValue('Boss clears')).toBe('1');
    expect(Number(statValue('Turns'))).toBeGreaterThan(0);
    expect(screen.getByText('New best')).toBeTruthy();

    const stats = storedStats();
    expect(stats?.bossClears).toBe(1);
    expect(stats?.furthestEncounter).toBe(4);
    expect(stats?.bestCompletedTurns).toBe(Number(statValue('Turns')));

    const save = loadRunSave(localStorage);
    expect(save.status).toBe('ok');
    expect(save.save?.run.phase).toBe('victory');
    expect(save.save?.battle).toBeNull();

    // New Run drops the finished run's save and returns to setup.
    fireEvent.click(screen.getByRole('button', { name: 'New Run' }));

    expect(currentScreen()).toBe('solo-setup');
    expect(localStorage.getItem(RUN_SAVE_STORAGE_KEY)).toBeNull();
  });

  it('shows the defeat totals and returns to the menu', () => {
    render(<App soloEncounter={JABBING_ENEMY} />);
    startRun();

    for (let turn = 0; turn < 5; turn += 1) {
      clickEndTurn();
    }

    expect(currentScreen()).toBe('run-result');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Run over' }),
    ).toBeTruthy();
    expect(statValue('Encounters cleared')).toBe('0 of 4');
    expect(statValue('Turns')).toBe('10');
    expect(statValue('Cards added')).toBe('0');
    expect(statValue('Damage taken')).toBe('40');
    expect(statValue('Boss clears')).toBe('0');

    const save = loadRunSave(localStorage);
    expect(save.save?.run.phase).toBe('defeat');
    expect(save.save?.battle).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(currentScreen()).toBe('menu');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Seeding and autosave                                                       */
/* -------------------------------------------------------------------------- */

describe('App solo seed', () => {
  it('produces the same first hand for a valid ?seed= and ignores an invalid one', () => {
    window.history.replaceState({}, '', '/?seed=24680');

    const first = render(<App />);
    startRun();
    const firstHand = handCardIds();
    const firstSave = loadRunSave(localStorage);
    expect(firstSave.save?.seed).toBe(24_680);
    first.unmount();

    localStorage.clear();
    window.history.replaceState({}, '', '/?seed=24680');

    const second = render(<App />);
    startRun();
    expect(handCardIds()).toEqual(firstHand);
    second.unmount();

    localStorage.clear();
    window.history.replaceState({}, '', '/?seed=not-a-number');

    render(<App />);
    startRun();

    expect(currentScreen()).toBe('battle');

    const generated = loadRunSave(localStorage);
    expect(generated.status).toBe('ok');
    expect(Number.isInteger(generated.save?.seed)).toBe(true);
    expect(generated.save?.seed).not.toBe(Number.NaN);
  });
});

describe('App solo autosave', () => {
  it('writes the run after a card play and after a completed turn', () => {
    render(<App soloEncounter={KNOWN_HAND_ENEMY} />);
    startRun();

    const opened = loadRunSave(localStorage);
    expect(opened.status).toBe('ok');
    expect(opened.battle?.turn).toBe(1);
    expect(opened.battle?.sides.player.hand).toHaveLength(5);

    const cinderJab = within(handRegion())
      .getAllByRole('button')
      .find((button) => (button.textContent ?? '').includes('Cinder Jab'));

    if (cinderJab === undefined) {
      throw new Error('The known fixture hand is missing Cinder Jab');
    }

    playCardButton(cinderJab);

    const afterPlay = loadRunSave(localStorage);
    expect(afterPlay.status).toBe('ok');
    expect(afterPlay.battle?.turn).toBe(1);
    expect(afterPlay.battle?.sides.player.energy).toBe(2);
    expect(afterPlay.battle?.sides.player.hand).toHaveLength(4);
    expect(afterPlay.battle?.sides.opponent.health).toBe(27);
    expect(afterPlay.save?.run.phase).toBe('battle');

    clickEndTurn();

    const afterTurn = loadRunSave(localStorage);
    expect(afterTurn.status).toBe('ok');
    expect(afterTurn.battle?.turn).toBe(3);
    expect(afterTurn.battle?.sides.player.energy).toBe(3);
    expect(afterTurn.battle?.sides.player.hand).toHaveLength(5);
    expect(afterTurn.save?.run.turnsTotal).toBe(0);
    expect(afterTurn.save?.battle?.turn).toBe(3);
  });
});
