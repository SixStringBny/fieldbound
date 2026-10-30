import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createRng } from '../../engine/rng';
import type {
  BattleSide,
  BattleState,
  CardInstance,
  Element as BattleElement,
  EnemyDefinition,
  EnemyPlan,
  Side,
} from '../../engine/types';
import { byId as cardCatalog } from '../../content/cards';
import { enemyById } from '../../content/enemies';
import { BattleBoard } from './BattleBoard';
import type { BattleLogLineView } from './BattleLog';
import type { FieldMatchup } from './FieldBanner';
import { ELEMENT_DISPLAY } from './ElementCue';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_HAND = [
  'ember-cinder-jab',
  'ember-ember-lance',
  'ember-kindled-fury',
  'ember-inferno',
  'shift-frost',
] as const;

const EMBER_MATCHUP: FieldMatchup = {
  empowered: 'ember',
  countered: 'frost',
  beatenBy: 'stone',
};

const PLAN: EnemyPlan = {
  side: 'opponent',
  turn: 4,
  steps: [
    {
      cardId: 'ember-cinder-jab',
      instanceId: 'opponent:plan:0:ember-cinder-jab',
      cost: 1,
      damage: 5,
      defense: 0,
      statuses: [],
      shiftTo: null,
      energyAfter: 2,
    },
    {
      cardId: 'shift-gale',
      instanceId: 'opponent:plan:1:shift-gale',
      cost: 1,
      damage: 0,
      defense: 0,
      statuses: [],
      shiftTo: 'gale',
      energyAfter: 1,
    },
  ],
  totalDamage: 5,
  totalDefense: 0,
  lethal: false,
  remainingEnergy: 1,
};

function requiredEnemy(id: string): EnemyDefinition {
  const enemy = enemyById(id);

  if (enemy === undefined) {
    throw new Error(`Test fixture is missing enemy ${id}`);
  }

  return enemy;
}

function instances(cardIds: readonly string[], side: Side): CardInstance[] {
  return cardIds.map((cardId, index) => ({
    instanceId: `${side}:hand:${String(index)}:${cardId}`,
    cardId,
  }));
}

function makeSide(
  side: Side,
  element: BattleElement,
  overrides: Partial<BattleSide> = {},
): BattleSide {
  return {
    side,
    element,
    health: side === 'player' ? 40 : 30,
    maxHealth: side === 'player' ? 40 : 30,
    defense: 0,
    energy: side === 'player' ? 3 : 0,
    deck: [],
    hand: [],
    discard: [],
    statuses: { focus: 0, weaken: 0, regen: 0 },
    ...overrides,
  };
}

interface StateOptions {
  readonly energy?: number;
  readonly hand?: readonly string[];
  readonly field?: BattleElement;
  readonly activeSide?: Side;
  readonly phase?: BattleState['phase'];
  readonly outcome?: BattleState['outcome'];
  readonly plan?: EnemyPlan | null;
}

function makeState(options: StateOptions = {}): BattleState {
  const hand = instances(options.hand ?? DEFAULT_HAND, 'player');
  const energy = options.energy ?? 3;

  return {
    seed: 7,
    rngState: createRng(7),
    turn: 3,
    activeSide: options.activeSide ?? 'player',
    phase: options.phase ?? 'action',
    field: options.field ?? 'ember',
    outcome: options.outcome ?? 'ongoing',
    sides: {
      player: makeSide('player', 'ember', {
        energy,
        defense: 2,
        statuses: { focus: 1, weaken: 0, regen: 0 },
        hand,
      }),
      opponent: makeSide('opponent', 'ember', {
        health: 23,
        maxHealth: 30,
        defense: 1,
        statuses: { focus: 0, weaken: 2, regen: 0 },
      }),
    },
    enemyPlan: options.plan === undefined ? PLAN : options.plan,
  };
}

function renderBoard(
  state: BattleState = makeState(),
  fieldMatchup: FieldMatchup | null = EMBER_MATCHUP,
  logLines: BattleLogLineView[] = [],
) {
  const onPlayCard = vi.fn();
  const onEndTurn = vi.fn();

  const result = render(
    <BattleBoard
      state={state}
      enemy={requiredEnemy('enemy-cinder-warden')}
      fieldMatchup={fieldMatchup}
      cards={cardCatalog}
      baseUrl="/app/"
      onPlayCard={onPlayCard}
      onEndTurn={onEndTurn}
      logLines={logLines}
      logToggleLabel="Log"
    />,
  );

  return { ...result, onPlayCard, onEndTurn };
}

function cinderJabButton(): HTMLElement {
  return screen.getByRole('button', {
    name: '1 energy, Cinder Jab, Ember attack, 3 damage',
  });
}

/* -------------------------------------------------------------------------- */
/* Structure and layout contract                                              */
/* -------------------------------------------------------------------------- */

describe('BattleBoard structure', () => {
  it('exposes enemy, field, player, hand and controls in order', () => {
    const { container } = renderBoard();
    const board = container.querySelector('[data-battle-board="true"]');

    expect(board).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Battle' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Cinder Warden' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Ember field' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'You' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Your hand' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Turn controls' })).toBeTruthy();

    const sections = Array.from(board?.querySelectorAll('section') ?? []).map(
      (section) => section.getAttribute('aria-labelledby'),
    );

    expect(sections.slice(0, 4)).toEqual([
      'enemy-panel-title',
      'field-banner-title',
      'player-panel-title',
      'hand-title',
    ]);
    expect(sections).toHaveLength(5);
    expect(sections[4]).toMatch(/-title$/);
  });

  it('keeps all five hand cards as reachable native buttons at 375px', () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    });
    window.dispatchEvent(new Event('resize'));

    try {
      renderBoard();

      const hand = screen.getByRole('region', { name: 'Your hand' });
      const cards = within(hand).getAllByRole('button');

      expect(cards).toHaveLength(5);

      for (const button of cards) {
        expect(button.tagName).toBe('BUTTON');
        expect(button.getAttribute('tabindex')).toBeNull();
        expect(button.getAttribute('aria-label')).toMatch(
          /^\d+ energy, .+, (Ember|Frost|Gale|Stone|Neutral) (attack|ward|utility|shift), /,
        );
      }
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  /*
   * jsdom reports every element as zero-sized, so document.scrollWidth cannot
   * prove the 375px no-overflow rule here. The stylesheet contract below is the
   * authoritative unit-level check; REL-04's Playwright spec asserts real pixel
   * overflow and target boxes in the browser.
   */
  it('declares the 375px-to-1080px stylesheet contract', () => {
    const tokens = readFileSync(
      resolve(process.cwd(), 'src/styles/tokens.css'),
      'utf8',
    );
    const css = readFileSync(
      resolve(process.cwd(), 'src/styles/board.css'),
      'utf8',
    );

    // The promoted block states both in rem: 2.75rem = 44px and 67.5rem =
    // 1080px at the 16px root (README Â§12 item 4, tokens.test.ts).
    expect(tokens).toMatch(/--fb-target:\s*2\.75rem/);
    expect(tokens).toMatch(/--fb-board-max:\s*67\.5rem/);

    expect(css).toMatch(
      /\.shell\[data-screen='battle'\]\s*\{[^}]*max-width:\s*var\(--fb-board-max\)/,
    );
    expect(css).toMatch(/\.hand__row\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.hand__row\s*\{[^}]*overscroll-behavior-x:\s*contain/);
    expect(css).toMatch(/\.hand__row\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
    expect(css).toMatch(/\.hand__row\s*\{[^}]*max-width:\s*100%/);

    expect(css).toMatch(/\.card-view\s*\{[^}]*min-width:\s*var\(--fb-target\)/);
    expect(css).toMatch(/\.card-view\s*\{[^}]*min-height:\s*var\(--fb-target\)/);
    expect(css).toMatch(
      /\.battle-controls__end\s*\{[^}]*min-height:\s*var\(--fb-target\)/,
    );
    expect(css).toMatch(
      /\.card-detail__play\s*\{[^}]*min-height:\s*var\(--fb-target\)/,
    );
    expect(css).toMatch(
      /\.card-detail__close\s*\{[^}]*width:\s*var\(--fb-target\)/,
    );
    expect(css).toMatch(
      /\.card-detail__close\s*\{[^}]*height:\s*var\(--fb-target\)/,
    );

    // No page-level overflow suppression: the hand row is the only scroller.
    expect(css).not.toMatch(
      /(?:^|\n)\s*(?:html|body)[^{]*\{[^}]*overflow-x\s*:/,
    );

    // Reduced motion removes transforms and caps transitions in both modes.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\[data-reduced-motion='true'\]/);
    expect(css).toMatch(/\[data-reduced-motion='false'\]/);
    expect(css).toMatch(
      /transition-duration:\s*var\(--fb-dur-instant\)/,
    );
    expect(css).toMatch(/transform:\s*none/);
  });
});

/* -------------------------------------------------------------------------- */
/* Stats, element cues and intent                                             */
/* -------------------------------------------------------------------------- */

describe('BattleBoard stats and cues', () => {
  it('shows health, defense, statuses and energy as text plus glyphs', () => {
    renderBoard();

    const enemy = screen.getByRole('region', { name: 'Cinder Warden' });
    const player = screen.getByRole('region', { name: 'You' });

    const enemyHealth = within(enemy).getByRole('meter', {
      name: 'Cinder Warden health',
    });
    expect(enemyHealth.getAttribute('aria-valuenow')).toBe('23');
    expect(enemyHealth.getAttribute('aria-valuetext')).toBe('23 of 30 health');

    const enemyDefense = within(enemy).getByRole('meter', {
      name: 'Cinder Warden defense',
    });
    expect(enemyDefense.getAttribute('aria-valuetext')).toBe('1 of 8 defense');

    const playerHealth = within(player).getByRole('meter', {
      name: 'Your health',
    });
    expect(playerHealth.getAttribute('aria-valuetext')).toBe('40 of 40 health');

    const playerDefense = within(player).getByRole('meter', {
      name: 'Your defense',
    });
    expect(playerDefense.getAttribute('aria-valuetext')).toBe('2 of 8 defense');

    const weaken = enemy.querySelector('[data-status="weaken"]');
    expect(weaken?.textContent).toContain('Weaken');
    expect(weaken?.textContent).toContain('2');

    const focus = player.querySelector('[data-status="focus"]');
    expect(focus?.textContent).toContain('Focus');
    expect(focus?.textContent).toContain('1');

    expect(within(player).getByText('3 energy')).toBeTruthy();
    expect(player.querySelectorAll('.energy-pip--on')).toHaveLength(3);
  });

  it('names the empowered and countered elements and marks the cycle', () => {
    renderBoard();

    const field = screen.getByRole('region', { name: 'Ember field' });
    const text = field.textContent ?? '';

    expect(text).toContain('Ember is empowered');
    expect(text).toContain('Frost is countered');
    expect(text).toContain('Stone beats Ember');

    for (const element of ['ember', 'frost', 'gale', 'stone'] as const) {
      expect(text).toContain(ELEMENT_DISPLAY[element].label);
      expect(text).toContain(ELEMENT_DISPLAY[element].glyph);
    }

    const cycle = within(field).getByRole('list', { name: 'Field cycle' });
    expect(within(cycle).getAllByRole('listitem')).toHaveLength(4);
    expect(
      cycle.querySelector('[aria-current="step"]')?.textContent,
    ).toContain('Ember');
  });

  it('states the Neutral opening field without inventing a matchup', () => {
    renderBoard(makeState({ field: 'neutral' }), null);

    const field = screen.getByRole('region', { name: 'Neutral field' });
    expect(field.textContent).toContain(
      'Neutral field. No element is empowered; no card is countered.',
    );
    expect(field.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('renders the enemy plan as an ordered list with recomputed numbers', () => {
    renderBoard();

    const enemy = screen.getByRole('region', { name: 'Cinder Warden' });
    const intent = within(enemy).getByRole('list', { name: 'Enemy plan' });
    const steps = within(intent).getAllByRole('listitem');

    expect(steps).toHaveLength(2);
    expect(steps[0]?.textContent).toContain('Cinder Jab');
    expect(steps[0]?.textContent).toContain('5 damage');
    expect(steps[1]?.textContent).toContain('Gale Shift');
    expect(steps[1]?.textContent).toContain('shifts to Gale');
    expect(enemy.textContent).toContain('Incoming: 5 damage, 0 defense.');
  });

  it('emits one End Turn intent while the player may act', () => {
    const { onEndTurn } = renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'End Turn' }));
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });

  it('disables End Turn during the enemy turn', () => {
    renderBoard(makeState({ activeSide: 'opponent' }));

    const end = screen.getByRole('button', {
      name: 'End Turn',
    }) as HTMLButtonElement;

    expect(end.disabled).toBe(true);
  });

  it('disables End Turn once the battle has ended', () => {
    renderBoard(
      makeState({ phase: 'ended', outcome: 'player-victory' }),
      EMBER_MATCHUP,
    );

    const end = screen.getByRole('button', {
      name: 'End Turn',
    }) as HTMLButtonElement;

    expect(end.disabled).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* State matrix                                                               */
/* -------------------------------------------------------------------------- */

describe('BattleBoard state matrix', () => {
  it('keeps the rack height and says the hand is empty, with End Turn enabled', () => {
    renderBoard(makeState({ hand: [] }));

    const hand = screen.getByRole('region', { name: 'Your hand' });
    expect(
      within(hand).getAllByText('Your hand is empty.').length,
    ).toBeGreaterThan(0);
    expect(within(hand).queryAllByRole('button')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'End Turn' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('shows the empty log note without a latest sentence', () => {
    renderBoard(makeState(), EMBER_MATCHUP, []);

    expect(screen.getByRole('note', { name: 'Battle log empty' })).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Latest battle log entry' }).textContent,
    ).toBe('');
  });

  it('states that no plan exists yet', () => {
    renderBoard(makeState({ plan: null }));

    const enemy = screen.getByRole('region', { name: 'Cinder Warden' });
    expect(within(enemy).getByText('No plan yet.')).toBeTruthy();
    expect(within(enemy).queryByRole('list', { name: 'Enemy plan' })).toBeNull();
  });

  it('marks a lethal plan with words and a danger rule', () => {
    renderBoard(
      makeState({
        plan: { ...PLAN, lethal: true },
      }),
    );

    const enemy = screen.getByRole('region', { name: 'Cinder Warden' });
    expect(enemy.getAttribute('data-lethal')).toBe('true');
    expect(within(enemy).getByText('Lethal')).toBeTruthy();
  });

  it('keeps ended-battle cards inspectable while Play is disabled', () => {
    renderBoard(makeState({ phase: 'ended', outcome: 'player-victory' }));

    fireEvent.click(cinderJabButton());

    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });
    const play = within(dialog).getByRole('button', {
      name: 'Play card',
    }) as HTMLButtonElement;

    expect(play.disabled).toBe(true);
    expect(dialog.textContent).toContain('You cannot play a card right now.');
  });
});

/* -------------------------------------------------------------------------- */
/* Detail sheet behaviour                                                     */
/* -------------------------------------------------------------------------- */

describe('BattleBoard card detail', () => {
  it('opens on click and on Enter, then closes on Escape and returns focus', () => {
    renderBoard();

    const card = cinderJabButton();
    card.focus();
    fireEvent.click(card);

    const dialog = screen.getByRole('dialog', { name: 'Cinder Jab' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Deals 3 damage.');
    expect(dialog.textContent).toContain(
      'Empowered: +2 damage, and it pierces defense.',
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close card detail' }),
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Close card detail' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(card);

    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Cinder Jab' })).toBeTruthy();
  });

  it('closes on the close button and on a backdrop tap', () => {
    const { container } = renderBoard();

    const card = cinderJabButton();
    card.focus();
    fireEvent.click(card);

    fireEvent.click(screen.getByRole('button', { name: 'Close card detail' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(card);

    fireEvent.click(card);
    const layer = container.querySelector('[data-card-detail-layer="true"]');

    if (!(layer instanceof HTMLElement)) {
      throw new Error('Card detail backdrop did not render');
    }

    fireEvent.click(layer);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('plays from the detail view by emitting one intent and closing', () => {
    const { onPlayCard } = renderBoard();

    fireEvent.click(cinderJabButton());
    fireEvent.click(screen.getByRole('button', { name: 'Play card' }));

    expect(onPlayCard).toHaveBeenCalledWith(
      'player:hand:0:ember-cinder-jab',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps an unaffordable card focusable and inspectable', () => {
    renderBoard(makeState({ energy: 1 }));

    const inferno = screen.getByRole('button', {
      name: '3 energy, Inferno, Ember attack, 7 damage, unaffordable',
    });

    expect(inferno.getAttribute('aria-disabled')).toBe('true');
    expect(inferno.textContent).toContain('Unaffordable');

    inferno.focus();
    expect(document.activeElement).toBe(inferno);

    fireEvent.click(inferno);

    const dialog = screen.getByRole('dialog');
    const play = within(dialog).getByRole('button', { name: 'Play card' });

    expect((play as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText(/need more energy/i)).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close card detail' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    const affordable = cinderJabButton();
    affordable.focus();
    expect(document.activeElement).toBe(affordable);
  });
});

/* -------------------------------------------------------------------------- */
/* Manifest images and failure fallback                                       */
/* -------------------------------------------------------------------------- */

describe('BattleBoard manifest images', () => {
  it('resolves card, enemy and field art from the manifest and base URL', () => {
    renderBoard();

    const cardImage = screen.getByAltText(
      'Cinder Jab, Ember attack, 3 damage',
    );
    expect(cardImage.getAttribute('src')).toBe(
      '/app/assets/cards/ember-cinder-jab.svg',
    );

    const enemyImage = screen.getByAltText(
      'Cinder Warden, Ember enemy, 23 of 30 health',
    );
    expect(enemyImage.getAttribute('src')).toBe(
      '/app/assets/enemies/enemy-cinder-warden.svg',
    );

    const fieldImage = screen.getByAltText(
      'Ember field. Ember is empowered; Frost is countered.',
    );
    expect(fieldImage.getAttribute('src')).toBe(
      '/app/assets/fields/field-ember.svg',
    );
  });

  it('shows a labelled fallback and keeps the board playable', () => {
    renderBoard();

    fireEvent.error(
      screen.getByAltText('Cinder Jab, Ember attack, 3 damage'),
    );

    const fallback = screen.getByRole('img', {
      name: 'Cinder Jab, Ember attack, 3 damage. Art unavailable.',
    });

    expect(fallback.textContent).toContain('Cinder Jab');
    expect(fallback.textContent).toContain('Art unavailable');

    const hand = screen.getByRole('region', { name: 'Your hand' });
    expect(within(hand).getAllByRole('button')).toHaveLength(5);

    fireEvent.click(cinderJabButton());
    expect(screen.getByRole('dialog', { name: 'Cinder Jab' })).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Purity and import boundary                                                 */
/* -------------------------------------------------------------------------- */

describe('BattleBoard presentation boundaries', () => {
  const componentFiles = [
    'AssetImage.tsx',
    'BattleBoard.tsx',
    'CardDetail.tsx',
    'CardView.tsx',
    'ElementCue.tsx',
    'EnemyPanel.tsx',
    'FieldBanner.tsx',
    'Hand.tsx',
    'PlayerPanel.tsx',
    'StatMeter.tsx',
    'StatusList.tsx',
    'card-presentation.ts',
  ];

  function sourceOf(file: string): string {
    return readFileSync(resolve(process.cwd(), 'src/ui/components', file), 'utf8');
  }

  it('imports no engine mutator, controller, persistence or content module', () => {
    const forbidden =
      /from '[^']*(?:engine\/(?:battle|damage|status|intent|ai|snapshot|rng)|persistence\/|content\/)[^']*'/;

    for (const file of componentFiles) {
      expect(sourceOf(file), file).not.toMatch(forbidden);
    }
  });

  it('has no hover-only interaction handler', () => {
    for (const file of componentFiles) {
      expect(sourceOf(file), file).not.toMatch(
        /onMouse(?:Enter|Over|Leave|Move)/,
      );
    }
  });
});
