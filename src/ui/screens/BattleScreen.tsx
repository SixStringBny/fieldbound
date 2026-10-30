/**
 * The playable battle screen (SHL-FR-03, ENG-FR-01, ENG-FR-04, ENG-FR-07,
 * SHL-FR-06).
 *
 * The screen is presentational: it receives reducer state from the battle
 * controller and dispatches exactly two intents, `playCard` and `endTurn`. It
 * imports neither an engine mutator nor a damage/status function, so the board
 * cannot restate a rule.
 *
 * Composition (battle-screen section 1): a pinned 44px header with the
 * FIELDBOUND mark, the turn line and the route actions, then one board region
 * that owns the arena, player band, hand, log and turn controls. The log lines
 * are rendered here from the controller's settled entries and handed to the
 * board, where the same log element is the phone strip/drawer or the table rail.
 *
 * Three effects keep the shell informed of settled transitions:
 *
 *   - the cue effect publishes the controller's cue list exactly once per
 *     sequence (audio remains SHL-06's subscriber);
 *   - the announcement effect turns the shared `BattleDeltas` into one polite
 *     sentence for the app's single live region. It never announces a render,
 *     only a new sequence, so re-rendering cannot duplicate a message;
 *   - the feedback cursor turns the same deltas into at most one visual beat,
 *     rendered in the commit that carries the settled values.
 *
 * The header turn label is one of the two handoff surfaces: it changes text
 * instantly and is keyed per handoff beat so its 160ms cross-fade replays
 * without the label ever waiting for the motion.
 *
 * Battle log (LOG-FR-02, LOG-FR-04, LOG-FR-07)
 * --------------------------------------------
 * Every sentence is produced by `src/battle-log/text.ts`; the log remains a
 * labelled, non-live region. The one polite announcement above is the only
 * spoken summary.
 */
import { useEffect, useRef } from 'react';
import { renderBattleLog } from '../../battle-log/text';
import { BATTLE_DIALOGUE } from '../../content/battle-dialogue';
import type { BattleControllerState } from '../../state/battle-controller';
import { describeBattleUpdate } from '../a11y/announcements';
import { BattleBoard } from '../components/BattleBoard';
import { emitCue } from '../events';
import { diffBattleState } from '../feedback/diff';
import { useBattleFeedback } from '../feedback/useFeedbackBeat';

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
  /**
   * Resolved reduced motion. The app root already carries it as
   * `data-reduced-motion`; the value also arrives here because an impact number
   * must not be *rendered* at all under reduced motion, which CSS cannot do.
   */
  readonly reducedMotion?: boolean;
}

function outcomeLabel(state: BattleControllerState): string {
  if (state.battle.outcome === 'player-victory') {
    return 'Victory';
  }

  if (state.battle.outcome === 'opponent-victory') {
    return 'Defeat';
  }

  return 'Battle over';
}

export function BattleScreen({
  state,
  baseUrl,
  onPlayCard,
  onEndTurn,
  onAnnounce,
  onExit,
  onOverview,
  reducedMotion = false,
}: BattleScreenProps) {
  const report = state.report;
  const previousRef = useRef<BattleControllerState>(state);
  const mountedRef = useRef(false);
  const { beat, dealt } = useBattleFeedback(state);

  const battleOver =
    state.battle.phase === 'ended' || state.battle.outcome !== 'ongoing';
  const playerTurn =
    state.battle.activeSide === 'player' && !battleOver;
  const turnText = battleOver
    ? outcomeLabel(state)
    : playerTurn
      ? 'Your turn'
      : 'Enemy turn';
  const handoff = beat?.handoff === true;

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
        deltas: diffBattleState(previous.battle, state.battle),
        next: state.battle,
        intent: report.intent,
        fieldMatchup: state.fieldMatchup,
        enemyName: state.enemy.name,
      }),
    );
  }, [state, report, onAnnounce]);

  return (
    <div className="battle-screen" data-battle-screen="true">
      <header className="battle-header">
        <div className="battle-header__identity">
          <span className="battle-header__mark" aria-hidden="true">
            F
          </span>
          <span className="battle-header__wordmark">Fieldbound</span>
          <h1 className="shell__page-title visually-hidden">Battle</h1>
          <p
            className="battle-board__turn battle-header__turn"
            data-outcome={battleOver ? 'true' : 'false'}
            data-feedback-handoff={
              handoff && !reducedMotion ? 'true' : undefined
            }
            key={handoff && beat !== null ? beat.key : 'turn'}
          >
            {battleOver ? turnText : `Turn ${state.battle.turn} · ${turnText}`}
          </p>
        </div>

        <div className="battle-header__actions">
          {onOverview === undefined ? null : (
            <button
              type="button"
              className="shell__back battle-header__action"
              onClick={onOverview}
            >
              Run overview
            </button>
          )}
          <button
            type="button"
            className="shell__back battle-header__action"
            onClick={onExit}
            aria-label="Leave battle"
          >
            Leave
          </button>
        </div>
      </header>

      {report !== null && !report.ok && report.error !== null ? (
        <p className="battle-screen__error">
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
        logLines={logLines}
        logToggleLabel="Log"
        feedback={beat}
        dealt={dealt}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
