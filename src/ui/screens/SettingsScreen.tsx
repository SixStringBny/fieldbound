/**
 * The settings surface (SHL-FR-07, SHL-FR-04, SHL-FR-05).
 *
 * Two switches, both applied and saved on the click that changes them: Sound
 * controls the synthesized cue engine, and Reduce motion writes the explicit
 * override that the app root mirrors into `data-reduced-motion`.
 *
 * The screen is presentational. It receives the resolved values from the
 * composition root and dispatches two typed intents; it never reads storage,
 * touches an AudioContext or calls matchMedia itself.
 */

export type ReducedMotionSource = 'system' | 'setting';

export interface SettingsScreenProps {
  /** True when synthesized sound is suppressed. */
  readonly muted: boolean;
  /** The resolved motion state, already combined with the OS preference. */
  readonly reducedMotion: boolean;
  /** Where the resolved motion value comes from, for the hint text. */
  readonly reducedMotionSource: ReducedMotionSource;
  /** False when the browser cannot save; changes still apply this session. */
  readonly storageAvailable: boolean;
  /** Pass the desired enabled state, not the previous one. */
  readonly onSoundChange: (enabled: boolean) => void;
  /** Pass the desired reduced state, not the previous one. */
  readonly onReducedMotionChange: (reduced: boolean) => void;
  readonly onBack: () => void;
}

export function SettingsScreen({
  muted,
  reducedMotion,
  reducedMotionSource,
  storageAvailable,
  onSoundChange,
  onReducedMotionChange,
  onBack,
}: SettingsScreenProps) {
  return (
    <section className="shell__panel settings" aria-labelledby="settings-title">
      <h1 className="shell__page-title" id="settings-title">
        Settings
      </h1>
      <p className="shell__copy">
        Sound and motion save as soon as you change them.
      </p>

      <ul className="settings__list">
        <li className="settings__row">
          <div className="settings__label">
            <h2 className="settings__name" id="settings-sound-label">
              Sound
            </h2>
            <p className="settings__hint" id="settings-sound-hint">
              Synthesized cues play after your first tap or key press.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            className="settings__switch"
            aria-checked={!muted}
            aria-labelledby="settings-sound-label"
            aria-describedby="settings-sound-hint"
            onClick={() => onSoundChange(muted)}
          >
            <span className="settings__switch-label">
              {muted ? 'Off' : 'On'}
            </span>
          </button>
        </li>

        <li className="settings__row">
          <div className="settings__label">
            <h2 className="settings__name" id="settings-motion-label">
              Reduce motion
            </h2>
            <p className="settings__hint" id="settings-motion-hint">
              {reducedMotionSource === 'system'
                ? 'Following your device setting.'
                : 'Set on this device.'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            className="settings__switch"
            aria-checked={reducedMotion}
            aria-labelledby="settings-motion-label"
            aria-describedby="settings-motion-hint"
            onClick={() => onReducedMotionChange(!reducedMotion)}
          >
            <span className="settings__switch-label">
              {reducedMotion ? 'On' : 'Off'}
            </span>
          </button>
        </li>
      </ul>

      {storageAvailable ? null : (
        <p className="settings__notice" role="status">
          This browser cannot save settings. Your choices apply for this
          session only.
        </p>
      )}

      <p className="settings__footer">
        <button type="button" className="shell__back" onClick={onBack}>
          Back
        </button>
      </p>
    </section>
  );
}
