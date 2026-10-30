/**
 * The feedback layer (motion-and-feedback section 5, section 12.1).
 *
 * One absolutely positioned, aria-hidden layer per panel. It is decoration
 * only: the numbers, chips and flashes are a second reading of facts the meter
 * values, the non-live log and the single polite announcement already carry, so
 * nothing here is focusable, named or announced, and no beat adds a live
 * region.
 *
 * Every node is keyed on the settled `key`, so a repeated identical delta
 * replays its animation while the panel itself stays mounted: focus, meter
 * values and open dialogs survive a beat. The layer never affects layout — it
 * is `position: absolute; inset: 0` inside a panel that is already a
 * positioning context — so a beat cannot change the document's scroll height or
 * move a control.
 *
 * Under reduced motion the caller does not render this component at all, so no
 * impact-number element exists in the DOM (section 10). CSS also keeps the
 * reduced branch still, which covers a beat that was already on screen when the
 * preference changed.
 */
import type { Side } from '../../engine/types';
import type {
  DefenseChip,
  FeedbackBeat,
  ImpactNumber,
} from '../feedback/derive';

/** Which panel the layer sits in. Solo and duel share these two slots. */
export type FeedbackSlot = 'enemy' | 'player';

export interface FeedbackLayerProps {
  readonly beat: FeedbackBeat;
  /** The engine side this panel shows. */
  readonly side: Side;
  readonly slot: FeedbackSlot;
}

/** U+2212 MINUS SIGN, never a hyphen: `−6`, `+2`. */
const MINUS = '\u2212';

function impactText(impact: ImpactNumber): string {
  const magnitude = Math.abs(impact.amount);

  return impact.kind === 'damage' ? `${MINUS}${magnitude}` : `+${magnitude}`;
}

function chipText(chip: DefenseChip): string {
  return `+${chip.amount} DEF`;
}

export function FeedbackLayer({ beat, side, slot }: FeedbackLayerProps) {
  const flash = beat.flash.find((target) => target.side === side);
  const impacts = beat.impacts.filter((impact) => impact.side === side);
  const chips = beat.defense.filter((chip) => chip.side === side);

  if (flash === undefined && impacts.length === 0 && chips.length === 0) {
    return null;
  }

  return (
    <div
      className="battle-feedback"
      data-feedback-key={beat.key}
      data-slot={slot}
      aria-hidden="true"
      key={beat.key}
    >
      {flash === undefined ? null : (
        <span
          className="battle-feedback__flash"
          data-impact-flash="true"
          data-kind={flash.kind}
          aria-hidden="true"
        />
      )}

      {chips.map((chip) => (
        <span
          className="battle-feedback__chip"
          data-defense-chip="true"
          data-side={side}
          aria-hidden="true"
          key={`chip:${side}`}
        >
          {chipText(chip)}
        </span>
      ))}

      {impacts.map((impact) => (
        <span
          className="battle-feedback__impact"
          data-impact-number="true"
          data-side={side}
          data-kind={impact.kind}
          aria-hidden="true"
          key={`impact:${side}`}
        >
          {impactText(impact)}
        </span>
      ))}
    </div>
  );
}
