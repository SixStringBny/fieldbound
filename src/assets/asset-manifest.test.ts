// @vitest-environment node
/**
 * Asset manifest contract tests (CNT-FR-05, CNT-FR-06, VIS-CON-06, VIS-NFR-02).
 *
 * The shipped asset set is checked four ways:
 *
 *   1. manifest shape: version, published spec block, exact 32/4/5 coverage,
 *      unique ids and paths, id-sorted order;
 *   2. catalog resolution: every card, enemy and field id has exactly one entry
 *      with the documented element, name, path and dimensions - and no extras;
 *   3. filesystem: every manifest path exists under `public/assets`, exactly 41
 *      SVGs are present, each carries the generator banner and the declared
 *      canvas, and the on-disk bytes equal what the generator would write;
 *   4. loader: known ids resolve to `base + assets/<path>` under a subpath base,
 *      unknown ids return `undefined`, and the base is normalized once.
 *
 * `auditManifest` is a pure function over a manifest plus a file-existence
 * predicate, so fixtures prove the test fails loudly when an entry, file or
 * duplicate is removed or a path drifts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../content/cards';
import { ENEMIES } from '../content/enemies';
import { ELEMENTS, FIELD_ELEMENTS } from '../engine/types';
import type { CardDefinition, Element, EnemyDefinition } from '../engine/types';
import {
  ASSET_IDS,
  ASSET_KINDS,
  ASSET_MANIFEST,
  ASSETS,
  assetById,
  byId,
  normalizeBase,
  resolveAsset,
} from './asset-manifest';
import type {
  AssetEntry,
  AssetKind,
  AssetManifest,
  AssetSpec,
} from './asset-manifest';

/* -------------------------------------------------------------------------- */
/* Documented contract                                                         */
/* -------------------------------------------------------------------------- */

const MANIFEST_NAME = 'assets.manifest.json';
const MANIFEST_VERSION = 1;
const GENERATOR = 'scripts/generate-placeholder-assets.mjs';

const EXPECTED_COUNTS: Readonly<Record<AssetKind, number>> = {
  card: 32,
  enemy: 4,
  field: 5,
};

const EXPECTED_TOTAL = 41;

/** Publishes the spec block from docs/features/card-content.md section 4.5. */
const EXPECTED_SPEC = {
  card: {
    width: 300,
    height: 420,
    format: 'svg',
    safeArea: 24,
    titleBand: 72,
    artBox: [240, 200],
    textBand: 96,
  },
  enemy: { width: 512, height: 512, format: 'svg', safeArea: 32 },
  field: { width: 256, height: 256, format: 'svg', safeArea: 16 },
} as const;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');
const GENERATOR_PATH = path.join(process.cwd(), 'scripts', 'generate-placeholder-assets.mjs');

/* -------------------------------------------------------------------------- */
/* Pure audit                                                                  */
/* -------------------------------------------------------------------------- */

interface CatalogCard {
  readonly id: string;
  readonly name: string;
  readonly element: Element;
}

interface CatalogEnemy {
  readonly id: string;
  readonly name: string;
  readonly element: Element;
}

export interface ManifestAuditInput {
  readonly manifest: AssetManifest;
  readonly cards: readonly CatalogCard[];
  readonly enemies: readonly CatalogEnemy[];
  readonly fields: readonly Element[];
  /** Receives a path relative to `public/`, e.g. `assets/cards/x.svg`. */
  readonly fileExists: (publicRelativePath: string) => boolean;
}

function countBy(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function specProblem(kind: AssetKind, actual: AssetSpec | undefined): string | undefined {
  if (actual === undefined) {
    return `manifest spec has no "${kind}" entry`;
  }

  const expected = EXPECTED_SPEC[kind];
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();

  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    return `manifest spec for "${kind}" does not match the documented spec`;
  }

  for (const key of expectedKeys) {
    const expectedValue = (expected as unknown as Record<string, unknown>)[key];
    const actualValue = (actual as unknown as Record<string, unknown>)[key];

    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      return `manifest spec for "${kind}" does not match the documented spec`;
    }
  }

  return undefined;
}

function isRelativeSvgPath(value: string): boolean {
  if (value.startsWith('/') || /^[a-zA-Z]:/.test(value) || value.includes('\\')) {
    return false;
  }

  const segments = value.split('/');
  return (
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..') &&
    value.endsWith('.svg')
  );
}

/**
 * Every manifest invariant in one place. Returns an empty array for the shipped
 * asset set; otherwise one message per violation, ordered deterministically so
 * fixtures can assert exact strings.
 */
export function auditManifest(input: ManifestAuditInput): string[] {
  const { manifest, cards, enemies, fields, fileExists } = input;
  const issues: string[] = [];

  if (manifest.version !== MANIFEST_VERSION) {
    issues.push(
      `manifest version is ${String(manifest.version)}, expected ${MANIFEST_VERSION}`,
    );
  }

  if (manifest.generatedBy !== GENERATOR) {
    issues.push(
      `manifest generatedBy is "${String(manifest.generatedBy)}", expected "${GENERATOR}"`,
    );
  }

  for (const kind of ASSET_KINDS) {
    const problem = specProblem(kind, manifest.spec[kind]);

    if (problem !== undefined) {
      issues.push(problem);
    }
  }

  if (manifest.assets.length !== EXPECTED_TOTAL) {
    issues.push(
      `manifest has ${manifest.assets.length} entries, expected ${EXPECTED_TOTAL}`,
    );
  }

  for (const kind of ASSET_KINDS) {
    const count = manifest.assets.filter((entry) => entry.kind === kind).length;

    if (count !== EXPECTED_COUNTS[kind]) {
      issues.push(
        `manifest has ${count} ${kind} entries, expected ${EXPECTED_COUNTS[kind]}`,
      );
    }
  }

  for (const [id, count] of countBy(manifest.assets.map((entry) => entry.id))) {
    if (count > 1) {
      issues.push(`manifest asset id "${id}" appears ${count} times`);
    }
  }

  for (const [assetPath, count] of countBy(manifest.assets.map((entry) => entry.path))) {
    if (count > 1) {
      issues.push(`manifest asset path "${assetPath}" appears ${count} times`);
    }
  }

  const expectedEntries: readonly {
    readonly id: string;
    readonly kind: AssetKind;
    readonly element: Element;
    readonly name: string;
    readonly path: string;
  }[] = [
    ...cards.map((card) => ({
      id: `card:${card.id}`,
      kind: 'card' as const,
      element: card.element,
      name: card.name,
      path: `cards/${card.id}.svg`,
    })),
    ...enemies.map((enemy) => ({
      id: `enemy:${enemy.id}`,
      kind: 'enemy' as const,
      element: enemy.element,
      name: enemy.name,
      path: `enemies/${enemy.id}.svg`,
    })),
    ...fields.map((element) => ({
      id: `field:${element}`,
      kind: 'field' as const,
      element,
      name: `${element[0]?.toUpperCase() ?? ''}${element.slice(1)} Field`,
      path: `fields/field-${element}.svg`,
    })),
  ];

  const entriesById = new Map(manifest.assets.map((entry) => [entry.id, entry] as const));
  const expectedIds = new Set(expectedEntries.map((entry) => entry.id));

  for (const expected of expectedEntries) {
    const entry = entriesById.get(expected.id);

    if (entry === undefined) {
      issues.push(`manifest is missing ${expected.kind} entry "${expected.id}"`);
      continue;
    }

    if (entry.kind !== expected.kind) {
      issues.push(
        `manifest entry "${entry.id}" has kind "${entry.kind}", expected "${expected.kind}"`,
      );
    }

    if (entry.element !== expected.element) {
      issues.push(
        `manifest entry "${entry.id}" has element "${entry.element}", expected "${expected.element}"`,
      );
    }

    if (entry.name !== expected.name) {
      issues.push(
        `manifest entry "${entry.id}" has name "${entry.name}", expected "${expected.name}"`,
      );
    }

    if (!isRelativeSvgPath(entry.path)) {
      issues.push(
        `manifest entry "${entry.id}" has path "${entry.path}" that is not a relative forward-slash SVG path`,
      );
    }

    if (entry.path !== expected.path) {
      issues.push(
        `manifest entry "${entry.id}" has path "${entry.path}", expected "${expected.path}"`,
      );
    }
  }

  for (const entry of manifest.assets) {
    if (!expectedIds.has(entry.id)) {
      issues.push(`manifest has unexpected ${entry.kind} entry "${entry.id}"`);
    }

    const spec = manifest.spec[entry.kind];

    if (spec !== undefined) {
      if (entry.width !== spec.width) {
        issues.push(
          `manifest entry "${entry.id}" has width ${entry.width}, expected ${spec.width}`,
        );
      }

      if (entry.height !== spec.height) {
        issues.push(
          `manifest entry "${entry.id}" has height ${entry.height}, expected ${spec.height}`,
        );
      }

      if (entry.format !== 'svg') {
        issues.push(
          `manifest entry "${entry.id}" has format "${String(entry.format)}", expected "svg"`,
        );
      }

      if (entry.safeArea !== spec.safeArea) {
        issues.push(
          `manifest entry "${entry.id}" has safeArea ${entry.safeArea}, expected ${spec.safeArea}`,
        );
      }
    }

    if (!fileExists(`assets/${entry.path}`)) {
      issues.push(
        `manifest entry "${entry.id}" has no file at "assets/${entry.path}"`,
      );
    }
  }

  for (let index = 1; index < manifest.assets.length; index += 1) {
    const previous = manifest.assets[index - 1];
    const current = manifest.assets[index];

    if (previous !== undefined && current !== undefined && previous.id > current.id) {
      issues.push('manifest assets are not sorted by id');
      break;
    }
  }

  return issues;
}

function fileExistsUnderPublic(publicRelativePath: string): boolean {
  const target = path.join(PUBLIC_DIR, publicRelativePath);

  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}

function walk(directory: string, prefix = ''): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...walk(path.join(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }

  return files.sort();
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

interface MutableManifest {
  version: number;
  generatedBy: string;
  spec: Record<AssetKind, AssetSpec>;
  assets: AssetEntry[];
}

function cloneManifest(): MutableManifest {
  return JSON.parse(JSON.stringify(ASSET_MANIFEST)) as MutableManifest;
}

function shippedAudit(manifest: AssetManifest = ASSET_MANIFEST): string[] {
  return auditManifest({
    manifest,
    cards: CARDS,
    enemies: ENEMIES,
    fields: ELEMENTS,
    fileExists: fileExistsUnderPublic,
  });
}

/* -------------------------------------------------------------------------- */
/* The shipped manifest                                                        */
/* -------------------------------------------------------------------------- */

describe('asset manifest', () => {
  it('is versioned and publishes the documented spec block', () => {
    expect(ASSET_MANIFEST.version).toBe(MANIFEST_VERSION);
    expect(ASSET_MANIFEST.generatedBy).toBe(GENERATOR);
    expect(ASSET_MANIFEST.spec).toStrictEqual(EXPECTED_SPEC);
  });

  it('covers 32 cards, 4 enemies and 5 fields with no extras', () => {
    expect(ASSETS).toHaveLength(EXPECTED_TOTAL);
    expect(ASSETS.filter((entry) => entry.kind === 'card')).toHaveLength(
      EXPECTED_COUNTS.card,
    );
    expect(ASSETS.filter((entry) => entry.kind === 'enemy')).toHaveLength(
      EXPECTED_COUNTS.enemy,
    );
    expect(ASSETS.filter((entry) => entry.kind === 'field')).toHaveLength(
      EXPECTED_COUNTS.field,
    );
    expect(new Set(ASSET_IDS).size).toBe(EXPECTED_TOTAL);
    expect(new Set(ASSETS.map((entry) => entry.path)).size).toBe(EXPECTED_TOTAL);
    expect(ASSET_IDS).toStrictEqual(ASSETS.map((entry) => entry.id));
    expect([...ASSET_IDS].sort()).toStrictEqual(ASSET_IDS);
  });

  it('resolves every catalog id and field to one documented entry', () => {
    expect(shippedAudit()).toStrictEqual([]);
  });

  it('names every id with the card, enemy or field namespace', () => {
    for (const entry of ASSETS) {
      expect(entry.id.startsWith(`${entry.kind}:`), entry.id).toBe(true);
    }

    expect(
      ASSETS.filter((entry) => entry.kind === 'field')
        .map((entry) => entry.id)
        .sort(),
    ).toStrictEqual(ELEMENTS.map((element) => `field:${element}`).sort());

    for (const element of FIELD_ELEMENTS) {
      const entry = assetById(`field:${element}`);

      expect(entry, element).toBeDefined();
      expect(entry?.path, element).toBe(`fields/field-${element}.svg`);
    }
  });

  it('keeps every path relative with forward slashes under public/assets', () => {
    for (const entry of ASSETS) {
      expect(entry.path.startsWith('/'), entry.id).toBe(false);
      expect(entry.path.includes('\\'), entry.id).toBe(false);
      expect(entry.path.split('/').includes('..'), entry.id).toBe(false);
      expect(entry.path.endsWith('.svg'), entry.id).toBe(true);
      expect(existsSync(path.join(PUBLIC_DIR, 'assets', entry.path)), entry.id).toBe(
        true,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Files on disk                                                               */
/* -------------------------------------------------------------------------- */

describe('placeholder files', () => {
  it('has exactly 41 SVGs: one per card, enemy and field', () => {
    const svgFiles = walk(PUBLIC_ASSETS_DIR).filter((file) => file.endsWith('.svg'));
    const expectedFiles = [...ASSETS.map((entry) => entry.path)].sort();

    expect(svgFiles).toStrictEqual(expectedFiles);
    expect(svgFiles).toHaveLength(EXPECTED_TOTAL);
  });

  it('ships the manifest beside the SVGs', () => {
    const manifestPath = path.join(PUBLIC_ASSETS_DIR, MANIFEST_NAME);

    expect(existsSync(manifestPath)).toBe(true);
    expect(statSync(manifestPath).isFile()).toBe(true);
  });

  it('writes a generated banner, the declared canvas and no remote references', () => {
    for (const entry of ASSETS) {
      const file = readFileSync(
        path.join(PUBLIC_ASSETS_DIR, entry.path),
        'utf8',
      );

      expect(file.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'), entry.id).toBe(
        true,
      );
      expect(file, entry.id).toContain(
        'Generated by scripts/generate-placeholder-assets.mjs',
      );
      expect(file, entry.id).toContain(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${entry.width}" height="${entry.height}" viewBox="0 0 ${entry.width} ${entry.height}"`,
      );
      expect(file, entry.id).toContain(`<title id="title">${escapeXml(entry.name)}`);
      expect(file.includes('\r'), entry.id).toBe(false);
      expect(file.includes('<script'), entry.id).toBe(false);

      const remote = [...file.matchAll(/https?:\/\/[^"'\s<>]+/g)].map(
        (match) => match[0],
      );

      expect(remote, entry.id).toStrictEqual(['http://www.w3.org/2000/svg']);
    }
  });

  it('is byte-identical to fresh generator output', () => {
    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(process.execPath, [GENERATOR_PATH, '--check'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `verified ${EXPECTED_TOTAL} SVG placeholders and public/assets/${MANIFEST_NAME}`,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

describe('asset loader', () => {
  it('resolves a known card under a GitHub Pages subpath base', () => {
    expect(resolveAsset('card:ember-cinder-jab', '/Card-Game-Project/')).toBe(
      '/Card-Game-Project/assets/cards/ember-cinder-jab.svg',
    );
  });

  it('normalizes a base with no trailing slash or repeated slashes', () => {
    expect(resolveAsset('card:ember-inferno', '/Card-Game-Project')).toBe(
      '/Card-Game-Project/assets/cards/ember-inferno.svg',
    );
    expect(resolveAsset('card:ember-inferno', '/Card-Game-Project///')).toBe(
      '/Card-Game-Project/assets/cards/ember-inferno.svg',
    );
  });

  it('resolves the root base to /assets/', () => {
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(resolveAsset('card:shift-ember', '/')).toBe(
      '/assets/cards/shift-ember.svg',
    );
  });

  it('resolves enemies and fields, including field:frost under a non-root base', () => {
    expect(resolveAsset('enemy:enemy-cinder-warden', '/Card-Game-Project/')).toBe(
      '/Card-Game-Project/assets/enemies/enemy-cinder-warden.svg',
    );
    expect(resolveAsset('field:frost', '/Card-Game-Project/')).toBe(
      '/Card-Game-Project/assets/fields/field-frost.svg',
    );
    expect(resolveAsset('field:neutral', '/Card-Game-Project/')).toBe(
      '/Card-Game-Project/assets/fields/field-neutral.svg',
    );
  });

  it('keeps a full origin base intact', () => {
    expect(
      resolveAsset('enemy:enemy-hollow-field', 'https://example.test/fieldbound/'),
    ).toBe('https://example.test/fieldbound/assets/enemies/enemy-hollow-field.svg');
  });

  it('returns undefined for unknown ids instead of throwing', () => {
    expect(resolveAsset('card:unknown', '/Card-Game-Project/')).toBeUndefined();
    expect(resolveAsset('field:plasma', '/Card-Game-Project/')).toBeUndefined();
    expect(resolveAsset('enemy-cinder-warden', '/Card-Game-Project/')).toBeUndefined();
    expect(resolveAsset('', '/Card-Game-Project/')).toBeUndefined();
    expect(resolveAsset('toString', '/Card-Game-Project/')).toBeUndefined();
    expect(resolveAsset('constructor', '/Card-Game-Project/')).toBeUndefined();
    expect(resolveAsset('__proto__', '/Card-Game-Project/')).toBeUndefined();
    expect(assetById('card:unknown')).toBeUndefined();
    expect(assetById('toString')).toBeUndefined();
  });

  it('resolves every manifest id and returns the shared entry', () => {
    expect(Object.isFrozen(byId)).toBe(true);
    expect(Object.keys(byId)).toHaveLength(EXPECTED_TOTAL);
    expect((byId as Record<string, unknown>)['toString']).toBeUndefined();

    for (const entry of ASSETS) {
      expect(byId[entry.id], entry.id).toBe(entry);
      expect(assetById(entry.id), entry.id).toBe(entry);
      expect(resolveAsset(entry.id, '/base/'), entry.id).toBe(
        `/base/assets/${entry.path}`,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Auditing fixtures                                                           */
/* -------------------------------------------------------------------------- */

function cardEntry(): AssetEntry {
  const entry = ASSETS.find((candidate) => candidate.id === 'card:ember-cinder-jab');

  if (entry === undefined) {
    throw new Error('fixture entry "card:ember-cinder-jab" is missing');
  }

  return entry;
}

describe('manifest audit fixtures', () => {
  it('fails when a card entry is missing', () => {
    const manifest = cloneManifest();
    manifest.assets = manifest.assets.filter(
      (entry) => entry.id !== 'card:ember-cinder-jab',
    );

    expect(shippedAudit(manifest)).toContain(
      'manifest is missing card entry "card:ember-cinder-jab"',
    );
    expect(shippedAudit(manifest)).toContain(
      'manifest has 31 card entries, expected 32',
    );
  });

  it('fails when an entry is duplicated', () => {
    const manifest = cloneManifest();
    manifest.assets = [...manifest.assets, cardEntry()];

    expect(shippedAudit(manifest)).toContain(
      'manifest asset id "card:ember-cinder-jab" appears 2 times',
    );
    expect(shippedAudit(manifest)).toContain(
      'manifest asset path "cards/ember-cinder-jab.svg" appears 2 times',
    );
    expect(shippedAudit(manifest)).toContain('manifest has 42 entries, expected 41');
  });

  it('fails when an entry has no file on disk', () => {
    const issues = auditManifest({
      manifest: ASSET_MANIFEST,
      cards: CARDS,
      enemies: ENEMIES,
      fields: ELEMENTS,
      fileExists: (publicRelativePath) =>
        publicRelativePath !== 'assets/cards/ember-cinder-jab.svg',
    });

    expect(issues).toContain(
      'manifest entry "card:ember-cinder-jab" has no file at "assets/cards/ember-cinder-jab.svg"',
    );
  });

  it('fails an absolute path and a backslash path', () => {
    const manifest = cloneManifest();
    const entry = manifest.assets.find(
      (candidate) => candidate.id === 'card:ember-cinder-jab',
    );

    if (entry === undefined) {
      throw new Error('fixture entry is missing');
    }

    (entry as { path: string }).path = '/cards/ember-cinder-jab.svg';
    expect(shippedAudit(manifest)).toContain(
      'manifest entry "card:ember-cinder-jab" has path "/cards/ember-cinder-jab.svg" that is not a relative forward-slash SVG path',
    );

    (entry as { path: string }).path = 'cards\\ember-cinder-jab.svg';
    expect(shippedAudit(manifest)).toContain(
      'manifest entry "card:ember-cinder-jab" has path "cards\\ember-cinder-jab.svg" that is not a relative forward-slash SVG path',
    );
  });

  it('fails a wrong canvas size and a missing safe area', () => {
    const manifest = cloneManifest();
    const entry = manifest.assets.find(
      (candidate) => candidate.id === 'card:ember-cinder-jab',
    );

    if (entry === undefined) {
      throw new Error('fixture entry is missing');
    }

    (entry as { width: number }).width = 301;
    expect(shippedAudit(manifest)).toContain(
      'manifest entry "card:ember-cinder-jab" has width 301, expected 300',
    );

    manifest.spec.card = { width: 300, height: 420, format: 'svg' } as AssetSpec;
    expect(shippedAudit(manifest)).toContain(
      'manifest spec for "card" does not match the documented spec',
    );
  });

  it('fails an unexpected entry', () => {
    const manifest = cloneManifest();
    manifest.assets = [
      ...manifest.assets,
      {
        ...cardEntry(),
        id: 'card:ember-unknown',
        name: 'Unknown',
        path: 'cards/ember-unknown.svg',
      },
    ];

    expect(shippedAudit(manifest)).toContain(
      'manifest has unexpected card entry "card:ember-unknown"',
    );
  });

  it('fails when entries are not sorted by id', () => {
    const manifest = cloneManifest();
    manifest.assets = [...manifest.assets].reverse();

    expect(shippedAudit(manifest)).toContain('manifest assets are not sorted by id');
  });
});

/* -------------------------------------------------------------------------- */
/* Type bridge                                                                 */
/* -------------------------------------------------------------------------- */

describe('catalog typing', () => {
  it('accepts the frozen card and enemy elements as manifest elements', () => {
    const cards: readonly CardDefinition[] = CARDS;
    const enemies: readonly EnemyDefinition[] = ENEMIES;

    expect(cards.every((card) => ELEMENTS.includes(card.element))).toBe(true);
    expect(enemies.every((enemy) => ELEMENTS.includes(enemy.element))).toBe(true);
  });
});
