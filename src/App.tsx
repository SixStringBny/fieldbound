/**
 * The router contract for the whole application.
 *
 * Every reachable surface is a member of this one discriminated union. The
 * union lives in the composition root so no screen can be mounted without a
 * corresponding App route. Gameplay screens are added to `App` by their own
 * tasks; this scaffold only mounts the shell, so none of those surfaces are
 * rendered yet.
 */
export const SCREEN_KINDS = [
  'menu',
  'how-to-play',
  'settings',
  'solo-setup',
  'run-overview',
  'battle',
  'reward',
  'run-result',
  'duel-setup',
  'privacy',
  'round-result',
  'match-result',
] as const;

export type ScreenKind = (typeof SCREEN_KINDS)[number];

export type Screen = {
  readonly [Kind in ScreenKind]: { readonly kind: Kind };
}[ScreenKind];

/** The menu is the only surface this workspace scaffold mounts. */
export const INITIAL_SCREEN: Screen = { kind: 'menu' };

/**
 * Fieldbound composition root.
 *
 * This scaffold renders the static shell only. It deliberately contains no
 * board, no cards and no engine imports: later tasks add those surfaces here
 * through the `Screen` union so the application keeps a single router.
 */
export function App() {
  return (
    <div className="app-root" id="app-root">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <main className="shell" id="main-content" tabIndex={-1}>
        <header className="shell__header">
          <p className="shell__eyebrow">A shared-field card battler</p>
          <h1 className="shell__title">Fieldbound</h1>
          <p className="shell__tagline">
            One field. Three energies. Two ways to play.
          </p>
        </header>

        <section className="shell__panel" aria-labelledby="shell-status-title">
          <h2 className="shell__panel-title" id="shell-status-title">
            Workspace ready
          </h2>
          <p className="shell__copy">
            The application shell is mounted. Solo, duel and settings surfaces
            are added by their own build steps; nothing is mocked here.
          </p>
          <ul className="shell__list">
            <li>React 19 with strict TypeScript</li>
            <li>Static Vite build with a configurable base path</li>
            <li>Vitest with jsdom plus a Playwright harness</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
