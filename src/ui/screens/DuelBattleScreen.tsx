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
 *
 * Feedback (motion-and-feedback sections 3 and 11)
 * ------------------------------------------------
 * The duel uses the same beat vocabulary over *public* deltas: the four health
 * and defense values, the shared field and the turn number that both humans can
 * already see. There is no intent block, so no reveal is ever derived. The beat
 * is keyed on the public log's length, which grows once per settled transition
 * and never on a refusal. The privacy handoff unmounts this screen, so a
 * transition into or out of privacy renders no beat at all.
 *
 * Battle log (LOG-FR-02, LOG-FR-04, LOG-FR-05, LOG-FR-07)
 * ------------------------------------------------------
 * Only the active-turn view carries entries, so this screen is the only duel
 * surface with a log. Every line is rendered by `src/battle-log/text.ts` from
 * the public entries: names are viewer-relative (the acting seat's own name and
 * the other seat's) and the round seed keys the deterministic dialogue, exactly
 * as the solo board does. The privacy and result screens render no log at all,
 * and the single app-wide polite announcement remains the only live region.
 */
import { useState } from 'react';
import { renderBattleLog } from '../../battle-log/text';
import { BATTLE_DIALOGUE } from '../../content/battle-dialogue';
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
import '../motion/motion.css';
import { BattleLog } from '../components/BattleLog';
import { CardDetail } from '../components/CardDetail';
import type { CardMatchup } from '../components/card-presentation';
import { ElementCue, elementLabel } from '../components/ElementCue';
import type { FieldMatchup } from '../components/FieldBanner';
import { FieldBanner } from '../components/FieldBanner';
import { FeedbackLayer } from '../components/FeedbackLayer';
import { Hand } from '../components/Hand';
import { StatMeter } from '../components/StatMeter';
import { StatusList } from '../components/StatusList';
import type { CardCatalogView } from '../components/view-types';
import type { FeedbackBeat } from '../feedback/derive';
import { useDuelFeedback } from '../feedback/useFeedbackBeat';
import { duelHandCountText, duelPlayerName, duelScoreText } from './duel-copy';

export interface DuelBattleScreenProps {
  /** Redacted active-turn view: one hand, an opponent count, no other cards. */
  readonly view: DuelBattleView;
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
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  /** Clear the match and return to the menu. */
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
  onPlayCard,
  onEndTurn,
  onExit,
  reducedMotion = false,
}: DuelBattleScreenProps) {
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
  const feedback = useDuelFeedback(view);
  const dealt = view.log.length > 1;
  const handoff = feedback?.handoff === true;

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

  // The shared public log, rendered relative to the seat holding the device:
  // `names.player` is this viewer, so victory/defeat and every actor read from
  // either side. No prose or rule is computed here (LOG-FR-02, LOG-FR-05).
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
      className="duel-battle"
      data-duel-battle="true"
      data-viewer={view.viewer}
    >
      <header className="duel-battle__head">
        <p className="shell__eyebrow">
          Local Duel · Round {view.round} · Series {duelScoreText(view.wins)}
        </p>
        <h1 className="shell__page-title">{viewerName}&apos;s turn</h1>
        <p
          className="duel-battle__turn"
          data-feedback-handoff={
            handoff && !reducedMotion ? 'true' : undefined
          }
          key={handoff && feedback !== null ? feedback.key : 'turn'}
        >
          Turn {view.turn}
        </p>
        <button type="button" className="shell__back" onClick={onExit}>
          Leave duel
        </button>
      </header>

      <div className="battle-log-layout">
        <div className="duel-battle__board">
          <DuelPanel
            panel={view.opponent}
            position="opponent"
            titleId="duel-panel-opponent"
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

          <DuelPanel
            panel={view.self}
            position="self"
            titleId="duel-panel-self"
            feedback={feedback}
            reducedMotion={reducedMotion}
          />

          <Hand
            hand={view.hand}
            cards={cards}
            energy={view.self.energy}
            baseUrl={baseUrl}
            onInspect={setOpenInstanceId}
            dealt={dealt}
            draw={feedback?.draw === true}
            drawn={feedback?.drawn ?? []}
          />

          <div
            className="battle-controls"
            role="group"
            aria-label="Turn controls"
          >
            <p className="battle-controls__energy">{view.self.energy} energy</p>
            <button
              type="button"
              className="battle-controls__end"
              onClick={onEndTurn}
            >
              End Turn
            </button>
          </div>
        </div>

        {/*
          Only the active-turn view reaches this branch. The privacy and result
          screens are separate components with no log, so no CSS-hidden history
          can leak an opponent's unplayed card to the DOM.
        */}
        <BattleLog lines={logLines} toggleLabel="Log" />
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
  readonly feedback: FeedbackBeat | null;
  readonly reducedMotion: boolean;
}

/**
 * One human seat. The active seat also sees their energy; the opposing seat
 * sees only a hand count, which is the whole point of the duel privacy model.
 *
 * The seat is also a feedback target: the beat's flash, signed number and
 * `+N DEF` chip render in a keyed layer inside the persistent panel, using the
 * same class names and `data-*` contract as the solo board.
 */
function DuelPanel({
  panel,
  position,
  titleId,
  feedback,
  reducedMotion,
}: DuelPanelProps) {
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

      {feedback === null || reducedMotion ? null : (
        <FeedbackLayer
          beat={feedback}
          side={panel.side}
          slot={position === 'opponent' ? 'enemy' : 'player'}
        />
      )}
    </section>
  );
}
