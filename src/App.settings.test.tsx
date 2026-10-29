import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, SCREENS } from './App';
import type { Screen } from './App';
import {
  SETTINGS_STORAGE_KEY,
  serializeSettings,
  DEFAULT_SETTINGS,
} from './persistence/settings';
import type { SettingsStorage } from './persistence/settings';
import { uiEvents } from './ui/events';
import { REDUCED_MOTION_QUERY } from './ui/motion/useReducedMotion';

/* -------------------------------------------------------------------------- */
/* matchMedia double                                                          */
/* -------------------------------------------------------------------------- */

const originalMatchMedia = window.matchMedia;

function installMatchMedia(matches: boolean): void {
  const query = {
    matches,
    media: REDUCED_MOTION_QUERY,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => query),
  });
}

/* -------------------------------------------------------------------------- */
/* WebAudio double                                                            */
/* -------------------------------------------------------------------------- */

class FakeParam {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeGain {
  readonly gain = new FakeParam(1);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeSource {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  onended: (() => void) | null = null;

  start(): void {}
  stop(): void {}
}

class FakeOscillator extends FakeSource {
  readonly frequency = new FakeParam(440);
  type: OscillatorType = 'sine';
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  readonly destination = {};
  readonly sampleRate = 48000;
  readonly oscillators: FakeOscillator[] = [];
  readonly noises: FakeBufferSource[] = [];
  readonly gains: FakeGain[] = [];
  currentTime = 0;
  state: AudioContextState = 'suspended';

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
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  /** Every source scheduled so far; each plays exactly one cue layer. */
  sourceCount(): number {
    return this.oscillators.length + this.noises.length;
  }
}

const originalAudioContext = Object.getOwnPropertyDescriptor(
  globalThis,
  'AudioContext',
);

function installAudioContext(): void {
  FakeAudioContext.instances = [];

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: class InstalledAudioContext extends FakeAudioContext {},
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function renderApp(
  initialScreen: Screen = SCREENS.settings,
  settingsStorage?: SettingsStorage | null,
) {
  return settingsStorage === undefined
    ? render(<App initialScreen={initialScreen} />)
    : render(
        <App initialScreen={initialScreen} settingsStorage={settingsStorage} />,
      );
}

function appRoot(): HTMLElement {
  const root = document.getElementById('app-root');

  if (root === null) {
    throw new Error('App root is not mounted');
  }

  return root;
}

function motionAttribute(): string | null {
  return appRoot().getAttribute('data-reduced-motion');
}

function storedSettings(): Record<string, unknown> {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
}

function soundSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: 'Sound' });
}

function motionSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: 'Reduce motion' });
}

function checked(control: HTMLElement): string | null {
  return control.getAttribute('aria-checked');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });

  if (originalAudioContext === undefined) {
    Reflect.deleteProperty(globalThis, 'AudioContext');
  } else {
    Object.defineProperty(globalThis, 'AudioContext', originalAudioContext);
  }

  FakeAudioContext.instances = [];
});

/* -------------------------------------------------------------------------- */
/* Settings through the composition root                                      */
/* -------------------------------------------------------------------------- */

describe('App settings screen', () => {
  it('is reachable from the menu and back', () => {
    renderApp(SCREENS.menu);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe(
      'settings',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeTruthy();
    expect(soundSwitch()).toBeTruthy();
    expect(motionSwitch()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('main').getAttribute('data-screen')).toBe('menu');
  });

  it('writes the Sound choice immediately and restores it on remount', () => {
    const first = renderApp();

    expect(checked(soundSwitch())).toBe('true');

    fireEvent.click(soundSwitch());

    expect(checked(soundSwitch())).toBe('false');
    expect(storedSettings()).toMatchObject({
      schemaVersion: 1,
      muted: true,
      reducedMotion: null,
    });

    first.unmount();
    renderApp();

    expect(checked(soundSwitch())).toBe('false');

    fireEvent.click(soundSwitch());

    expect(checked(soundSwitch())).toBe('true');
    expect(storedSettings()).toMatchObject({ muted: false });
  });

  it('writes the motion override and mirrors it onto the app root', () => {
    installMatchMedia(false);
    const first = renderApp();

    expect(motionAttribute()).toBe('false');
    expect(checked(motionSwitch())).toBe('false');
    expect(screen.getByText('Following your device setting.')).toBeTruthy();

    fireEvent.click(motionSwitch());

    expect(checked(motionSwitch())).toBe('true');
    expect(motionAttribute()).toBe('true');
    expect(screen.getByText('Set on this device.')).toBeTruthy();
    expect(storedSettings()).toMatchObject({
      schemaVersion: 1,
      reducedMotion: true,
    });

    first.unmount();
    renderApp();

    expect(motionAttribute()).toBe('true');
    expect(checked(motionSwitch())).toBe('true');
  });

  it('uses the system motion preference on first paint with no stored override', () => {
    installMatchMedia(true);
    renderApp();

    expect(motionAttribute()).toBe('true');
    expect(checked(motionSwitch())).toBe('true');
    expect(screen.getByText('Following your device setting.')).toBeTruthy();

    fireEvent.click(motionSwitch());

    // An explicit false still wins over a matching OS preference.
    expect(motionAttribute()).toBe('false');
    expect(storedSettings()).toMatchObject({ reducedMotion: false });
  });

  it('lets a stored explicit override win in both directions', () => {
    installMatchMedia(true);
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      serializeSettings({ ...DEFAULT_SETTINGS, reducedMotion: false }),
    );

    renderApp();

    expect(motionAttribute()).toBe('false');
    expect(checked(motionSwitch())).toBe('false');
    expect(screen.getByText('Set on this device.')).toBeTruthy();
  });

  it('falls back to defaults for invalid or unknown-version settings without throwing', () => {
    installMatchMedia(false);

    const invalidPayloads = [
      '{not json',
      'null',
      JSON.stringify({ schemaVersion: 2, muted: true, reducedMotion: true }),
      JSON.stringify({ schemaVersion: 1, muted: 'yes', reducedMotion: null }),
      JSON.stringify({ schemaVersion: 1, muted: false }),
    ];

    for (const payload of invalidPayloads) {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, payload);

      const { unmount } = renderApp();

      expect(motionAttribute()).toBe('false');
      expect(checked(soundSwitch())).toBe('true');
      expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();

      unmount();
    }
  });

  it('keeps the toggles working in memory when storage is unavailable', () => {
    installMatchMedia(false);
    renderApp(SCREENS.settings, null);

    expect(
      screen.getByText(/This browser cannot save settings/),
    ).toBeTruthy();

    fireEvent.click(soundSwitch());
    expect(checked(soundSwitch())).toBe('false');

    fireEvent.click(soundSwitch());
    expect(checked(soundSwitch())).toBe('true');

    fireEvent.click(motionSwitch());
    expect(checked(motionSwitch())).toBe('true');
    expect(motionAttribute()).toBe('true');

    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('does not crash when the browser storage getter throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage disabled');
      },
    });

    try {
      expect(() => render(<App initialScreen={SCREENS.settings} />)).not.toThrow();
      expect(soundSwitch()).toBeTruthy();
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window, 'localStorage');
      } else {
        Object.defineProperty(window, 'localStorage', descriptor);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Audio wiring                                                               */
/* -------------------------------------------------------------------------- */

describe('App audio wiring', () => {
  it('creates no AudioContext before a gesture, then unlocks and plays cues', () => {
    installAudioContext();
    renderApp(SCREENS.menu);

    expect(FakeAudioContext.instances).toHaveLength(0);

    fireEvent.pointerDown(window);

    expect(FakeAudioContext.instances).toHaveLength(1);
    const context = FakeAudioContext.instances[0];

    if (context === undefined) {
      throw new Error('Expected the first gesture to unlock audio');
    }

    act(() => {
      uiEvents.emitCue('card-play');
    });

    expect(context.sourceCount()).toBeGreaterThan(0);
  });

  it('skips cues while muted and plays them again after unmuting', () => {
    installAudioContext();
    renderApp(SCREENS.menu);

    fireEvent.keyDown(window, { key: 'a' });

    const context = FakeAudioContext.instances[0];

    if (context === undefined) {
      throw new Error('Expected the key gesture to unlock audio');
    }

    act(() => {
      uiEvents.emitCue('card-play');
    });
    expect(context.sourceCount()).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(soundSwitch());
    expect(checked(soundSwitch())).toBe('false');

    const sourcesWhileMuted = context.sourceCount();

    act(() => {
      uiEvents.emitCue('damage');
    });

    expect(context.sourceCount()).toBe(sourcesWhileMuted);

    fireEvent.click(soundSwitch());
    expect(checked(soundSwitch())).toBe('true');

    act(() => {
      uiEvents.emitCue('ward');
    });

    expect(context.sourceCount()).toBeGreaterThan(sourcesWhileMuted);
  });

  it('stays asleep when muted before the first gesture, then unlocks on unmute', () => {
    installAudioContext();
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      serializeSettings({ ...DEFAULT_SETTINGS, muted: true }),
    );

    renderApp();

    expect(checked(soundSwitch())).toBe('false');

    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(FakeAudioContext.instances).toHaveLength(0);

    fireEvent.click(soundSwitch());

    expect(checked(soundSwitch())).toBe('true');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});
