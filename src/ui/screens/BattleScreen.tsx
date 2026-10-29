/**
 * The playable battle screen (SHL-FR-03, ENG-FR-01, ENG-FR-04, ENG-FR-07,
 * SHL-FR-06).
 *
 * The screen is presentational: it receives reducer state from the battle
 * controller and dispatches exactly two intents, `playCard` and `endTurn`. It
 * imports neither an engine mutator nor a damage/status function, so the board
 * cannot restate a rule.
 *
 * Two effects keep the shell informed of settled transitions:
 *
 *   - the cue effect publishes the controller's cue list exactly once per
 *     sequence (audio remains SHL-06's subscriber);
 *   - the announcement effect turns the before/after state into one polite
 *     sentence for the app's single live region. It never announces a render,
 *     only a new sequence, so re-rendering cannot duplicate a message.
 *
 * Battle log (LOG-FR-02, LOG-FR-04, LOG-FR-07)
 * --------------------------------------------
 * The screen forwards the controller's settled entries to the pure text
 * renderer and hands the resulting lines to the shared `BattleLog` surface. It
 * chooses no words and computes no rule: the enemy name and battle seed are
 * state facts, the catalog is frozen content, and every sentence is produced by
 * `src/battle-log/text.ts`. The log is a labelled, non-live region beside the
 * board; the one polite announcement above remains the only spoken summary.
 */
import { useEffect, useRef } from 'react';
import { renderBattleLog } from '../../battle-log/text';
import { BATTLE_DIALOGUE } from '../../content/battle-dialogue';
import type { BattleControllerState } from '../../state/battle-controller';
import { describeBattleUpdate } from '../a11y/announcements';
import { BattleBoard } from '../components/BattleBoard';
import { BattleLog } from '../components/BattleLog';
import { emitCue } from '../events';

export interface BattleScreenProps {
  readonly state: BattleControllerState;
  /** App base URL used by every manifest image. */
  readonly baseUrl: string;
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  /** Publish one polite announcement for a settled transition. */
  readonly onAnnounce: (message: string) => void;
  /** Leave the battle for the menu. Solo and duel replace this with their own flow. */
  readonly onExit: () => void;
  /**
   * Solo only: open the run overview without leaving the fight. Omitted for a
   * standalone practice battle and for a duel, where there is no run to show.
   */
  readonly onOverview?: () => void;
}

export function BattleScreen({
  state,
  baseUrl,
  onPlayCard,
  onEndTurn,
  onAnnounce,
  onExit,
  onOverview,
}: BattleScreenProps) {
  const report = state.report;
  const previousRef = useRef<BattleControllerState>(state);
  const mountedRef = useRef(false);

  // One rendered line per settled entry (LOG-FR-02). Solo always views the
  // engine player side, so `You` and the enemy name are the two actors and the
  // enemy id lets its authored voice answer its own triggers.
  const logLines = renderBattleLog(state.log, {
    seed: state.battle.seed,
    names: { player: 'You', opponent: state.enemy.name },
    catalog: state.cards,
    dialogue: BATTLE_DIALOGUE,
    enemyId: state.enemy.id,
  });

  useEffect(() => {
    // A board remounted from the run overview carries the last reduction in
    // `state.report`. Replaying its cues here would sound the card a second
    // time; only transitions after this mount are emitted.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (report === null) {
      return;
    }

    for (const cue of report.cues) {
      emitCue(cue);
    }
  }, [state.sequence, report]);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;

    if (report === null || previous.sequence === state.sequence) {
      return;
    }

    if (!report.ok) {
      const detail = report.error === null ? '' : ` ${report.error.message}`;
      onAnnounce(`That action was refused.${detail}`);
      return;
    }

    onAnnounce(
      describeBattleUpdate({
        previous: previous.battle,
        next: state.battle,
        intent: report.intent,
        fieldMatchup: state.fieldMatchup,
        enemyName: state.enemy.name,
      }),
    );
  }, [state, report, onAnnounce]);

  return (
    <div className="battle-screen" data-battle-screen="true">
      <header className="battle-screen__head">
        <p className="shell__eyebrow">Fieldbound</p>
        <h1 className="shell__page-title">Battle</h1>
        <div className="battle-screen__actions">
          {onOverview === undefined ? null : (
            <button type="button" className="shell__back" onClick={onOverview}>
              Run overview
            </button>
          )}
          <button type="button" className="shell__back" onClick={onExit}>
            Leave battle
          </button>
        </div>
      </header>

      {report !== null && !report.ok && report.error !== null ? (
        <p className="battle-screen__error">
          That action was refused: {report.error.message}
        </p>
      ) : null}

      <div className="battle-log-layout">
        <BattleBoard
          state={state.battle}
          enemy={state.enemy}
          fieldMatchup={state.fieldMatchup}
          cards={state.cards}
          baseUrl={baseUrl}
          onPlayCard={onPlayCard}
          onEndTurn={onEndTurn}
        />

        {/*
          The log follows the board in DOM order, so at 375px the sticky End
          Turn bar is never covered by the latest strip or the opened drawer,
          and at 1024px the same list becomes the right-hand column.
        */}
        <BattleLog lines={logLines} toggleLabel="Log" />
      </div>
    </div>
  );
}
