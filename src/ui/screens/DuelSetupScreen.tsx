/**
 * Two-step local-duel deck setup (DUEL-FR-01, VIS-US-02).
 *
 * Player 1 chooses and confirms behind a "Player 2, look away" callout, then
 * Player 2 chooses from the same four starter decks. The second step never
 * marks, restates or otherwise reveals Player 1's pick; both decks become
 * visible only on the summary that follows the second confirmation. Leaving
 * the surface discards the partial choice because the selection state lives
 * inside this component and unmounts with it.
 *
 * The screen is presentational: it receives the frozen deck catalog and reports
 * one typed intent, `onStartMatch`, once both ids are locked. It imports no
 * engine, duel controller or storage module.
 */
import { useState } from 'react';
import type { DeckDefinition } from '../../engine/types';
import '../../styles/tokens.css';
import '../../styles/duel.css';
import { ElementCue } from '../components/ElementCue';

type SetupStep = 'player1' | 'player2' | 'summary';

export interface DuelSetupScreenProps {
  /** The four frozen starter decks, in documented order. */
  readonly decks: readonly DeckDefinition[];
  /** Both ids are locked when this fires; the caller owns the match. */
  readonly onStartMatch: (player1DeckId: string, player2DeckId: string) => void;
  /** Return to the menu and discard any partial choice. */
  readonly onBack: () => void;
}

export function DuelSetupScreen({
  decks,
  onStartMatch,
  onBack,
}: DuelSetupScreenProps) {
  const [step, setStep] = useState<SetupStep>('player1');
  const [selection, setSelection] = useState<string | null>(null);
  const [player1DeckId, setPlayer1DeckId] = useState<string | null>(null);
  const [player2DeckId, setPlayer2DeckId] = useState<string | null>(null);

  const player1Deck = decks.find((deck) => deck.id === player1DeckId);
  const player2Deck = decks.find((deck) => deck.id === player2DeckId);
  const bothLocked = player1DeckId !== null && player2DeckId !== null;

  const select = (deckId: string) => {
    setSelection(deckId);
  };

  const confirmPlayer1 = () => {
    if (selection === null) {
      return;
    }

    setPlayer1DeckId(selection);
    setSelection(null);
    setStep('player2');
  };

  const confirmPlayer2 = () => {
    if (selection === null) {
      return;
    }

    setPlayer2DeckId(selection);
    setSelection(null);
    setStep('summary');
  };

  const startMatch = () => {
    if (player1DeckId === null || player2DeckId === null) {
      return;
    }

    onStartMatch(player1DeckId, player2DeckId);
  };

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

      {step === 'player1' ? (
        <DeckStep
          title="Player 1, choose your deck"
          callout="Player 2, look away."
          copy="Player 1 picks first. Both decks stay hidden until Player 2 confirms."
          stepLabel="Step 1 of 2"
          decks={decks}
          selection={selection}
          onSelect={select}
          onConfirm={confirmPlayer1}
          confirmLabel="Confirm Player 1 deck"
        />
      ) : null}

      {step === 'player2' ? (
        <DeckStep
          title="Player 2, choose your deck"
          callout="Player 1 has chosen."
          copy="Player 2 picks now. Both decks are revealed only after this confirmation."
          stepLabel="Step 2 of 2"
          decks={decks}
          selection={selection}
          onSelect={select}
          onConfirm={confirmPlayer2}
          confirmLabel="Confirm Player 2 deck"
        />
      ) : null}

      {step === 'summary' ? (
        <section
          className="shell__panel duel-setup__summary"
          aria-labelledby="duel-summary-title"
        >
          <h2 className="shell__panel-title" id="duel-summary-title">
            Both decks are locked
          </h2>
          <p className="shell__copy">
            These choices stay fixed for the whole match, including a rematch.
          </p>

          <ul className="duel-setup__picks">
            <li className="duel-setup__deck-line">
              Player 1: {player1Deck?.name ?? 'not chosen'}
            </li>
            <li className="duel-setup__deck-line">
              Player 2: {player2Deck?.name ?? 'not chosen'}
            </li>
          </ul>

          <button
            type="button"
            className="shell__button duel-setup__start"
            onClick={startMatch}
            disabled={!bothLocked}
          >
            Start Match
          </button>
        </section>
      ) : null}

      <p className="duel-setup__footer">
        <button type="button" className="shell__back" onClick={onBack}>
          Back to menu
        </button>
      </p>
    </section>
  );
}

interface DeckStepProps {
  readonly title: string;
  readonly callout: string;
  readonly copy: string;
  readonly stepLabel: string;
  readonly decks: readonly DeckDefinition[];
  readonly selection: string | null;
  readonly onSelect: (deckId: string) => void;
  readonly onConfirm: () => void;
  readonly confirmLabel: string;
}

function DeckStep({
  title,
  callout,
  copy,
  stepLabel,
  decks,
  selection,
  onSelect,
  onConfirm,
  confirmLabel,
}: DeckStepProps) {
  return (
    <section className="duel-setup__step" aria-labelledby="duel-step-title">
      <p className="duel-setup__step-label">{stepLabel}</p>
      <h2 className="shell__panel-title" id="duel-step-title">
        {title}
      </h2>
      <p className="duel-setup__callout">{callout}</p>
      <p className="shell__copy">{copy}</p>

      <ul className="duel-decks">
        {decks.map((deck) => {
          const selected = selection === deck.id;

          return (
            <li key={deck.id}>
              <button
                type="button"
                className="duel-deck"
                aria-pressed={selected}
                aria-label={`Choose the ${deck.name} deck`}
                onClick={() => onSelect(deck.id)}
              >
                <span className="duel-deck__name">{deck.name}</span>
                <span className="duel-deck__meta">
                  <ElementCue element={deck.element} />
                  <span>{deck.cards.length} cards</span>
                </span>
                {selected ? (
                  <span className="duel-deck__state">Selected</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="shell__button duel-setup__confirm"
        onClick={onConfirm}
        disabled={selection === null}
      >
        {confirmLabel}
      </button>
    </section>
  );
}
