/**
 * The playable battle screen (SHL-FR-03, ENG-FR-01, ENG-FR-04, ENG-FR-07).
 *
 * The screen is presentational: it receives reducer state from the battle
 * controller and dispatches exactly two intents, `playCard` and `endTurn`. It
 * imports neither an engine mutator nor a damage/status function, so the board
 * cannot restate a rule.
 *
 * The one effect emits the cues the controller derived for the last settled
 * action, exactly once per sequence. Audio remains SHL-06's subscriber; this
 * screen only publishes what happened.
 */
import { useEffect } from 'react';
import type { BattleControllerState } from '../../state/battle-controller';
import { BattleBoard } from '../components/BattleBoard';
import { emitCue } from '../events';

export interface BattleScreenProps {
  readonly state: BattleControllerState;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  /** Leave the battle for the menu. Solo and duel replace this with their own flow. */
  readonly onExit: () => void;
}

export function BattleScreen({
  state,
  baseUrl,
  onPlayCard,
  onEndTurn,
  onExit,
}: BattleScreenProps) {
  const report = state.report;

  useEffect(() => {
    if (report === null) {
      return;
    }

    for (const cue of report.cues) {
      emitCue(cue);
    }
  }, [state.sequence, report]);

  return (
    <div className="battle-screen" data-battle-screen="true">
      <header className="battle-screen__head">
        <p className="shell__eyebrow">Fieldbound</p>
        <h1 className="shell__page-title">Battle</h1>
        <button type="button" className="shell__back" onClick={onExit}>
          Leave battle
        </button>
      </header>

      {report !== null && !report.ok && report.error !== null ? (
        <p className="battle-screen__error" role="status">
          That action was refused: {report.error.message}
        </p>
      ) : null}

      <BattleBoard
        state={state.battle}
        enemy={state.enemy}
        fieldMatchup={state.fieldMatchup}
        cards={state.cards}
        baseUrl={baseUrl}
        onPlayCard={onPlayCard}
        onEndTurn={onEndTurn}
      />
    </div>
  );
}
