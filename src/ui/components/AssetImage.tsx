/**
 * Manifest-backed image with a labelled failure state (SHL-FR-08, VIS-CON-06).
 *
 * Every card, enemy and field image resolves through `src/assets/asset-manifest`
 * with the caller's app base URL; no component imports an SVG directly and no
 * remote URL is ever built. The manifest dimensions reserve the image box before
 * the SVG decodes, so loading art cannot shift the board.
 *
 * A missing manifest entry or a failed load renders a bordered text fallback
 * that keeps the asset's name and "Art unavailable" visible. The board stays
 * playable and the image's accessible name survives.
 */
import { useEffect, useState } from 'react';
import { ASSET_MANIFEST, assetById, resolveAsset } from '../../assets/asset-manifest';
import type { AssetKind } from '../../assets/asset-manifest';

export interface AssetImageProps {
  /** Manifest id: `card:<id>`, `enemy:<id>` or `field:<element>`. */
  readonly assetId: string;
  /** The app base URL, normally `import.meta.env.BASE_URL`. */
  readonly baseUrl: string;
  /** Descriptive alt text, including the element and the primary number. */
  readonly alt: string;
  readonly kind: AssetKind;
}

const KIND_FALLBACK_LABEL: Readonly<Record<AssetKind, string>> = {
  card: 'Card art',
  enemy: 'Enemy portrait',
  field: 'Field art',
};

const KIND_GLYPH: Readonly<Record<AssetKind, string>> = {
  card: '▭',
  enemy: '◇',
  field: '◈',
};

export function AssetImage({ assetId, baseUrl, alt, kind }: AssetImageProps) {
  const [failed, setFailed] = useState(false);

  // A recycled component must not keep showing the previous asset's fallback.
  useEffect(() => {
    setFailed(false);
  }, [assetId]);

  const entry = assetById(assetId);
  const src = resolveAsset(assetId, baseUrl);
  const spec = ASSET_MANIFEST.spec[kind];
  const width = entry?.width ?? spec.width;
  const height = entry?.height ?? spec.height;
  const label = entry?.name ?? KIND_FALLBACK_LABEL[kind];

  if (src === undefined || failed) {
    return (
      <span
        className={`asset-image asset-image--${kind} asset-image--fallback`}
        data-kind={kind}
        data-asset-fallback="true"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <span
          className="asset-image__fallback"
          role="img"
          aria-label={`${alt}. Art unavailable.`}
        >
          <span className="asset-image__fallback-glyph" aria-hidden="true">
            {KIND_GLYPH[kind]}
          </span>
          <span className="asset-image__fallback-label">{label}</span>
          <span className="asset-image__fallback-note">Art unavailable</span>
        </span>
      </span>
    );
  }

  return (
    <span
      className={`asset-image asset-image--${kind}`}
      data-kind={kind}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img
        className="asset-image__img"
        src={src}
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
