#!/usr/bin/env node
// One-off: rebuild src/scene3d/westcoast.json from Natural Earth (public domain).
// Usage: node scripts/build-westcoast.mjs [states.geojson countries.geojson]
//   states:    ne_50m_admin_1_states_provinces.geojson (US states)
//   countries: ne_50m_admin_0_countries.geojson (Mexico; the 1:50m states file has no Mexican states)
// Without arguments both files are downloaded from the Natural Earth GitHub mirror.
// The output is committed; this script is not part of the build.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';

const MIRROR = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const STATES = [
  'California',
  'Oregon',
  'Washington',
  'Nevada',
  'Idaho',
  'Arizona',
  'Utah',
  'Montana',
  'Wyoming',
  'Colorado',
  'New Mexico',
];
// Wider than the shared projection (lat 32.5–46.5, lon −125 to −116): the east corridor runs
// through Las Vegas and Boise, and the camera sees well past them, so the land continues east to
// Colorado and south into Mexico instead of ending in ocean.
const BBOX = '-127,30,-104,48';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'scene3d', 'westcoast.json');

async function download(name) {
  const dir = await mkdtemp(join(tmpdir(), 'ne-'));
  const file = join(dir, name);
  const res = await fetch(`${MIRROR}/${name}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${name}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const states = process.argv[2] ?? (await download('ne_50m_admin_1_states_provinces.geojson'));
const countries = process.argv[3] ?? (await download('ne_50m_admin_0_countries.geojson'));

const usFilter = `[${STATES.map((s) => `'${s}'`).join(',')}].includes(name) && iso_a2 == 'US'`;
await mapshaper.runCommands(
  [
    `-i "${states}" name=us`,
    `-filter "${usFilter}"`,
    '-filter-fields name,postal',
    `-i "${countries}" name=mx`,
    `-filter "NAME == 'Mexico'" target=mx`,
    `-each "name = 'Mexico'; postal = 'MX'" target=mx`,
    '-filter-fields name,postal target=mx',
    '-merge-layers target=us,mx force name=land',
    `-clip bbox=${BBOX}`,
    '-simplify 40% keep-shapes',
    `-o "${out}" format=geojson precision=0.001`,
  ].join(' '),
);
console.log(`Wrote ${out}`);
