/**
 * Shared-field banner (SHL-FR-02, SHL-FR-03, VIS-US-03).
 *
 * Always states the active element and the matchup in words, for example
 * "Ember is empowered; Frost is countered. Stone beats Ember." A four-step cycle
 * strip marks the active element, and the field art comes from the manifest.
 * The banner palette is decorative; the text and glyphs carry the meaning.
 */
import { FIELD_ELEMENTS } from '../../engine/types';
import type { Element, FieldElement } from '../../engine/types';
import { AssetImage } from './AssetImage';
import { ElementCue, elementLabel } from './ElementCue';

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
      <span className="field-banner__art">
        <AssetImage
          assetId={`field:${field}`}
          baseUrl={baseUrl}
          alt={alt}
          kind="field"
        />
      </span>

      <div className="field-banner__body">
        <h2 className="field-banner__title" id="field-banner-title">
          <ElementCue element={field} /> <span>field</span>
        </h2>

        {matchup === null ? (
          <p className="field-banner__matchup">
            Neutral field. No element is empowered; no card is countered.
          </p>
        ) : (
          <p className="field-banner__matchup">
            <strong>{elementLabel(matchup.empowered)}</strong> is empowered;{' '}
            <strong>{elementLabel(matchup.countered)}</strong> is countered.{' '}
            {elementLabel(matchup.beatenBy)} beats {fieldName}.
          </p>
        )}

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
