/**
 * Beat cursors: the two hooks that turn a settled render into at most one
 * feedback beat (motion-and-feedback sections 3.2 and 3.3).
 *
 * Both hooks follow React's documented "adjust state when a value changes"
 * pattern: the beat is computed *during the render that commits the settled
 * values*, so the meters, the hand and the beat land in one commit and the beat
 * starts at t = 0 with the state it describes. No effect, timer, interval or
 * frame callback is involved anywhere in the beat path.
 *
 * The previous settled state is kept in the same cursor object, so the diff is
 * always between two consecutive commits. A refusal or a zero-delta action
 * yields `null` and the cursor still advances, which is what keeps the next
 * beat diffing from the right predecessor.
 *
 * There is no beat on mount, by construction: the cursor starts on the state it
 * was mounted with. A battle resumed through Continue Run therefore renders its
 * opening deal without animating anything (state matrix: "Battle mount, fresh
 * or resumed — no beat").
 */
import { useState } from 'react';
import type { DuelBattleView } from '../../duel/round';
import type { BattleControllerState } from '../../state/battle-controller';
import { deriveDuelFeedbackBeat, deriveFeedbackBeat } from './derive';
import type { FeedbackBeat } from './derive';

/** The beat, plus whether the opening deal has settled. */
export interface BattleFeedbackView {
  readonly beat: FeedbackBeat | null;
  /**
   * True once any settled transition has happened. `.hand` renders
   * `data-dealt="true"` from it, which is what stops the opening hand from
   * animating while later draws do.
   */
  readonly dealt: boolean;
}

interface BattleCursor {
  readonly sequence: number;
  readonly prior: BattleControllerState;
  readonly beat: FeedbackBeat | null;
  readonly dealt: boolean;
}

const NO_BEAT: BattleFeedbackView = { beat: null, dealt: false };

/**
 * One beat per settled battle transition.
 *
 * The controller's `sequence` increments on every dispatch, including a
 * rejection, so it is the settled-transition token. A rejection carries
 * `report.ok === false` and produces no beat: the refusal sentence is the
 * feedback.
 */
export function useBattleFeedback(
  state: BattleControllerState,
): BattleFeedbackView {
  const [cursor, setCursor] = useState<BattleCursor>(() => ({
    sequence: state.sequence,
    prior: state,
    beat: null,
    dealt: false,
  }));

  if (cursor.sequence !== state.sequence) {
    // A controller that restarts at a lower sequence is a different battle on
    // the same component: start over without animating the new opening.
    if (state.sequence < cursor.sequence) {
      setCursor({
        sequence: state.sequence,
        prior: state,
        beat: null,
        dealt: false,
      });

      return NO_BEAT;
    }

    const beat =
      state.report !== null && state.report.ok
        ? deriveFeedbackBeat(cursor.prior.battle, state.battle, state.sequence)
        : null;
    const dealt = cursor.dealt || beat !== null;

    setCursor({ sequence: state.sequence, prior: state, beat, dealt });

    return { beat, dealt };
  }

  return { beat: cursor.beat, dealt: cursor.dealt };
}

interface DuelCursor {
  /**
   * The public log grows by exactly one entry per settled duel transition and
   * never on a refusal, so its length is this screen's sequence. The redacted
   * view carries no counter of its own.
   */
  readonly length: number;
  readonly prior: DuelBattleView;
  readonly beat: FeedbackBeat | null;
}

/**
 * One beat per settled duel transition, over the public deltas of the redacted
 * view. The board is unmounted during the privacy handoff, so this hook never
 * sees a transition into or out of privacy; it starts fresh with no beat on
 * every mount, which is exactly the "privacy renders no beat" rule.
 */
export function useDuelFeedback(view: DuelBattleView): FeedbackBeat | null {
  const [cursor, setCursor] = useState<DuelCursor>(() => ({
    length: view.log.length,
    prior: view,
    beat: null,
  }));

  if (cursor.length !== view.log.length) {
    const beat =
      view.log.length > cursor.length
        ? deriveDuelFeedbackBeat(cursor.prior, view, view.log.length)
        : null;

    setCursor({ length: view.log.length, prior: view, beat });

    return beat;
  }

  return cursor.beat;
}
