/**
 * Global keyboard controls and modal focus handling (SHL-FR-06, VIS-NFR-03).
 *
 * Two concerns live here because they are two halves of the same contract:
 *
 *   - `useKeyboardControls` binds the app-wide `E` shortcut. It ends the turn
 *     only when focus is outside a text field, no modal dialog is open and no
 *     modifier is held, so typing an "e" in a future input can never cost a
 *     turn.
 *   - `useDialogFocusTrap` is the dialog half: it records the invoking control,
 *     moves focus inside, wraps Tab/Shift+Tab, closes on Escape, locks
 *     background scrolling and restores focus to the invoker on close.
 *
 * Neither hook renders. `CardDetail` owns the markup (`role="dialog"`,
 * `aria-modal="true"`); this module only enforces the behaviour, so a second
 * dialog can reuse it without copying focus code.
 *
 * No positive `tabindex` value is ever produced: the trap only walks native
 * focusables and elements whose authored tab index is zero or positive-free.
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/* -------------------------------------------------------------------------- */
/* Text entry detection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Input types that do not accept typed text. Everything else - including an
 * unspecified `type`, which defaults to text - counts as a text field and
 * blocks the `E` shortcut.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

const TEXT_ENTRY_ROLES = new Set([
  'combobox',
  'searchbox',
  'spinbutton',
  'textbox',
]);

/**
 * True when a keyboard shortcut would be typing rather than commanding.
 * Handles inputs, textareas, selects, contenteditable hosts and the ARIA text
 * roles that sit on non-form elements.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const contentEditable = target.getAttribute('contenteditable');
  if (contentEditable !== null && contentEditable !== 'false') {
    return true;
  }

  const tag = target.tagName.toLowerCase();

  if (tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (tag === 'input') {
    return !NON_TEXT_INPUT_TYPES.has(
      (target as HTMLInputElement).type.toLowerCase(),
    );
  }

  const role = target.getAttribute('role');
  return role !== null && TEXT_ENTRY_ROLES.has(role);
}

/** True while any modal dialog is mounted, whichever screen owns it. */
export function hasOpenModalDialog(
  documentRoot: Document = document,
): boolean {
  return documentRoot.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/* -------------------------------------------------------------------------- */
/* Global E shortcut                                                           */
/* -------------------------------------------------------------------------- */

export interface KeyboardControlsOptions {
  /** End the current turn. Never called while a text field or dialog owns focus. */
  readonly onEndTurn: () => void;
  /** False once the battle is settled; the listener is removed entirely. */
  readonly enabled?: boolean;
}

/**
 * Bind `E` to ending a turn. The listener sits on the document so it works
 * whichever control has focus, and every guard runs before the intent is
 * dispatched. `preventDefault` keeps the key from reaching a page-level
 * handler that might otherwise scroll or type.
 */
export function useKeyboardControls({
  onEndTurn,
  enabled = true,
}: KeyboardControlsOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) {
        return;
      }

      // Legacy IMEs report an empty key with keyCode 229 while composing.
      if (event.keyCode === 229) {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== 'e') {
        return;
      }

      if (isTextEntryTarget(event.target) || hasOpenModalDialog()) {
        return;
      }

      event.preventDefault();
      onEndTurn();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onEndTurn]);
}

/* -------------------------------------------------------------------------- */
/* Dialog focus trap                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Native focusables in DOM order. `button:not([disabled])` deliberately keeps
 * `aria-disabled` cards reachable: they are focusable by design so a keyboard
 * user can open the detail and learn why the card cannot be played.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Every programmatically focusable element inside `container`, in DOM order. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true',
  );
}

export interface DialogFocusTrapOptions {
  /** The element carrying `role="dialog"` and `aria-modal="true"`. */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Close the dialog when Escape is pressed. */
  readonly onClose: () => void;
  /** Element focused on open. Defaults to the first focusable in the dialog. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Where focus goes when the invoking control no longer exists - for example
   * after the dialog played the only copy of a hand card. Called only in that
   * case; a surviving invoker always wins.
   */
  readonly fallbackFocus?: () => HTMLElement | null;
  /** Flip to false to suspend the trap without unmounting the dialog. */
  readonly active?: boolean;
}

/**
 * Trap focus inside an open modal dialog and give focus back on close.
 *
 * The effect captures the invoker before moving focus, so Tab and Shift+Tab
 * wrap inside the dialog and Escape closes it exactly once. Background
 * scrolling is locked for the dialog's lifetime and released on cleanup.
 */
export function useDialogFocusTrap({
  containerRef,
  onClose,
  initialFocusRef,
  fallbackFocus,
  active = true,
}: DialogFocusTrapOptions): void {
  // Escape is handled from a document listener, which would otherwise be
  // re-bound every time the parent passes a new inline callback.
  const onCloseRef = useRef(onClose);
  const fallbackFocusRef = useRef(fallbackFocus);

  useEffect(() => {
    onCloseRef.current = onClose;
    fallbackFocusRef.current = fallbackFocus;
  }, [onClose, fallbackFocus]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const invoker =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = containerRef.current;
    const initial =
      initialFocusRef?.current ??
      (container === null ? null : focusableWithin(container)[0]);
    initial?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;

      if (invoker !== null && invoker.isConnected) {
        invoker.focus();
        return;
      }

      const fallback = fallbackFocusRef.current?.();
      if (fallback !== null && fallback !== undefined) {
        fallback.focus();
      }
    };
  }, [active, containerRef, initialFocusRef]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;

      if (container === null) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusables = focusableWithin(container);

      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (first === undefined || last === undefined) {
        return;
      }

      const current = document.activeElement;

      if (!(current instanceof HTMLElement) || !container.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      // Move explicitly instead of relying on the browser's sequential focus
      // navigation: it keeps the cycle inside the dialog even when a control is
      // disabled mid-interaction, and it behaves identically in jsdom.
      const index = focusables.indexOf(current);
      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        index === -1
          ? event.shiftKey
            ? focusables.length - 1
            : 0
          : (index + step + focusables.length) % focusables.length;
      const next = focusables[nextIndex];

      if (next === undefined) {
        return;
      }

      event.preventDefault();
      next.focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef]);
}
