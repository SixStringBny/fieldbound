import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CardDefinition } from '../../engine/types';
import { cardById } from '../../content/cards';
import { CardView } from './CardView';
import { ELEMENT_DISPLAY } from './ElementCue';

function card(id: string): CardDefinition {
  const found = cardById(id);

  if (found === undefined) {
    throw new Error(`Test fixture is missing card ${id}`);
  }

  return found;
}

interface RenderOptions {
  readonly affordable?: boolean;
  readonly onInspect?: (instanceId: string) => void;
}

function renderCard(cardDefinition: CardDefinition, options: RenderOptions = {}) {
  const onInspect = options.onInspect ?? vi.fn();

  const result = render(
    <CardView
      card={cardDefinition}
      instanceId="player:hand:0:test"
      affordable={options.affordable ?? true}
      baseUrl="/app/"
      onInspect={onInspect}
    />,
  );

  return { ...result, onInspect };
}

describe('CardView', () => {
  it('shows cost, name, element glyph and label, and the primary number', () => {
    renderCard(card('ember-ember-lance'));

    const button = screen.getByRole('button', {
      name: '2 energy, Ember Lance, Ember attack, 4 damage, Pierce',
    });

    expect(within(button).getByText('Ember Lance')).toBeTruthy();
    expect(within(button).getByText('Ember')).toBeTruthy();
    expect(
      within(button).getByText(ELEMENT_DISPLAY.ember.glyph),
    ).toBeTruthy();
    expect(within(button).getByText('4')).toBeTruthy();
    expect(within(button).getByText('damage')).toBeTruthy();
    expect(within(button).getByText('2')).toBeTruthy();
    expect(button.textContent).toContain('Pierce');
  });

  it('names a Ward by its defense and a Shift by its destination', () => {
    const { unmount } = renderCard(card('ember-ash-guard'));

    expect(
      screen.getByRole('button', {
        name: '1 energy, Ash Guard, Ember ward, 2 defense',
      }),
    ).toBeTruthy();

    unmount();

    renderCard(card('shift-frost'));

    const shift = screen.getByRole('button', {
      name: '1 energy, Frost Shift, Neutral shift, shifts the field to Frost',
    });
    expect(within(shift).getByText('to Frost')).toBeTruthy();
  });

  it('keeps an affordable card focusable and opens inspection on click', () => {
    const { onInspect } = renderCard(card('ember-cinder-jab'));

    const button = screen.getByRole('button', {
      name: '1 energy, Cinder Jab, Ember attack, 3 damage',
    });

    expect(button.getAttribute('aria-disabled')).toBeNull();
    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    expect(onInspect).toHaveBeenCalledWith('player:hand:0:test');
  });

  it('keeps an unaffordable card focusable but rejects activation', () => {
    const { onInspect } = renderCard(card('ember-inferno'), {
      affordable: false,
    });

    const button = screen.getByRole('button', {
      name: '3 energy, Inferno, Ember attack, 7 damage, unaffordable',
    });

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toContain('Unaffordable');

    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(onInspect).not.toHaveBeenCalled();
  });

  it('opens inspection from Enter and Space on the focused card', () => {
    const { onInspect } = renderCard(card('ember-cinder-jab'));

    const button = screen.getByRole('button', {
      name: '1 energy, Cinder Jab, Ember attack, 3 damage',
    });

    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onInspect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: ' ' });
    expect(onInspect).toHaveBeenCalledTimes(2);
  });

  it('resolves card art through the manifest and the supplied base URL', () => {
    renderCard(card('ember-ember-lance'));

    const image = screen.getByAltText(
      'Ember Lance, Ember attack, 4 damage, pierces defense',
    );

    expect(image.getAttribute('src')).toBe(
      '/app/assets/cards/ember-ember-lance.svg',
    );
    expect(image.getAttribute('width')).toBe('300');
    expect(image.getAttribute('height')).toBe('420');
  });

  it('renders a labelled fallback when the image fails, and stays activatable', () => {
    const { onInspect } = renderCard(card('ember-ember-lance'));

    fireEvent.error(
      screen.getByAltText('Ember Lance, Ember attack, 4 damage, pierces defense'),
    );

    const fallback = screen.getByRole('img', {
      name: 'Ember Lance, Ember attack, 4 damage, pierces defense. Art unavailable.',
    });

    expect(fallback.textContent).toContain('Ember Lance');
    expect(fallback.textContent).toContain('Art unavailable');

    const button = screen.getByRole('button', {
      name: '2 energy, Ember Lance, Ember attack, 4 damage, Pierce',
    });
    fireEvent.click(button);
    expect(onInspect).toHaveBeenCalledWith('player:hand:0:test');
  });

  it('falls back to a labelled box for an id absent from the manifest', () => {
    const missing: CardDefinition = {
      id: 'not-in-manifest',
      name: 'Lost Relic',
      element: 'neutral',
      type: 'utility',
      cost: 0,
      draw: 1,
    };

    renderCard(missing);

    const fallback = screen.getByRole('img', {
      name: 'Lost Relic, Neutral utility, draws 1. Art unavailable.',
    });

    expect(fallback.textContent).toContain('Card art');
    expect(
      screen.getByRole('button', {
        name: '0 energy, Lost Relic, Neutral utility, draws 1',
      }),
    ).toBeTruthy();
  });

  it('prints the field-bonus badge as text, not colour alone', () => {
    renderCard(card('ember-kindled-fury'));

    const button = screen.getByRole('button', {
      name: '2 energy, Kindled Fury, Ember attack, 3 damage, +2 on Ember field',
    });

    expect(button.textContent).toContain('+2 on Ember field');
  });
});
