/**
 * The hand row (SHL-FR-02, SHL-FR-03, VIS-NFR-01).
 *
 * A single horizontally scrollable snap row inside its own `<ul>`. At 375px the
 * page never scrolls sideways; the row reveals the remaining cards with a swipe,
 * and every card remains a focusable native button in DOM order. The row carries
 * `overscroll-behavior-x: contain` so a swipe cannot chain to the page.
 */
import type { CardInstance } from '../../engine/types';
import { CardView } from './CardView';
import type { CardCatalogView } from './view-types';

export interface HandProps {
  readonly hand: readonly CardInstance[];
  readonly cards: CardCatalogView;
  /** Current player energy; affordability is a face state, not a play rule. */
  readonly energy: number;
  readonly baseUrl: string;
  readonly onInspect: (instanceId: string) => void;
}

export function Hand({ hand, cards, energy, baseUrl, onInspect }: HandProps) {
  return (
    <section
      className="hand"
      aria-labelledby="hand-title"
      aria-describedby="hand-hint"
    >
      <div className="hand__head">
        <h2 className="hand__title" id="hand-title">
          Your hand
        </h2>
        <p className="hand__hint" id="hand-hint">
          {hand.length === 0
            ? 'No cards in hand.'
            : `${hand.length} cards. Scroll sideways to see them all.`}
        </p>
      </div>

      {hand.length === 0 ? (
        <p className="hand__empty">Your hand is empty.</p>
      ) : (
        <ul className="hand__row" aria-labelledby="hand-title">
          {hand.map((instance) => {
            const card = cards[instance.cardId];

            if (card === undefined) {
              return (
                <li className="hand__item" key={instance.instanceId}>
                  <p className="hand__empty">
                    Unknown card “{instance.cardId}”. Art and effect unavailable.
                  </p>
                </li>
              );
            }

            return (
              <li className="hand__item" key={instance.instanceId}>
                <CardView
                  card={card}
                  instanceId={instance.instanceId}
                  affordable={energy >= card.cost}
                  baseUrl={baseUrl}
                  onInspect={onInspect}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
