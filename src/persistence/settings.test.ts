import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  createSettingsStore,
  parseStoredSettings,
} from './settings';
import type { Settings, SettingsStorage } from './settings';

/* -------------------------------------------------------------------------- */
/* Storage double                                                             */
/* -------------------------------------------------------------------------- */

class MemoryStorage implements SettingsStorage {
  readonly values = new Map<string, string>();
  readonly getItem = vi.fn((key: string) => this.values.get(key) ?? null);
  readonly setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value);
  });
  readonly removeItem = vi.fn((key: string) => {
    this.values.delete(key);
  });

  raw(key: string = SETTINGS_STORAGE_KEY): string | null {
    return this.values.get(key) ?? null;
  }
}

/* -------------------------------------------------------------------------- */
/* Defaults and round trip                                                    */
/* -------------------------------------------------------------------------- */

describe('settings defaults', () => {
  it('starts sound on, motion following the system and no stored key', () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(storage);

    expect(DEFAULT_SETTINGS).toEqual({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      muted: false,
      reducedMotion: null,
    });
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    // Loading defaults must not create a key the player never chose.
    expect(storage.raw()).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.isPersistent).toBe(true);
  });

  it('writes both preferences under the versioned key immediately', () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(storage);

    expect(store.save({ ...DEFAULT_SETTINGS, muted: true })).toBe(true);

    expect(storage.raw()).toBe(
      JSON.stringify({
        schemaVersion: 1,
        muted: true,
        reducedMotion: null,
      }),
    );

    expect(
      store.save({
        ...DEFAULT_SETTINGS,
        muted: false,
        reducedMotion: true,
      }),
    ).toBe(true);

    expect(JSON.parse(storage.raw() ?? '{}')).toEqual({
      schemaVersion: 1,
      muted: false,
      reducedMotion: true,
    });
  });

  it('reads back a saved value from a fresh store, as a reload would', () => {
    const storage = new MemoryStorage();
    createSettingsStore(storage).save({
      ...DEFAULT_SETTINGS,
      muted: true,
      reducedMotion: false,
    });

    const reloaded = createSettingsStore(storage).load();

    expect(reloaded).toEqual({
      schemaVersion: 1,
      muted: true,
      reducedMotion: false,
    });
  });

  it('never stores game state beside the settings', () => {
    const storage = new MemoryStorage();
    createSettingsStore(storage).save({ ...DEFAULT_SETTINGS, muted: true });

    const parsed = JSON.parse(storage.raw() ?? '{}') as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual([
      'muted',
      'reducedMotion',
      'schemaVersion',
    ]);
    expect(parsed).not.toHaveProperty('run');
    expect(parsed).not.toHaveProperty('battle');
  });
});

/* -------------------------------------------------------------------------- */
/* Invalid payloads                                                           */
/* -------------------------------------------------------------------------- */

describe('settings validation', () => {
  const invalidPayloads: Array<[string, string]> = [
    ['malformed JSON', '{not json'],
    ['an empty string', ''],
    ['an array', '[1,2,3]'],
    ['null', 'null'],
    ['a string', '"muted"'],
    ['an unknown version', JSON.stringify({ schemaVersion: 2, muted: true, reducedMotion: null })],
    ['a missing version', JSON.stringify({ muted: true, reducedMotion: null })],
    ['a non-boolean muted value', JSON.stringify({ schemaVersion: 1, muted: 'yes', reducedMotion: null })],
    ['a non-boolean motion value', JSON.stringify({ schemaVersion: 1, muted: false, reducedMotion: 'on' })],
    ['a missing motion value', JSON.stringify({ schemaVersion: 1, muted: false })],
  ];

  for (const [label, payload] of invalidPayloads) {
    it(`falls back to defaults and removes only the settings key for ${label}`, () => {
      const storage = new MemoryStorage();
      storage.values.set('fieldbound.run.v1', '{"keep":"me"}');
      storage.values.set(SETTINGS_STORAGE_KEY, payload);

      const store = createSettingsStore(storage);

      expect(() => store.load()).not.toThrow();
      expect(store.load()).toEqual(DEFAULT_SETTINGS);
      expect(storage.raw()).toBeNull();
      expect(storage.raw('fieldbound.run.v1')).toBe('{"keep":"me"}');
    });
  }

  it('accepts a valid payload with an explicit false override', () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        muted: true,
        reducedMotion: false,
      }),
    );

    expect(createSettingsStore(storage).load()).toEqual({
      schemaVersion: 1,
      muted: true,
      reducedMotion: false,
    });
  });

  it('ignores unknown extra fields without discarding a valid payload', () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          schemaVersion: 1,
          muted: false,
          reducedMotion: null,
          future: 'ignored',
        }),
      ),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects a payload that cannot be serialized', () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(storage);

    expect(
      store.save({
        schemaVersion: 1,
        muted: 'loud',
        reducedMotion: null,
      } as unknown as Settings),
    ).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Unavailable storage                                                        */
/* -------------------------------------------------------------------------- */

describe('unavailable storage', () => {
  it('keeps the toggles working in memory for the session', () => {
    const store = createSettingsStore(null);

    expect(store.isPersistent).toBe(false);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);

    expect(store.save({ ...DEFAULT_SETTINGS, muted: true })).toBe(false);
    expect(store.load()).toEqual({ ...DEFAULT_SETTINGS, muted: true });

    expect(
      store.save({ ...DEFAULT_SETTINGS, muted: true, reducedMotion: true }),
    ).toBe(false);
    expect(store.load()).toEqual({
      schemaVersion: 1,
      muted: true,
      reducedMotion: true,
    });
  });

  it('falls back to defaults when reading throws', () => {
    const storage: SettingsStorage = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const store = createSettingsStore(storage);

    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(store.isPersistent).toBe(false);
  });

  it('keeps a change in memory when the quota rejects the write', () => {
    const storage: SettingsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: vi.fn(),
    };
    const store = createSettingsStore(storage);

    expect(store.save({ ...DEFAULT_SETTINGS, muted: true })).toBe(false);
    expect(store.load()).toEqual({ ...DEFAULT_SETTINGS, muted: true });
    expect(store.isPersistent).toBe(false);
  });

  it('does not throw when an invalid key cannot be removed', () => {
    const storage: SettingsStorage = {
      getItem: () => 'not json',
      setItem: vi.fn(),
      removeItem: () => {
        throw new Error('read-only storage');
      },
    };

    const store = createSettingsStore(storage);

    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(store.isPersistent).toBe(false);
  });

  it('resolves the browser storage by default and falls back when absent', () => {
    // jsdom provides localStorage, so the default store can persist.
    const store = createSettingsStore();
    expect(store.isPersistent).toBe(true);

    expect(() => store.save({ ...DEFAULT_SETTINGS, muted: true })).not.toThrow();
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });
});
