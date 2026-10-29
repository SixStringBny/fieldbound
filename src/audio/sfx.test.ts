import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUE_NAMES } from '../ui/events';
import {
  CUE_SPECS,
  DEFAULT_MASTER_GAIN,
  MAX_CUE_DURATION,
  createSfxEngine,
  cueDuration,
} from './sfx';

/* -------------------------------------------------------------------------- */
/* A mockable WebAudio surface                                                */
/* -------------------------------------------------------------------------- */

interface ParamWrite {
  readonly method: 'set' | 'linear' | 'exponential' | 'cancel';
  readonly value: number;
  readonly time: number;
}

class FakeParam {
  value: number;
  readonly writes: ParamWrite[] = [];

  constructor(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.writes.push({ method: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.writes.push({ method: 'linear', value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.writes.push({ method: 'exponential', value, time });
  }

  cancelScheduledValues(time: number): void {
    this.writes.push({ method: 'cancel', value: this.value, time });
  }
}

class FakeGain {
  readonly gain = new FakeParam(1);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

type SourceKind = 'oscillator' | 'noise';

class FakeSource {
  readonly kind: SourceKind;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  onended: (() => void) | null = null;

  constructor(kind: SourceKind) {
    this.kind = kind;
  }

  start(when = 0): void {
    this.starts.push(when);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }
}

class FakeOscillator extends FakeSource {
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  type: OscillatorType = 'sine';

  constructor() {
    super('oscillator');
  }
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;

  constructor() {
    super('noise');
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  static reset(): void {
    FakeAudioContext.instances = [];
  }

  readonly destination = { name: 'destination' };
  readonly sampleRate = 48000;
  readonly oscillators: FakeOscillator[] = [];
  readonly noises: FakeBufferSource[] = [];
  readonly gains: FakeGain[] = [];
  currentTime = 0;
  state: AudioContextState = 'suspended';
  resumeCalls = 0;
  closeCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    this.noises.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    const samples = new Float32Array(length);

    return {
      length,
      getChannelData: () => samples,
    } as unknown as AudioBuffer;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }

  sources(): FakeSource[] {
    return [...this.oscillators, ...this.noises];
  }

  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

const originalAudioContext = Object.getOwnPropertyDescriptor(
  globalThis,
  'AudioContext',
);

function installGlobalAudioContext(): void {
  FakeAudioContext.reset();

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: class InstalledAudioContext extends FakeAudioContext {},
  });
}

afterEach(() => {
  FakeAudioContext.reset();

  if (originalAudioContext === undefined) {
    Reflect.deleteProperty(globalThis, 'AudioContext');
  } else {
    Object.defineProperty(globalThis, 'AudioContext', originalAudioContext);
  }

  vi.restoreAllMocks();
});

function makeEngine(
  options: { readonly muted?: boolean; readonly context?: FakeAudioContext } = {},
) {
  const context = options.context ?? new FakeAudioContext();
  const createContext = vi.fn(() => context.asContext());
  const engine = createSfxEngine({
    createContext,
    initialMuted: options.muted ?? false,
  });

  return { engine, context, createContext };
}

function makeSequentialEngine() {
  const contexts: FakeAudioContext[] = [];
  const factory = vi.fn(() => {
    const created = new FakeAudioContext();
    contexts.push(created);
    return created.asContext();
  });
  const engine = createSfxEngine({ createContext: factory });

  return { engine, contexts, factory };
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${what}`);
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

describe('sfx engine lifecycle', () => {
  it('constructs no AudioContext before unlock is called', () => {
    installGlobalAudioContext();
    const engine = createSfxEngine();

    engine.play('card-play');
    engine.play('victory');
    engine.mute();
    engine.setMuted(false);

    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(engine.isUnlocked).toBe(false);

    engine.unlock();

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]).toBeInstanceOf(FakeAudioContext);
    expect(engine.isUnlocked).toBe(true);
  });

  it('creates one context and resumes it once across repeated unlocks', () => {
    const { engine, context, createContext } = makeEngine();

    engine.unlock();
    engine.unlock();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.state).toBe('running');
    expect(context.resumeCalls).toBe(1);
  });

  it('treats a throwing factory as unavailable audio without throwing', () => {
    const engine = createSfxEngine({
      createContext: () => {
        throw new Error('WebAudio refused');
      },
    });

    expect(() => engine.unlock()).not.toThrow();
    expect(engine.isUnlocked).toBe(false);
    expect(() => engine.play('ui')).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();
  });

  it('does not build a context when unlock happens while muted', () => {
    const { engine, createContext } = makeEngine({ muted: true });

    engine.unlock();

    expect(createContext).not.toHaveBeenCalled();
    expect(engine.isUnlocked).toBe(false);

    engine.setMuted(false);
    engine.unlock();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(engine.isUnlocked).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Cue synthesis                                                              */
/* -------------------------------------------------------------------------- */

describe('cue synthesis', () => {
  it('keeps every recipe non-empty and inside the 300ms budget', () => {
    for (const cue of CUE_NAMES) {
      const spec = CUE_SPECS[cue];

      expect(spec.layers.length, cue).toBeGreaterThan(0);
      expect(cueDuration(spec), cue).toBeGreaterThan(0);
      expect(cueDuration(spec), cue).toBeLessThanOrEqual(MAX_CUE_DURATION);
    }
  });

  it('schedules at least one source per cue and stops it within 300ms', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    context.currentTime = 12;

    for (const cue of CUE_NAMES) {
      const sourcesBefore = context.sources().length;
      const gainsBefore = context.gains.length;

      engine.play(cue);

      const created = context.sources().slice(sourcesBefore);

      expect(created.length, cue).toBeGreaterThan(0);
      expect(context.gains.length, cue).toBeGreaterThan(gainsBefore);

      for (const source of created) {
        const scheduledStart = required(source.starts[0], `${cue} start`);
        const scheduledStop = required(source.stops[0], `${cue} stop`);

        expect(scheduledStart).toBeGreaterThanOrEqual(12);
        expect(scheduledStart - 12).toBeLessThanOrEqual(MAX_CUE_DURATION);
        expect(scheduledStop - scheduledStart).toBeLessThanOrEqual(
          MAX_CUE_DURATION,
        );
        expect(scheduledStop - 12).toBeLessThanOrEqual(MAX_CUE_DURATION);
        expect(source.connect).toHaveBeenCalledTimes(1);
      }
    }
  });

  it('routes every layer through one low master gain', () => {
    const { engine, context } = makeEngine();
    engine.unlock();

    const master = required(context.gains[0], 'master gain');

    expect(DEFAULT_MASTER_GAIN).toBeLessThanOrEqual(0.25);
    expect(master.gain.value).toBe(DEFAULT_MASTER_GAIN);
    expect(master.connect).toHaveBeenCalledTimes(1);
    expect(master.connect).toHaveBeenCalledWith(context.destination);

    engine.play('damage');

    // The master is the only gain connected to the destination; layers connect
    // to the master instead, which is what keeps the mix quiet.
    expect(context.gains.length).toBeGreaterThan(1);
    for (const layerGain of context.gains.slice(1)) {
      expect(layerGain.connect).toHaveBeenCalledWith(master);
    }
  });

  it('ramps every layer down to silence before its source stops', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    engine.play('damage');

    const layerGains = context.gains.slice(1);
    expect(layerGains.length).toBeGreaterThan(0);

    for (const gain of layerGains) {
      const writes = gain.gain.writes;
      expect(writes.length).toBeGreaterThanOrEqual(3);

      const final = required(writes[writes.length - 1], 'final gain write');
      expect(final.method).toBe('exponential');
      expect(final.value).toBeLessThanOrEqual(0.001);
    }
  });

  it('builds the damage cue from noise as well as a tone', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    engine.play('damage');

    expect(context.noises.length).toBeGreaterThan(0);
    expect(context.oscillators.length).toBeGreaterThan(0);

    const noise = required(context.noises[0], 'noise source');
    expect(noise.buffer).not.toBeNull();
    expect(noise.loop).toBe(false);
  });

  it('uses an oscillator sweep for the field shift', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    engine.play('shift');

    const swept = context.oscillators.filter((oscillator) =>
      oscillator.frequency.writes.some((write) => write.method === 'exponential'),
    );

    expect(swept.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Muting                                                                     */
/* -------------------------------------------------------------------------- */

describe('muting', () => {
  it('schedules nothing while muted and resumes scheduling after unmuting', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    engine.mute();

    expect(engine.isMuted).toBe(true);

    const sourcesBefore = context.sources().length;
    const gainsBefore = context.gains.length;

    for (const cue of CUE_NAMES) {
      engine.play(cue);
    }

    expect(context.sources()).toHaveLength(sourcesBefore);
    expect(context.gains).toHaveLength(gainsBefore);

    engine.setMuted(false);
    expect(engine.isMuted).toBe(false);

    engine.play('ui');

    expect(context.sources().length).toBeGreaterThan(sourcesBefore);
  });

  it('stops connected nodes when muted mid-cue and plays later cues after unmuting', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    engine.play('victory');

    const inFlight = [...context.sources()];
    expect(inFlight.length).toBeGreaterThan(0);

    for (const source of inFlight) {
      expect(source.stops).toHaveLength(1);
      expect(source.disconnect).not.toHaveBeenCalled();
    }

    engine.mute();

    for (const source of inFlight) {
      expect(source.stops).toHaveLength(2);
      expect(source.disconnect).toHaveBeenCalledTimes(1);
    }

    for (const layerGain of context.gains.slice(1)) {
      expect(layerGain.disconnect).toHaveBeenCalledTimes(1);
    }

    const sourcesAfterMute = context.sources().length;
    engine.play('victory');
    expect(context.sources()).toHaveLength(sourcesAfterMute);

    engine.setMuted(false);
    engine.play('victory');
    expect(context.sources().length).toBeGreaterThan(sourcesAfterMute);
  });

  it('mute is idempotent and does not stop a second time', () => {
    const { engine, context } = makeEngine();
    engine.unlock();
    engine.play('card-play');

    const sources = [...context.sources()];
    engine.mute();
    engine.mute();

    for (const source of sources) {
      expect(source.stops).toHaveLength(2);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Dispose                                                                    */
/* -------------------------------------------------------------------------- */

describe('dispose', () => {
  it('stops in-flight voices, closes the context and goes quiet afterwards', () => {
    const { engine, contexts, factory } = makeSequentialEngine();
    engine.unlock();
    engine.play('victory');

    const context = required(contexts[0], 'opened context');
    const inFlight = [...context.sources()];

    engine.dispose();

    expect(engine.isUnlocked).toBe(false);
    expect(context.state).toBe('closed');
    expect(context.closeCalls).toBe(1);

    for (const source of inFlight) {
      expect(source.stops.length).toBeGreaterThanOrEqual(2);
      expect(source.disconnect).toHaveBeenCalledTimes(1);
    }

    const master = required(context.gains[0], 'master gain');
    expect(master.disconnect).toHaveBeenCalledTimes(1);

    const sourcesAfterDispose = context.sources().length;
    engine.play('victory');
    expect(context.sources()).toHaveLength(sourcesAfterDispose);

    engine.dispose();
    expect(context.closeCalls).toBe(1);

    engine.unlock();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(engine.isUnlocked).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* No recorded media                                                          */
/* -------------------------------------------------------------------------- */

describe('asset-free synthesis', () => {
  function readSource(): string {
    return readFileSync(resolve(process.cwd(), 'src/audio/sfx.ts'), 'utf8');
  }

  it('never fetches or references a recorded audio file', () => {
    const source = readSource();

    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/new\s+Audio\s*\(/);
    expect(source).not.toMatch(/decodeAudioData/);
    expect(source).not.toMatch(/\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)\b/i);
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(/<audio/i);
    expect(source).not.toMatch(/import\.meta/);
  });

  it('synthesizes only through oscillators, buffers and gain nodes', () => {
    const source = readSource();

    expect(source).toMatch(/createOscillator/);
    expect(source).toMatch(/createBufferSource/);
    expect(source).toMatch(/createGain/);
  });
});
