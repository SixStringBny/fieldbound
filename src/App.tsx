/**
 * The router contract and composition root for the whole application.
 *
 * Every reachable surface is a member of one discriminated union. `SCREENS` maps
 * each kind to its screen value and `routes` maps each kind to the element that
 * renders it, so the compiler rejects the file the moment `SCREEN_KINDS` grows
 * without a matching route. Screens dispatch navigation intents; only this file
 * decides which screen is mounted.
 *
 * Surfaces that later tasks build (settings, solo, battle, duel) resolve to a
 * single shared notice until then. That keeps the menu's entries alive and the
 * router exhaustive without creating empty screen files that a later task would
 * have to delete.
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { emitCue } from './ui/events';
import { HowToPlayScreen } from './ui/screens/HowToPlayScreen';
import { MenuScreen } from './ui/screens/MenuScreen';

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

/** The shape of one screen value, keyed by its own kind. */
export type ScreenByKind = {
  readonly [Kind in ScreenKind]: { readonly kind: Kind };
};

export type Screen = ScreenByKind[ScreenKind];

/**
 * The only legal way to construct a screen. Its mapped type is required to name
 * every kind, which is what makes an added union member a typecheck failure.
 */
export const SCREENS: ScreenByKind = {
  menu: { kind: 'menu' },
  'how-to-play': { kind: 'how-to-play' },
  settings: { kind: 'settings' },
  'solo-setup': { kind: 'solo-setup' },
  'run-overview': { kind: 'run-overview' },
  battle: { kind: 'battle' },
  reward: { kind: 'reward' },
  'run-result': { kind: 'run-result' },
  'duel-setup': { kind: 'duel-setup' },
  privacy: { kind: 'privacy' },
  'round-result': { kind: 'round-result' },
  'match-result': { kind: 'match-result' },
};

export const INITIAL_SCREEN: Screen = SCREENS.menu;

export interface AppProps {
  /**
   * Test-only entry point: mount the composition root directly on a surface.
   * Read once at mount, mirroring a browser reload rather than an in-app jump.
   */
  readonly initialScreen?: Screen;
  /**
   * True only when the boot-time save check validated a run. Continue Run is
   * absent otherwise; the menu never offers a resume that cannot be restored.
   */
  readonly hasSave?: boolean;
}

export function App({
  initialScreen = INITIAL_SCREEN,
  hasSave = false,
}: AppProps = {}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);

  const navigate = useCallback((kind: ScreenKind) => {
    setScreen(SCREENS[kind]);
    emitCue('ui');
  }, []);

  const pending = (title: string): ReactNode => (
    <PendingSurface title={title} onBack={() => navigate('menu')} />
  );

  const routes: { readonly [Kind in ScreenKind]: ReactNode } = {
    menu: (
      <MenuScreen
        hasSave={hasSave}
        onPlaySolo={() => navigate('solo-setup')}
        onLocalDuel={() => navigate('duel-setup')}
        // RUN-05 replaces this with the screen stored in the validated save.
        onContinueRun={() => navigate('battle')}
        onHowToPlay={() => navigate('how-to-play')}
        onSettings={() => navigate('settings')}
      />
    ),
    'how-to-play': <HowToPlayScreen onBack={() => navigate('menu')} />,
    settings: pending('Settings'),
    'solo-setup': pending('Solo setup'),
    'run-overview': pending('Run overview'),
    battle: pending('Battle'),
    reward: pending('Reward'),
    'run-result': pending('Run result'),
    'duel-setup': pending('Duel setup'),
    privacy: pending('Privacy handoff'),
    'round-result': pending('Round result'),
    'match-result': pending('Match result'),
  };

  return (
    <div className="app-root" id="app-root">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <main
        className="shell"
        id="main-content"
        tabIndex={-1}
        data-screen={screen.kind}
      >
        {routes[screen.kind]}
      </main>
    </div>
  );
}

/**
 * The router's exhaustive fallback for a surface a later task has not built
 * yet. It is deliberately one shared notice, not a screen file per feature.
 */
function PendingSurface({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <section className="shell__panel" aria-labelledby="pending-title">
      <h1 className="shell__page-title" id="pending-title">
        {title}
      </h1>
      <p className="shell__copy">
        This surface is added by its own build step. Nothing here is mocked.
      </p>
      <p>
        <button type="button" className="shell__button" onClick={onBack}>
          Back to menu
        </button>
      </p>
    </section>
  );
}
