/**
 * The rules reference (reading-screens section 3).
 *
 * This screen is prose, not logic: it explains the turn sequence, the three
 * energy rule, the shared field cycle, persistent defense, the three statuses
 * and both modes. Every number here is documentation of the engine contract; no
 * damage, draw or affordability computation lives in the component.
 *
 * Presentation only. The document is one 42rem parchment sheet on the slate
 * table; the masthead sits above it, never on paper. The copy is verbatim: the
 * redesign changes how the same facts look, never what they say.
 *
 * The contents surface is the one deliberate interaction addition. At 1024px and
 * above it is a sticky rail in column one; below that it is a 44px sticky
 * `Contents` disclosure that pushes the sheet down rather than covering it.
 * Activating a link prevents the hash, focuses the target `h2` and closes the
 * disclosure; Escape closes it and returns focus to the button. There is no
 * scroll-spy and no `aria-current`: the contents describe the page, they do not
 * track it.
 */
import { useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { ELEMENT_DISPLAY } from '../components/ElementCue';
import type { Element } from '../../engine/types';
import '../../styles/document.css';

export interface HowToPlayScreenProps {
  readonly onBack: () => void;
}

interface SectionLink {
  readonly id: string;
  readonly label: string;
}

/** The six anchored sections, in reading order. */
const SECTIONS: readonly SectionLink[] = [
  { id: 'rules-turn-title', label: 'A turn in three steps' },
  { id: 'rules-energy-title', label: 'Energy' },
  { id: 'rules-field-title', label: 'The field cycle' },
  { id: 'rules-defense-title', label: 'Defense' },
  { id: 'rules-status-title', label: 'Statuses' },
  { id: 'rules-modes-title', label: 'Modes' },
];

interface CycleStep {
  readonly from: Element;
  readonly to: Element;
}

/** Ember beats Frost, Frost beats Gale, Gale beats Stone, Stone beats Ember. */
const CYCLE: readonly CycleStep[] = [
  { from: 'ember', to: 'frost' },
  { from: 'frost', to: 'gale' },
  { from: 'gale', to: 'stone' },
  { from: 'stone', to: 'ember' },
];

function ElementSeal({ element }: { readonly element: Element }) {
  const display = ELEMENT_DISPLAY[element];

  return (
    <span className="field-cycle__seal" data-element={element}>
      <span className="field-cycle__glyph">{display.glyph}</span>
      <span className="field-cycle__name">{display.label}</span>
    </span>
  );
}

export function HowToPlayScreen({ onBack }: HowToPlayScreenProps) {
  const [contentsOpen, setContentsOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  /**
   * Jump, do not navigate: the hash is never written, no history entry is
   * created and the router is not involved. Focus is what scrolls the heading
   * into view, and `scroll-margin-top` keeps it clear of the sticky strip.
   */
  const jumpTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    setContentsOpen(false);

    const heading = document.getElementById(id);

    if (heading !== null) {
      heading.focus();
    }
  };

  const handleContentsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !contentsOpen) {
      return;
    }

    event.preventDefault();
    setContentsOpen(false);
    toggle.current?.focus();
  };

  return (
    <div className="document">
      <header className="document__masthead">
        <div className="document__masthead-line">
          <p className="document__eyebrow">Rules reference</p>
          <button type="button" className="document__back" onClick={onBack}>
            Back
          </button>
        </div>
        <h1 className="document__title">How to Play</h1>
        <p className="document__tagline">
          Take your opponent to 0 health. The shared field decides how hard that
          is.
        </p>
      </header>

      <nav
        className="contents"
        aria-label="On this page"
        data-open={contentsOpen ? 'true' : 'false'}
        onKeyDown={handleContentsKeyDown}
      >
        <div className="contents__bar">
          <button
            type="button"
            className="contents__toggle"
            aria-expanded={contentsOpen}
            aria-controls="how-to-play-contents"
            ref={toggle}
            onClick={() => setContentsOpen((open) => !open)}
          >
            <span className="contents__toggle-glyph" aria-hidden="true">
              ☰
            </span>
            Contents
          </button>
          <span className="contents__count">6 sections</span>
        </div>

        <ol className="contents__list" id="how-to-play-contents">
          {SECTIONS.map((section) => (
            <li className="contents__item" key={section.id}>
              <a
                className="contents__link"
                href={`#${section.id}`}
                onClick={(event) => jumpTo(event, section.id)}
              >
                <span className="contents__bullet" aria-hidden="true">
                  ◆
                </span>
                {section.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="document__sheet">
        <section className="document__section" aria-labelledby="rules-turn-title">
          <h2 className="document__heading" id="rules-turn-title" tabIndex={-1}>
            A turn in three steps
          </h2>
          <ol className="rules__steps">
            <li className="rules__step">
              <span className="rules__step-seal" aria-hidden="true">
                1
              </span>
              <span className="rules__step-body">
                <strong>Turn start.</strong> Your energy resets to three, Regen
                heals 2, and you draw back up to five cards.
              </span>
            </li>
            <li className="rules__step">
              <span className="rules__step-seal" aria-hidden="true">
                2
              </span>
              <span className="rules__step-body">
                <strong>Actions.</strong> Play any affordable cards in any order.
                Energy is spent the moment a card resolves.
              </span>
            </li>
            <li className="rules__step">
              <span className="rules__step-seal" aria-hidden="true">
                3
              </span>
              <span className="rules__step-body">
                <strong>Turn end.</strong> Your remaining hand is discarded and
                the other side takes over.
              </span>
            </li>
          </ol>
        </section>

        <section
          className="document__section document__section--drop"
          aria-labelledby="rules-energy-title"
        >
          <h2 className="document__heading" id="rules-energy-title" tabIndex={-1}>
            Energy
          </h2>
          <p>
            You get three energy at the start of every turn, and unspent energy
            never carries over. A card&rsquo;s cost is the number in its corner;
            when you cannot pay it, the card is disabled.
          </p>
          <p>
            Cards that grant energy can push you above three for the current
            turn only. Five cards are drawn each turn, so a card you cannot
            afford this turn is still yours next turn.
          </p>
        </section>

        <section className="document__section" aria-labelledby="rules-field-title">
          <h2 className="document__heading" id="rules-field-title" tabIndex={-1}>
            The field cycle
          </h2>
          <p>
            One field is shared by both sides. It never rotates on its own;
            only Shift cards change it.
          </p>
          <ul className="rules__cycle">
            {CYCLE.map((step) => (
              <li
                className="rules__cycle-step"
                key={`${step.from}-${step.to}`}
                data-element={step.from}
              >
                <span className="field-cycle__pair" aria-hidden="true">
                  <ElementSeal element={step.from} />
                  <span className="field-cycle__arrow">→</span>
                  <ElementSeal element={step.to} />
                </span>
                <span className="rules__cycle-beats">
                  {ELEMENT_DISPLAY[step.from].label} beats{' '}
                  {ELEMENT_DISPLAY[step.to].label}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Ember, Frost, Gale and Stone form the four-step cycle. Neutral sits
            outside it and empowers and counters nothing.
          </p>
          <p>
            <strong>Empowered:</strong> an attack that matches the field deals
            +2 damage and pierces defense. A Ward that matches the field gains
            +2 defense.
          </p>
          <p>
            <strong>Countered:</strong> an attack the field beats is halved,
            rounded up and never below 1, and it cannot pierce even when the card
            has the Pierce keyword.
          </p>
        </section>

        <section className="document__section" aria-labelledby="rules-defense-title">
          <h2
            className="document__heading"
            id="rules-defense-title"
            tabIndex={-1}
          >
            Defense
          </h2>
          <p>
            Defense is flat damage reduction that stays for the whole battle.
            Incoming attacks are reduced by its value and the armor itself is not
            worn down.
          </p>
          <p className="rules__callout">
            It caps at 8 and resets between encounters and duel rounds.
          </p>
          <p>
            Wards add defense, and a Ward that matches the field adds 2 more.
            Pierce ignores defense for that attack; a countered attack never
            pierces.
          </p>
        </section>

        <section className="document__section" aria-labelledby="rules-status-title">
          <h2 className="document__heading" id="rules-status-title" tabIndex={-1}>
            Statuses
          </h2>
          <dl className="rules__statuses">
            <div className="rules__status">
              <dt>Focus</dt>
              <dd>
                Your next attack card deals +2 damage and consumes one stack.
                Stacks up to 3.
              </dd>
            </div>
            <div className="rules__status">
              <dt>Weaken</dt>
              <dd>
                Your next attack card deals 2 less damage, never below 0, and
                consumes one stack. Stacks up to 3.
              </dd>
            </div>
            <div className="rules__status">
              <dt>Regen</dt>
              <dd>
                Heals 2 at your turn start and consumes one stack. Stacks up to
                2.
              </dd>
            </div>
          </dl>
          <p>
            Focus and Weaken both apply and both consume a stack when present.
            Statuses never carry between battles or duel rounds.
          </p>
        </section>

        <section className="document__section" aria-labelledby="rules-modes-title">
          <h2 className="document__heading" id="rules-modes-title" tabIndex={-1}>
            Modes
          </h2>

          <h3 className="rules__heading">Solo run</h3>
          <p>
            Pick one of four elemental starter decks and take 40 health through
            four fights: Cinder Warden at 30 health, Rime Sentinel at 35, Storm
            Herald at 40 and The Hollow Field at 60. After each win except the
            last, heal 12 and add one card from a choice of three.
          </p>
          <p>
            The run autosaves after every settled action, so Continue Run on the
            menu restores the exact battle you left.
          </p>

          <h3 className="rules__heading">Local duel</h3>
          <p>
            Two players share one device, each locking a deck before the match.
            Rounds are best of three, first to two wins. A privacy screen hides
            the board and both hands before every turn, and only the active
            player&rsquo;s hand is shown during their turn.
          </p>
          <p>
            Every round resets health, defense, the field and statuses. Duels
            are never saved, so a reload returns to the menu.
          </p>

          <h3 className="rules__heading">Winning</h3>
          <p>
            A battle ends when one side reaches 0 health. Defense is not health:
            it keeps absorbing, so out-damage it or pierce it outright.
          </p>
        </section>
      </div>

      <p className="document__footer">
        <button
          type="button"
          className="shell__button document__footer-action"
          onClick={onBack}
        >
          Back to menu
        </button>
      </p>
    </div>
  );
}
