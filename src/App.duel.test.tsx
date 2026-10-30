/**
 * App-level local-duel interaction tests (DUEL-FR-01, DUEL-FR-03, DUEL-FR-04,
 * DUEL-FR-05, DUEL-FR-06, VIS-US-02).
 *
 * Every test renders the real composition root, starts at the menu or at a
 * prepared match, and drives DOM events. Assertions are user-visible text,
 * ARIA, presence or absence of the battle subtree and the score surfaces; no
 * test reaches into a controller's internal state.
 *
 * The long series test scripts both humans with a deliberately asymmetric
 * policy: Player 1 plays every affordable card, Player 2 only ends the turn.
 * Damage is therefore one-way, so the series is a deterministic 2-0 regardless
 * of the shuffled deck order, and the score progression can be asserted without
 * a fixed seed.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, SCREENS } from './App';
import { createMatch, recordRoundWinner } from './duel/match';
import type { DuelMatch } from './duel/match';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function currentScreen(): string {
  return screen.getByRole('main').getAttribute('data-screen') ?? '';
}

function battleElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-duel-battle]');
}

function chooseDeck(name: string): void {
  fireEvent.click(
    screen.getByRole('button', { name: `Choose the ${name} deck` }),
  );
}

function pressReady(): void {
  fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));
}

/** Menu -> Local Duel -> both confirmations -> Start Match. */
function startDuel(player1 = 'Ember', player2 = 'Frost'): void {
  fireEvent.click(screen.getByRole('button', { name: 'Local Duel' }));
  chooseDeck(player1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm Player 1 deck' }),
  );
  chooseDeck(player2);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm Player 2 deck' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
}

/**
 * Plays every affordable card from the active hand through its detail sheet.
 * A card that settles the round unmounts the battle, so the loop stops as soon
 * as the surface changes.
 */
function playAffordableCards(): void {
  for (let index = 0; index < 12; index += 1) {
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
      return;
    }

    fireEvent.click(playable);
    const dialog = screen.queryByRole('dialog');

    if (dialog === null) {
      return;
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
 * Plays the whole series with the asymmetric policy described at the top.
 * Privacy is explicitly dismissed for every turn, so the loop also exercises
 * the handoff rather than bypassing it.
 */
function driveSeriesToResult(): void {
  for (let step = 0; step < 500; step += 1) {
    const current = currentScreen();

    if (current === 'round-result' || current === 'match-result') {
      return;
    }

    if (current === 'privacy') {
      pressReady();
      continue;
    }

    if (current !== 'battle') {
      throw new Error(`The duel reached an unexpected screen: ${current}`);
    }

    const viewer = battleElement()?.getAttribute('data-viewer');

    if (viewer === 'player1') {
      playAffordableCards();
    }

    if (currentScreen() !== 'battle') {
      continue;
    }

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    if (currentScreen() === 'privacy') {
      pressReady();
    }
  }

  throw new Error('The duel did not settle inside the turn budget');
}

/** A completed 2-0 match for the match-result action tests. */
function completedMatch(): DuelMatch {
  const created = createMatch({
    player1DeckId: 'deck-ember',
    player2DeckId: 'deck-frost',
    seed: 20_261_029,
  });

  if (!created.ok) {
    throw new Error(created.error.message);
  }

  const first = recordRoundWinner(created.value, 'player1');

  if (!first.ok) {
    throw new Error(first.error.message);
  }

  const second = recordRoundWinner(first.value, 'player1');

  if (!second.ok) {
    throw new Error(second.error.message);
  }

  return second.value;
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

describe('App local duel setup', () => {
  it('walks from the menu through both deck confirmations to the handoff', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Local Duel' }));

    expect(currentScreen()).toBe('duel-setup');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Local Duel' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Player 1, choose your deck' }),
    ).toBeTruthy();
    expect(screen.getByText('Player 2, look away.')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /^Choose the .* deck$/ }),
    ).toHaveLength(4);

    const confirmPlayer1 = screen.getByRole('button', {
      name: 'Confirm Player 1 deck',
    }) as HTMLButtonElement;
    expect(confirmPlayer1.disabled).toBe(true);

    chooseDeck('Ember');
    expect(confirmPlayer1.disabled).toBe(false);
    fireEvent.click(confirmPlayer1);

    // Step 2 shows the deck list but no mark, summary or sentence that names
    // Player 1's choice. All four buttons are unselected.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Player 2, choose your deck' }),
    ).toBeTruthy();
    expect(screen.getByText('Player 1 has chosen.')).toBeTruthy();
    expect(screen.queryByText('Player 1: Ember')).toBeNull();

    for (const button of screen.getAllByRole('button', {
      name: /^Choose the .* deck$/,
    })) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }

    chooseDeck('Frost');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Player 2 deck' }),
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Both decks are locked' }),
    ).toBeTruthy();
    expect(screen.getByText('Player 1: Ember')).toBeTruthy();
    expect(screen.getByText('Player 2: Frost')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));

    expect(currentScreen()).toBe('privacy');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pass to Player 1' }),
    ).toBeTruthy();
  });

  it('discards a partial choice when Back returns to the menu', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Local Duel' }));
    chooseDeck('Stone');
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));

    expect(currentScreen()).toBe('menu');
    expect(screen.queryByText('Player 1: Stone')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Local Duel' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Player 1, choose your deck' }),
    ).toBeTruthy();

    for (const button of screen.getAllByRole('button', {
      name: /^Choose the .* deck$/,
    })) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }

    expect(screen.queryByText(/Player 1:/)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Privacy                                                                    */
/* -------------------------------------------------------------------------- */

describe('App duel privacy', () => {
  it('unmounts the battle and exposes no card, health or field detail', () => {
    const { container } = render(<App />);

    startDuel();

    expect(currentScreen()).toBe('privacy');

    const dialog = screen.getByRole('dialog', { name: 'Pass to Player 1' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Other player, look away.')).toBeTruthy();

    // The board is gone, not covered: no battle subtree and no card hooks.
    expect(container.querySelector('[data-duel-battle]')).toBeNull();
    expect(container.querySelectorAll('[data-card-id]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-instance-id]')).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Your hand' })).toBeNull();
    expect(container.textContent).not.toContain('Cinder Jab');
    expect(container.textContent).not.toContain('Health');
  });

  it('dismisses only on the explicit action; Escape does nothing', () => {
    render(<App />);

    startDuel();

    const ready = screen.getByRole('button', { name: "I'm ready" });
    expect(document.activeElement).toBe(ready);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(ready, { key: 'Escape' });

    expect(currentScreen()).toBe('privacy');
    expect(screen.getByRole('dialog', { name: 'Pass to Player 1' })).toBeTruthy();

    // Enter activates the focused ready button without a pointer.
    fireEvent.keyDown(ready, { key: 'Enter' });

    expect(currentScreen()).toBe('battle');
    expect(
      screen.getByRole('heading', { level: 1, name: "Player 1's turn" }),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Active hand and turn handoff                                               */
/* -------------------------------------------------------------------------- */

describe('App duel battle', () => {
  it('renders only the active hand and the opponent count, then hands off', () => {
    const { container } = render(<App />);

    startDuel();
    pressReady();

    expect(currentScreen()).toBe('battle');
    expect(battleElement()?.getAttribute('data-viewer')).toBe('player1');

    const hand = screen.getByRole('region', { name: 'Your hand' });
    expect(within(hand).getAllByRole('button')).toHaveLength(5);

    const opponent = screen.getByRole('region', { name: 'Player 2' });
    expect(within(opponent).getByText('5 cards in hand')).toBeTruthy();
    expect(opponent.querySelectorAll('[data-instance-id]')).toHaveLength(0);
    expect(opponent.querySelectorAll('[data-card-id]')).toHaveLength(0);

    expect(screen.getAllByRole('region', { name: 'Your hand' })).toHaveLength(1);
    expect(container.querySelectorAll('[data-instance-id]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-card-id]')).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));

    // The handoff replaces the board before Player 2's hand can appear.
    expect(currentScreen()).toBe('privacy');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pass to Player 2' }),
    ).toBeTruthy();
    expect(container.querySelectorAll('[data-instance-id]')).toHaveLength(0);
    expect(container.querySelector('[data-duel-battle]')).toBeNull();

    pressReady();

    expect(currentScreen()).toBe('battle');
    expect(
      screen.getByRole('heading', { level: 1, name: "Player 2's turn" }),
    ).toBeTruthy();

    expect(
      within(screen.getByRole('region', { name: 'Your hand' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(5);
    expect(
      within(screen.getByRole('region', { name: 'Player 1' })).getByText(
        '0 cards in hand',
      ),
    ).toBeTruthy();
    expect(container.querySelectorAll('[data-instance-id]')).toHaveLength(5);
  });

  it('ends a duel turn with E but not while the privacy handoff is open', () => {
    render(<App />);

    startDuel();

    // The handoff is a modal and owns attention; E must not reach a turn.
    fireEvent.keyDown(document.body, { key: 'e' });
    expect(currentScreen()).toBe('privacy');

    pressReady();
    expect(currentScreen()).toBe('battle');

    fireEvent.keyDown(document.body, { key: 'e' });

    expect(currentScreen()).toBe('privacy');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pass to Player 2' }),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Feedback beat                                                              */
/* -------------------------------------------------------------------------- */

describe('App duel feedback', () => {
  function opponentRegion(): HTMLElement {
    return screen.getByRole('region', { name: 'Player 2' });
  }

  function opponentHealth(): number {
    return Number(
      within(opponentRegion())
        .getByRole('meter', { name: 'Player 2 health' })
        .getAttribute('aria-valuenow'),
    );
  }

  /** Play the first affordable card through its detail sheet. */
  function playFirstAffordable(): boolean {
    const hand = screen.queryByRole('region', { name: 'Your hand' });

    if (hand === null) {
      return false;
    }

    const playable = within(hand)
      .queryAllByRole('button')
      .find((button) => button.getAttribute('aria-disabled') !== 'true');

    if (playable === undefined) {
      return false;
    }

    fireEvent.click(playable);
    const dialog = screen.queryByRole('dialog');

    if (dialog === null) {
      return false;
    }

    const play = within(dialog).getByRole('button', { name: 'Play card' });

    if ((play as HTMLButtonElement).disabled) {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Close card detail' }),
      );
      return false;
    }

    fireEvent.click(play);
    return true;
  }

  it('shows the same signed number over the public health delta', () => {
    const match = createMatch({
      player1DeckId: 'deck-ember',
      player2DeckId: 'deck-frost',
      seed: 99,
    });

    if (!match.ok) {
      throw new Error(match.error.message);
    }

    // A fixed round seed keeps the opening hand deterministic: it holds an
    // affordable attack, so the first health change is a known one.
    render(<App initialScreen={SCREENS.privacy} duelMatch={match.value} />);
    pressReady();

    expect(currentScreen()).toBe('battle');
    expect(document.querySelector('[data-feedback-key]')).toBeNull();

    let observed = false;

    for (let step = 0; step < 6 && !observed; step += 1) {
      if (currentScreen() !== 'battle') {
        break;
      }

      const before = opponentHealth();

      if (!playFirstAffordable()) {
        break;
      }

      if (currentScreen() !== 'battle') {
        break;
      }

      const after = opponentHealth();

      if (after < before) {
        const numbers = opponentRegion().querySelectorAll(
          '[data-impact-number]',
        );

        expect(numbers).toHaveLength(1);
        expect(numbers[0]?.textContent).toBe(`\u2212${before - after}`);
        expect(numbers[0]?.getAttribute('data-side')).toBe('opponent');
        expect(numbers[0]?.getAttribute('aria-hidden')).toBe('true');
        observed = true;
      }
    }

    expect(observed).toBe(true);

    // A duel has no intent block at all, so nothing can be revealed.
    expect(document.querySelector('[data-intent-reveal]')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('renders no beat behind the privacy handoff', () => {
    const { container } = render(<App />);

    startDuel();

    expect(currentScreen()).toBe('privacy');
    expect(container.querySelector('[data-feedback-key]')).toBeNull();
    expect(container.querySelector('[data-impact-number]')).toBeNull();
    expect(container.querySelector('[data-duel-battle]')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Score progression and match result                                         */
/* -------------------------------------------------------------------------- */

describe('App duel series', () => {
  it(
    'plays a 2-0 series with a round result, a decider handoff and match actions',
    () => {
      const { container } = render(<App />);

      startDuel();
      pressReady();

      driveSeriesToResult();

      // Player 1 was first in round 1 and won it 1-0.
      expect(currentScreen()).toBe('round-result');
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Player 1 wins round 1',
        }),
      ).toBeTruthy();
      expect(screen.getByText('Series 1\u20130')).toBeTruthy();
      expect(container.querySelectorAll('[data-instance-id]')).toHaveLength(0);

      // The verdict owns focus, announces the score once and carries the public
      // series strip plus the deterministic next opener (reading-screens §6.1).
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1, name: 'Player 1 wins round 1' }),
      );
      expect(screen.getByRole('status').textContent).toBe(
        'Player 1 wins round 1. 1\u20130.',
      );
      expect(screen.getAllByRole('status')).toHaveLength(1);

      const roundStrip = screen.getByRole('list', { name: 'Series score' });
      const roundPips = within(roundStrip).getAllByRole('listitem');

      expect(roundPips).toHaveLength(3);
      expect(
        roundPips.map((pip) => pip.getAttribute('data-round-winner')),
      ).toEqual(['player1', 'none', 'none']);
      expect(roundPips[0]?.textContent).toContain('Round 1: Player 1');
      expect(roundPips[2]?.textContent).toContain('Round 3: not played');
      expect(screen.getByText('Next round: Player 2 opens.')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Next Round' }));

      // Round 2 alternates the first player to Player 2 and starts at privacy.
      expect(currentScreen()).toBe('privacy');
      expect(
        screen.getByRole('heading', { level: 1, name: 'Pass to Player 2' }),
      ).toBeTruthy();

      pressReady();
      driveSeriesToResult();

      // At 2-0 the match result replaces the round result.
      expect(currentScreen()).toBe('match-result');
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Player 1 wins the match',
        }),
      ).toBeTruthy();
      expect(screen.getByText('Final score 2\u20130')).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Rematch' }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Change decks' }),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
      expect(container.querySelectorAll('[data-instance-id]')).toHaveLength(0);

      // The plaque owns focus, announces the final score once and names every
      // played round in the strip (reading-screens §6.2).
      expect(document.activeElement).toBe(
        screen.getByRole('heading', {
          level: 1,
          name: 'Player 1 wins the match',
        }),
      );
      expect(screen.getByRole('status').textContent).toBe(
        'Player 1 wins the match. 2\u20130.',
      );
      expect(screen.getAllByRole('status')).toHaveLength(1);

      const matchStrip = screen.getByRole('list', { name: 'Series score' });

      expect(screen.getAllByRole('list', { name: 'Series score' })).toHaveLength(
        1,
      );
      expect(
        within(matchStrip)
          .getAllByRole('listitem')
          .map((pip) => pip.getAttribute('data-round-winner')),
      ).toEqual(['player1', 'player1', 'none']);
    },
    30_000,
  );

  it('rematches with the same decks, a 0-0 score and Player 1 privacy', () => {
    render(
      <App
        initialScreen={SCREENS['match-result']}
        duelMatch={completedMatch()}
      />,
    );

    expect(currentScreen()).toBe('match-result');
    expect(screen.getByText('Final score 2\u20130')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));

    expect(currentScreen()).toBe('privacy');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pass to Player 1' }),
    ).toBeTruthy();

    pressReady();

    expect(currentScreen()).toBe('battle');
    expect(screen.getByText(/Round 1 · Series 0\u20130/)).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Player 1 (you)' }).textContent,
    ).toContain('Ember');
    expect(
      screen.getByRole('region', { name: 'Player 2' }).textContent,
    ).toContain('Frost');
  });

  it('returns to a fresh setup from Change decks', () => {
    render(
      <App
        initialScreen={SCREENS['match-result']}
        duelMatch={completedMatch()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change decks' }));

    expect(currentScreen()).toBe('duel-setup');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Player 1, choose your deck' }),
    ).toBeTruthy();
    expect(screen.queryByText('Player 1: Ember')).toBeNull();

    for (const button of screen.getAllByRole('button', {
      name: /^Choose the .* deck$/,
    })) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('clears the match with Menu', () => {
    render(
      <App
        initialScreen={SCREENS['match-result']}
        duelMatch={completedMatch()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(currentScreen()).toBe('menu');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Fieldbound' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue Run' })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* No persistence                                                             */
/* -------------------------------------------------------------------------- */

describe('App duel persistence', () => {
  it('does not survive a reload and never offers Continue Run', () => {
    localStorage.clear();

    const first = render(<App />);

    startDuel();
    pressReady();

    expect(currentScreen()).toBe('battle');
    expect(
      screen.getByRole('heading', { level: 1, name: "Player 1's turn" }),
    ).toBeTruthy();

    first.unmount();

    const duelKeys = Object.keys(localStorage).filter((key) =>
      key.toLowerCase().includes('duel'),
    );
    expect(duelKeys).toEqual([]);

    render(<App />);

    expect(currentScreen()).toBe('menu');
    expect(screen.queryByRole('button', { name: 'Continue Run' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Local Duel' })).toBeTruthy();
  });
});
