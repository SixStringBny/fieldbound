/**
 * Persisted player settings (SHL-FR-07, VIS-NFR-06).
 *
 * Two preferences live under one versioned key, `fieldbound.settings.v1`:
 * whether synthesized sound is muted, and the explicit reduced-motion override.
 * `reducedMotion: null` means "no choice yet; follow the operating system", so
 * the settings screen can show the resolved system state without pretending the
 * player picked it.
 *
 * This module is the only code allowed to touch the settings key. It never
 * imports gameplay, so settings can never grow into a second save file.
 *
 * Storage rules:
 *
 *   - a corrupt payload, a foreign shape or an unknown `schemaVersion` is
 *     discarded and only this key is removed;
 *   - writing is synchronous and happens on every change;
 *   - when storage is missing, access throws or the quota is full, the store
 *     keeps the last written value in memory for the session and reports that
 *     the write did not persist instead of throwing.
 *
 * The store takes an injectable adapter, so tests exercise the failure paths
 * without patching `window`.
 */

/** The one localStorage key this module owns. */
export const SETTINGS_STORAGE_KEY = 'fieldbound.settings.v1';

/** The current schema version. A mismatch is treated as foreign data. */
export const SETTINGS_SCHEMA_VERSION = 1 as const;

export interface SettingsV1 {
  readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  /** True when synthesized sound is suppressed. */
  readonly muted: boolean;
  /** Explicit in-app choice; null means "follow the OS preference". */
  readonly reducedMotion: boolean | null;
}

export type Settings = SettingsV1;

/**
 * Defaults follow the game-shell contract: sound is on but silent until the
 * first gesture, and motion follows the operating system.
 */
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  muted: false,
  reducedMotion: null,
};

/** The minimum storage surface the store needs; `Storage` satisfies it. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Validate a raw stored string. Returns null for anything this module did not
 * write, so the caller can discard it. Unknown extra keys are ignored, which
 * keeps a future additive field from invalidating today's payload.
 */
export function parseStoredSettings(raw: string): Settings | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  if (record.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    return null;
  }

  if (typeof record.muted !== 'boolean') {
    return null;
  }

  const reducedMotion = record.reducedMotion;

  if (reducedMotion !== null && typeof reducedMotion !== 'boolean') {
    return null;
  }

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    muted: record.muted,
    reducedMotion,
  };
}

/** Serialize the canonical shape; property order is part of the contract. */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    muted: settings.muted,
    reducedMotion: settings.reducedMotion,
  });
}

export interface SettingsStore {
  /** Read once. Invalid or unknown data is removed and defaults are returned. */
  load(): Settings;
  /**
   * Persist immediately. Returns false when the value only reached the
   * in-memory fallback, so the UI can show a non-blocking notice.
   */
  save(settings: Settings): boolean;
  /** True while writes reach the browser's Storage. */
  readonly isPersistent: boolean;
}

/** Resolve `window.localStorage`; private-mode accessors can throw. */
function resolveDefaultStorage(): SettingsStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function canSerialize(settings: Settings): boolean {
  return (
    typeof settings.muted === 'boolean' &&
    (settings.reducedMotion === null ||
      typeof settings.reducedMotion === 'boolean')
  );
}

/**
 * Create a settings store. Pass a storage adapter in tests, or `null` to
 * simulate a browser that has no usable storage; omit it for production.
 */
export function createSettingsStore(
  storage?: SettingsStorage | null,
): SettingsStore {
  const resolvedStorage =
    storage === undefined ? resolveDefaultStorage() : storage;

  let persistent = resolvedStorage !== null;
  /** Last value written or read, so an unavailable store still works. */
  let memory: Settings | null = null;

  const fallback = (): Settings => memory ?? DEFAULT_SETTINGS;

  function removeInvalidKey(active: SettingsStorage): void {
    try {
      active.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // A storage that cannot remove is also a storage that cannot persist;
      // defaults still apply for this session.
      persistent = false;
    }
  }

  return {
    load(): Settings {
      if (resolvedStorage === null) {
        persistent = false;
        return fallback();
      }

      let raw: string | null;

      try {
        raw = resolvedStorage.getItem(SETTINGS_STORAGE_KEY);
      } catch {
        persistent = false;
        return fallback();
      }

      if (raw === null) {
        // No stored choice: keep an in-memory value from a failed write,
        // otherwise use defaults without creating the key.
        return fallback();
      }

      const parsed = parseStoredSettings(raw);

      if (parsed === null) {
        memory = DEFAULT_SETTINGS;
        removeInvalidKey(resolvedStorage);
        return DEFAULT_SETTINGS;
      }

      memory = parsed;
      return parsed;
    },

    save(settings: Settings): boolean {
      if (!canSerialize(settings)) {
        return false;
      }

      const next: Settings = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        muted: settings.muted,
        reducedMotion: settings.reducedMotion,
      };

      memory = next;

      if (resolvedStorage === null) {
        persistent = false;
        return false;
      }

      try {
        resolvedStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(next));
        return true;
      } catch {
        // Quota exceeded or a storage that throws on write: keep the value for
        // this session rather than losing the player's toggle.
        persistent = false;
        return false;
      }
    },

    get isPersistent() {
      return persistent;
    },
  };
}
