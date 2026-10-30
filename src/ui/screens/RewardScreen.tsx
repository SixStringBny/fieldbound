/**
 * The mandatory solo reward (RUN-FR-02, RUN-FR-03, RUN-US-02).
 *
 * Three dealt offers from `docs/design-system/solo-flow.md` section 5. Selection
 * and confirmation are two deliberate steps:
 *
 *   1. activating an offer marks it `aria-pressed="true"`, lifts it and enables
 *      the confirm action labelled with the choice;
 *   2. activating that confirm action reports exactly one `onChoose(index)`.
 *
 * The screen does not advance on the first activation, there is no skip and no
 * menu escape while the reward phase is open. A missing card face renders a
 * labelled, disabled option; an invalid offer list shows a labelled error and
 * mounts no confirm bar.
 *
 * Presentational only: it imports no engine mutator, controller or storage
 * module, and `onSelect` is a reporting hook for the one app-wide polite region.
 */
import { useRef, useState } from 'react';
import type { Element } from '../../engine/types';
import type { RewardOffer } from '../../run/rewards';
import { AssetImage } from '../components/AssetImage';
import { cardEffectLines, cardPrimary } from '../components/card-presentation';
import { ElementCue, elementLabel } from '../components/ElementCue';
import type { CardCatalogView } from '../components/view-types';

/** The reward screen always deals exactly three offers. */
const OFFER_COUNT = 3;

const PROMPT = 'Select one reward to continue.';

export interface RewardScreenProps {
  /** Exactly the three offers the run controller generated. */
  readonly offers: readonly RewardOffer[];
  /** Read-only card lookup for the card faces. */
  readonly cards: CardCatalogView;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  /** Current run health, shown as context for the heal option. */
  readonly health: number;
  readonly maxHealth: number;
  /** The confirmed offer's index; the run advances after exactly one call. */
  readonly onChoose: (index: number) => void;
  /** Optional hook reporting the name the player just selected. */
  readonly onSelect?: (name: string) => void;
}

type OfferView =
  | {
      readonly kind: 'card';
      readonly name: string;
      readonly effect: string;
      readonly primary: { readonly value: string; readonly label: string };
      readonly element: Element;
      readonly cost: number;
      readonly cardId: string;
      readonly available: true;
    }
  | {
      readonly kind: 'heal';
      readonly name: string;
      readonly effect: string;
      readonly amount: number;
      readonly available: true;
    }
  | {
      readonly kind: 'unavailable';
      readonly name: string;
      readonly effect: string;
      readonly available: false;
    };

function offerView(
  offer: RewardOffer,
  cards: CardCatalogView,
  maxHealth: number,
): OfferView {
  if (offer.kind === 'heal') {
    return {
      kind: 'heal',
      name: `Heal ${String(offer.amount)}`,
      effect: `+${String(offer.amount)} health, up to ${String(maxHealth)}. No card is added to the deck.`,
      amount: offer.amount,
      available: true,
    };
  }

  const card = cards[offer.cardId];

  if (card === undefined) {
    return {
      kind: 'unavailable',
      name: 'Card data unavailable',
      effect: 'This offer cannot be taken.',
      available: false,
    };
  }

  return {
    kind: 'card',
    name: card.name,
    effect: cardEffectLines(card).join(' '),
    primary: cardPrimary(card),
    element: card.element,
    cost: card.cost,
    cardId: card.id,
    available: true,
  };
}

export function RewardScreen({
  offers,
  cards,
  baseUrl,
  health,
  maxHealth,
  onChoose,
  onSelect,
}: RewardScreenProps) {
  const [selection, setSelection] = useState<number | null>(null);
  // One confirmation only: the phase guard in the controller is the second
  // line of defence, this ref is the first.
  const confirmed = useRef(false);
  const [confirming, setConfirming] = useState(false);

  const views = offers.map((offer) => offerView(offer, cards, maxHealth));
  const valid = offers.length === OFFER_COUNT;
  const selectedView = selection === null ? null : (views[selection] ?? null);

  const select = (index: number) => {
    const view = views[index];

    if (view === undefined || !view.available) {
      return;
    }

    setSelection(index);
    onSelect?.(view.name);
  };

  const confirm = () => {
    if (selection === null || confirmed.current || selectedView === null) {
      return;
    }

    if (!selectedView.available) {
      return;
    }

    confirmed.current = true;
    setConfirming(true);
    onChoose(selection);
  };

  return (
    <section className="reward" aria-labelledby="reward-title">
      <header className="reward__head">
        <p className="shell__eyebrow">Solo Run · Reward</p>
        <h1 className="shell__page-title" id="reward-title">
          Choose a reward
        </h1>
        <p className="shell__copy">
          Exactly one option. There is no skip, and the next battle starts only
          after your choice.
        </p>
        <p className="reward__health">
          Health: {health} / {maxHealth}
        </p>
      </header>

      {valid ? null : (
        <p className="reward__error" data-reward-error="true">
          The reward options could not be dealt, so there is nothing to take. No
          choice has been made and no card has been added to the deck.
        </p>
      )}

      {valid ? (
        <ul className="reward__options" aria-label="Reward options">
          {views.map((view, index) => {
            const selected = selection === index;
            const descriptionId = `reward-offer-${String(index)}-effect`;
            const label = view.available
              ? `Choose ${view.name}`
              : 'Card data unavailable';

            return (
              <li className="reward__item" key={`${view.kind}:${String(index)}`}>
                <button
                  type="button"
                  className={`reward-option reward-option--${view.kind}`}
                  data-offer-index={index}
                  {...(view.kind === 'card'
                    ? { 'data-element': view.element }
                    : {})}
                  aria-pressed={selected}
                  aria-label={label}
                  aria-describedby={descriptionId}
                  disabled={!view.available}
                  onClick={() => {
                    select(index);
                  }}
                >
                  <span className="reward-option__head">
                    {view.kind === 'card' ? (
                      <span className="reward-option__cost" aria-hidden="true">
                        {view.cost}
                      </span>
                    ) : (
                      <span
                        className="reward-option__seal"
                        aria-hidden="true"
                      >
                        {view.kind === 'heal' ? '✚' : '⊘'}
                      </span>
                    )}
                  </span>

                  {view.kind === 'card' ? (
                    <span className="reward-option__art">
                      <AssetImage
                        assetId={`card:${view.cardId}`}
                        baseUrl={baseUrl}
                        alt={`${view.name}, ${elementLabel(view.element)} card`}
                        kind="card"
                      />
                    </span>
                  ) : null}

                  <span className="reward-option__title">{view.name}</span>

                  {view.kind === 'card' ? (
                    <span className="reward-option__meta">
                      <ElementCue element={view.element} />
                    </span>
                  ) : null}

                  {view.kind === 'card' ? (
                    <span className="reward-option__primary">
                      <span className="reward-option__primary-value">
                        {view.primary.value}
                      </span>
                      <span className="reward-option__primary-label">
                        {view.primary.label}
                      </span>
                    </span>
                  ) : null}

                  {view.kind === 'heal' ? (
                    <span className="reward-option__primary">
                      <span className="reward-option__primary-value">
                        +{view.amount}
                      </span>
                      <span className="reward-option__primary-label">
                        health
                      </span>
                    </span>
                  ) : null}

                  {view.kind === 'heal' ? (
                    <span className="reward-option__meta">
                      {health} / {maxHealth} health now
                    </span>
                  ) : null}

                  <span
                    className="reward-option__effect"
                    id={descriptionId}
                  >
                    {view.effect}
                  </span>

                  {selected && view.available ? (
                    <span className="reward-option__state">
                      <span
                        className="reward-option__state-glyph"
                        aria-hidden="true"
                      >
                        ✓
                      </span>{' '}
                      Selected
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {valid ? (
        <div className="solo-bar solo-bar--reward">
          <div className="solo-bar__inner">
            <p className="reward__summary" id="reward-summary">
              {selectedView === null ? (
                PROMPT
              ) : (
                <>
                  <strong>{selectedView.name}</strong> · {selectedView.effect}
                </>
              )}
            </p>

            <div className="solo-bar__actions">
              <button
                type="button"
                className="shell__button solo-bar__primary"
                onClick={confirm}
                disabled={selectedView === null || confirming}
                aria-describedby="reward-summary"
              >
                {selectedView === null
                  ? 'Take reward'
                  : `Take ${selectedView.name}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
