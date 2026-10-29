/**
 * The mandatory solo reward (RUN-FR-02, RUN-FR-03, RUN-US-02).
 *
 * After every normal-encounter victory the run stops here and exactly one
 * option must be chosen; there is no skip. Card options show the printed face,
 * element, cost and full effect. The heal option appears only when the run is
 * below 20 health and states the exact amount carried by the offer, so the
 * screen never re-derives the reward rule.
 *
 * Presentational only: it reports `onChoose(index)` and imports no engine
 * mutator, controller or storage module.
 */
import type { RewardOffer } from '../../run/rewards';
import { AssetImage } from '../components/AssetImage';
import { cardEffectLines, cardPrimary } from '../components/card-presentation';
import { ElementCue, elementLabel } from '../components/ElementCue';
import type { CardCatalogView } from '../components/view-types';

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
  /** The chosen offer's index; the run advances after exactly one call. */
  readonly onChoose: (index: number) => void;
}

export function RewardScreen({
  offers,
  cards,
  baseUrl,
  health,
  maxHealth,
  onChoose,
}: RewardScreenProps) {
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

      <ul className="reward__options" aria-label="Reward options">
        {offers.map((offer, index) => {
          if (offer.kind === 'heal') {
            return (
              <li key={`heal:${String(index)}`}>
                <button
                  type="button"
                  className="reward-option reward-option--heal"
                  aria-label={`Choose Heal ${String(offer.amount)}`}
                  onClick={() => onChoose(index)}
                >
                  <span className="reward-option__kind">Heal</span>
                  <span className="reward-option__title">
                    Heal {offer.amount}
                  </span>
                  <span className="reward-option__effect">
                    Restores {offer.amount} health, up to {maxHealth}. No card is
                    added to the deck.
                  </span>
                </button>
              </li>
            );
          }

          const card = cards[offer.cardId];

          if (card === undefined) {
            return (
              <li key={`missing:${offer.cardId}`}>
                <button
                  type="button"
                  className="reward-option"
                  aria-label={`Choose ${offer.cardId}`}
                  onClick={() => onChoose(index)}
                >
                  <span className="reward-option__title">{offer.cardId}</span>
                  <span className="reward-option__effect">
                    Card data is unavailable.
                  </span>
                </button>
              </li>
            );
          }

          const primary = cardPrimary(card);

          return (
            <li key={`card:${offer.cardId}`}>
              <button
                type="button"
                className="reward-option"
                data-element={card.element}
                aria-label={`Choose ${card.name}`}
                onClick={() => onChoose(index)}
              >
                <span className="reward-option__art">
                  <AssetImage
                    assetId={`card:${card.id}`}
                    baseUrl={baseUrl}
                    alt={`${card.name}, ${elementLabel(card.element)} card`}
                    kind="card"
                  />
                </span>

                <span className="reward-option__head">
                  <span className="reward-option__cost" aria-hidden="true">
                    {card.cost}
                  </span>
                  <span className="reward-option__title">{card.name}</span>
                  <ElementCue element={card.element} />
                </span>

                <span className="reward-option__primary">
                  <span className="reward-option__primary-value">
                    {primary.value}
                  </span>{' '}
                  <span className="reward-option__primary-label">
                    {primary.label}
                  </span>
                </span>

                <span className="reward-option__effect">
                  {cardEffectLines(card).join(' ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
