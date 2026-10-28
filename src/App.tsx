/**
 * The router contract and composition root for the whole application.
 *
 * Every reachable surface is a member of one discriminated union. `SCREENS` maps
 * each kind to its screen value and `routes` maps each kind to the element that
 * renders it, so the compiler rejects the file the moment `SCREEN_KINDS` grows
 * without a matching route. Screens dispatch navigation intents; only this file
 * decides which screen is mounted.
 *
 * Surfaces that later tasks build (settings, solo, duel) resolve to a single
 * shared notice until then. That keeps the menu's entries alive and the router
 * exhaustive without creating empty screen files that a later task would have
 * to delete. The battle surface is built and owned by SHL-03.
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { byId as cardCatalog } from './content/cards';
import { deckByElement } from './content/decks';
import { enemyById } from './content/enemies';
import {
  createBattleControllerState,
  useBattleController,
} from './state/battle-controller';
import type {
  BattleControllerConfig,
  BattleControllerState,
} from './state/battle-controller';
import type { EngineResult } from './engine/types';
import { emitCue } from './ui/events';
import { BattleScreen } from './ui/screens/BattleScreen';
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

/**
 * The interim practice encounter the composition root mounts on the battle
 * screen. Solo setup (RUN-04) will replace it with the run's own battle; until
 * then it gives the menu and the test-only entry point a real, playable fight
 * built from the frozen Ember starter deck against the first ladder enemy.
 */
const PRACTICE_BATTLE_SEED = 7;

function buildPracticeBattleConfig(): BattleControllerConfig | null {
  const deck = deckByElement('ember');
  const enemy = enemyById('enemy-cinder-warden');

  if (deck === undefined || enemy === undefined) {
    return null;
  }

  return {
    seed: PRACTICE_BATTLE_SEED,
    player: { element: deck.element, cards: deck.cards },
    opponent: {
      element: enemy.element,
      cards: enemy.deck,
      maxHealth: enemy.maxHealth,
    },
    cards: cardCatalog,
    enemy,
  };
}

const PRACTICE_BATTLE_CONFIG: BattleControllerConfig | null =
  buildPracticeBattleConfig();

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
  /**
   * Test-only: mount a controlled battle instead of the built-in practice
   * encounter. Production routes always use the practice battle until RUN-04
   * supplies the run's own battle.
   */
  readonly battleConfig?: BattleControllerConfig;
}

export function App({
  initialScreen = INITIAL_SCREEN,
  hasSave = false,
  battleConfig,
}: AppProps = {}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);

  const navigate = useCallback((kind: ScreenKind) => {
    setScreen(SCREENS[kind]);
    emitCue('ui');
  }, []);

  const pending = (title: string): ReactNode => (
    <PendingSurface title={title} onBack={() => navigate('menu')} />
  );

  const battle = battleConfig ?? PRACTICE_BATTLE_CONFIG;

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
    battle: <BattleRoute config={battle} onExit={() => navigate('menu')} />,
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
 * The battle route. The controller is created once per mount; a bad setup is a
 * typed failure rendered as a recoverable panel, never a thrown string.
 */
function BattleRoute({
  config,
  onExit,
}: {
  readonly config: BattleControllerConfig | null;
  readonly onExit: () => void;
}) {
  const [initial] = useState<
    EngineResult<BattleControllerState> | null
  >(() =>
    config === null ? null : createBattleControllerState(config),
  );

  if (initial === null) {
    return (
      <BattleUnavailable
        message="The frozen starter content is missing the Ember deck or the first enemy."
        onExit={onExit}
      />
    );
  }

  if (!initial.ok) {
    return <BattleUnavailable message={initial.error.message} onExit={onExit} />;
  }

  return <BattleSession initialState={initial.value} onExit={onExit} />;
}

/** Keeps the hook unconditional: mounted only once a battle exists. */
function BattleSession({
  initialState,
  onExit,
}: {
  readonly initialState: BattleControllerState;
  readonly onExit: () => void;
}) {
  const controller = useBattleController(initialState);

  return (
    <BattleScreen
      state={controller.state}
      baseUrl={import.meta.env.BASE_URL}
      onPlayCard={controller.playCard}
      onEndTurn={controller.endTurn}
      onExit={onExit}
    />
  );
}

function BattleUnavailable({
  message,
  onExit,
}: {
  readonly message: string;
  readonly onExit: () => void;
}) {
  return (
    <section className="shell__panel" aria-labelledby="battle-unavailable-title">
      <h1 className="shell__page-title" id="battle-unavailable-title">
        Battle
      </h1>
      <p className="shell__copy">The battle could not start: {message}</p>
      <p>
        <button type="button" className="shell__button" onClick={onExit}>
          Back to menu
        </button>
      </p>
    </section>
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
