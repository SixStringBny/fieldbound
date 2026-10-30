/**
 * Solo run setup (RUN-FR-01, VIS-US-01).
 *
 * The physical deck table from `docs/design-system/solo-flow.md` section 3: four
 * parchment deck cards, each a native button that reports `aria-pressed` and
 * carries the element seal, the deck name, its identity line, the `10 cards ·
 * 2 Shift cards` count and all ten printed card names with the Shift cards
 * tagged in words.
 *
 * The screen is presentational: it receives the frozen deck catalog and the
 * card lookup, holds only the local selection, and reports one typed intent,
 * `onStart`, with the chosen element. `onSelect` is a reporting hook so the
 * composition root can speak the one polite announcement; the screen never
 * mounts a live region of its own and imports no engine mutator, controller or
 * storage module.
 */
import { useRef, useState } from 'react';
import type { DeckDefinition, FieldElement } from '../../engine/types';
import { DeckTable } from '../components/DeckTable';
import type { CardCatalogView } from '../components/view-types';

export interface SoloSetupScreenProps {
  /** The four frozen starter decks, in documented order. */
  readonly decks: readonly DeckDefinition[];
  /** Read-only card lookup for the printed card names. */
  readonly cards: CardCatalogView;
  /** Start a run on the chosen starter element; called at most once. */
  readonly onStart: (element: FieldElement) => void;
  /** Return to the menu without starting a run. */
  readonly onBack: () => void;
  /**
   * Optional hook for the composition root: the deck name the player just
   * picked. The screen still owns the selection; this only reports it so the
   * one app-wide status region can speak.
   */
  readonly onSelect?: (deckName: string) => void;
}

const START_HINT = 'Select one of the four decks to enable Start Run.';

export function SoloSetupScreen({
  decks,
  cards,
  onStart,
  onBack,
  onSelect,
}: SoloSetupScreenProps) {
  const [selection, setSelection] = useState<string | null>(null);
  // A second activation of Start Run must not start a second run, even before
  // the composition root has swapped the route.
  const started = useRef(false);
  const [starting, setStarting] = useState(false);

  const chosen = decks.find((deck) => deck.id === selection) ?? null;

  const select = (deckId: string) => {
    const deck = decks.find((candidate) => candidate.id === deckId);

    if (deck === undefined) {
      return;
    }

    setSelection(deck.id);
    onSelect?.(deck.name);
  };

  const start = () => {
    if (chosen === null || started.current) {
      return;
    }

    started.current = true;
    setStarting(true);
    onStart(chosen.element);
  };

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

      <DeckTable
        decks={decks}
        cards={cards}
        selection={selection}
        onSelect={select}
        label="Starter decks"
        idPrefix="solo-setup"
      />

      <div className="solo-bar solo-bar--setup">
        <div className="solo-bar__inner">
          <p className="solo-bar__status" id="solo-setup-hint">
            {chosen === null ? (
              START_HINT
            ) : (
              <>
                <span aria-hidden="true">✓ </span>
                {chosen.name} deck selected
              </>
            )}
          </p>

          <div className="solo-bar__actions">
            <button
              type="button"
              className="shell__button solo-bar__primary"
              onClick={start}
              disabled={chosen === null || starting}
              aria-describedby="solo-setup-hint"
            >
              Start Run
            </button>

            <button type="button" className="shell__back" onClick={onBack}>
              Back to menu
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
