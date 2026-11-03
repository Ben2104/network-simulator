#!/usr/bin/env node
// One-off: rebuild src/scene3d/westcoast.json from Natural Earth (public domain).
// Usage: node scripts/build-westcoast.mjs [path/to/ne_50m_admin_1_states_provinces.geojson]
// Without an argument the file is downloaded from the Natural Earth GitHub mirror.
// The output is committed; this script is not part of the build.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson';
const STATES = ['California', 'Oregon', 'Washington', 'Nevada', 'Idaho', 'Arizona', 'Utah'];
// A little wider than the shared projection (lat 32.5–46.5, lon −125 to −116).
const BBOX = '-127,31.5,-114,47.5';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'scene3d', 'westcoast.json');

let input = process.argv[2];
if (!input) {
  const dir = await mkdtemp(join(tmpdir(), 'ne-'));
  input = join(dir, 'states.geojson');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await writeFile(input, Buffer.from(await res.arrayBuffer()));
}

const filter = `[${STATES.map((s) => `'${s}'`).join(',')}].includes(name) && iso_a2 == 'US'`;
await mapshaper.runCommands(
  [
    `-i "${input}"`,
    `-filter "${filter}"`,
    '-filter-fields name,postal',
    `-clip bbox=${BBOX}`,
    '-simplify 40% keep-shapes',
    `-o "${out}" format=geojson precision=0.001`,
  ].join(' '),
);
console.log(`Wrote ${out}`);
