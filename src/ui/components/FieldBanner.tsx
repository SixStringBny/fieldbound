/**
 * Shared-field banner (SHL-FR-02, SHL-FR-03, VIS-US-03, battle-screen
 * section 2.3).
 *
 * Always states the active element and the matchup in words, for example
 * "Ember is empowered; Frost is countered. Stone beats Ember." The brass
 * roundel marks the active element, and a four-step cycle strip marks the
 * current step. The banner palette is decorative; the text and glyphs carry the
 * meaning.
 *
 * At phone widths the cycle strip is hidden by CSS: the field name plus the
 * matchup sentence is enough there, and the full cycle lives in How to Play.
 * The markup stays one element at every width.
 */
import { FIELD_ELEMENTS } from '../../engine/types';
import type { Element, FieldElement } from '../../engine/types';
import { AssetImage } from './AssetImage';
import { ElementCue, ELEMENT_DISPLAY, elementLabel } from './ElementCue';

/**
 * Field facts supplied by the controller from the engine's frozen cycle. The
 * presentation layer never re-derives matchups, so the words cannot drift from
 * the rules.
 */
export interface FieldMatchup {
  /** Element matching the active field. */
  readonly empowered: FieldElement;
  /** Element the active field beats. */
  readonly countered: FieldElement;
  /** Element whose field beats the active one. */
  readonly beatenBy: FieldElement;
}

export interface FieldBannerProps {
  readonly field: Element;
  /** `null` on the Neutral opening field, where no element is empowered. */
  readonly matchup: FieldMatchup | null;
  readonly baseUrl: string;
}

export function FieldBanner({ field, matchup, baseUrl }: FieldBannerProps) {
  const fieldName = elementLabel(field);

  const alt =
    matchup === null
      ? `${fieldName} field. No element is empowered or countered.`
      : `${fieldName} field. ${elementLabel(matchup.empowered)} is empowered; ${elementLabel(matchup.countered)} is countered.`;

  return (
    <section
      className="field-banner"
      data-field={field}
      aria-labelledby="field-banner-title"
    >
      <div className="field-banner__roundel" aria-hidden="true">
        <span className="field-banner__roundel-ring" />
        <span className="field-banner__roundel-glyph">
          {ELEMENT_DISPLAY[field].glyph}
        </span>
        <span className="field-banner__art">
          <AssetImage
            assetId={`field:${field}`}
            baseUrl={baseUrl}
            alt={alt}
            kind="field"
          />
        </span>
        <span className="field-banner__roundel-tag">{fieldName}</span>
      </div>

      <div className="field-banner__body">
        <p className="field-banner__eyebrow">Shared field</p>
        <h2 className="field-banner__title" id="field-banner-title">
          <ElementCue element={field} /> <span>field</span>
        </h2>

        <p className="field-banner__matchup">
            {matchup === null ? (
              'Neutral field. No element is empowered; no card is countered.'
            ) : (
              <>
                {elementLabel(matchup.empowered)} is empowered;{' '}
                {elementLabel(matchup.countered)} is countered.{' '}
                {elementLabel(matchup.beatenBy)} beats {fieldName}.
              </>
            )}
          </p>

        <ol className="field-banner__cycle" aria-label="Field cycle">
          {FIELD_ELEMENTS.map((element) => (
            <li
              className="field-banner__cycle-step"
              key={element}
              aria-current={field === element ? 'step' : undefined}
            >
              <ElementCue element={element} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
