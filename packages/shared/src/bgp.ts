/**
 * Illustrative Autonomous Systems for the simplified BGP mode. The ASNs come from the private
 * range (64512–65534); names, ownership and business relationships are invented for teaching and
 * do not describe real ISPs or real peering agreements.
 */
export interface AutonomousSystem {
  asn: number;
  name: string;
  /** Short role shown in the UI. */
  role: string;
  nodeIds: readonly string[];
}

export const AUTONOMOUS_SYSTEMS: readonly AutonomousSystem[] = [
  {
    asn: 64512,
    name: 'Campus Net',
    role: "The sender's network, with an edge router at El Segundo",
    nodeIds: ['csulb', 'el-segundo'],
  },
  {
    asn: 64520,
    name: 'SoCal Metro',
    role: 'Regional ISP selling transit to the campus',
    nodeIds: ['la-wilshire', 'lb-isp', 'riverside'],
  },
  {
    asn: 64530,
    name: 'Coastal Backbone',
    role: 'Carrier along the coast that only peers',
    nodeIds: ['eugene', 'medford', 'oakland', 'portland', 'redding', 'san-jose', 'slo'],
  },
  {
    asn: 64540,
    name: 'Valley Backbone',
    role: 'Transit carrier through the Central Valley',
    nodeIds: ['bakersfield', 'fresno', 'klamath-falls', 'reno', 'sacramento'],
  },
  {
    asn: 64550,
    name: 'Desert Carrier',
    role: 'Long-haul carrier across the desert',
    nodeIds: [
      'barstow',
      'boise',
      'burns',
      'las-vegas',
      'ontario',
      'pendleton',
      'tonopah',
      'winnemucca',
    ],
  },
  {
    asn: 64560,
    name: 'Oregon Cloud',
    role: 'Hosting network for the data center',
    nodeIds: ['bend', 'oregon-dc'],
  },
];

/**
 * Business relationships between neighboring ASes. `provider-customer`: the first AS sells
 * transit to the second. `peer`: settlement-free exchange of each other's customer routes.
 */
export type AsRelationshipKind = 'provider-customer' | 'peer';
export interface AsRelationship {
  a: number;
  b: number;
  kind: AsRelationshipKind;
}

export const AS_RELATIONSHIPS: readonly AsRelationship[] = [
  { a: 64520, b: 64512, kind: 'provider-customer' },
  { a: 64512, b: 64530, kind: 'peer' },
  { a: 64540, b: 64520, kind: 'provider-customer' },
  { a: 64520, b: 64550, kind: 'peer' },
  { a: 64530, b: 64540, kind: 'peer' },
  { a: 64540, b: 64550, kind: 'peer' },
  { a: 64550, b: 64560, kind: 'provider-customer' },
  { a: 64540, b: 64560, kind: 'provider-customer' },
  { a: 64530, b: 64560, kind: 'peer' },
];

/** How AS `from` sees neighbor `to`. */
export type NeighborRole = 'customer' | 'peer' | 'provider';

/** BGP local preference by neighbor role: customers pay, peers are free, providers cost money. */
export const LOCAL_PREF: Readonly<Record<NeighborRole, number>> = {
  customer: 300,
  peer: 200,
  provider: 100,
};

const asnByNode = new Map(AUTONOMOUS_SYSTEMS.flatMap((as) => as.nodeIds.map((id) => [id, as.asn])));
const asByAsn = new Map(AUTONOMOUS_SYSTEMS.map((as) => [as.asn, as]));

export function asnOf(nodeId: string): number | undefined {
  return asnByNode.get(nodeId);
}

export function autonomousSystem(asn: number): AutonomousSystem | undefined {
  return asByAsn.get(asn);
}

/** Role of `to` from `from`'s point of view, or undefined when the ASes have no agreement. */
export function neighborRole(from: number, to: number): NeighborRole | undefined {
  for (const r of AS_RELATIONSHIPS) {
    if (r.kind === 'peer' && ((r.a === from && r.b === to) || (r.a === to && r.b === from)))
      return 'peer';
    if (r.kind === 'provider-customer') {
      if (r.a === from && r.b === to) return 'customer';
      if (r.a === to && r.b === from) return 'provider';
    }
  }
  return undefined;
}
