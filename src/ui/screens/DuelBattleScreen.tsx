/**
 * The active-turn duel board (DUEL-FR-04, DUEL-FR-06, VIS-US-02).
 *
 * This screen renders exactly what the round controller's redacted view allows:
 * the active viewer's hand as card faces, the opponent as health, defense,
 * statuses and a hand *count*, and the shared field. The opponent's card ids
 * never reach this component, so they cannot reach the DOM.
 *
 * The layout mirrors the solo board with two player panels instead of an enemy
 * intent list: opponent at the top, field banner between, active panel and
 * active hand at the bottom, then End Turn. There is no AI, intent or timer.
 *
 * Card detail opens only from the active hand and plays through the same
 * `onPlayCard` intent as a card face tap. The screen imports no engine mutator,
 * controller or storage module; it receives view types and dispatches intents.
 */
import { useState } from 'react';
import type { CardDefinition } from '../../engine/types';
import { DEFENSE_CAP } from '../../engine/types';
import type {
  DuelBattleView,
  DuelOpponentView,
  DuelSelfView,
} from '../../duel/round';
import '../../styles/tokens.css';
import '../../styles/board.css';
import '../../styles/duel.css';
import { CardDetail } from '../components/CardDetail';
import type { CardMatchup } from '../components/card-presentation';
import { ElementCue, elementLabel } from '../components/ElementCue';
import type { FieldMatchup } from '../components/FieldBanner';
import { FieldBanner } from '../components/FieldBanner';
import { Hand } from '../components/Hand';
import { StatMeter } from '../components/StatMeter';
import { StatusList } from '../components/StatusList';
import type { CardCatalogView } from '../components/view-types';
import { duelHandCountText, duelPlayerName, duelScoreText } from './duel-copy';

export interface DuelBattleScreenProps {
  /** Redacted active-turn view: one hand, an opponent count, no other cards. */
  readonly view: DuelBattleView;
  readonly cards: CardCatalogView;
  /** Field facts resolved by the composition root from the engine's cycle. */
  readonly fieldMatchup: FieldMatchup | null;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  /** Clear the match and return to the menu. */
  readonly onExit: () => void;
}

export function DuelBattleScreen({
  view,
  cards,
  fieldMatchup,
  baseUrl,
  onPlayCard,
  onEndTurn,
  onExit,
}: DuelBattleScreenProps) {
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);

  const openInstance =
    openInstanceId === null
      ? undefined
      : view.hand.find((instance) => instance.instanceId === openInstanceId);
  const openCard =
    openInstance === undefined ? undefined : cards[openInstance.cardId];

  const matchupFor = (card: CardDefinition): CardMatchup => {
    if (
      view.field === 'neutral' ||
      card.element === 'neutral' ||
      fieldMatchup === null
    ) {
      return 'neutral';
    }

    if (card.element === view.field) {
      return 'empowered';
    }

    if (card.element === fieldMatchup.countered) {
      return 'countered';
    }

    return 'neutral';
  };

  const closeDetail = () => {
    setOpenInstanceId(null);
  };

  const playCard = (instanceId: string) => {
    setOpenInstanceId(null);
    onPlayCard(instanceId);
  };

  const viewerName = duelPlayerName(view.viewer);

  return (
    <div
      className="duel-battle"
      data-duel-battle="true"
      data-viewer={view.viewer}
    >
      <header className="duel-battle__head">
        <p className="shell__eyebrow">
          Local Duel · Round {view.round} · Series {duelScoreText(view.wins)}
        </p>
        <h1 className="shell__page-title">{viewerName}&apos;s turn</h1>
        <p className="duel-battle__turn">Turn {view.turn}</p>
        <button type="button" className="shell__back" onClick={onExit}>
          Leave duel
        </button>
      </header>

      <DuelPanel
        panel={view.opponent}
        position="opponent"
        titleId="duel-panel-opponent"
      />

      <FieldBanner
        field={view.field}
        matchup={fieldMatchup}
        baseUrl={baseUrl}
      />

      <DuelPanel panel={view.self} position="self" titleId="duel-panel-self" />

      <Hand
        hand={view.hand}
        cards={cards}
        energy={view.self.energy}
        baseUrl={baseUrl}
        onInspect={setOpenInstanceId}
      />

      <div className="battle-controls" role="group" aria-label="Turn controls">
        <p className="battle-controls__energy">{view.self.energy} energy</p>
        <button
          type="button"
          className="battle-controls__end"
          onClick={onEndTurn}
        >
          End Turn
        </button>
      </div>

      {openInstance !== undefined && openCard !== undefined ? (
        <CardDetail
          card={openCard}
          instanceId={openInstance.instanceId}
          field={view.field}
          matchup={matchupFor(openCard)}
          affordable={view.self.energy >= openCard.cost}
          baseUrl={baseUrl}
          onPlay={playCard}
          onClose={closeDetail}
        />
      ) : null}
    </div>
  );
}

interface DuelPanelProps {
  readonly panel: DuelSelfView | DuelOpponentView;
  readonly position: 'self' | 'opponent';
  readonly titleId: string;
}

/**
 * One human seat. The active seat also sees their energy; the opposing seat
 * sees only a hand count, which is the whole point of the duel privacy model.
 */
function DuelPanel({ panel, position, titleId }: DuelPanelProps) {
  const name = duelPlayerName(panel.player);
  const energy = 'energy' in panel ? panel.energy : null;

  return (
    <section
      className={`duel-panel duel-panel--${position}`}
      data-player={panel.player}
      data-position={position}
      aria-labelledby={titleId}
    >
      <div className="duel-panel__head">
        <h2 className="duel-panel__title" id={titleId}>
          {position === 'self' ? `${name} (you)` : name}
        </h2>
        <p className="duel-panel__element">
          <ElementCue element={panel.element} />{' '}
          <span>{elementLabel(panel.element)} deck</span>
        </p>
      </div>

      <StatMeter
        label={`${name} health`}
        visibleLabel="Health"
        value={panel.health}
        max={panel.maxHealth}
        tone="health"
      />

      <StatMeter
        label={`${name} defense`}
        visibleLabel="Defense"
        value={panel.defense}
        max={DEFENSE_CAP}
        tone="defense"
      />

      <StatusList statuses={panel.statuses} ownerLabel={name} />

      <div className="duel-panel__footer">
        {energy === null ? (
          <p className="duel-panel__count" data-hand-count={panel.handCount}>
            {duelHandCountText(panel.handCount)}
          </p>
        ) : (
          <p className="duel-panel__energy">{energy} energy</p>
        )}
        <p className="duel-panel__piles">
          {panel.deckCount} in deck · {panel.discardCount} discarded
        </p>
      </div>
    </section>
  );
}
