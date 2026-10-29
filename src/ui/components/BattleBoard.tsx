/**
 * The portrait-first battle board (SHL-FR-02, SHL-FR-03, SHL-FR-08).
 *
 * Composes the enemy panel, field banner, player panel, hand and sticky turn
 * controls from engine-supplied `BattleState`, `EnemyPlan` and card data. It
 * holds only one piece of view state - which card's detail sheet is open - and
 * reports every consequence upward as an intent (`onInspect` is internal,
 * `onPlayCard` and `onEndTurn` are the outward ones).
 *
 * Rules boundary: this file imports engine *types and frozen constants* only.
 * It imports no engine mutator, controller, persistence module or content
 * catalog. Field matchup facts arrive pre-resolved from the controller, so the
 * banner can state the rules without restating the cycle.
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
}

function outcomeLabel(state: BattleState): string {
  if (state.outcome === 'player-victory') {
    return 'Victory';
  }

  if (state.outcome === 'opponent-victory') {
    return 'Defeat';
  }

  return 'Battle over';
}

export function BattleBoard({
  state,
  enemy,
  fieldMatchup,
  cards,
  baseUrl,
  onPlayCard,
  onEndTurn,
}: BattleBoardProps) {
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);

  const player = state.sides.player;
  const battleOver = state.phase === 'ended' || state.outcome !== 'ongoing';
  const playerTurn = state.activeSide === 'player' && !battleOver;
  const turnText = battleOver
    ? outcomeLabel(state)
    : playerTurn
      ? 'Your turn'
      : 'Enemy turn';

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

  const closeDetail = () => {
    setOpenInstanceId(null);
  };

  const playCard = (instanceId: string) => {
    setOpenInstanceId(null);
    onPlayCard(instanceId);
  };

  return (
    <section
      className="battle-board"
      data-battle-board="true"
      data-field={state.field}
      aria-labelledby="battle-board-title"
    >
      <div className="battle-board__header">
        <h2 className="visually-hidden" id="battle-board-title">
          Battle
        </h2>
        <p className="battle-board__turn">
          Turn {state.turn} · {turnText}
        </p>
        {battleOver ? (
          <p className="battle-board__outcome">{outcomeLabel(state)}</p>
        ) : null}
      </div>

      <EnemyPanel
        enemy={enemy}
        side={state.sides.opponent}
        plan={state.enemyPlan}
        cards={cards}
        baseUrl={baseUrl}
      />

      <FieldBanner
        field={state.field}
        matchup={fieldMatchup}
        baseUrl={baseUrl}
      />

      <PlayerPanel side={player} />

      <Hand
        hand={player.hand}
        cards={cards}
        energy={player.energy}
        baseUrl={baseUrl}
        onInspect={setOpenInstanceId}
      />

      <div className="battle-controls" role="group" aria-label="Turn controls">
        <p className="battle-controls__energy">{player.energy} energy</p>
        <button
          type="button"
          className="battle-controls__end"
          onClick={onEndTurn}
          disabled={!playerTurn}
        >
          End Turn
        </button>
      </div>

      {openInstance !== undefined && openCard !== undefined ? (
        <CardDetail
          card={openCard}
          instanceId={openInstance.instanceId}
          field={state.field}
          matchup={matchupFor(openCard)}
          affordable={player.energy >= openCard.cost}
          baseUrl={baseUrl}
          onPlay={playCard}
          onClose={closeDetail}
        />
      ) : null}
    </section>
  );
}
