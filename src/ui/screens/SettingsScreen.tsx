/**
 * The settings surface (reading-screens section 4; SHL-FR-07, SHL-FR-04,
 * SHL-FR-05).
 *
 * One 42rem parchment sheet under the shared document masthead, with exactly two
 * rows - Sound and Reduce motion - each a label, a hint and a 72x44 switch.
 * Both switches apply and save on the click that changes them: Sound controls the
 * synthesized cue engine, and Reduce motion writes the explicit override that the
 * app root mirrors into `data-reduced-motion`.
 *
 * There is no third "follow your device" state, no storage row and no reset, and
 * the masthead `Back` is the only action: a trailing second `Back` would
 * duplicate the same intent one short screen apart and give two controls the same
 * accessible name.
 *
 * The storage notice is a static note, not a live region (Q6). It reports a
 * condition discovered on mount, not feedback to an action, and the app already
 * owns the single polite `role="status"`.
 *
 * The screen is presentational. It receives the resolved values from the
 * composition root and dispatches two typed intents; it never reads storage,
 * touches an AudioContext or calls matchMedia itself.
 */

import '../../styles/document.css';

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
    <div className="document document--settings">
      <header className="document__masthead">
        <div className="document__masthead-line">
          <p className="document__eyebrow">Preferences</p>
          <button type="button" className="document__back" onClick={onBack}>
            Back
          </button>
        </div>
        <h1 className="document__title">Settings</h1>
        <p className="document__tagline">
          Sound and motion save as soon as you change them.
        </p>
      </header>

      <div className="document__sheet">
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
              <span className="settings__switch-thumb" aria-hidden="true" />
              <span className="settings__switch-word">
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
              <span className="settings__switch-thumb" aria-hidden="true" />
              <span className="settings__switch-word">
                {reducedMotion ? 'On' : 'Off'}
              </span>
            </button>
          </li>
        </ul>

        {storageAvailable ? null : (
          <p className="settings__notice">
            This browser cannot save settings. Your choices apply for this
            session only.
          </p>
        )}
      </div>
    </div>
  );
}
