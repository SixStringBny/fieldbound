/**
 * One hand card as a native button (SHL-FR-03, VIS-NFR-03, battle-screen
 * section 4).
 *
 * The face shows the cost seal, art, name, primary number and at most one badge.
 * Element, type, the printed summary and any further badges live in the detail
 * sheet; the accessible name still carries cost, name, element, type, primary
 * number and every badge, so the face is meaningful without colour.
 *
 * Unaffordable cards stay in the tab order: the button is `aria-disabled`
 * (not `disabled`), which keeps keyboard users from being silently dropped out
 * of the hand. Activation is rejected, and the visible "Unaffordable" label
 * plus the accessible name explain the state without relying on dimming.
 *
 * This component is props-only: it reports an inspect intent and imports no
 * engine mutator, controller or storage module.
 */
import type { KeyboardEvent } from 'react';
import type { CardDefinition } from '../../engine/types';
import { AssetImage } from './AssetImage';
import {
  cardAccessibleName,
  cardAltText,
  cardBadges,
  cardPrimary,
} from './card-presentation';

export interface CardViewProps {
  readonly card: CardDefinition;
  readonly instanceId: string;
  readonly affordable: boolean;
  /** App base URL used to resolve the manifest image. */
  readonly baseUrl: string;
  /**
   * Called when a card is activated to inspect it. An unaffordable card still
   * opens the detail (battle-screen §4, §6); only its Play action is disabled.
   */
  readonly onInspect: (instanceId: string) => void;
}

export function CardView({
  card,
  instanceId,
  affordable,
  baseUrl,
  onInspect,
}: CardViewProps) {
  const primary = cardPrimary(card);
  const badge = cardBadges(card)[0];

  const activate = () => {
    onInspect(instanceId);
  };

  /**
   * Enter and Space are handled explicitly so both open the detail on the
   * component's own terms; preventDefault suppresses the native synthetic click
   * that would otherwise fire a second time.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <button
      type="button"
      className="card-view"
      data-element={card.element}
      data-affordable={affordable ? 'true' : 'false'}
      data-instance-id={instanceId}
      data-card-id={card.id}
      aria-disabled={affordable ? undefined : true}
      aria-label={cardAccessibleName(card, affordable)}
      onClick={activate}
      onKeyDown={handleKeyDown}
    >
      <span className="card-view__cost" aria-hidden="true">
        {card.cost}
      </span>

      <span className="card-view__art">
        <AssetImage
          assetId={`card:${card.id}`}
          baseUrl={baseUrl}
          alt={cardAltText(card)}
          kind="card"
        />
      </span>

      <span className="card-view__name">{card.name}</span>

      <span className="card-view__primary">
        <span className="card-view__primary-value">{primary.value}</span>
        <span className="card-view__primary-label">{primary.label}</span>
      </span>

      {badge === undefined ? null : (
        <span className="card-view__badges">
          <span className="card-view__badge">{badge}</span>
        </span>
      )}

      {affordable ? null : (
        <span className="card-view__state">
          <span aria-hidden="true">⊘</span> Unaffordable
        </span>
      )}
    </button>
  );
}
