/**
 * The application's entry point.
 *
 * The menu only dispatches intents: it never imports the engine, a controller
 * or storage. Continue Run is rendered only when the composition root has
 * validated a saved run, so a corrupt save can never advertise a resumable game
 * (RUN-05).
 */

export interface MenuScreenProps {
  /** True only when a validated run save is available to resume. */
  readonly hasSave: boolean;
  readonly onPlaySolo: () => void;
  readonly onLocalDuel: () => void;
  readonly onContinueRun: () => void;
  readonly onHowToPlay: () => void;
  readonly onSettings: () => void;
}

export function MenuScreen({
  hasSave,
  onPlaySolo,
  onLocalDuel,
  onContinueRun,
  onHowToPlay,
  onSettings,
}: MenuScreenProps) {
  return (
    <>
      <header className="shell__header">
        <p className="shell__eyebrow">A shared-field card battler</p>
        <h1 className="shell__title">Fieldbound</h1>
        <p className="shell__tagline">
          One field. Three energies. Two ways to play.
        </p>
      </header>

      <nav className="shell__panel menu" aria-labelledby="menu-title">
        <h2 className="shell__panel-title" id="menu-title">
          Main menu
        </h2>

        <ul className="menu__list">
          <li className="menu__item">
            <button
              type="button"
              className="menu__entry"
              onClick={onPlaySolo}
              aria-describedby="menu-play-solo-hint"
            >
              Play Solo
            </button>
            <p className="menu__hint" id="menu-play-solo-hint">
              Four fights, one 40-health run.
            </p>
          </li>

          <li className="menu__item">
            <button
              type="button"
              className="menu__entry"
              onClick={onLocalDuel}
              aria-describedby="menu-local-duel-hint"
            >
              Local Duel
            </button>
            <p className="menu__hint" id="menu-local-duel-hint">
              Best of three, pass and play on one device.
            </p>
          </li>

          {hasSave ? (
            <li className="menu__item">
              <button
                type="button"
                className="menu__entry"
                onClick={onContinueRun}
                aria-describedby="menu-continue-run-hint"
              >
                Continue Run
              </button>
              <p className="menu__hint" id="menu-continue-run-hint">
                Resume the run you left.
              </p>
            </li>
          ) : null}

          <li className="menu__item">
            <button
              type="button"
              className="menu__entry"
              onClick={onHowToPlay}
              aria-describedby="menu-how-to-play-hint"
            >
              How to Play
            </button>
            <p className="menu__hint" id="menu-how-to-play-hint">
              Energy, the field cycle, defense, statuses and both modes.
            </p>
          </li>

          <li className="menu__item">
            <button
              type="button"
              className="menu__entry"
              onClick={onSettings}
              aria-describedby="menu-settings-hint"
            >
              Settings
            </button>
            <p className="menu__hint" id="menu-settings-hint">
              Sound and motion.
            </p>
          </li>
        </ul>
      </nav>
    </>
  );
}
