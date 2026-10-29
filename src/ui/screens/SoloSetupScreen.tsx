/**
 * Solo run setup (RUN-FR-01, VIS-US-01).
 *
 * Four starter deck cards let the player choose the element the run is built
 * around. Each card states the element (glyph and word), a one-line identity,
 * the ten card names and the two Shift cards, so the choice is made from the
 * deck's actual contents rather than colour or a stat sheet.
 *
 * The screen is presentational: it receives the frozen deck catalog and the
 * card lookup, holds only the local selection, and reports one typed intent,
 * `onStart`, with the chosen element. It imports no engine mutator, controller
 * or storage module.
 */
import { useState } from 'react';
import type { DeckDefinition, FieldElement } from '../../engine/types';
import { ElementCue } from '../components/ElementCue';
import type { CardCatalogView } from '../components/view-types';

/**
 * One-line deck identity copy. This is presentation prose, not a rule: the
 * engine still resolves every card. The element is prefixed by the screen so the
 * line always names its own subject.
 */
const DECK_IDENTITIES: Readonly<Record<FieldElement, string>> = {
  ember: 'aggressive, piercing',
  frost: 'patient, defensive',
  gale: 'swift, drawing cards',
  stone: 'steady, heavy hits',
};

export interface SoloSetupScreenProps {
  /** The four frozen starter decks, in documented order. */
  readonly decks: readonly DeckDefinition[];
  /** Read-only card lookup for the printed card names. */
  readonly cards: CardCatalogView;
  /** Start a run on the chosen starter element. */
  readonly onStart: (element: FieldElement) => void;
  /** Return to the menu without starting a run. */
  readonly onBack: () => void;
}

export function SoloSetupScreen({
  decks,
  cards,
  onStart,
  onBack,
}: SoloSetupScreenProps) {
  const [selection, setSelection] = useState<string | null>(null);

  const chosen = decks.find((deck) => deck.id === selection) ?? null;

  return (
    <section className="solo-setup" aria-labelledby="solo-setup-title">
      <header className="solo-setup__head">
        <p className="shell__eyebrow">Solo Run</p>
        <h1 className="shell__page-title" id="solo-setup-title">
          Solo Run
        </h1>
        <p className="shell__copy">
          Choose a starter deck. You begin at 40 health on the first of four
          encounters, and the deck grows by one card after every normal victory.
        </p>
      </header>

      <ul className="solo-decks" aria-label="Starter decks">
        {decks.map((deck) => {
          const selected = deck.id === selection;
          const names = deck.cards.map(
            (cardId) => cards[cardId]?.name ?? cardId,
          );
          const shifts = deck.cards.filter(
            (cardId) => cards[cardId]?.type === 'shift',
          );

          return (
            <li key={deck.id}>
              <button
                type="button"
                className="solo-deck"
                data-element={deck.element}
                aria-pressed={selected}
                aria-label={`Choose the ${deck.name} deck`}
                onClick={() => setSelection(deck.id)}
              >
                <span className="solo-deck__head">
                  <span className="solo-deck__name">{deck.name}</span>
                  <ElementCue element={deck.element} />
                </span>

                <span className="solo-deck__identity">
                  {deck.name}: {DECK_IDENTITIES[deck.element]}
                </span>

                <span className="solo-deck__section-label">
                  {deck.cards.length} cards
                </span>
                <span className="solo-deck__cards">
                  {names.join(' · ')}
                </span>

                <span className="solo-deck__section-label">
                  Shift cards ({shifts.length})
                </span>
                <span className="solo-deck__cards">
                  {shifts
                    .map((cardId) => cards[cardId]?.name ?? cardId)
                    .join(' · ')}
                </span>

                {selected ? (
                  <span className="solo-deck__state">Selected</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="solo-setup__actions">
        <button
          type="button"
          className="shell__button"
          onClick={() => {
            if (chosen !== null) {
              onStart(chosen.element);
            }
          }}
          disabled={chosen === null}
        >
          Start Run
        </button>

        <button type="button" className="shell__back" onClick={onBack}>
          Back to menu
        </button>
      </div>

      {chosen === null ? (
        <p className="solo-setup__hint">
          Select one of the four decks to enable Start Run.
        </p>
      ) : null}
    </section>
  );
}
