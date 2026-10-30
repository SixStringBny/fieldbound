/**
 * The full-screen duel privacy handoff (duel-flow section 3, OVERHAUL 6.10;
 * DUEL-FR-03, DUEL-FR-04, VIS-US-02).
 *
 * Privacy is a **route**, not an overlay: App mounts this screen instead of the
 * battle route, so the board, both hands, health, defense, energy, field, log
 * and every card name are absent from the document rather than covered. The
 * view carries only `viewer`, `round` and `wins`.
 *
 * The plaque names the arriving player, tells the other player to look away,
 * repeats the public series score and offers exactly one action. `I'm ready` is
 * the only dismissal: the dialog traps Tab and Shift+Tab on that control,
 * Escape is deliberately a no-op and nothing schedules an automatic dismissal.
 *
 * Focus lands on `I'm ready` on mount. On activation the privacy route unmounts,
 * the battle route mounts and the battle screen's own one-shot focus request
 * lands on the first card of the incoming hand (or End Turn when the hand is
 * empty). This screen reports exactly one intent, `onReady`.
 */
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { DuelPlayer, DuelRound, DuelWins } from '../../duel/match';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import { useDialogFocusTrap } from '../a11y/useKeyboardControls';
import { duelPlayerName, duelScoreText } from './duel-copy';

export interface PrivacyScreenProps {
  /** The seat that now owns the device. */
  readonly viewer: DuelPlayer;
  /** The round about to be revealed. */
  readonly round: DuelRound;
  /** The public series score entering the round. */
  readonly wins: DuelWins;
  /** The explicit tap, Enter or Space that reveals the turn. */
  readonly onReady: () => void;
}

export function PrivacyScreen({
  viewer,
  round,
  wins,
  onReady,
}: PrivacyScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    containerRef,
    // Escape must not dismiss the handoff. The trap consumes the key anyway, so
    // it cannot close or act on anything behind the screen.
    onClose: () => {},
    initialFocusRef: readyRef,
  });

  /**
   * Enter and Space activate the handoff on the component's own terms so both
   * keyboard paths work identically in every environment; preventDefault
   * suppresses the native synthetic click that would otherwise fire twice.
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
        className="duel-privacy__plaque"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="duel-privacy-title"
        aria-describedby="duel-privacy-hint"
        tabIndex={-1}
      >
        <p className="duel-privacy__eyebrow">Local Duel · Round {round}</p>
        <h1 className="duel-privacy__title" id="duel-privacy-title">
          Pass to {duelPlayerName(viewer)}
        </h1>
        <p className="duel-privacy__hint" id="duel-privacy-hint">
          Other player, look away.
        </p>
        <p className="duel-privacy__score">Series {duelScoreText(wins)}</p>

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
