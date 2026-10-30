/**
 * The battle board (SHL-FR-02, SHL-FR-03, SHL-FR-08, battle-screen sections
 * 1-3, motion-and-feedback sections 3 and 4).
 *
 * One board region owns the arena (enemy + field), the player band, the hand,
 * the battle log and the turn controls. The same DOM is laid out as a phone
 * rack, a tablet column or a two-column game table by CSS grid areas, so every
 * control — player summary, End Turn, latest log line, Log toggle and history —
 * renders exactly once (the single-instance rule, section 1.3).
 *
 * It holds only two pieces of view state: which card's detail sheet is open and
 * which hand index invoked it, so focus can return to the next surviving card
 * when a play removes the invoker. Every consequence leaves as an intent
 * (`onPlayCard`, `onEndTurn`).
 *
 * Feedback: the board *receives* the settled beat rather than deriving it, so
 * the derivation happens once per transition beside the announcement. Every
 * overlay is a keyed child of a persistent panel — flash, impact number and
 * defense chip inside the target panel, the ring inside the field roundel, the
 * intent reveal on the intent block, the handoff on the header/footer. No panel
 * is ever remounted by a beat.
 *
 * Rules boundary: this file imports engine *types and frozen constants* only.
 * It imports no engine mutator, controller, persistence module or content
 * catalog. Field matchup facts arrive pre-resolved from the controller.
 */
import { useState } from 'react';
import '../../styles/tokens.css';
import '../../styles/board.css';
import '../motion/motion.css';
import type {
  BattleState,
  CardDefinition,
  EnemyDefinition,
} from '../../engine/types';
import type { FeedbackBeat } from '../feedback/derive';
import { BattleLog } from './BattleLog';
import type { BattleLogLineView } from './BattleLog';
import { CardDetail } from './CardDetail';
import type { CardMatchup } from './card-presentation';
import { EnemyPanel } from './EnemyPanel';
import { FieldBanner } from './FieldBanner';
import type { FieldMatchup } from './FieldBanner';
import { Hand } from './Hand';
import { PlayerPanel } from './PlayerPanel';
import type { CardCatalogView } from './view-types';

export interface BattleBoardProps {
  readonly state: BattleState;
  readonly enemy: EnemyDefinition;
  /**
   * Controller-resolved field facts. `null` while the opening Neutral field is
   * active; the engine's cycle stays the single source of truth.
   */
  readonly fieldMatchup: FieldMatchup | null;
  readonly cards: CardCatalogView;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  /** Rendered battle-log lines, in chronological order. */
  readonly logLines: readonly BattleLogLineView[];
  /** Visible text for the history toggle ("Log"). */
  readonly logToggleLabel: string;
  /**
   * The one beat this settled transition shows, or `null` for a refusal, a
   * zero-delta action or a mount. Omitted by callers that render a board with
   * no feedback (tests, non-playing surfaces).
   */
  readonly feedback?: FeedbackBeat | null;
  /** True once any settled transition has happened (`data-dealt`). */
  readonly dealt?: boolean;
  /** Resolved reduced motion; no decoration is rendered when true. */
  readonly reducedMotion?: boolean;
}

export function BattleBoard({
  state,
  enemy,
  fieldMatchup,
  cards,
  baseUrl,
  onPlayCard,
  onEndTurn,
  logLines,
  logToggleLabel,
  feedback = null,
  dealt = false,
  reducedMotion = false,
}: BattleBoardProps) {
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState(0);

  const player = state.sides.player;
  const battleOver = state.phase === 'ended' || state.outcome !== 'ongoing';
  const playerTurn = state.activeSide === 'player' && !battleOver;

  const openInstance =
    openInstanceId === null
      ? undefined
      : player.hand.find((instance) => instance.instanceId === openInstanceId);
  const openCard =
    openInstance === undefined ? undefined : cards[openInstance.cardId];

  const matchupFor = (card: CardDefinition): CardMatchup => {
    if (
      state.field === 'neutral' ||
      card.element === 'neutral' ||
      fieldMatchup === null
    ) {
      return 'neutral';
    }

    if (card.element === state.field) {
      return 'empowered';
    }

    if (card.element === fieldMatchup.countered) {
      return 'countered';
    }

    return 'neutral';
  };

  const inspect = (instanceId: string) => {
    const index = player.hand.findIndex(
      (instance) => instance.instanceId === instanceId,
    );
    setOpenIndex(index < 0 ? 0 : index);
    setOpenInstanceId(instanceId);
  };

  const closeDetail = () => {
    setOpenInstanceId(null);
  };

  const playCard = (instanceId: string) => {
    setOpenInstanceId(null);
    onPlayCard(instanceId);
  };

  /*
   * The invoking button is unmounted by a play, so the dialog cannot return
   * focus to it. The documented survivor is the next card in hand order, then
   * the last card, then End Turn; the index was captured when the sheet opened.
   */
  const focusSurvivor = (): HTMLElement | null => {
    const cardsNow = Array.from(
      document.querySelectorAll<HTMLElement>('.hand .card-view'),
    );

    if (cardsNow.length > 0) {
      return cardsNow[Math.min(openIndex, cardsNow.length - 1)] ?? null;
    }

    return document.querySelector<HTMLElement>('.battle-controls__end');
  };

  const handoff = feedback?.handoff === true;

  return (
    <section
      className="battle-board"
      data-battle-board="true"
      data-field={state.field}
      data-outcome={state.outcome}
      aria-labelledby="battle-board-title"
    >
      <h2 className="visually-hidden" id="battle-board-title">
        Battle
      </h2>

      <div className="battle-arena">
        <EnemyPanel
          enemy={enemy}
          side={state.sides.opponent}
          plan={state.enemyPlan}
          cards={cards}
          baseUrl={baseUrl}
          feedback={feedback}
          reducedMotion={reducedMotion}
        />

        <FieldBanner
          field={state.field}
          matchup={fieldMatchup}
          baseUrl={baseUrl}
          shift={feedback?.field ?? null}
          shiftKey={feedback?.key ?? 0}
          reducedMotion={reducedMotion}
        />
      </div>

      <PlayerPanel
        side={player}
        feedback={feedback}
        reducedMotion={reducedMotion}
      />

      <Hand
        hand={player.hand}
        cards={cards}
        energy={player.energy}
        deckCount={player.deck.length}
        discardCount={player.discard.length}
        baseUrl={baseUrl}
        onInspect={inspect}
        dealt={dealt}
        draw={feedback?.draw === true}
        drawn={feedback?.drawn ?? []}
      />

      <BattleLog lines={logLines} toggleLabel={logToggleLabel} />

      <div className="battle-footer">
        <div className="battle-controls" role="group" aria-label="Turn controls">
          {/*
            The footer energy cross-fades in place on a handoff beat. The text is
            committed first and the label is keyed, so the new value is never
            held back by the motion.
          */}
          <p
            className="battle-controls__energy"
            data-feedback-handoff={handoff && !reducedMotion ? 'true' : undefined}
            key={handoff && feedback !== null ? feedback.key : 'energy'}
          >
            {player.energy} energy
          </p>
          <button
            type="button"
            className="battle-controls__end"
            onClick={onEndTurn}
            disabled={!playerTurn}
          >
            End Turn
          </button>
        </div>
      </div>

      {openInstance !== undefined && openCard !== undefined ? (
        <CardDetail
          card={openCard}
          instanceId={openInstance.instanceId}
          field={state.field}
          matchup={matchupFor(openCard)}
          affordable={player.energy >= openCard.cost}
          playable={playerTurn}
          baseUrl={baseUrl}
          onPlay={playCard}
          onClose={closeDetail}
          fallbackFocus={focusSurvivor}
        />
      ) : null}
    </section>
  );
}
