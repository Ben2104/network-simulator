import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { MOCKS_DIR, buildApiMocks } from './test/mocks.js';

let app: FastifyInstance;
let live: Record<string, unknown>;
beforeAll(async () => {
  app = await buildApp();
  live = await buildApiMocks(app);
});
afterAll(() => app.close());

describe('packages/shared/mocks', () => {
  it.each(['network', 'route-routed', 'route-unreachable'])(
    '%s.json matches the live API (run `npm run mocks -w @netsim/server` if this fails)',
    (name) => {
      const committed: unknown = JSON.parse(
        readFileSync(new URL(`${name}.json`, MOCKS_DIR), 'utf8'),
      );
      expect(committed).toEqual(live[name]);
    },
  );
});
