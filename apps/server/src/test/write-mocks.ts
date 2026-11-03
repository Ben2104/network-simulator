import { mkdirSync, writeFileSync } from 'node:fs';
import { buildApp } from '../app.js';
import { MOCKS_DIR, buildApiMocks } from './mocks.js';

/** `npm run mocks -w @netsim/server`: rewrites the generated mocks from the current API. */
const app = await buildApp();
mkdirSync(MOCKS_DIR, { recursive: true });
for (const [name, body] of Object.entries(await buildApiMocks(app))) {
  writeFileSync(new URL(`${name}.json`, MOCKS_DIR), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`wrote packages/shared/mocks/${name}.json`);
}
await app.close();
