/**
 * Fieldbound's synthesized sound cues (SHL-FR-05, VIS-CON-06).
 *
 * Every sound is built at runtime from oscillators and a short noise buffer, so
 * the bundle contains no recorded media and the page asks for no extra bytes.
 * The cue set is data (`CUE_SPECS`); scheduling is deliberately tiny: one gain
 * envelope plus one source per layer, with a hard stop inside 300ms.
 *
 * Lifecycle contract for the shell (SHL-06):
 *
 *   const sfx = createSfxEngine({ initialMuted: settings.muted });
 *   // On the first pointer or key gesture, and on every later gesture:
 *   sfx.unlock();
 *   // When the cue bus delivers an event:
 *   sfx.play(event.cue);
 *   // When the Sound switch changes:
 *   sfx.setMuted(next);
 *
 * `unlock()` is idempotent. It refuses to build an AudioContext while muted, so
 * a player who muted before their first gesture never wakes the audio hardware;
 * the shell should therefore call `unlock()` again on the gesture that unmutes.
 *
 * Playing or muting before unlock is safe and silent: no context exists yet, and
 * no constructor, timer or network activity happens at module load.
 */
import type { CueName } from '../ui/events';

/* -------------------------------------------------------------------------- */
/* Cue recipes                                                                */
/* -------------------------------------------------------------------------- */

/** One oscillator layer, optionally swept between two frequencies. */
export interface ToneLayer {
  readonly kind: 'tone';
  readonly wave: OscillatorType;
  readonly frequency: number;
  /**
   * Target of an exponential sweep. Omitted for a steady pitch; every value is
   * positive because exponential ramps cannot reach zero.
   */
  readonly endFrequency?: number;
  /** Offset from the cue start, in seconds. */
  readonly start: number;
  /** Sounding length in seconds; the gain reaches silence at this point. */
  readonly duration: number;
  /** Peak layer gain before the master gain. Kept small on purpose. */
  readonly gain: number;
}

/** One buffered white-noise layer for impacts. */
export interface NoiseLayer {
  readonly kind: 'noise';
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
}

export type CueLayer = ToneLayer | NoiseLayer;

export interface CueSpec {
  readonly layers: readonly CueLayer[];
}

/**
 * The seven documented cues. Every layer ends before 300ms, so a cue can never
 * outlive the turn that caused it or overlap the next one.
 */
export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  // A quick two-step pluck: the card leaves the hand.
  'card-play': {
    layers: [
      { kind: 'tone', wave: 'triangle', frequency: 523.25, start: 0, duration: 0.06, gain: 0.5 },
      { kind: 'tone', wave: 'triangle', frequency: 783.99, start: 0.05, duration: 0.09, gain: 0.32 },
    ],
  },
  // Noise crack over a short falling thump.
  damage: {
    layers: [
      { kind: 'noise', start: 0, duration: 0.16, gain: 0.42 },
      {
        kind: 'tone',
        wave: 'sawtooth',
        frequency: 110,
        endFrequency: 62,
        start: 0,
        duration: 0.18,
        gain: 0.34,
      },
    ],
  },
  // A warm rising pair: the Ward settles.
  ward: {
    layers: [
      { kind: 'tone', wave: 'sine', frequency: 392, start: 0, duration: 0.16, gain: 0.4 },
      { kind: 'tone', wave: 'sine', frequency: 587.33, start: 0.06, duration: 0.14, gain: 0.3 },
    ],
  },
  // Two short glides: the field turns over.
  shift: {
    layers: [
      {
        kind: 'tone',
        wave: 'sine',
        frequency: 220,
        endFrequency: 440,
        start: 0,
        duration: 0.24,
        gain: 0.38,
      },
      {
        kind: 'tone',
        wave: 'triangle',
        frequency: 330,
        endFrequency: 660,
        start: 0.02,
        duration: 0.2,
        gain: 0.18,
      },
    ],
  },
  // A three-note major arpeggio.
  victory: {
    layers: [
      { kind: 'tone', wave: 'triangle', frequency: 523.25, start: 0, duration: 0.1, gain: 0.4 },
      { kind: 'tone', wave: 'triangle', frequency: 659.25, start: 0.08, duration: 0.1, gain: 0.34 },
      { kind: 'tone', wave: 'triangle', frequency: 783.99, start: 0.16, duration: 0.12, gain: 0.4 },
    ],
  },
  // The same shape falling, and lower.
  defeat: {
    layers: [
      { kind: 'tone', wave: 'sawtooth', frequency: 392, start: 0, duration: 0.14, gain: 0.3 },
      { kind: 'tone', wave: 'sawtooth', frequency: 329.63, start: 0.1, duration: 0.14, gain: 0.3 },
      { kind: 'tone', wave: 'sawtooth', frequency: 261.63, start: 0.2, duration: 0.08, gain: 0.28 },
    ],
  },
  // A single soft tick for navigation.
  ui: {
    layers: [
      { kind: 'tone', wave: 'triangle', frequency: 880, start: 0, duration: 0.045, gain: 0.22 },
    ],
  },
};

/** Hard upper bound for a single cue, from the game-shell audio contract. */
export const MAX_CUE_DURATION = 0.3;

/** Default master gain: quiet enough to sit under speech and repeated plays. */
export const DEFAULT_MASTER_GAIN = 0.16;

/**
 * Length of a cue: the latest point at which any layer stops sounding. Kept as
 * a function so the recipes and the limit cannot drift apart.
 */
export function cueDuration(spec: CueSpec): number {
  let end = 0;

  for (const layer of spec.layers) {
    end = Math.max(end, layer.start + layer.duration);
  }

  return end;
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Builds the platform context. Injected in tests and in any embedding that has
 * its own AudioContext; the real constructor is only reached through this
 * function, so importing this module never touches WebAudio.
 */
export type AudioContextFactory = () => AudioContext;

export interface SfxEngineOptions {
  readonly createContext?: AudioContextFactory;
  readonly initialMuted?: boolean;
  /** Peak master gain. Clamped to 0..1; defaults to `DEFAULT_MASTER_GAIN`. */
  readonly masterGain?: number;
}

export interface SfxEngine {
  /** True once a context exists (i.e. `unlock()` succeeded). */
  readonly isUnlocked: boolean;
  /** True when cues and in-flight sound are suppressed. */
  readonly isMuted: boolean;
  /**
   * Create (or resume) the audio context. Call from a pointer or key gesture.
   * Safe to call on every gesture; a muted engine stays locked.
   */
  unlock(): void;
  /** Mute stops in-flight voices immediately; unmute allows later cues. */
  setMuted(muted: boolean): void;
  /** Convenience for the Sound switch turning off. */
  mute(): void;
  /** Schedule one cue. Does nothing before unlock, while muted or after dispose. */
  play(cue: CueName): void;
  /** Stop every voice, close the context and become locked again. */
  dispose(): void;
}

interface Voice {
  readonly source: AudioScheduledSourceNode;
  readonly gain: GainNode;
}

/** A value an exponential ramp may approach; exact zero is not valid. */
const SILENT_GAIN = 0.0001;
/** Short attack so a cue starts crisply without a click. */
const ATTACK_SECONDS = 0.012;

function clampGain(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MASTER_GAIN;
  }

  return Math.min(1, Math.max(0, value));
}

function disconnectQuietly(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected, or a minimal implementation without disconnect.
  }
}

function closeContext(context: AudioContext): void {
  try {
    void context.close().catch(() => {});
  } catch {
    // Closing is best effort; the engine has already forgotten the context.
  }
}

function resumeIfSuspended(context: AudioContext): void {
  // 'running' and 'closed' need no work. Anything else (including Safari's
  // non-standard 'interrupted') gets a resume attempt; a rejected promise is
  // fine because the next gesture retries.
  if (context.state === 'running' || context.state === 'closed') {
    return;
  }

  try {
    void context.resume().catch(() => {});
  } catch {
    // Older WebKit can reject synchronously before a gesture.
  }
}

function defaultCreateAudioContext(): AudioContext {
  const scope = globalThis as typeof globalThis & {
    readonly AudioContext?: typeof AudioContext;
    readonly webkitAudioContext?: typeof AudioContext;
  };
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext;

  if (Constructor === undefined) {
    throw new Error('WebAudio is unavailable in this environment.');
  }

  return new Constructor();
}

function createToneSource(
  context: AudioContext,
  layer: ToneLayer,
  startAt: number,
  endAt: number,
): AudioScheduledSourceNode {
  const oscillator = context.createOscillator();
  oscillator.type = layer.wave;
  oscillator.frequency.setValueAtTime(layer.frequency, startAt);

  if (layer.endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(layer.endFrequency, endAt);
  }

  return oscillator;
}

function createNoiseSource(
  context: AudioContext,
  duration: number,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  source.buffer = buffer;
  return source;
}

export function createSfxEngine(options: SfxEngineOptions = {}): SfxEngine {
  const createContext = options.createContext ?? defaultCreateAudioContext;
  const masterGainValue = clampGain(options.masterGain ?? DEFAULT_MASTER_GAIN);

  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = options.initialMuted ?? false;
  const voices = new Set<Voice>();

  /**
   * Stop every scheduled voice right now. Called by mute and dispose, so a
   * switch never waits for the 300ms tail of a victory arpeggio.
   */
  function stopAllVoices(): void {
    for (const voice of [...voices]) {
      voices.delete(voice);

      // The source is being torn down here; suppress the natural end callback.
      voice.source.onended = null;

      try {
        voice.source.stop();
      } catch {
        // Stopping an already-finished source is harmless.
      }

      disconnectQuietly(voice.source);
      disconnectQuietly(voice.gain);
    }
  }

  function scheduleLayer(
    activeContext: AudioContext,
    masterNode: GainNode,
    layer: CueLayer,
    at: number,
  ): void {
    const startAt = at + layer.start;
    const endAt = startAt + layer.duration;

    try {
      const gainNode = activeContext.createGain();
      gainNode.gain.setValueAtTime(SILENT_GAIN, startAt);
      gainNode.gain.linearRampToValueAtTime(
        layer.gain,
        startAt + Math.min(ATTACK_SECONDS, layer.duration / 4),
      );
      gainNode.gain.exponentialRampToValueAtTime(SILENT_GAIN, endAt);
      gainNode.connect(masterNode);

      const source =
        layer.kind === 'noise'
          ? createNoiseSource(activeContext, layer.duration)
          : createToneSource(activeContext, layer, startAt, endAt);

      source.connect(gainNode);

      const voice: Voice = { source, gain: gainNode };
      voices.add(voice);

      source.onended = () => {
        voices.delete(voice);
        disconnectQuietly(source);
        disconnectQuietly(gainNode);
      };

      source.start(startAt);
      source.stop(endAt);
    } catch {
      // A single failed layer must not throw into the caller's turn, and the
      // other layers of the cue can still sound.
    }
  }

  function unlock(): void {
    // Muting before the first gesture must not wake the audio hardware.
    if (muted) {
      return;
    }

    if (context !== null) {
      resumeIfSuspended(context);
      return;
    }

    let created: AudioContext;

    try {
      created = createContext();
    } catch {
      return;
    }

    try {
      const gain = created.createGain();
      gain.gain.value = masterGainValue;
      gain.connect(created.destination);
      context = created;
      master = gain;
    } catch {
      closeContext(created);
      return;
    }

    resumeIfSuspended(created);
  }

  function setMuted(next: boolean): void {
    if (next === muted) {
      return;
    }

    muted = next;

    if (muted) {
      stopAllVoices();
      return;
    }

    // Unmuting does not construct a context: only a gesture may do that.
    // A context that already exists just needs to be running again.
    if (context !== null) {
      resumeIfSuspended(context);
    }
  }

  function play(cue: CueName): void {
    if (muted) {
      return;
    }

    const activeContext = context;
    const masterNode = master;

    if (activeContext === null || masterNode === null) {
      return;
    }

    const spec = CUE_SPECS[cue];

    if (spec === undefined) {
      return;
    }

    // A card click is a gesture too, so it can revive a browser-suspended
    // context even if the original unlock happened earlier.
    resumeIfSuspended(activeContext);

    const startAt = activeContext.currentTime;

    for (const layer of spec.layers) {
      scheduleLayer(activeContext, masterNode, layer, startAt);
    }
  }

  function dispose(): void {
    stopAllVoices();

    const closingContext = context;
    const masterNode = master;

    context = null;
    master = null;

    if (masterNode !== null) {
      disconnectQuietly(masterNode);
    }

    if (closingContext !== null) {
      closeContext(closingContext);
    }
  }

  return {
    get isUnlocked() {
      return context !== null;
    },
    get isMuted() {
      return muted;
    },
    unlock,
    setMuted,
    mute() {
      setMuted(true);
    },
    play,
    dispose,
  };
}
