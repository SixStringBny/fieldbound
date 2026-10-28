/**
 * Fieldbound's typed UI event bus.
 *
 * Screens and controllers describe what the player just did; they never import
 * audio, DOM or timing code. The shell subscribes once and turns cues into
 * synthesized sound (SHL-06), which keeps every screen presentational and keeps
 * the AudioContext out of the render path.
 *
 * The bus is a plain synchronous publish/subscribe pair. A subscriber receives
 * a copy of the listener set, so subscribing or unsubscribing during delivery is
 * safe, and a failing subscriber cannot stop the rest of the app from reacting.
 */

/** Every cue the synthesized audio engine (SHL-05) can play. */
export const CUE_NAMES = [
  'card-play',
  'damage',
  'ward',
  'shift',
  'victory',
  'defeat',
  'ui',
] as const;

export type CueName = (typeof CUE_NAMES)[number];

export interface CueEvent {
  readonly type: 'cue';
  readonly cue: CueName;
}

export type UiEvent = CueEvent;

export type UiEventListener = (event: UiEvent) => void;

export interface UiEventBus {
  /** Deliver one event to every current subscriber. */
  emit(event: UiEvent): void;
  /** Shorthand for a cue event; the common case for screens. */
  emitCue(cue: CueName): void;
  /** Register a listener and return an idempotent unsubscribe function. */
  subscribe(listener: UiEventListener): () => void;
}

/** Create an isolated bus. Tests use this instead of the shared instance. */
export function createUiEventBus(): UiEventBus {
  const listeners = new Set<UiEventListener>();

  const bus: UiEventBus = {
    emit(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // Sound is decorative: a broken speaker must never block a turn.
        }
      }
    },
    emitCue(cue) {
      bus.emit({ type: 'cue', cue });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return bus;
}

/** The application-wide bus the composition root and screens share. */
export const uiEvents = createUiEventBus();

/** Convenience for screens that only need to raise a cue. */
export function emitCue(cue: CueName): void {
  uiEvents.emitCue(cue);
}
