/**
 * The router contract and composition root for the whole application.
 *
 * Every reachable surface is a member of one discriminated union. `SCREENS` maps
 * each kind to its screen value and `routes` maps each kind to the element that
 * renders it, so the compiler rejects the file the moment `SCREEN_KINDS` grows
 * without a matching route. Screens dispatch navigation intents; only this file
 * decides which screen is mounted.
 *
 * The menu, rules, settings, solo run, battle and full local-duel flow are
 * built. The solo run is an in-memory controller state held beside the screen
 * union: setup, the first battle, the mandatory reward, the run overview and the
 * result screen all read that state, and every settled action is autosaved to
 * `fieldbound.run.v1` by the controller (RUN-FR-01, RUN-FR-02, RUN-FR-04,
 * RUN-FR-08).
 *
 * At boot the same key is loaded and validated once, before any screen renders.
 * A valid save seeds the run controller, which is what makes Continue Run
 * restore the exact battle, reward, overview or result surface; an invalid or
 * unknown-version payload is removed by the save module and simply leaves no
 * Continue Run entry, with no error dialog and no raw storage exception
 * (RUN-FR-05, RUN-FR-06, VIS-NFR-06).
 *
 * The duel is an in-memory session held beside the screen union: the privacy,
 * battle, round-result and match-result routes read the live round controller's
 * redacted view, so an inactive hand cannot reach the DOM and a reload cannot
 * resume a duel (DUEL-FR-03, DUEL-FR-04, DUEL-FR-05, VIS-CON-03).
 *
 * The root also owns the cross-cutting runtime wiring: the versioned settings
 * store, the resolved reduced-motion attribute, the single subscription that
 * turns cue-bus events into synthesized sound after the first gesture, the one
 * polite live region every screen announces through, and the skip link that
 * moves focus to the main landmark.
 */

import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createSfxEngine } from './audio/sfx';
import { byId as cardCatalog } from './content/cards';
import { deckByElement, STARTER_DECKS } from './content/decks';
import { enemyById } from './content/enemies';
import { createMatch, matchWinner, recordRoundWinner, rematch } from './duel/match';
import type { DuelMatch, DuelPlayer, DuelRound } from './duel/match';
import {
  createDuelRound,
  dismissDuelPrivacy,
  duelRoundView,
  endDuelTurn,
  playDuelCard,
} from './duel/round';
import type { DuelRoundState } from './duel/round';
import type { Settings, SettingsStorage } from './persistence/settings';
import { createSettingsStore } from './persistence/settings';
import { createRunSaveStore } from './persistence/run-save';
import type { RunSaveStorage } from './persistence/run-save';
import type { StatsStorage } from './persistence/stats';
import { resolveRunSeed } from './persistence/seed';
import type { SeedSource } from './persistence/seed';
import {
  RUN_ENCOUNTER_COUNT,
  RUN_MAX_HEALTH,
  currentEnemy,
  runSummary,
} from './run/run-model';
import {
  createBattleControllerState,
  fieldMatchupFor,
  useBattleController,
} from './state/battle-controller';
import type {
  BattleControllerConfig,
  BattleControllerState,
} from './state/battle-controller';
import {
  runCurrentHealth,
  runEncounterNumber,
  runProgress,
  screenForRun,
  useSoloRunController,
} from './state/run-controller';
import type {
  SoloEncounterFactory,
  SoloRunAttempt,
  SoloRunState,
} from './state/run-controller';
import { resumeRun } from './state/resume-run';
import type { RunResume } from './state/resume-run';
import type { EngineResult, FieldElement } from './engine/types';
import { useKeyboardControls } from './ui/a11y/useKeyboardControls';
import { emitCue, uiEvents } from './ui/events';
import { LiveRegion } from './ui/components/LiveRegion';
import {
  reducedMotionAttribute,
  useReducedMotion,
} from './ui/motion/useReducedMotion';
import { BattleScreen } from './ui/screens/BattleScreen';
import { DuelBattleScreen } from './ui/screens/DuelBattleScreen';
import type { DuelBattleScreenProps } from './ui/screens/DuelBattleScreen';
import { DuelSetupScreen } from './ui/screens/DuelSetupScreen';
import { duelPlayerName, duelScoreText } from './ui/screens/duel-copy';
import { HowToPlayScreen } from './ui/screens/HowToPlayScreen';
import { MatchResultScreen } from './ui/screens/MatchResultScreen';
import { MenuScreen } from './ui/screens/MenuScreen';
import { PrivacyScreen } from './ui/screens/PrivacyScreen';
import { RewardScreen } from './ui/screens/RewardScreen';
import { RoundResultScreen } from './ui/screens/RoundResultScreen';
import { RunOverviewScreen } from './ui/screens/RunOverviewScreen';
import { RunResultScreen } from './ui/screens/RunResultScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { SoloSetupScreen } from './ui/screens/SoloSetupScreen';

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

/* -------------------------------------------------------------------------- */
/* Continue Run                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One line describing where Continue Run will land, so the menu promises the
 * right surface before it opens. Derived only from the restored or live run
 * state; the menu screen itself stays presentational.
 */
function continueRunHint(state: SoloRunState): string {
  switch (state.run.phase) {
    case 'victory':
      return 'Run complete. Review the result.';
    case 'defeat':
      return 'Run over. Review the result.';
    case 'battle':
    case 'reward':
    case 'overview':
      return `Encounter ${runEncounterNumber(state.run)} of ${
        RUN_ENCOUNTER_COUNT
      } · ${runCurrentHealth(state)} of ${RUN_MAX_HEALTH} health`;
  }
}

/* -------------------------------------------------------------------------- */
/* Local duel session                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The in-memory duel flow. Duels are intentionally ephemeral (DUEL-FR-05,
 * VIS-CON-03), so this state is never written to storage and a reload starts
 * again at the menu.
 *
 * `round` holds the live privacy-gated round controller state; the other
 * variants exist only after `recordRoundWinner` has scored a settled round.
 */
type DuelSession =
  | {
      readonly phase: 'round';
      readonly match: DuelMatch;
      readonly round: DuelRoundState;
    }
  | {
      readonly phase: 'round-result';
      /** Match after the winner was recorded: the next round or complete. */
      readonly match: DuelMatch;
      /** The round that just settled, for the result heading. */
      readonly round: DuelRound;
      readonly winner: DuelPlayer;
    }
  | { readonly phase: 'match-result'; readonly match: DuelMatch };

/**
 * Entry state for the test-only `duelMatch` seam. A complete match opens its
 * result; an in-progress match opens the privacy gate for its current round.
 */
function duelSessionFrom(match: DuelMatch | undefined): DuelSession | null {
  if (match === undefined) {
    return null;
  }

  if (match.phase === 'complete') {
    return { phase: 'match-result', match };
  }

  const created = createDuelRound(match);

  return created.ok
    ? { phase: 'round', match, round: created.value }
    : null;
}

/**
 * A fresh unsigned 32-bit match seed. Duels are local and ephemeral, so the
 * seed only needs to vary between series; the match model derives every round
 * seed and the rematch seed from it deterministically.
 */
let duelSeedCounter = 0;

function freshDuelSeed(): number {
  duelSeedCounter = (duelSeedCounter + 1) >>> 0;

  if (typeof globalThis.crypto !== 'undefined') {
    const draw = new Uint32Array(1);
    globalThis.crypto.getRandomValues(draw);

    const value = draw[0];

    if (value !== undefined) {
      return value;
    }
  }

  return (Date.now() ^ Math.imul(duelSeedCounter, 0x9e3779b1)) >>> 0;
}

export interface AppProps {
  /**
   * Test-only entry point: mount the composition root directly on a surface.
   * Read once at mount, mirroring a browser reload rather than an in-app jump.
   */
  readonly initialScreen?: Screen;
  /**
   * Test-only override for the Continue Run gate. Production omits it, so the
   * entry follows the boot-time save check and the live run state. `true` forces
   * the entry to render (the navigation suite uses it without a saved run);
   * `false` hides it even when a restored run exists.
   */
  readonly hasSave?: boolean;
  /**
   * Test-only: mount a controlled battle instead of the built-in practice
   * encounter. Production routes always use the practice battle until RUN-04
   * supplies the run's own battle.
   */
  readonly battleConfig?: BattleControllerConfig;
  /**
   * Test-only: replace the browser's storage for settings, or pass `null` to
   * simulate a browser where storage is unavailable. Production omits it.
   */
  readonly settingsStorage?: SettingsStorage | null;
  /**
   * Test-only: mount the duel flow from a prepared match instead of the setup
   * screen. A completed match opens the match result; an in-progress match
   * opens its privacy handoff. Production never passes it.
   */
  readonly duelMatch?: DuelMatch;
  /**
   * Test-only: replace the run save's storage, or pass `null` to simulate a
   * browser where storage is unavailable. Production omits it.
   */
  readonly runSaveStorage?: RunSaveStorage | null;
  /**
   * Test-only: replace the best-run record's storage, or pass `null` for none.
   * Production omits it.
   */
  readonly runStatsStorage?: StatsStorage | null;
  /**
   * Test-only: build a deterministic or weakened encounter instead of the real
   * ladder enemy. The run controller still owns the battle and the autosave;
   * production never passes it.
   */
  readonly soloEncounter?: SoloEncounterFactory;
  /**
   * Test-only: replace `crypto.getRandomValues` when a run is started without
   * `?seed=`. Production omits it.
   */
  readonly seedSource?: SeedSource | null;
}

export function App({
  initialScreen = INITIAL_SCREEN,
  hasSave,
  battleConfig,
  settingsStorage,
  duelMatch,
  runSaveStorage,
  runStatsStorage,
  soloEncounter,
  seedSource,
}: AppProps = {}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);

  // The whole duel exists only in this state. It is created on demand, holds
  // the privacy-gated round state, and is discarded on Menu or Change decks.
  const [duel, setDuel] = useState<DuelSession | null>(() =>
    duelSessionFrom(duelMatch),
  );

  // The one polite live region for the whole session. Screens publish a
  // settled message; the region replaces its text rather than appending, so a
  // transition is never read twice. An identical repeat is deduped.
  const [announcement, setAnnouncement] = useState('');

  const announce = useCallback((message: string) => {
    const next = message.trim();

    if (next === '') {
      return;
    }

    setAnnouncement((current) => (current === next ? current : next));
  }, []);

  /**
   * Move focus to the main landmark explicitly. A plain fragment link relies on
   * the browser's focus fix-up, which jsdom and some embedded browsers do not
   * perform; focusing the tabindex="-1" landmark makes the skip link work
   * everywhere without adding a positive tab index.
   */
  const skipToMain = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById('main-content');

    if (main === null) {
      return;
    }

    event.preventDefault();
    main.focus();

    if (typeof main.scrollIntoView === 'function') {
      main.scrollIntoView({ block: 'start' });
    }
  }, []);

  // The store is created once per mount; `load` validates before use and only
  // removes the settings key when the payload is unusable.
  const [settingsStore] = useState(() => createSettingsStore(settingsStorage));
  const [settings, setSettings] = useState<Settings>(() => settingsStore.load());
  const [storageAvailable, setStorageAvailable] = useState<boolean>(
    () => settingsStore.isPersistent,
  );

  // One engine per mount. It constructs no AudioContext until a gesture and
  // starts muted when the saved choice says so, so a mute survives a reload
  // without waking the audio hardware first.
  const [sfx] = useState(() => createSfxEngine({ initialMuted: settings.muted }));

  const reducedMotion = useReducedMotion(settings.reducedMotion);

  // Keep the engine's mute state in step with the setting, including the
  // initial load and any change made from another surface later.
  useEffect(() => {
    sfx.setMuted(settings.muted);
  }, [sfx, settings.muted]);

  // The cue bus is the only path from screens to sound. A subscriber cannot
  // throw through the bus, and no screen imports the audio module.
  useEffect(
    () =>
      uiEvents.subscribe((event) => {
        if (event.type === 'cue') {
          sfx.play(event.cue);
        }
      }),
    [sfx],
  );

  // Browsers require a gesture before audio may start. The listeners stay for
  // the session because unmuting after a muted boot needs a later gesture to
  // perform the actual unlock; `unlock()` is idempotent.
  useEffect(() => {
    const unlock = () => {
      sfx.unlock();
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [sfx]);

  useEffect(() => () => sfx.dispose(), [sfx]);

  const applySettings = useCallback(
    (next: Settings) => {
      setSettings(next);
      const persisted = settingsStore.save(next);

      if (!persisted) {
        setStorageAvailable(false);
      }
    },
    [settingsStore],
  );

  const navigate = useCallback((kind: ScreenKind) => {
    setScreen(SCREENS[kind]);
    // A stale announcement from the previous surface must not linger as if it
    // described the new one.
    setAnnouncement('');
    emitCue('ui');
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Duel intents                                                             */
  /* ------------------------------------------------------------------------ */

  const beginDuelSetup = useCallback(() => {
    setDuel(null);
    navigate('duel-setup');
  }, [navigate]);

  const leaveDuel = useCallback(() => {
    setDuel(null);
    navigate('menu');
  }, [navigate]);

  /**
   * Creates the privacy-gated round for `match` and shows the handoff. Every
   * round, including a rematch and the next round in a series, starts here.
   */
  const openRound = useCallback(
    (match: DuelMatch, message: string) => {
      const created = createDuelRound(match);

      if (!created.ok) {
        announce(`The duel could not continue: ${created.error.message}`);
        return;
      }

      setDuel({ phase: 'round', match, round: created.value });
      navigate('privacy');
      announce(message);
    },
    [announce, navigate],
  );

  const handleStartMatch = useCallback(
    (player1DeckId: string, player2DeckId: string) => {
      const created = createMatch({
        player1DeckId,
        player2DeckId,
        seed: freshDuelSeed(),
      });

      if (!created.ok) {
        announce(`The duel could not start: ${created.error.message}`);
        return;
      }

      openRound(
        created.value,
        `Pass the device to ${duelPlayerName(created.value.firstPlayer)}.`,
      );
    },
    [announce, openRound],
  );

  /** The only way past the privacy gate: an explicit ready action. */
  const handleDuelReady = useCallback(() => {
    if (duel?.phase !== 'round') {
      return;
    }

    const result = dismissDuelPrivacy(duel.round);

    if (!result.ok) {
      announce(result.error.message);
      return;
    }

    setDuel({ phase: 'round', match: duel.match, round: result.value });
    navigate('battle');

    const view = duelRoundView(result.value);

    if (view.kind === 'battle') {
      announce(
        `${duelPlayerName(view.viewer)}'s turn. Turn ${view.turn}.`,
      );
    }
  }, [announce, duel, navigate]);

  /**
   * Records a settled round and moves the flow to the next round or the match
   * result. Returns true when the round had settled, so callers do not also
   * redraw the finished battle.
   */
  const settleRound = useCallback(
    (match: DuelMatch, next: DuelRoundState): boolean => {
      if (next.phase !== 'complete') {
        return false;
      }

      const updated = recordRoundWinner(match, next.roundWinner);

      if (!updated.ok) {
        announce(`The round could not be scored: ${updated.error.message}`);
        return true;
      }

      if (updated.value.phase === 'complete') {
        setDuel({ phase: 'match-result', match: updated.value });
        navigate('match-result');
        announce(
          `${duelPlayerName(next.roundWinner)} wins the match. ${duelScoreText(
            updated.value.wins,
          )}.`,
        );
        return true;
      }

      setDuel({
        phase: 'round-result',
        match: updated.value,
        round: match.round,
        winner: next.roundWinner,
      });
      navigate('round-result');
      announce(
        `${duelPlayerName(next.roundWinner)} wins round ${
          match.round
        }. ${duelScoreText(updated.value.wins)}.`,
      );
      return true;
    },
    [announce, navigate],
  );

  const handleDuelPlay = useCallback(
    (instanceId: string) => {
      if (duel?.phase !== 'round') {
        return;
      }

      const result = playDuelCard(duel.round, instanceId);

      if (!result.ok) {
        announce(`That action was refused. ${result.error.message}`);
        return;
      }

      emitCue('card-play');

      if (settleRound(duel.match, result.value)) {
        return;
      }

      setDuel({ phase: 'round', match: duel.match, round: result.value });
      announce(`${duelPlayerName(duel.round.viewer)} played a card.`);
    },
    [announce, duel, settleRound],
  );

  const handleDuelEndTurn = useCallback(() => {
    if (duel?.phase !== 'round') {
      return;
    }

    const result = endDuelTurn(duel.round);

    if (!result.ok) {
      announce(`That action was refused. ${result.error.message}`);
      return;
    }

    if (settleRound(duel.match, result.value)) {
      return;
    }

    setDuel({ phase: 'round', match: duel.match, round: result.value });

    if (result.value.phase === 'privacy') {
      navigate('privacy');
      announce(`Pass the device to ${duelPlayerName(result.value.viewer)}.`);
    }
  }, [announce, duel, navigate, settleRound]);

  const handleNextRound = useCallback(() => {
    if (duel?.phase !== 'round-result') {
      return;
    }

    openRound(
      duel.match,
      `Pass the device to ${duelPlayerName(duel.match.firstPlayer)}.`,
    );
  }, [duel, openRound]);

  const handleRematch = useCallback(() => {
    if (duel?.phase !== 'match-result') {
      return;
    }

    const next = rematch(duel.match);

    if (!next.ok) {
      announce(`The rematch could not start: ${next.error.message}`);
      return;
    }

    openRound(
      next.value,
      `Pass the device to ${duelPlayerName(next.value.firstPlayer)}.`,
    );
  }, [announce, duel, openRound]);

  /* ------------------------------------------------------------------------ */
  /* Solo run intents                                                         */
  /* ------------------------------------------------------------------------ */

  // Boot-time resume (RUN-05). The store validates the payload before it is
  // used and removes only the run key when it is corrupt or foreign; a valid
  // save becomes the controller's starting state, so Continue Run can reopen
  // the exact screen the run was saved from. `useState` reads it once, mirroring
  // a browser reload rather than an in-app navigation.
  const [bootResume] = useState<RunResume>(() =>
    resumeRun(createRunSaveStore(runSaveStorage).load()),
  );

  // The run lives beside the screen union, like the duel: it is created on
  // demand or restored from a validated save, autosaves through its own store
  // and is discarded on New Run.
  const runController = useSoloRunController({
    initialState: bootResume.status === 'available' ? bootResume.state : null,
    ...(runSaveStorage === undefined ? {} : { saveStorage: runSaveStorage }),
    ...(runStatsStorage === undefined ? {} : { statsStorage: runStatsStorage }),
    ...(soloEncounter === undefined ? {} : { encounterSetup: soloEncounter }),
  });
  const runState = runController.state;
  const {
    start: startRun,
    playCard: playRunCard,
    endTurn: endRunTurn,
    chooseReward: chooseRunReward,
    nextBattle: nextRunBattle,
    reset: resetRun,
  } = runController;

  /** Start Run resolves `?seed=` once, then hands the seed to the controller. */
  const handleStartRun = useCallback(
    (element: FieldElement) => {
      const resolution = resolveRunSeed(window.location.search, seedSource);
      const attempt = startRun(element, resolution.seed);

      if (attempt.transition === null) {
        announce(
          `The run could not start: ${attempt.error?.message ?? 'unknown error'}`,
        );
        return;
      }

      navigate(attempt.transition.screen);

      const enemy = currentEnemy(attempt.transition.state.run);

      announce(
        `${enemy?.name ?? 'The first enemy'}, encounter 1 of ${RUN_ENCOUNTER_COUNT}.`,
      );
    },
    [announce, navigate, seedSource, startRun],
  );

  /**
   * Turn one controller intent into navigation, cues and one announcement.
   *
   * The battle screen emits and announces its own non-terminal transitions.
   * When an action settles the fight the board unmounts in the same commit, so
   * this function emits the report's final cues and announces the new phase
   * instead. A rejection during a fight is left to the board, which renders the
   * engine's message next to the hand.
   */
  const applyRunAttempt = useCallback(
    (attempt: SoloRunAttempt) => {
      if (attempt.transition === null) {
        if (attempt.error !== null) {
          announce(
            `That action could not be completed: ${attempt.error.message}`,
          );
        }

        return;
      }

      const next = attempt.transition;
      const previousScreen = screen.kind;

      if (previousScreen === 'battle' && next.screen !== 'battle') {
        for (const cue of next.cues) {
          emitCue(cue);
        }
      }

      if (next.screen !== previousScreen) {
        navigate(next.screen);
      }

      if (next.error !== null) {
        if (next.screen !== 'battle') {
          announce(`That action was refused: ${next.error.message}`);
        }

        return;
      }

      if (next.endedRun !== null) {
        announce(
          next.endedRun.phase === 'victory'
            ? 'Victory. The run is complete.'
            : 'Defeat. The run is over.',
        );
        return;
      }

      if (next.screen === 'reward') {
        announce('Victory. Choose one reward.');
        return;
      }

      if (next.screen === 'battle' && previousScreen !== 'battle') {
        const enemy = currentEnemy(next.state.run);

        announce(
          `${enemy?.name ?? 'The enemy'}, encounter ${runEncounterNumber(
            next.state.run,
          )} of ${RUN_ENCOUNTER_COUNT}.`,
        );
        return;
      }

      if (next.screen === 'run-overview' && previousScreen === 'reward') {
        announce(
          `Reward chosen. Encounter ${runEncounterNumber(
            next.state.run,
          )} of ${RUN_ENCOUNTER_COUNT} is ready.`,
        );
      }
    },
    [announce, navigate, screen],
  );

  const handleRunPlayCard = useCallback(
    (instanceId: string) => {
      applyRunAttempt(playRunCard(instanceId));
    },
    [applyRunAttempt, playRunCard],
  );

  const handleRunEndTurn = useCallback(() => {
    applyRunAttempt(endRunTurn());
  }, [applyRunAttempt, endRunTurn]);

  const handleChooseReward = useCallback(
    (index: number) => {
      applyRunAttempt(chooseRunReward(index));
    },
    [applyRunAttempt, chooseRunReward],
  );

  const handleRunOverview = useCallback(() => {
    navigate('run-overview');

    if (runState !== null) {
      const enemy = currentEnemy(runState.run);

      announce(
        `Run overview. Encounter ${runEncounterNumber(
          runState.run,
        )} of ${RUN_ENCOUNTER_COUNT}, ${enemy?.name ?? 'no enemy'}.`,
      );
    }
  }, [announce, navigate, runState]);

  /** Overview: start the shown encounter, or return to a live fight. */
  const handleOverviewNext = useCallback(() => {
    if (runState?.run.phase === 'battle') {
      navigate('battle');
      return;
    }

    applyRunAttempt(nextRunBattle());
  }, [applyRunAttempt, navigate, nextRunBattle, runState]);

  const handleNewRun = useCallback(() => {
    resetRun();
    navigate('solo-setup');
  }, [navigate, resetRun]);

  /**
   * Continue Run. The run is already restored at boot, so this intent only has
   * to reopen the screen the save was written from: battle, reward, overview or
   * result (RUN-05). A restored result screen reads the saved totals and never
   * re-records the best run.
   */
  const handleContinueRun = useCallback(() => {
    if (runState === null) {
      return;
    }

    navigate(screenForRun(runState));

    switch (runState.run.phase) {
      case 'battle': {
        const enemy = currentEnemy(runState.run);
        announce(
          `${enemy?.name ?? 'The enemy'}, encounter ${runEncounterNumber(
            runState.run,
          )} of ${RUN_ENCOUNTER_COUNT}.`,
        );
        return;
      }
      case 'reward':
        announce('Choose one reward.');
        return;
      case 'overview':
        announce(
          `Run overview. Encounter ${runEncounterNumber(
            runState.run,
          )} of ${RUN_ENCOUNTER_COUNT}.`,
        );
        return;
      case 'victory':
        announce('Run complete.');
        return;
      case 'defeat':
        announce('Run over.');
        return;
    }
  }, [announce, navigate, runState]);

  const handleSoundChange = useCallback(
    (enabled: boolean) => {
      const next: Settings = { ...settings, muted: !enabled };
      applySettings(next);
      sfx.setMuted(next.muted);

      // Unmuting is itself a gesture: unlock now rather than making the player
      // press a second control before the first cue can sound.
      if (!next.muted) {
        sfx.unlock();
      }
    },
    [applySettings, settings, sfx],
  );

  const handleReducedMotionChange = useCallback(
    (reduced: boolean) => {
      applySettings({ ...settings, reducedMotion: reduced });
    },
    [applySettings, settings],
  );

  const battle = battleConfig ?? PRACTICE_BATTLE_CONFIG;

  // Redacted view of the live duel round. `null` whenever no round is running,
  // so every non-duel route keeps rendering its own surface.
  const duelView = duel?.phase === 'round' ? duelRoundView(duel.round) : null;
  const duelMatchWinner =
    duel?.phase === 'match-result' ? matchWinner(duel.match) : null;

  // Solo facts derived from the run phase. Only a battle-phase run has a board,
  // and only a terminal run has a result summary.
  const soloBattle =
    runState !== null && runState.run.phase === 'battle'
      ? runState.battle
      : null;
  const soloSummary = runState === null ? null : runSummary(runState.run);

  // Continue Run is offered only when a run actually exists: either restored
  // from a validated boot save or still live in this session (RUN-05). The
  // test-only `hasSave` prop can force the gate for the navigation suite.
  const showContinueRun = hasSave ?? (runState !== null);

  const routes: { readonly [Kind in ScreenKind]: ReactNode } = {
    menu: (
      <MenuScreen
        hasSave={showContinueRun}
        {...(runState === null ? {} : { resumeHint: continueRunHint(runState) })}
        onPlaySolo={() => navigate('solo-setup')}
        onLocalDuel={beginDuelSetup}
        onContinueRun={handleContinueRun}
        onHowToPlay={() => navigate('how-to-play')}
        onSettings={() => navigate('settings')}
      />
    ),
    'how-to-play': <HowToPlayScreen onBack={() => navigate('menu')} />,
    settings: (
      <SettingsScreen
        muted={settings.muted}
        reducedMotion={reducedMotion}
        reducedMotionSource={
          settings.reducedMotion === null ? 'system' : 'setting'
        }
        storageAvailable={storageAvailable}
        onSoundChange={handleSoundChange}
        onReducedMotionChange={handleReducedMotionChange}
        onBack={() => navigate('menu')}
      />
    ),
    'solo-setup': (
      <SoloSetupScreen
        decks={STARTER_DECKS}
        cards={cardCatalog}
        onStart={handleStartRun}
        onBack={() => navigate('menu')}
      />
    ),
    'run-overview':
      runState === null ? (
        <RunUnavailable title="Run overview" onBack={() => navigate('menu')} />
      ) : (
        <RunOverviewScreen
          progress={runProgress(runState.run)}
          encounterNumber={runEncounterNumber(runState.run)}
          encounterTotal={RUN_ENCOUNTER_COUNT}
          health={runCurrentHealth(runState)}
          maxHealth={RUN_MAX_HEALTH}
          deckSize={runState.run.deck.length}
          turnsTotal={runState.run.turnsTotal}
          nextEnemy={currentEnemy(runState.run)}
          baseUrl={import.meta.env.BASE_URL}
          mode={runState.run.phase === 'battle' ? 'battle' : 'between'}
          onNextBattle={handleOverviewNext}
          onMenu={() => navigate('menu')}
        />
      ),
    battle:
      duelView?.kind === 'battle' ? (
        <DuelBattleRoute
          view={duelView}
          cards={cardCatalog}
          fieldMatchup={fieldMatchupFor(duelView.field)}
          baseUrl={import.meta.env.BASE_URL}
          onPlayCard={handleDuelPlay}
          onEndTurn={handleDuelEndTurn}
          onExit={leaveDuel}
        />
      ) : soloBattle !== null ? (
        <SoloBattleRoute
          state={soloBattle}
          onPlayCard={handleRunPlayCard}
          onEndTurn={handleRunEndTurn}
          onAnnounce={announce}
          onExit={() => navigate('menu')}
          onOverview={handleRunOverview}
        />
      ) : (
        <BattleRoute
          config={battle}
          onAnnounce={announce}
          onExit={() => navigate('menu')}
        />
      ),
    reward:
      runState === null ||
      runState.run.phase !== 'reward' ||
      runState.offers === null ? (
        <RunUnavailable title="Reward" onBack={() => navigate('menu')} />
      ) : (
        <RewardScreen
          offers={runState.offers}
          cards={cardCatalog}
          baseUrl={import.meta.env.BASE_URL}
          health={runState.run.health}
          maxHealth={RUN_MAX_HEALTH}
          onChoose={handleChooseReward}
        />
      ),
    'run-result':
      runState === null || soloSummary === null ? (
        <RunUnavailable title="Run result" onBack={() => navigate('menu')} />
      ) : (
        <RunResultScreen
          summary={soloSummary}
          stats={runState.stats}
          onNewRun={handleNewRun}
          onMenu={() => navigate('menu')}
        />
      ),
    'duel-setup': (
      <DuelSetupScreen
        decks={STARTER_DECKS}
        onStartMatch={handleStartMatch}
        onBack={leaveDuel}
      />
    ),
    privacy:
      duelView?.kind === 'privacy' ? (
        <PrivacyScreen viewer={duelView.viewer} onReady={handleDuelReady} />
      ) : (
        <DuelUnavailable title="Privacy handoff" onBack={leaveDuel} />
      ),
    'round-result':
      duel?.phase === 'round-result' ? (
        <RoundResultScreen
          round={duel.round}
          winner={duel.winner}
          wins={duel.match.wins}
          onNextRound={handleNextRound}
        />
      ) : (
        <DuelUnavailable title="Round result" onBack={leaveDuel} />
      ),
    'match-result':
      duel?.phase === 'match-result' && duelMatchWinner !== null ? (
        <MatchResultScreen
          winner={duelMatchWinner}
          wins={duel.match.wins}
          onRematch={handleRematch}
          onChangeDecks={beginDuelSetup}
          onMenu={leaveDuel}
        />
      ) : (
        <DuelUnavailable title="Match result" onBack={leaveDuel} />
      ),
  };

  return (
    <div
      className="app-root"
      id="app-root"
      data-reduced-motion={reducedMotionAttribute(reducedMotion)}
    >
      <LiveRegion message={announcement} />

      <a className="skip-link" href="#main-content" onClick={skipToMain}>
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
  onAnnounce,
  onExit,
}: {
  readonly config: BattleControllerConfig | null;
  readonly onAnnounce: (message: string) => void;
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

  return (
    <BattleSession
      initialState={initial.value}
      onAnnounce={onAnnounce}
      onExit={onExit}
    />
  );
}

/** Keeps the hooks unconditional: mounted only once a battle exists. */
function BattleSession({
  initialState,
  onAnnounce,
  onExit,
}: {
  readonly initialState: BattleControllerState;
  readonly onAnnounce: (message: string) => void;
  readonly onExit: () => void;
}) {
  const controller = useBattleController(initialState);
  const { battle } = controller.state;
  const canEndTurn =
    battle.outcome === 'ongoing' &&
    battle.phase === 'action' &&
    battle.activeSide === 'player';

  // Keyboard-only play: E ends the turn unless a text field or a modal dialog
  // owns focus. Disabled once the battle settles, so the shortcut cannot fire
  // a rejection on the victory panel.
  useKeyboardControls({ onEndTurn: controller.endTurn, enabled: canEndTurn });

  return (
    <BattleScreen
      state={controller.state}
      baseUrl={import.meta.env.BASE_URL}
      onPlayCard={controller.playCard}
      onEndTurn={controller.endTurn}
      onAnnounce={onAnnounce}
      onExit={onExit}
    />
  );
}

/**
 * The live solo board. Unlike the standalone practice battle, the reducer state
 * comes from the run controller; this wrapper only adds the app-wide E shortcut
 * and the optional route back to the run overview.
 */
function SoloBattleRoute({
  state,
  onPlayCard,
  onEndTurn,
  onAnnounce,
  onExit,
  onOverview,
}: {
  readonly state: BattleControllerState;
  readonly onPlayCard: (instanceId: string) => void;
  readonly onEndTurn: () => void;
  readonly onAnnounce: (message: string) => void;
  readonly onExit: () => void;
  readonly onOverview: () => void;
}) {
  const { battle } = state;
  const canEndTurn =
    battle.outcome === 'ongoing' &&
    battle.phase === 'action' &&
    battle.activeSide === 'player';

  useKeyboardControls({ onEndTurn, enabled: canEndTurn });

  return (
    <BattleScreen
      state={state}
      baseUrl={import.meta.env.BASE_URL}
      onPlayCard={onPlayCard}
      onEndTurn={onEndTurn}
      onAnnounce={onAnnounce}
      onExit={onExit}
      onOverview={onOverview}
    />
  );
}

/**
 * The duel battle route adds the same app-wide E shortcut the solo board uses.
 * The privacy handoff is a separate screen with its own modal listener, so E
 * can never skip or settle a turn while the device is being passed.
 */
function DuelBattleRoute({
  onEndTurn,
  ...screenProps
}: DuelBattleScreenProps) {
  useKeyboardControls({ onEndTurn, enabled: true });

  return <DuelBattleScreen onEndTurn={onEndTurn} {...screenProps} />;
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
 * Reachable only through the `initialScreen` test seam or a transient
 * navigation mismatch: a duel surface mounted with no live duel. It never
 * advertises a resumable duel, because duels are not persisted (DUEL-FR-05).
 */
function DuelUnavailable({
  title,
  onBack,
}: {
  readonly title: string;
  readonly onBack: () => void;
}) {
  return (
    <section className="shell__panel" aria-labelledby="duel-unavailable-title">
      <h1 className="shell__page-title" id="duel-unavailable-title">
        {title}
      </h1>
      <p className="shell__copy">
        No duel is in progress. Duels are never saved, so start a new one from
        the menu.
      </p>
      <p>
        <button type="button" className="shell__button" onClick={onBack}>
          Back to menu
        </button>
      </p>
    </section>
  );
}

/**
 * A solo surface mounted with no live run. This is reachable through the
 * `initialScreen` test seam or a transient navigation mismatch; it never claims
 * a run exists and offers the menu instead.
 */
function RunUnavailable({
  title,
  onBack,
}: {
  readonly title: string;
  readonly onBack: () => void;
}) {
  return (
    <section className="shell__panel" aria-labelledby="run-unavailable-title">
      <h1 className="shell__page-title" id="run-unavailable-title">
        {title}
      </h1>
      <p className="shell__copy">
        No solo run is in progress. Start one from the menu to reach this
        surface.
      </p>
      <p>
        <button type="button" className="shell__button" onClick={onBack}>
          Back to menu
        </button>
      </p>
    </section>
  );
}
