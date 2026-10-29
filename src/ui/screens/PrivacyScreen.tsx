/**
 * The full-screen duel privacy handoff (DUEL-FR-03, DUEL-FR-04, VIS-US-02).
 *
 * Rendered only while the round controller reports pending privacy. The battle
 * is unmounted before this mounts, so the board, both hands, health, field,
 * intent and card names are absent from the DOM, not merely covered.
 *
 * The interstitial:
 *
 *   - names the player who takes the device and tells the other player to look
 *     away;
 *   - contains no deck, hand, health, field or intent detail;
 *   - focuses a single full-width "I'm ready" button on mount;
 *   - dismisses only on that button, Enter or Space. Escape is deliberately a
 *     no-op: the focus trap still consumes it so it cannot close anything else;
 *   - never schedules an automatic dismissal.
 *
 * The screen reports one intent, `onReady`; it imports no engine or controller
 * mutator and reads no storage.
 */
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { DuelPlayer } from '../../duel/match';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import { useDialogFocusTrap } from '../a11y/useKeyboardControls';
import { duelPlayerName } from './duel-copy';

export interface PrivacyScreenProps {
  /** The seat that now owns the device. */
  readonly viewer: DuelPlayer;
  /** The explicit tap, Enter or Space that reveals the turn. */
  readonly onReady: () => void;
}

export function PrivacyScreen({ viewer, onReady }: PrivacyScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    containerRef,
    // Escape must not dismiss the handoff. The trap still consumes the key.
    onClose: () => {},
    initialFocusRef: readyRef,
    // The invoking deck or End Turn control is unmounted by the time the turn
    // is revealed; hand focus to the first card of the incoming hand instead.
    fallbackFocus: () =>
      document.querySelector<HTMLElement>('.duel-battle .hand .card-view') ??
      document.querySelector<HTMLElement>(
        '.duel-battle .battle-controls__end',
      ),
  });

  /**
   * Enter and Space are handled explicitly so both activate the handoff on the
   * component's own terms; preventDefault suppresses the native synthetic click
   * that would otherwise fire a second time.
   */
  const handleReadyKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onReady();
    }
  };

  return (
    <div className="duel-privacy" data-duel-privacy="true">
      <div
        className="duel-privacy__dialog"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="duel-privacy-title"
        aria-describedby="duel-privacy-hint"
        tabIndex={-1}
      >
        <p className="duel-privacy__kicker">Local Duel</p>
        <h1 className="duel-privacy__title" id="duel-privacy-title">
          Pass to {duelPlayerName(viewer)}
        </h1>
        <p className="duel-privacy__hint" id="duel-privacy-hint">
          Other player, look away.
        </p>

        <button
          type="button"
          className="duel-privacy__ready"
          ref={readyRef}
          onClick={onReady}
          onKeyDown={handleReadyKeyDown}
        >
          I&apos;m ready
        </button>
      </div>
    </div>
  );
}
