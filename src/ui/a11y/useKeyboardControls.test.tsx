/**
 * Behavioural tests for the app-wide E shortcut and the dialog focus trap.
 *
 * These render small harnesses rather than the whole app: the shortcut logic is
 * global, and the trap is a generic dialog contract. The end-to-end keyboard
 * flow through `App`, the live region and the skip link lives in
 * `src/App.a11y.test.tsx`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  isTextEntryTarget,
  useDialogFocusTrap,
  useKeyboardControls,
} from './useKeyboardControls';

/* -------------------------------------------------------------------------- */
/* Shortcut harness                                                           */
/* -------------------------------------------------------------------------- */

function ShortcutHarness({
  onEndTurn,
  enabled = true,
}: {
  readonly onEndTurn: () => void;
  readonly enabled?: boolean;
}) {
  useKeyboardControls({ onEndTurn, enabled });

  return (
    <button type="button" onClick={onEndTurn}>
      End Turn
    </button>
  );
}

function appendToBody(element: HTMLElement): HTMLElement {
  document.body.appendChild(element);
  return element;
}

function removeFromBody(element: HTMLElement): void {
  element.remove();
}

/* -------------------------------------------------------------------------- */
/* Text entry detection                                                       */
/* -------------------------------------------------------------------------- */

describe('isTextEntryTarget', () => {
  it('treats text inputs, textareas, selects and contenteditable as typing', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    const ariaTextbox = document.createElement('div');

    editable.setAttribute('contenteditable', 'true');
    ariaTextbox.setAttribute('role', 'textbox');

    for (const element of [input, textarea, select, editable, ariaTextbox]) {
      appendToBody(element);
      expect(isTextEntryTarget(element)).toBe(true);
      removeFromBody(element);
    }
  });

  it('does not treat buttons, checkboxes or plain elements as typing', () => {
    const button = document.createElement('button');
    const checkbox = document.createElement('input');
    const plain = document.createElement('span');
    const range = document.createElement('input');

    checkbox.type = 'checkbox';
    range.type = 'range';

    for (const element of [button, checkbox, plain, range]) {
      appendToBody(element);
      expect(isTextEntryTarget(element)).toBe(false);
      removeFromBody(element);
    }
  });

  it('treats a null or non-element target as not typing', () => {
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(document)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* E shortcut                                                                 */
/* -------------------------------------------------------------------------- */

describe('useKeyboardControls', () => {
  it('ends the turn once for E, in either case', () => {
    const onEndTurn = vi.fn();
    render(<ShortcutHarness onEndTurn={onEndTurn} />);

    fireEvent.keyDown(document.body, { key: 'e' });
    expect(onEndTurn).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: 'E' });
    expect(onEndTurn).toHaveBeenCalledTimes(2);
  });

  it('never fires while focus is in a text field', () => {
    const onEndTurn = vi.fn();
    render(<ShortcutHarness onEndTurn={onEndTurn} />);

    const input = appendToBody(document.createElement('input'));
    const textarea = appendToBody(document.createElement('textarea'));
    const editable = appendToBody(document.createElement('div'));
    editable.setAttribute('contenteditable', 'true');

    try {
      for (const field of [input, textarea, editable]) {
        field.focus();
        fireEvent.keyDown(field, { key: 'e' });
      }

      expect(onEndTurn).not.toHaveBeenCalled();
    } finally {
      removeFromBody(input);
      removeFromBody(textarea);
      removeFromBody(editable);
    }
  });

  it('ignores modifiers, key repeat and an IME composition', () => {
    const onEndTurn = vi.fn();
    render(<ShortcutHarness onEndTurn={onEndTurn} />);

    fireEvent.keyDown(document.body, { key: 'e', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'e', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'e', altKey: true });
    fireEvent.keyDown(document.body, { key: 'e', repeat: true });
    fireEvent.keyDown(document.body, { key: 'e', isComposing: true });
    fireEvent.keyDown(document.body, { key: 'q' });

    expect(onEndTurn).not.toHaveBeenCalled();
  });

  it('ignores E while a modal dialog is open', () => {
    const onEndTurn = vi.fn();
    render(<ShortcutHarness onEndTurn={onEndTurn} />);

    const modal = appendToBody(document.createElement('div'));
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    try {
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(onEndTurn).not.toHaveBeenCalled();
    } finally {
      removeFromBody(modal);
    }

    fireEvent.keyDown(document.body, { key: 'e' });
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled and rebinds when enabled', () => {
    const onEndTurn = vi.fn();
    const { rerender } = render(
      <ShortcutHarness onEndTurn={onEndTurn} enabled={false} />,
    );

    fireEvent.keyDown(document.body, { key: 'e' });
    expect(onEndTurn).not.toHaveBeenCalled();

    rerender(<ShortcutHarness onEndTurn={onEndTurn} />);
    fireEvent.keyDown(document.body, { key: 'e' });
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Dialog focus trap                                                          */
/* -------------------------------------------------------------------------- */

function TrapDialog({ onClose }: { readonly onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap({ containerRef, onClose });

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Test dialog"
      tabIndex={-1}
    >
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </div>
  );
}

function TrapHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button type="button">Outside action</button>
      {open ? <TrapDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

describe('useDialogFocusTrap', () => {
  it('moves focus in, cycles Tab and Shift+Tab, and restores the invoker on Escape', () => {
    render(<TrapHarness />);

    const invoke = screen.getByRole('button', { name: 'Open dialog' });
    invoke.focus();
    fireEvent.click(invoke);

    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Focus that escaped programmatically is pulled back inside.
    screen.getByRole('button', { name: 'Outside action' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(invoke);
    expect(document.body.style.overflow).toBe('');
  });

  it('falls back to the supplied control when the invoker was removed', () => {
    function RemovingDialog({
      onClose,
      fallbackFocus,
    }: {
      readonly onClose: () => void;
      readonly fallbackFocus: () => HTMLElement | null;
    }) {
      const containerRef = useRef<HTMLDivElement>(null);

      useDialogFocusTrap({ containerRef, onClose, fallbackFocus });

      return (
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Removing dialog"
          tabIndex={-1}
        >
          <button type="button" onClick={onClose}>
            Vanishing action
          </button>
        </div>
      );
    }

    function RemoveHarness() {
      const [open, setOpen] = useState(false);
      const [removed, setRemoved] = useState(false);
      const fallbackRef = useRef<HTMLButtonElement>(null);

      return (
        <div>
          {removed ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              Open dialog
            </button>
          )}
          <button type="button" ref={fallbackRef}>
            Fallback action
          </button>
          {open ? (
            <RemovingDialog
              onClose={() => {
                setRemoved(true);
                setOpen(false);
              }}
              fallbackFocus={() => fallbackRef.current}
            />
          ) : null}
        </div>
      );
    }

    render(<RemoveHarness />);

    const invoke = screen.getByRole('button', { name: 'Open dialog' });
    invoke.focus();
    fireEvent.click(invoke);

    const close = screen.getByRole('button', { name: 'Vanishing action' });
    expect(document.activeElement).toBe(close);

    fireEvent.click(close);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.contains(invoke)).toBe(false);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Fallback action' }),
    );
  });
});
