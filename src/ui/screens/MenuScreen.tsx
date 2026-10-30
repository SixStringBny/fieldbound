/**
 * The application's entry point.
 *
 * The menu only dispatches intents: it never imports the engine, a controller
 * or storage. Continue Run is rendered only when the composition root has
 * validated a saved run, so a corrupt save can never advertise a resumable game
 * (RUN-05).
 *
 * The screen is the table from `docs/design-system/solo-flow.md` section 2, as
 * amended by the UI polish pass: a masthead at the top, the two modes as the
 * largest objects in the middle - each carrying the field roundel, the game's
 * own motif - and How to Play and Settings as one quiet footer row at the
 * bottom. Continue Run is a parchment bookmark spanning the hub, only with a
 * validated save. The composition fills the viewport instead of reserving an
 * empty band above the thumb envelope (AB-P1 menu amendment).
 *
 * Each entry is one native button covering the whole object; the visible label
 * and hint are associated with it by `aria-labelledby` / `aria-describedby`, so
 * the accessible names stay exactly the frozen strings while the whole card
 * remains the target. The mode motif is decorative: the seal and the disc are
 * `aria-hidden`, and the title beside them carries the word.
 */

export interface MenuScreenProps {
  /** True only when a validated run save is available to resume. */
  readonly hasSave: boolean;
  /**
   * Optional one-line description of where the saved run will resume, for
   * example "Encounter 2 of 4 · 28 of 40 health". The composition root derives
   * it from the restored run; the screen never inspects storage.
   */
  readonly resumeHint?: string;
  /**
   * Optional deck line for the Continue bookmark, for example
   * "Ember deck · 11 cards". Supplied only when the composition root has a
   * restored run whose deck it can describe.
   */
  readonly deckSummary?: string;
  readonly onPlaySolo: () => void;
  readonly onLocalDuel: () => void;
  readonly onContinueRun: () => void;
  readonly onHowToPlay: () => void;
  readonly onSettings: () => void;
}

export function MenuScreen({
  hasSave,
  resumeHint,
  deckSummary,
  onPlaySolo,
  onLocalDuel,
  onContinueRun,
  onHowToPlay,
  onSettings,
}: MenuScreenProps) {
  return (
    <div className="menu">
      <header className="menu__hero">
        <h1 className="menu__wordmark">Fieldbound</h1>
        <p className="menu__tagline">
          One field. Three energies. Two ways to play.
        </p>
        {hasSave ? null : <p className="menu__plaque">No run in progress</p>}
      </header>

      <nav className="menu__hub" aria-label="Main menu">
        <ul className="menu__list">
          <li className="menu__item menu__item--mode menu__item--solo">
            <button
              type="button"
              className="menu__card menu__card--solo"
              aria-labelledby="menu-play-solo-label"
              aria-describedby="menu-play-solo-hint"
              onClick={onPlaySolo}
            />
            <span className="menu__card-content">
              <span className="menu__motif" aria-hidden="true">
                <span className="menu__motif-ring" />
                <span className="menu__seal menu__seal--ember">▲</span>
              </span>
              <span className="menu__card-text">
                <span className="menu__card-title" id="menu-play-solo-label">
                  Play Solo
                </span>
                <span className="menu__card-hint" id="menu-play-solo-hint">
                  Four fights, one 40-health run.
                </span>
              </span>
              <span className="menu__card-glyph" aria-hidden="true">
                ›
              </span>
            </span>
          </li>

          <li className="menu__item menu__item--mode menu__item--duel">
            <button
              type="button"
              className="menu__card menu__card--duel"
              aria-labelledby="menu-local-duel-label"
              aria-describedby="menu-local-duel-hint"
              onClick={onLocalDuel}
            />
            <span className="menu__card-content">
              <span className="menu__motif menu__motif--duel" aria-hidden="true">
                <span className="menu__motif-ring" />
                <span className="menu__seal menu__seal--brass">◆</span>
              </span>
              <span className="menu__card-text">
                <span className="menu__card-title" id="menu-local-duel-label">
                  Local Duel
                </span>
                <span className="menu__card-hint" id="menu-local-duel-hint">
                  Best of three, pass and play.
                </span>
              </span>
              <span className="menu__card-glyph" aria-hidden="true">
                ›
              </span>
            </span>
          </li>

          {hasSave ? (
            <li className="menu__item menu__item--bookmark">
              <button
                type="button"
                className="menu__bookmark"
                aria-labelledby="menu-continue-run-label"
                aria-describedby={
                  deckSummary === undefined
                    ? 'menu-continue-run-hint'
                    : 'menu-continue-run-hint menu-continue-run-deck'
                }
                onClick={onContinueRun}
              />
              <span className="menu__bookmark-content">
                <span
                  className="menu__bookmark-title"
                  id="menu-continue-run-label"
                >
                  Continue Run
                </span>
                <span className="menu__bookmark-hint" id="menu-continue-run-hint">
                  {resumeHint ?? 'Resume the run you left.'}
                </span>
                {deckSummary === undefined ? null : (
                  <span className="menu__bookmark-deck" id="menu-continue-run-deck">
                    {deckSummary}
                  </span>
                )}
              </span>
            </li>
          ) : null}

          <li className="menu__item menu__item--docs">
            <div className="menu__docs">
              <button
                type="button"
                className="menu__row"
                aria-labelledby="menu-how-to-play-label"
                onClick={onHowToPlay}
              >
                <span className="menu__row-title" id="menu-how-to-play-label">
                  How to Play
                </span>
                <span className="menu__row-glyph" aria-hidden="true">
                  ›
                </span>
              </button>

              <button
                type="button"
                className="menu__row"
                aria-labelledby="menu-settings-label"
                onClick={onSettings}
              >
                <span className="menu__row-title" id="menu-settings-label">
                  Settings
                </span>
                <span className="menu__row-glyph" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  );
}
