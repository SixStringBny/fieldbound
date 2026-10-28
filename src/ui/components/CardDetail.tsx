/**
 * Full-effect card detail sheet (SHL-FR-03, VIS-NFR-03).
 *
 * A modal dialog that repeats the printed effect, the current-field sentence and
 * a Play button. It closes on a backdrop tap, the close button and Escape, moves
 * focus to the close button on open, locks background scrolling and returns
 * focus to the invoking card on close. The visible heading is the dialog's
 * accessible name.
 *
 * It reports intents only: `onPlay` and `onClose`. No engine mutator, controller
 * or storage module is imported.
 */
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { CardDefinition, Element } from '../../engine/types';
import { AssetImage } from './AssetImage';
import {
  cardAltText,
  cardBadges,
  cardEffectLines,
  cardMatchupSentence,
  cardPrimary,
} from './card-presentation';
import type { CardMatchup } from './card-presentation';
import { CARD_TYPE_LABELS, ElementCue } from './ElementCue';

export interface CardDetailProps {
  readonly card: CardDefinition;
  readonly instanceId: string;
  readonly field: Element;
  readonly matchup: CardMatchup;
  readonly affordable: boolean;
  readonly baseUrl: string;
  readonly onPlay: (instanceId: string) => void;
  readonly onClose: () => void;
}

export function CardDetail({
  card,
  instanceId,
  field,
  matchup,
  affordable,
  baseUrl,
  onPlay,
  onClose,
}: CardDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    invokerRef.current = active instanceof HTMLElement ? active : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;

      const invoker = invokerRef.current;
      if (invoker !== null && invoker.isConnected) {
        invoker.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const primary = cardPrimary(card);
  const badges = cardBadges(card);
  const effects = cardEffectLines(card);
  const matchupSentence = cardMatchupSentence(card, field, matchup);

  return (
    <div
      className="card-detail-layer"
      data-card-detail-layer="true"
      onClick={onClose}
    >
      <div
        className="card-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        data-element={card.element}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className="card-detail__close"
          ref={closeRef}
          aria-label="Close card detail"
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
        </button>

        <p className="card-detail__kicker">
          <ElementCue element={card.element} /> · Cost {card.cost} ·{' '}
          {CARD_TYPE_LABELS[card.type]}
        </p>

        <h2 className="card-detail__title" id="card-detail-title">
          {card.name}
        </h2>

        <p className="card-detail__primary">
          <span className="card-detail__primary-value" aria-hidden="true">
            {primary.value}
          </span>
          <span className="card-detail__primary-label">{primary.label}</span>
        </p>

        <div className="card-detail__art">
          <AssetImage
            assetId={`card:${card.id}`}
            baseUrl={baseUrl}
            alt={cardAltText(card)}
            kind="card"
          />
        </div>

        <h3 className="card-detail__section-title">Full effect</h3>
        <ul className="card-detail__effects">
          {effects.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {badges.length > 0 ? (
          <div className="card-detail__badges">
            {badges.map((badge) => (
              <span className="card-view__badge" key={badge}>
                {badge}
              </span>
            ))}
          </div>
        ) : null}

        <p className="card-detail__matchup" data-matchup={matchup}>
          {matchupSentence}
        </p>

        <button
          type="button"
          className="card-detail__play"
          disabled={!affordable}
          onClick={() => onPlay(instanceId)}
        >
          Play card
        </button>

        {affordable ? null : (
          <p className="card-detail__note">
            You need more energy to play this card.
          </p>
        )}
      </div>
    </div>
  );
}
