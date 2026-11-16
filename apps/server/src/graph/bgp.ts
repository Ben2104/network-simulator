import { LOCAL_PREF, asnOf, neighborRole, type NeighborRole, type Network } from '@netsim/shared';
import type { BfsResult, FailureState } from './bfs.js';
import { findWeightedRoute } from './dijkstra.js';

const codeOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface BgpResult extends BfsResult {
  /** ASNs from the start node's AS to the destination's AS; empty when unreachable. */
  asPath: number[];
}

/**
 * A BGP speaker: one connected piece of an AS. Normally an AS is one speaker; if failures split
 * an AS, each piece routes on its own and loop prevention keeps a path from re-entering the ASN.
 */
interface Speaker {
  id: string;
  asn: number;
  nodeIds: Set<string>;
}

interface BgpRoute {
  /** Speaker IDs from this speaker to the origin. */
  speakers: string[];
  asPath: number[];
  /** How this speaker learned the route: 'origin' or the role of the neighbor it came from. */
  learnedFrom: 'origin' | NeighborRole;
}

function buildSpeakers(network: Network, failures: FailureState) {
  const live = (id: string) => !failures.disabledNodeIds.has(id) && asnOf(id) !== undefined;
  const liveLinks = network.links.filter(
    (l) => !failures.disabledLinkIds.has(l.id) && live(l.source) && live(l.target),
  );
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (const n of network.nodes) if (live(n.id)) parent.set(n.id, n.id);
  for (const l of liveLinks) {
    if (asnOf(l.source) !== asnOf(l.target)) continue;
    const a = find(l.source),
      b = find(l.target);
    // Keep the smaller ID as root so speaker IDs are deterministic.
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const speakers = new Map<string, Speaker>();
  const speakerOf = new Map<string, string>();
  for (const id of [...parent.keys()].sort(codeOrder)) {
    const root = find(id);
    const sid = `${asnOf(root)}:${root}`;
    if (!speakers.has(sid)) speakers.set(sid, { id: sid, asn: asnOf(root)!, nodeIds: new Set() });
    speakers.get(sid)!.nodeIds.add(id);
    speakerOf.set(id, sid);
  }
  const neighbors = new Map<string, Set<string>>([...speakers.keys()].map((s) => [s, new Set()]));
  for (const l of liveLinks) {
    const a = speakerOf.get(l.source)!,
      b = speakerOf.get(l.target)!;
    if (a === b) continue;
    // Two ASes with a road but no business agreement exchange no routes.
    if (!neighborRole(speakers.get(a)!.asn, speakers.get(b)!.asn)) continue;
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  }
  return { speakers, speakerOf, neighbors };
}

/** Lower is better: -local preference, AS-path length, neighbor ASN, neighbor speaker ID. */
type RankKey = [number, number, number, string];
function compareKeys(a: RankKey, b: RankKey): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || codeOrder(a[3], b[3]);
}

/** Gao–Rexford export rule: customer-learned and own routes go to everyone, others only to customers. */
function exports(route: BgpRoute, toRole: NeighborRole): boolean {
  return (
    route.learnedFrom === 'origin' || route.learnedFrom === 'customer' || toRole === 'customer'
  );
}

/**
 * Simplified BGP: every AS piece picks one best route to the destination's AS by
 * (1) highest local preference (customer > peer > provider), (2) shortest AS path,
 * (3) lowest neighbor ASN as a deterministic stand-in for BGP's later tie-breakers.
 * Routes propagate under valley-free export rules until nothing changes. The chosen AS path is
 * then expanded to roads with Dijkstra on configured link cost, standing in for each AS's IGP.
 */
export function findBgpRoute(
  network: Network,
  from: string,
  to: string,
  failures: FailureState,
  bandwidths: Readonly<Record<string, number>> = {},
): BgpResult {
  const { speakers, speakerOf, neighbors } = buildSpeakers(network, failures);
  const source = speakerOf.get(from);
  const origin = speakerOf.get(to);
  const localOnly = (): BgpResult => {
    // No BGP route: show the search inside the sender's own AS before giving up.
    const local = source ? speakers.get(source)!.nodeIds : new Set<string>();
    const r = findWeightedRoute(network, from, to, failures, bandwidths, (_, b) => local.has(b));
    return { ...r, found: false, path: [], linkPath: [], asPath: [] };
  };
  if (!source || !origin) return localOnly();

  let table = new Map<string, BgpRoute>([
    [origin, { speakers: [origin], asPath: [speakers.get(origin)!.asn], learnedFrom: 'origin' }],
  ]);
  const order = [...speakers.keys()].sort(codeOrder);
  // Gao–Rexford policies always converge; the cap only guards against a future bad table.
  for (let round = 0; round <= speakers.size * 4; round++) {
    const next = new Map<string, BgpRoute>();
    let changed = false;
    for (const sid of order) {
      const me = speakers.get(sid)!;
      let best: BgpRoute | undefined;
      let bestKey: RankKey | undefined;
      if (sid === origin) best = table.get(sid);
      else
        for (const nid of [...neighbors.get(sid)!].sort(codeOrder)) {
          const theirs = table.get(nid);
          if (!theirs || theirs.asPath.includes(me.asn)) continue;
          const nAsn = speakers.get(nid)!.asn;
          const role = neighborRole(me.asn, nAsn)!;
          if (!exports(theirs, neighborRole(nAsn, me.asn)!)) continue;
          const key: RankKey = [-LOCAL_PREF[role], theirs.asPath.length, nAsn, nid];
          if (!bestKey || compareKeys(key, bestKey) < 0) {
            bestKey = key;
            best = {
              speakers: [sid, ...theirs.speakers],
              asPath: [me.asn, ...theirs.asPath],
              learnedFrom: role,
            };
          }
        }
      if (best) next.set(sid, best);
      const old = table.get(sid);
      if (old?.speakers.join() !== best?.speakers.join()) changed = true;
    }
    table = next;
    if (!changed) break;
  }

  const chosen = table.get(source);
  if (!chosen) return localOnly();

  // Expand to roads with the IGP stand-in: only routers of the chosen AS pieces, moving within
  // a piece or forward to the next piece on the AS path (never back to an earlier AS).
  const position = new Map(chosen.speakers.map((s, i) => [s, i]));
  const disabledNodeIds = new Set(failures.disabledNodeIds);
  for (const n of network.nodes) {
    const s = speakerOf.get(n.id);
    if (s === undefined || !position.has(s)) disabledNodeIds.add(n.id);
  }
  const step = (a: string, b: string) =>
    position.get(speakerOf.get(b)!)! - position.get(speakerOf.get(a)!)!;
  const r = findWeightedRoute(
    network,
    from,
    to,
    { disabledNodeIds, disabledLinkIds: failures.disabledLinkIds },
    bandwidths,
    (a, b) => step(a, b) === 0 || step(a, b) === 1,
  );
  return r.found ? { ...r, asPath: chosen.asPath } : { ...r, asPath: [] };
}
