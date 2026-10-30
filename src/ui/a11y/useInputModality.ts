/**
 * The last input modality the page has observed (AB-G6).
 *
 * Every route change focuses its `h1` so assistive technology lands at the top
 * of the new surface. The ring around that heading is only wanted when the
 * route change came from the keyboard: after a pointer click, or on the cold
 * first paint, the same ring reads as a selection or debug outline.
 *
 * The browser's `:focus-visible` heuristic is not a reliable proxy here. It
 * describes whether the *focused element* would show a ring, not which input
 * moved the route, and its handling of a script focus differs between Chromium,
 * Firefox and WebKit. So the composition root records the modality it observed
 * itself and marks the heading with it.
 *
 * The value is deliberately a ref, not React state: recording a keystroke or a
 * click must never re-render the app, and the modality is only read at the
 * instant a route change focuses its heading.
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type InputModality = 'pointer' | 'keyboard';

/**
 * Keys that report a modifier press without being an interaction of their own.
 * Holding Shift before a click would otherwise mark the next route change as
 * keyboard-driven.
 */
const MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'FnLock',
  'Hyper',
  'Meta',
  'NumLock',
  'ScrollLock',
  'Shift',
  'Super',
  'Symbol',
  'SymbolLock',
]);

/**
 * Observe pointer and keyboard input for the life of the mounting component.
 *
 * Both listeners sit in the capture phase on `window`, so the modality is
 * already recorded by the time a click or an activation handler navigates, and
 * nothing a screen does in its own bubble-phase handler can hide the input that
 * caused it.
 */
export function useInputModality(): RefObject<InputModality | null> {
  const modality = useRef<InputModality | null>(null);

  useEffect(() => {
    const observePointer = () => {
      modality.current = 'pointer';
    };

    const observeKey = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(event.key)) {
        return;
      }

      modality.current = 'keyboard';
    };

    window.addEventListener('pointerdown', observePointer, true);
    window.addEventListener('keydown', observeKey, true);

    return () => {
      window.removeEventListener('pointerdown', observePointer, true);
      window.removeEventListener('keydown', observeKey, true);
    };
  }, []);

  return modality;
}
