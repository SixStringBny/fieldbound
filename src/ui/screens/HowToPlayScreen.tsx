/**
 * The rules reference.
 *
 * This screen is prose, not logic: it explains the turn sequence, the three
 * energy rule, the shared field cycle, persistent defense, the three statuses
 * and both modes. Every number here is documentation of the engine contract; no
 * damage, draw or affordability computation lives in the component.
 */

export interface HowToPlayScreenProps {
  readonly onBack: () => void;
}

export function HowToPlayScreen({ onBack }: HowToPlayScreenProps) {
  return (
    <>
      <header className="shell__header shell__header--compact">
        <p className="shell__eyebrow">Rules reference</p>
        <h1 className="shell__title shell__title--page">How to Play</h1>
        <p className="shell__tagline">
          Take your opponent to 0 health. The shared field decides how hard that
          is.
        </p>
      </header>

      <button type="button" className="shell__back" onClick={onBack}>
        Back
      </button>

      <div className="rules">
        <section className="shell__panel" aria-labelledby="rules-turn-title">
          <h2 className="shell__panel-title" id="rules-turn-title">
            A turn in three steps
          </h2>
          <ol className="rules__steps">
            <li>
              <strong>Turn start.</strong> Your energy resets to three, Regen
              heals 2, and you draw back up to five cards.
            </li>
            <li>
              <strong>Actions.</strong> Play any affordable cards in any order.
              Energy is spent the moment a card resolves.
            </li>
            <li>
              <strong>Turn end.</strong> Your remaining hand is discarded and
              the other side takes over.
            </li>
          </ol>
        </section>

        <section className="shell__panel" aria-labelledby="rules-energy-title">
          <h2 className="shell__panel-title" id="rules-energy-title">
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

        <section className="shell__panel" aria-labelledby="rules-field-title">
          <h2 className="shell__panel-title" id="rules-field-title">
            The field cycle
          </h2>
          <p>
            One field is shared by both sides. It never rotates on its own;
            only Shift cards change it.
          </p>
          <ul className="rules__cycle">
            <li>Ember beats Frost</li>
            <li>Frost beats Gale</li>
            <li>Gale beats Stone</li>
            <li>Stone beats Ember</li>
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

        <section className="shell__panel" aria-labelledby="rules-defense-title">
          <h2 className="shell__panel-title" id="rules-defense-title">
            Defense
          </h2>
          <p>
            Defense is flat damage reduction that stays for the whole battle.
            Incoming attacks are reduced by its value and the armor itself is not
            worn down. It caps at 8 and resets between encounters and duel
            rounds.
          </p>
          <p>
            Wards add defense, and a Ward that matches the field adds 2 more.
            Pierce ignores defense for that attack; a countered attack never
            pierces.
          </p>
        </section>

        <section className="shell__panel" aria-labelledby="rules-status-title">
          <h2 className="shell__panel-title" id="rules-status-title">
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

        <section className="shell__panel" aria-labelledby="rules-modes-title">
          <h2 className="shell__panel-title" id="rules-modes-title">
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

      <p className="rules__footer">
        <button type="button" className="shell__button" onClick={onBack}>
          Back to menu
        </button>
      </p>
    </>
  );
}
