/**
 * Two-step local-duel deck setup (duel-flow section 2, OVERHAUL 6.9;
 * DUEL-FR-01, VIS-US-02).
 *
 * The setup is the solo physical deck table with one extra secret: Player 1
 * chooses behind a "Player 2, look away" banner, and Player 2's step replaces
 * Player 1's pick with a sealed card-back marker that carries no deck name,
 * element, colour or naming `data-*`. Both decks are revealed only on the
 * summary that follows the second confirmation.
 *
 * The shared `DeckTable` owns the four deck cards, their ten printed names, the
 * `Choose the <Deck> deck` contract and the `aria-pressed` selection. This
 * screen owns the step machine, the step banner, the sealed marker, the locked
 * summary and the sticky action bar.
 *
 * Focus follows duel-flow section 6.1: the route `h1` receives focus on mount
 * from the app's route-focus rule, and every deliberate step change moves focus
 * to the new step (or summary) `h2` so the question is announced without
 * moving past it. Re-renders and selection changes never move focus.
 *
 * The screen is presentational: it reports the locked ids once through
 * `onStartMatch`, reports deliberate copy changes through `onAnnounce` for the
 * one app-wide polite region, and imports no engine, controller or storage
 * module.
 */
import { useEffect, useRef, useState } from 'react';
import type { DeckDefinition } from '../../engine/types';
import '../../styles/tokens.css';
import '../../styles/solo.css';
import '../../styles/duel.css';
import { DeckTable } from '../components/DeckTable';
import type { CardCatalogView } from '../components/view-types';

type SetupStep = 'player1' | 'player2' | 'summary';

export interface DuelSetupScreenProps {
  /** The four frozen starter decks, in documented order. */
  readonly decks: readonly DeckDefinition[];
  /** Read-only card lookup for the deck table's printed card names. */
  readonly cards: CardCatalogView;
  /** Both ids are locked when this fires; the caller owns the match. */
  readonly onStartMatch: (player1DeckId: string, player2DeckId: string) => void;
  /** Return to the menu and discard any partial choice. */
  readonly onBack: () => void;
  /**
   * Optional hook for the composition root: one polite line per deliberate
   * change (a selection, the step change or the locked summary). The screen
   * never mounts a live region of its own.
   */
  readonly onAnnounce?: (message: string) => void;
}

const NO_SELECTION_HINT = 'Select one of the four decks to enable Confirm.';

export function DuelSetupScreen({
  decks,
  cards,
  onStartMatch,
  onBack,
  onAnnounce,
}: DuelSetupScreenProps) {
  const [step, setStep] = useState<SetupStep>('player1');
  const [selection, setSelection] = useState<string | null>(null);
  const [player1DeckId, setPlayer1DeckId] = useState<string | null>(null);
  const [player2DeckId, setPlayer2DeckId] = useState<string | null>(null);

  // Focus is moved only on a deliberate step change, never on the first mount
  // (the route h1 already owns that) and never on a selection re-render.
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  // Start Match dispatches exactly once even before the route swaps.
  const startedRef = useRef(false);
  const [starting, setStarting] = useState(false);

  const player1Deck = decks.find((deck) => deck.id === player1DeckId);
  const player2Deck = decks.find((deck) => deck.id === player2DeckId);
  const bothLocked = player1DeckId !== null && player2DeckId !== null;

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    stepHeadingRef.current?.focus();
  }, [step]);

  const announce = (message: string) => {
    onAnnounce?.(message);
  };

  const select = (deckId: string) => {
    const deck = decks.find((candidate) => candidate.id === deckId);

    if (deck === undefined) {
      return;
    }

    setSelection(deck.id);
    announce(
      `${deck.name} deck selected. ${
        step === 'player1' ? 'Confirm Player 1 deck' : 'Confirm Player 2 deck'
      } is enabled.`,
    );
  };

  const confirmPlayer1 = () => {
    if (selection === null) {
      return;
    }

    setPlayer1DeckId(selection);
    setSelection(null);
    setStep('player2');
    announce('Player 2, choose your deck.');
  };

  const confirmPlayer2 = () => {
    if (selection === null) {
      return;
    }

    setPlayer2DeckId(selection);
    setSelection(null);
    setStep('summary');
    announce('Both decks are locked. Start Match is ready.');
  };

  const startMatch = () => {
    if (player1DeckId === null || player2DeckId === null || startedRef.current) {
      return;
    }

    startedRef.current = true;
    setStarting(true);
    onStartMatch(player1DeckId, player2DeckId);
  };

  const stepNumber = step === 'player1' ? 1 : 2;
  const selectedDeck = decks.find((deck) => deck.id === selection) ?? null;
  const confirmLabel =
    step === 'player1' ? 'Confirm Player 1 deck' : 'Confirm Player 2 deck';

  const hint =
    step === 'summary'
      ? 'Both decks are locked for this match.'
      : selectedDeck === null
        ? NO_SELECTION_HINT
        : `${selectedDeck.name} deck selected.`;

  return (
    <section className="duel-setup" aria-labelledby="duel-setup-title">
      <header className="duel-setup__head">
        <p className="shell__eyebrow">Local Duel</p>
        <h1 className="shell__page-title" id="duel-setup-title">
          Local Duel
        </h1>
        <p className="shell__copy">
          Best of three, pass and play on one device. Each player locks one of
          the four starter decks.
        </p>
      </header>

      {step === 'summary' ? (
        <section
          className="duel-setup__step duel-setup__summary"
          aria-labelledby="duel-summary-title"
        >
          <h2
            className="duel-setup__title"
            id="duel-summary-title"
            tabIndex={-1}
            ref={stepHeadingRef}
          >
            Both decks are locked
          </h2>
          <p className="shell__copy">
            These choices stay fixed for the whole match, including a rematch.
          </p>

          <ul className="duel-setup__locked" aria-label="Locked decks">
            <LockedDeck
              player="Player 1"
              deck={player1Deck}
              cards={cards}
            />
            <LockedDeck
              player="Player 2"
              deck={player2Deck}
              cards={cards}
            />
          </ul>

          <ul className="duel-setup__picks">
            <li className="duel-setup__pick">
              Player 1: {player1Deck?.name ?? 'not chosen'}
            </li>
            <li className="duel-setup__pick">
              Player 2: {player2Deck?.name ?? 'not chosen'}
            </li>
          </ul>
        </section>
      ) : (
        <section className="duel-setup__step" aria-labelledby="duel-step-title">
          <p className="duel-setup__step-label">Step {stepNumber} of 2</p>

          {step === 'player1' ? (
            <h2
              className="duel-setup__title"
              id="duel-step-title"
              tabIndex={-1}
              ref={stepHeadingRef}
            >
              Player 1, choose your deck
            </h2>
          ) : (
            <h2
              className="duel-setup__title"
              id="duel-step-title"
              tabIndex={-1}
              ref={stepHeadingRef}
            >
              Player 2, choose your deck
            </h2>
          )}

          <p className="duel-setup__callout">
            {step === 'player1'
              ? 'Player 2, look away.'
              : 'Player 1 has chosen.'}
          </p>

          <p className="shell__copy">
            {step === 'player1'
              ? 'Player 1 picks first. Both decks stay hidden until Player 2 confirms.'
              : 'Player 2 picks now. Both decks are revealed only after this confirmation.'}
          </p>

          {step === 'player2' ? <SealedPickMarker /> : null}

          <DeckTable
            decks={decks}
            cards={cards}
            selection={selection}
            onSelect={select}
            label="Starter decks"
            idPrefix="duel-setup"
          />
        </section>
      )}

      <div className="duel-bar">
        <div className="duel-bar__inner">
          <p className="duel-bar__status" id="duel-setup-hint">
            {step === 'summary' ? null : (
              <span aria-hidden="true">✓ </span>
            )}
            {hint}
          </p>

          <div className="duel-bar__actions">
            {step === 'summary' ? (
              <button
                type="button"
                className="shell__button duel-bar__primary"
                onClick={startMatch}
                disabled={!bothLocked || starting}
                aria-describedby="duel-setup-hint"
              >
                Start Match
              </button>
            ) : (
              <button
                type="button"
                className="shell__button duel-bar__primary"
                onClick={step === 'player1' ? confirmPlayer1 : confirmPlayer2}
                disabled={selection === null}
                aria-describedby="duel-setup-hint"
              >
                {confirmLabel}
              </button>
            )}

            <button type="button" className="shell__back" onClick={onBack}>
              Back to menu
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The step-2 sealed marker (duel-flow section 2.1). One neutral card back and
 * two lines; no deck name, element, element colour, `aria-label` or naming
 * `data-*` is rendered, so the marker cannot identify Player 1's pick.
 */
function SealedPickMarker() {
  return (
    <div className="duel-sealed" data-duel-sealed="true">
      <span className="duel-sealed__back" aria-hidden="true" data-duel-card-back="" />
      <div className="duel-sealed__body">
        <p className="duel-sealed__title">Player 1&apos;s deck is locked</p>
        <p className="duel-sealed__hint">
          No name is shown until both decks are locked.
        </p>
      </div>
    </div>
  );
}

/**
 * One compact locked-deck card on the summary. It is not a button: the choice
 * is fixed for the match, so there is nothing to activate. The card back is
 * decorative; the deck name and counts are the accessible value.
 */
function LockedDeck({
  player,
  deck,
  cards,
}: {
  readonly player: 'Player 1' | 'Player 2';
  readonly deck: DeckDefinition | undefined;
  readonly cards: CardCatalogView;
}) {
  if (deck === undefined) {
    return (
      <li className="duel-locked" data-player={player}>
        <span className="duel-locked__back" aria-hidden="true" data-duel-card-back="" />
        <p className="duel-locked__body">
          <span className="duel-locked__player">{player}</span>
          <span className="duel-locked__unavailable">Deck unavailable</span>
        </p>
      </li>
    );
  }

  const shifts = deck.cards.filter(
    (cardId) => cards[cardId]?.type === 'shift',
  ).length;

  return (
    <li className="duel-locked" data-player={player}>
      <span className="duel-locked__back" aria-hidden="true" data-duel-card-back="" />
      <p className="duel-locked__body">
        <span className="duel-locked__player">{player}</span>
        <span className="duel-locked__name">{deck.name}</span>
        <span className="duel-locked__meta">
          {deck.cards.length} cards · {shifts} Shift cards
        </span>
      </p>
    </li>
  );
}
