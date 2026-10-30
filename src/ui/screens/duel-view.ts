/**
 * The presentation projection of a redacted duel round (duel-flow section 8.2;
 * OVERHAUL section 8.2).
 *
 * The round controller's views are frozen: `src/duel/round*.ts` may not change,
 * and the privacy view in particular must stay `viewer`, `round` and `wins`.
 * Two pieces of *public* presentation data live in the match instead:
 *
 *   - the locked deck names, resolved from the match's locked deck ids, so both
 *     panels can print `<Deck> deck · <Element>` without reading a hand;
 *   - the completed-round history, so the board, the round result and the match
 *     result can paint the same three-pip strip.
 *
 * `projectDuelBoardView` adds exactly those two facts to a `DuelBattleView`. It
 * is a pure widening of an already-redacted view: no rule, no hidden card, hand
 * count, deck order, intent or score is introduced, and nothing here can be
 * used to see the opponent's hand. The match is the owner of both facts; this
 * module only renames them for the screen.
 */
import { deckById } from '../../content/decks';
import type { Element } from '../../engine/types';
import type { DuelBattleView, DuelOpponentView, DuelSelfView } from '../../duel/round';
import type { DuelMatch, DuelPlayer } from '../../duel/match';
import { elementLabel } from '../components/ElementCue';

/** The active viewer's panel with its public locked deck name. */
export type DuelSelfPanelView = DuelSelfView & {
  readonly deckName: string;
};

/** The opposing panel with its public locked deck name. */
export type DuelOpponentPanelView = DuelOpponentView & {
  readonly deckName: string;
};

/** The active-turn view plus the public series strip history. */
export type DuelBoardView = Omit<DuelBattleView, 'self' | 'opponent'> & {
  readonly self: DuelSelfPanelView;
  readonly opponent: DuelOpponentPanelView;
  /** Round winners in played order, one per completed round. */
  readonly roundWinners: readonly DuelPlayer[];
};

/** The locked deck's display name; falls back to the seat's element label. */
function lockedDeckName(
  match: DuelMatch,
  player: DuelPlayer,
  element: Element,
): string {
  const deck = deckById(match.deckIds[player]);

  return deck?.name ?? elementLabel(element);
}

/**
 * Widen one redacted battle view with the two public presentation facts.
 *
 * `deckName` is resolved from the match's locked deck id for that seat, never
 * from a card or a hand, so an inactive hand still cannot reach the DOM. The
 * `roundWinners` list is the match's append-only public history.
 */
export function projectDuelBoardView(
  view: DuelBattleView,
  match: DuelMatch,
): DuelBoardView {
  return {
    ...view,
    self: {
      ...view.self,
      deckName: lockedDeckName(match, view.self.player, view.self.element),
    },
    opponent: {
      ...view.opponent,
      deckName: lockedDeckName(
        match,
        view.opponent.player,
        view.opponent.element,
      ),
    },
    roundWinners: match.roundWinners,
  };
}
