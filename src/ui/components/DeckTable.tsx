/**
 * The physical deck table (solo-flow section 3, OVERHAUL section 6.4).
 *
 * One card per starter deck, each a native button with `aria-pressed` covering
 * the whole object. The face states the element (seal glyph plus the deck's own
 * name and identity line), the contents count and all ten printed card names at
 * 12px in two columns, with the two Shift cards tagged in words as well as by
 * colour. The contents block carries an id the button points at with
 * `aria-describedby`, so assistive technology can read the full deck without
 * inflating the button's accessible name beyond the frozen
 * `Choose the <Deck> deck` contract.
 *
 * Solo setup owns the screen; the duel setup ticket reuses this component for
 * its sealed step-2 table, so it takes the selection as a prop and reports one
 * typed intent rather than holding the choice itself. It is presentational: no
 * engine, controller, content or storage import beyond read-only view types.
 */
import type { DeckDefinition } from '../../engine/types';
import { ELEMENT_DISPLAY } from './ElementCue';
import type { CardCatalogView } from './view-types';

/**
 * One-line deck identity copy. This is presentation prose, not a rule: the
 * engine still resolves every card. The deck name is prefixed by the component
 * so the line always names its own subject.
 */
const DECK_IDENTITIES: Readonly<Record<DeckDefinition['element'], string>> = {
  ember: 'aggressive, piercing',
  frost: 'patient, defensive',
  gale: 'swift, drawing cards',
  stone: 'steady, heavy hits',
};

export interface DeckTableProps {
  /** The four frozen starter decks, in documented order. */
  readonly decks: readonly DeckDefinition[];
  /** Read-only card lookup for the printed card names. */
  readonly cards: CardCatalogView;
  /** The selected deck id, or null while nothing is chosen. */
  readonly selection: string | null;
  /** Report the chosen deck; the caller owns the state. */
  readonly onSelect: (deckId: string) => void;
  /** Accessible name for the list of decks, e.g. "Starter decks". */
  readonly label: string;
  /**
   * Id prefix for the per-deck contents blocks. Two tables can never collide on
   * one page because each route passes its own prefix.
   */
  readonly idPrefix: string;
}

/** The id of one deck's full-contents block. */
export function deckContentsId(idPrefix: string, deckId: string): string {
  return `${idPrefix}-${deckId}-contents`;
}

export function DeckTable({
  decks,
  cards,
  selection,
  onSelect,
  label,
  idPrefix,
}: DeckTableProps) {
  return (
    <ul className="solo-decks" aria-label={label}>
      {decks.map((deck) => {
        const names = deck.cards.map((cardId) => cards[cardId]);
        const available = names.every((card) => card !== undefined);
        const shifts = names.filter((card) => card?.type === 'shift').length;
        const selected = deck.id === selection;
        const contentsId = deckContentsId(idPrefix, deck.id);
        const seal = ELEMENT_DISPLAY[deck.element];

        return (
          <li className="solo-decks__item" key={deck.id}>
            <button
              type="button"
              className="solo-deck"
              data-element={deck.element}
              data-available={available ? 'true' : 'false'}
              aria-pressed={available ? selected : undefined}
              aria-label={
                available
                  ? `Choose the ${deck.name} deck`
                  : `The ${deck.name} deck is unavailable`
              }
              aria-describedby={contentsId}
              disabled={!available}
              onClick={() => {
                if (available) {
                  onSelect(deck.id);
                }
              }}
            >
              <span className="solo-deck__head">
                <span
                  className="solo-deck__seal"
                  data-element={deck.element}
                  aria-hidden="true"
                >
                  {seal.glyph}
                </span>
                <span className="solo-deck__name">{deck.name}</span>
                {selected ? (
                  <span className="solo-deck__state">
                    <span className="solo-deck__state-glyph" aria-hidden="true">
                      ✓
                    </span>{' '}
                    Selected
                  </span>
                ) : null}
              </span>

              <span className="solo-deck__identity">
                {deck.name}: {DECK_IDENTITIES[deck.element]}
              </span>

              <span className="solo-deck__contents" id={contentsId}>
                {available ? null : (
                  <span className="solo-deck__unavailable">
                    Deck unavailable: a printed card is missing.
                  </span>
                )}

                <span className="solo-deck__counts">
                  <span className="solo-deck__count">
                    {deck.cards.length} cards
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span className="solo-deck__count">{shifts} Shift cards</span>
                </span>

                <span className="solo-deck__cards">
                  {deck.cards.map((cardId) => {
                    const card = cards[cardId];

                    return (
                      <span className="solo-deck__card" key={cardId}>
                        <span className="solo-deck__card-name">
                          {card?.name ?? cardId}
                        </span>
                        {card?.type === 'shift' ? (
                          <span className="solo-deck__tag">
                            <span
                              className="solo-deck__tag-glyph"
                              aria-hidden="true"
                            >
                              ⇄
                            </span>{' '}
                            Shift
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
