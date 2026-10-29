// Throwaway prototype build: inline the seven placeholder SVGs so index.html
// is a single double-clickable file. Run: node .prototype/ui-directions/build.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const assets = join(root, 'public', 'assets');

const files = {
  IMG_INFERNO: join(assets, 'cards', 'ember-inferno.svg'),
  IMG_CINDER_JAB: join(assets, 'cards', 'ember-cinder-jab.svg'),
  IMG_EMBER_LANCE: join(assets, 'cards', 'ember-ember-lance.svg'),
  IMG_PROBE: join(assets, 'cards', 'neutral-probe.svg'),
  IMG_SHIFT_EMBER: join(assets, 'cards', 'shift-ember.svg'),
  IMG_ENEMY: join(assets, 'enemies', 'enemy-cinder-warden.svg'),
  IMG_FIELD: join(assets, 'fields', 'field-neutral.svg'),
};

let html = await readFile(join(here, 'index.template.html'), 'utf8');

for (const [token, path] of Object.entries(files)) {
  const svg = await readFile(path);
  const data = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  html = html.split(`__${token}__`).join(data);
}

const leftovers = html.match(/__IMG_[A-Z_]+__/g);
if (leftovers) throw new Error(`Unreplaced tokens: ${leftovers.join(', ')}`);

await writeFile(join(here, 'index.html'), html);
console.log(`Wrote index.html (${Buffer.byteLength(html)} bytes)`);
