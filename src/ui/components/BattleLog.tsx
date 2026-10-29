/**
 * Battle log surface (LOG-FR-04, presentation half of LOG-FR-07, LOG-NF-02).
 *
 * Renders pre-rendered `BattleLogLine` values only. It formats nothing, sorts
 * nothing and computes no rules: the strings arrive already composed by the
 * battle-log renderer, so this file imports no engine mutator, content catalog,
 * controller, storage module or text renderer. The only imports are React, the
 * shared modal-dialog check used by the Escape guard, and the log stylesheets.
 *
 * Surface:
 *
 *   - one always-visible latest-entry strip inside a labelled `region`;
 *   - a native 44x44 Log button with `aria-expanded` / `aria-controls` that
 *     opens the scrollable history drawer below 1024px;
 *   - an ordered list of the same entries in chronological DOM order;
 *   - at 1024px and wider the history is laid out as a right-hand column and
 *     the toggle is hidden (see `battle-log.css`). Screens get that column by
 *     wrapping the board and this component in `.battle-log-layout`.
 *
 * It is deliberately *not* a live region: the app already mounts one polite
 * live region for settled transitions, and a live log would say every event
 * twice. Nothing here announces, focuses or interrupts. Opening the drawer
 * scrolls the newest entry into view without moving focus.
 *
 * Escape closes the drawer and returns focus to the toggle. The listener is
 * document-scoped only while the drawer is open and defers to an open modal
 * dialog, so Escape never dismisses a privacy screen or a card detail sheet on
 * the log's behalf.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { hasOpenModalDialog } from '../a11y/useKeyboardControls';
import '../../styles/tokens.css';
import '../../styles/battle-log.css';

/**
 * One rendered log entry.
 *
 * Structurally identical to `BattleLogLine` from `src/battle-log/text.ts`, but
 * declared locally so the presentation layer never imports the renderer. The
 * screen passes its rendered lines straight through.
 */
export interface BattleLogLineView {
  /** Stable entry id, unique inside one battle. */
  readonly id: string;
  /** Entry ordinal; carried for consumers, never used for sorting. */
  readonly ordinal: number;
  /** Engine turn number after the transition. */
  readonly turn: number;
  /** The factual English sentence. */
  readonly factual: string;
  /** At most one authored dialogue line. */
  readonly dialogue: string | null;
}

export interface BattleLogProps {
  /** Rendered lines in chronological order. Never sorted or rewritten here. */
  readonly lines: readonly BattleLogLineView[];
  /**
   * Visible text for the history toggle. The screen supplies the product's
   * wording (for example "Log"); the component never invents a label.
   */
  readonly toggleLabel: string;
}

const REGION_LABEL = 'Battle log';
const LATEST_LABEL = 'Latest battle log entry';
const HISTORY_LABEL = 'Battle log entries';
const EMPTY_TEXT = 'The battle log is empty.';

export function BattleLog({ lines, toggleLabel }: BattleLogProps) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const historyId = `${baseId}-history`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const spaceHeldRef = useRef(false);

  const newest = lines.length === 0 ? null : (lines[lines.length - 1] ?? null);
  const newestKey = newest === null ? '' : newest.id;

  /*
   * Keep the newest entry reachable when the drawer opens and when a new line
   * arrives while it is open. `scrollTop` is assigned directly rather than via
   * smooth scrolling, so reduced motion is honoured without a JS branch.
   */
  useEffect(() => {
    const history = historyRef.current;

    if (history !== null) {
      history.scrollTop = history.scrollHeight;
    }
  }, [open, newestKey]);

  const toggle = () => {
    setOpen((current) => !current);
  };

  /*
   * Enter and Space are driven explicitly, following the board's card-button
   * precedent. The listener environment used by the unit tests does not
   * synthesise a click for keyboard activation, and this keeps one state
   * change per key press: Enter is cancelled on keydown, Space on keyup (the
   * point at which a native button would otherwise fire its click).
   */
  const handleToggleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      toggle();
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      // Cancel the page-scroll default; the toggle itself fires on keyup.
      event.preventDefault();
      spaceHeldRef.current = true;
    }
  };

  const handleToggleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') {
      return;
    }

    if (!spaceHeldRef.current) {
      return;
    }

    spaceHeldRef.current = false;
    event.preventDefault();
    toggle();
  };

  /*
   * Escape is scoped to the open drawer, not the whole document lifetime. An
   * open modal dialog keeps Escape for itself so the log can never dismiss a
   * privacy screen or a card sheet.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      if (hasOpenModalDialog()) {
        return;
      }

      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <section
      className="battle-log"
      data-battle-log="true"
      aria-labelledby={titleId}
    >
      <div className="battle-log__head">
        <h2 className="battle-log__title" id={titleId}>
          {REGION_LABEL}
        </h2>
        <button
          type="button"
          className="battle-log__toggle"
          ref={toggleRef}
          aria-expanded={open}
          aria-controls={historyId}
          onClick={toggle}
          onKeyDown={handleToggleKeyDown}
          onKeyUp={handleToggleKeyUp}
        >
          <span className="battle-log__toggle-glyph" aria-hidden="true">
            ☰
          </span>
          <span className="battle-log__toggle-label">{toggleLabel}</span>
        </button>
      </div>

      <div
        className="battle-log__latest"
        role="group"
        aria-label={LATEST_LABEL}
      >
        {newest === null ? null : (
          <p className="battle-log__latest-text" data-battle-log-latest="true">
            {newest.factual}
          </p>
        )}
      </div>

      <div
        className="battle-log__history"
        id={historyId}
        ref={historyRef}
        data-open={open ? 'true' : 'false'}
      >
        {lines.length === 0 ? (
          <div
            className="battle-log__empty"
            role="note"
            aria-label="Battle log empty"
            data-battle-log-empty="true"
          >
            <p className="battle-log__empty-text">{EMPTY_TEXT}</p>
          </div>
        ) : null}

        {lines.length === 0 ? null : (
          <ol className="battle-log__list" aria-label={HISTORY_LABEL}>
            {lines.map((line) => (
              <li
                className="battle-log__item"
                key={line.id}
                data-battle-log-entry={line.id}
              >
                <p className="battle-log__factual">
                  <span className="battle-log__turn">Turn {line.turn}</span>{' '}
                  {line.factual}
                </p>
                {line.dialogue === null ? null : (
                  <p className="battle-log__dialogue">{line.dialogue}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
