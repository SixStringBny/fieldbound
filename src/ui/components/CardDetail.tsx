/**
 * Full-effect card detail sheet (SHL-FR-03, VIS-NFR-03).
 *
 * A modal dialog that repeats the printed effect, the current-field sentence and
 * a Play button. It closes on a backdrop tap, the close button and Escape, moves
 * focus to the close button on open, traps Tab and Shift+Tab inside the sheet,
 * locks background scrolling and returns focus to the invoking card on close
 * (or the nearest surviving hand card when playing removed it).
 *
 * It reports intents only: `onPlay` and `onClose`. No engine mutator, controller
 * or storage module is imported.
 */
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { CardDefinition, Element } from '../../engine/types';
import { useDialogFocusTrap } from '../a11y/useKeyboardControls';
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
  const containerRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap({
    containerRef,
    onClose,
    initialFocusRef: closeRef,
    fallbackFocus: () =>
      document.querySelector<HTMLElement>('.hand .card-view') ??
      document.querySelector<HTMLElement>('.battle-controls__end'),
  });

  const handlePlayKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onPlay(instanceId);
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
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        tabIndex={-1}
        data-element={card.element}
        onClick={(event) => event.stopPropagation()}
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
          onKeyDown={handlePlayKeyDown}
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
