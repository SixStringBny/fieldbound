/**
 * The active-turn duel board (duel-flow section 4, OVERHAUL 6.6/6.9;
 * DUEL-FR-04, DUEL-FR-06, VIS-US-02).
 *
 * The board adopts the battle shell from #8: exactly `100svh`, a pinned 44px
 * header, one board region with the opponent band, the shared field, the self
 * band, the active hand, the public log and the turn controls. There is no
 * intent panel, no AI and no timer.
 *
 * Redaction is structural. The screen receives a `DuelBoardView`, which is the
 * round controller's active-turn view plus only two public facts: the locked
 * deck name per panel and the completed-round history for the series strip.
 * The opponent is a count and a decorative card-back fan; no opponent card id,
 * name, cost or deck order exists in the props, so none can reach the DOM. Only
 * the viewer's own hand renders card faces.
 *
 * Focus: the board is mounted only by the battle route, which always follows a
 * privacy handoff. One mount-time effect hands focus to the first card of the
 * incoming hand, or End Turn when the hand is empty. Later renders, redraws and
 * later turns never move focus again because the effect has no dependencies.
 *
 * The public log is the same component and the same rendered lines as the solo
 * board; it is never live. The single app-wide polite region is the only
 * announcement, and the result routes are separate surfaces with no board.
 */
import { useEffect, useState } from 'react';
import { renderBattleLog } from '../../battle-log/text';
import { BATTLE_DIALOGUE } from '../../content/battle-dialogue';
import type { CardDefinition } from '../../engine/types';
import { DEFENSE_CAP, TURN_START_ENERGY } from '../../engine/types';
import '../../styles/tokens.css';
import '../../styles/board.css';
import '../../styles/duel.css';
import '../motion/motion.css';
import { BattleLog } from '../components/BattleLog';
import { CardDetail } from '../components/CardDetail';
import type { CardMatchup } from '../components/card-presentation';
import { ElementCue } from '../components/ElementCue';
import { FeedbackLayer } from '../components/FeedbackLayer';
import { FieldBanner } from '../components/FieldBanner';
import type { FieldMatchup } from '../components/FieldBanner';
import { Hand } from '../components/Hand';
import { SeriesStrip } from '../components/SeriesStrip';
import { StatMeter } from '../components/StatMeter';
import { StatusList } from '../components/StatusList';
import type { CardCatalogView } from '../components/view-types';
import type { FeedbackBeat } from '../feedback/derive';
import { useDuelFeedback } from '../feedback/useFeedbackBeat';
import { duelHandCountText, duelPlayerName, duelScoreText } from './duel-copy';
import type { DuelBoardView, DuelOpponentPanelView, DuelSelfPanelView } from './duel-view';

export interface DuelBattleScreenProps {
  /** The redacted active-turn view plus the two public presentation facts. */
  readonly view: DuelBoardView;
  readonly cards: CardCatalogView;
  /**
   * The round's engine seed. It only keys the deterministic dialogue picker;
   * no battle rule reads it here and it is not part of the redacted view.
   */
  readonly seed: number;
  /** Field facts resolved by the composition root from the engine's cycle. */
  readonly fieldMatchup: FieldMatchup | null;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  /** False only when the controller would reject an action (never on a live turn). */
  readonly live: boolean;
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  /** Clear the match and return to the menu. Leaving is immediate. */
  readonly onExit: () => void;
  /** Resolved reduced motion; no decoration is rendered when true. */
  readonly reducedMotion?: boolean;
}

export function DuelBattleScreen({
  view,
  cards,
  seed,
  fieldMatchup,
  baseUrl,
  live,
  onPlayCard,
  onEndTurn,
  onExit,
  reducedMotion = false,
}: DuelBattleScreenProps) {
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
  const feedback = useDuelFeedback(view);
  const dealt = view.log.length > 1;
  const handoff = feedback?.handoff === true;

  /*
   * One-shot focus after the privacy gate. The battle route is only ever
   * mounted behind an explicit ready action, so the first card of the incoming
   * hand is the documented destination (duel-flow section 3.3). An empty hand
   * falls back to End Turn. The dependency list is empty on purpose: a play,
   * a redraw or a later turn re-renders this screen but never steals focus.
   */
  useEffect(() => {
    const target =
      document.querySelector<HTMLElement>(
        '[data-duel-battle="true"] .hand .card-view',
      ) ??
      document.querySelector<HTMLElement>(
        '[data-duel-battle="true"] .battle-controls__end',
      );

    if (target !== null) {
      // The ring must be visible even when the handoff was dismissed with a
      // pointer: `:focus-visible` alone does not guarantee that for a
      // programmatic focus after a click (AB-G6).
      target.setAttribute('data-duel-focus', '');
      target.focus();
    }
  }, []);

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
  const opponentName = duelPlayerName(view.opponent.player);

  /*
   * The shared public log, rendered relative to the seat holding the device:
   * `names.player` is this viewer, so every actor and the victory/defeat prose
   * read from either side. No prose or rule is composed here (LOG-FR-02).
   */
  const logLines = renderBattleLog(view.log, {
    seed,
    names: { player: viewerName, opponent: opponentName },
    catalog: cards,
    dialogue: BATTLE_DIALOGUE,
    viewerSide: view.self.side,
    enemyId: null,
  });

  return (
    <div
      className="battle-screen duel-battle"
      data-battle-screen="true"
      data-duel-battle="true"
      data-viewer={view.viewer}
    >
      <header className="battle-header duel-header">
        <div className="battle-header__identity duel-header__identity">
          <span className="battle-header__mark" aria-hidden="true">
            F
          </span>
          <span className="battle-header__wordmark">Fieldbound</span>

          <div className="duel-header__meta">
            <div className="duel-header__eyebrow">
              <p className="shell__eyebrow">
                Round {view.round} · Series {duelScoreText(view.wins)}
              </p>
              <SeriesStrip roundWinners={view.roundWinners} />
            </div>

            <h1 className="duel-header__title">{viewerName}&apos;s turn</h1>

            <p
              className="duel-header__turn"
              data-feedback-handoff={
                handoff && !reducedMotion ? 'true' : undefined
              }
              key={handoff && feedback !== null ? feedback.key : 'turn'}
            >
              Turn {view.turn}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="shell__back battle-header__action duel-header__leave"
          onClick={onExit}
        >
          Leave duel
        </button>
      </header>

      <section
        className="battle-board duel-board"
        data-battle-board="true"
        data-field={view.field}
        aria-labelledby="duel-board-title"
      >
        <h2 className="visually-hidden" id="duel-board-title">
          Battle
        </h2>

        <div className="battle-arena duel-arena">
          <DuelPanel
            panel={view.opponent}
            position="opponent"
            titleId="duel-opponent-title"
            feedback={feedback}
            reducedMotion={reducedMotion}
          />

          <FieldBanner
            field={view.field}
            matchup={fieldMatchup}
            baseUrl={baseUrl}
            shift={feedback?.field ?? null}
            shiftKey={feedback?.key ?? 0}
            reducedMotion={reducedMotion}
          />
        </div>

        <DuelPanel
          panel={view.self}
          position="self"
          titleId="duel-self-title"
          feedback={feedback}
          reducedMotion={reducedMotion}
        />

        <Hand
          hand={view.hand}
          cards={cards}
          energy={view.self.energy}
          deckCount={view.self.deckCount}
          discardCount={view.self.discardCount}
          baseUrl={baseUrl}
          onInspect={setOpenInstanceId}
          dealt={dealt}
          draw={feedback?.draw === true}
          drawn={feedback?.drawn ?? []}
        />

        {/*
          The duel log is public-only and never live. The privacy and result
          routes do not render this component at all.
        */}
        <BattleLog lines={logLines} toggleLabel="Log" />

        <div className="battle-footer">
          <div
            className="battle-controls"
            role="group"
            aria-label="Turn controls"
          >
            <button
              type="button"
              className="battle-controls__end"
              onClick={onEndTurn}
              disabled={!live}
            >
              End Turn
            </button>
          </div>
        </div>

        {openInstance !== undefined && openCard !== undefined ? (
          <CardDetail
            card={openCard}
            instanceId={openInstance.instanceId}
            field={view.field}
            matchup={matchupFor(openCard)}
            affordable={view.self.energy >= openCard.cost}
            playable={live}
            baseUrl={baseUrl}
            onPlay={playCard}
            onClose={closeDetail}
          />
        ) : null}
      </section>
    </div>
  );
}

interface DuelPanelProps {
  readonly panel: DuelSelfPanelView | DuelOpponentPanelView;
  readonly position: 'self' | 'opponent';
  readonly titleId: string;
  readonly feedback: FeedbackBeat | null;
  readonly reducedMotion: boolean;
}

/**
 * One human seat. Both panels name the public locked deck (`<Deck> deck ·
 * <Element>`); only the self panel shows energy. The opposing seat is a hand
 * *count* plus a decorative CSS card-back fan: never a card face, a card id, a
 * name or a cost (duel-flow section 4.4/4.8).
 */
function DuelPanel({
  panel,
  position,
  titleId,
  feedback,
  reducedMotion,
}: DuelPanelProps) {
  const name = duelPlayerName(panel.player);
  const isSelf = position === 'self';
  const energy = isSelf ? (panel as DuelSelfPanelView).energy : null;
  const pipCount = energy === null ? 0 : Math.max(TURN_START_ENERGY, energy);

  return (
    <section
      className={`duel-panel duel-panel--${position}`}
      data-player={panel.player}
      data-position={position}
      data-element={panel.element}
      aria-labelledby={titleId}
    >
      <div className="duel-panel__head">
        <h2 className="duel-panel__title" id={titleId}>
          {isSelf ? `${name} (you)` : name}
        </h2>
        <p className="duel-panel__deck">
          <span className="duel-panel__deck-name">{panel.deckName} deck</span>
          <span aria-hidden="true"> · </span>
          <ElementCue element={panel.element} />
        </p>
      </div>

      <div className="duel-panel__meters">
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
      </div>

      <StatusList statuses={panel.statuses} ownerLabel={name} />

      <div className="duel-panel__foot">
        {energy === null ? (
          <div className="duel-panel__hidden-hand">
            <CardBackFan count={panel.handCount} />
            <p
              className="duel-panel__count"
              data-hand-count={panel.handCount}
            >
              {duelHandCountText(panel.handCount)}
            </p>
          </div>
        ) : (
          <p className="duel-panel__energy">
            <span className="duel-panel__energy-text">{energy} energy</span>
            <span className="energy-pips" aria-hidden="true">
              {Array.from({ length: pipCount }, (_, index) => (
                <span
                  className={
                    index < energy ? 'energy-pip energy-pip--on' : 'energy-pip'
                  }
                  key={index}
                >
                  ◆
                </span>
              ))}
            </span>
          </p>
        )}

        <p className="duel-panel__piles">
          {panel.deckCount} in deck · {panel.discardCount} discarded
        </p>
      </div>

      {feedback === null || reducedMotion ? null : (
        <FeedbackLayer
          beat={feedback}
          side={panel.side}
          slot={isSelf ? 'player' : 'enemy'}
        />
      )}
    </section>
  );
}

/**
 * The hidden hand: a decorative fan of up to five card backs at table/tablet
 * and three at phone (the rest are hidden by CSS). Every back is `aria-hidden`,
 * is not a button and carries no card or instance id. The adjacent count in
 * `[data-hand-count]` is the only accessible value.
 */
function CardBackFan({ count }: { readonly count: number }) {
  if (count <= 0) {
    return null;
  }

  const visible = Math.min(count, 5);

  return (
    <span className="duel-fan" aria-hidden="true">
      {Array.from({ length: visible }, (_, index) => (
        <span
          className="duel-card-back"
          data-duel-card-back=""
          aria-hidden="true"
          key={index}
        />
      ))}
    </span>
  );
}
