import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { BfsStep, RouteRequest } from '@netsim/shared';

/** Test support only (excluded from the build): the demo routes from `docs/architecture.md`. */

export interface Scenario {
  from?: string;
  nodes?: string[];
  links?: string[];
}

/** Keyed by the "Failures" column of the demo-routes table in `docs/architecture.md`. */
export const SCENARIOS: Record<string, Scenario> = {
  none: {},
  'station `oakland`': { nodes: ['oakland'] },
  'road `oakland--redding`': { links: ['oakland--redding'] },
  '`sacramento` + `redding`': { nodes: ['sacramento', 'redding'] },
  '`sacramento` + `redding` + `barstow`': { nodes: ['sacramento', 'redding', 'barstow'] },
  'start at `sacramento`': { from: 'sacramento' },
};

export const toRouteRequest = ({ from, nodes = [], links = [] }: Scenario): RouteRequest => ({
  ...(from && { fromNodeId: from }),
  disabledNodeIds: nodes,
  disabledLinkIds: links,
});

export type Expected = { path: string[]; hops?: number } | { unreachable: true; explored: number };

/** Parses the demo-routes table so the doc and the tests can never drift apart. */
function documentedRoutes(): [string, Expected][] {
  const doc = readFileSync(new URL('../../../../docs/architecture.md', import.meta.url), 'utf8');
  const section = /^### Demo routes[\s\S]*?(?=^### )/m.exec(doc)?.[0] ?? '';
  const rows = [...section.matchAll(/^\| (.+?) +\| (.+?) +\|$/gm)].slice(2); // skip header + rule
  return rows.map(([, label, route]) => {
    const explored = /^none — BFS explores (\d+) stations/.exec(route!);
    if (explored) return [label!, { unreachable: true, explored: Number(explored[1]) }];
    const hops = /\((\d+) hops\)$/.exec(route!);
    const path = route!.replace(/\s*\(\d+ hops\)$/, '').split(' → ');
    return [label!, { path, hops: hops ? Number(hops[1]) : undefined }];
  });
}

export const DOCUMENTED_ROUTES = documentedRoutes();

/** Works for both `findRoute()` results and `/api/route` responses. */
export function expectDocumented(
  r: { routed: boolean; path: string[]; linkPath: string[]; visitOrder: BfsStep[] },
  expected: Expected,
) {
  if ('unreachable' in expected) {
    expect(r.routed).toBe(false);
    expect(r.path).toEqual([]);
    expect(r.linkPath).toEqual([]);
    expect(r.visitOrder).toHaveLength(expected.explored);
  } else {
    expect(r.routed).toBe(true);
    expect(r.path).toEqual(expected.path);
    expect(r.linkPath).toHaveLength(r.path.length - 1);
    if (expected.hops !== undefined) expect(r.path.length - 1).toBe(expected.hops);
  }
}
