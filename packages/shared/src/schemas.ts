import { Type, type Static } from '@sinclair/typebox';
import { LIMITS } from './limits.js';
import { ROUTING } from './routing.js';

/**
 * TypeBox schemas are the single source of truth for the API contract:
 * Fastify validates requests against them at runtime, and `Static<>` derives the TS types.
 */

const Id = Type.String({ minLength: 1, maxLength: LIMITS.maxIdLength, pattern: '^[a-z0-9-]+$' });

export const NodeKindSchema = Type.Union([
  Type.Literal('client'),
  Type.Literal('router'),
  Type.Literal('server'),
]);

export const NetworkNodeSchema = Type.Object({
  id: Id,
  label: Type.String(),
  kind: NodeKindSchema,
  /** Approximate real-world location. Projected to the map with `project()`. */
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lon: Type.Number({ minimum: -180, maximum: 180 }),
  /** Human-readable place, e.g. "Long Beach, CA". */
  place: Type.String(),
});

export const NetworkLinkSchema = Type.Object({
  id: Id,
  source: Id,
  target: Id,
  /** Great-circle distance, display only. BFS ignores it. */
  distanceKm: Type.Number({ minimum: 0 }),
});

export const NetworkSchema = Type.Object({
  nodes: Type.Array(NetworkNodeSchema),
  links: Type.Array(NetworkLinkSchema),
  clientId: Id,
  serverId: Id,
});

export const RoutingAlgorithmSchema = Type.Union([Type.Literal('bfs'), Type.Literal('dijkstra')]);
export const LinkBandwidthsSchema = Type.Record(
  Type.String({ pattern: `^[a-z0-9-]{1,${LIMITS.maxIdLength}}$` }),
  Type.Union([Type.Literal(10), Type.Literal(100), Type.Literal(1000)]),
  { maxProperties: ROUTING.maxOverrides, additionalProperties: false },
);

export const RouteRequestSchema = Type.Object(
  {
    /** Start node. Defaults to the client lot. Enables the live-reroute stretch goal. */
    fromNodeId: Type.Optional(Id),
    /** Omitted by existing clients: defaults to BFS. */
    algorithm: Type.Optional(RoutingAlgorithmSchema),
    /** Per-request settings only. Omitted roads default to 1000 Mbps. */
    linkBandwidthMbps: Type.Optional(LinkBandwidthsSchema),
    disabledNodeIds: Type.Array(Id, { maxItems: LIMITS.maxDisabledIds, uniqueItems: true }),
    disabledLinkIds: Type.Array(Id, { maxItems: LIMITS.maxDisabledIds, uniqueItems: true }),
  },
  { additionalProperties: false },
);

export const BfsStepSchema = Type.Object({
  nodeId: Id,
  parentId: Type.Union([Id, Type.Null()]),
  viaLinkId: Type.Union([Id, Type.Null()]),
  depth: Type.Integer({ minimum: 0 }),
  /** Settled cumulative cost, present for Dijkstra only. */
  cost: Type.Optional(Type.Number({ minimum: 0 })),
});

export const RouteResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('routed'), Type.Literal('unreachable')]),
  /** BFS dequeue order or Dijkstra settlement order. Drives search visualization. */
  visitOrder: Type.Array(BfsStepSchema),
  /** Node IDs from start to server. Empty when unreachable. */
  path: Type.Array(Id),
  /** Link IDs along `path` (length = path.length - 1). */
  linkPath: Type.Array(Id),
  /** Metadata included when a client explicitly requests routing settings. */
  algorithm: Type.Optional(RoutingAlgorithmSchema),
  totalCost: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
});

export const PacketizeRequestSchema = Type.Union([
  Type.Object(
    {
      source: Type.Literal('file'),
      fileName: Type.String({ minLength: 1, maxLength: LIMITS.fileNameMaxLength }),
      sizeBytes: Type.Integer({ minimum: 1, maximum: LIMITS.fileMaxBytes }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      source: Type.Literal('message'),
      message: Type.String({ minLength: 1, maxLength: LIMITS.messageMaxLength }),
    },
    { additionalProperties: false },
  ),
]);

export const CarSchema = Type.Object({
  id: Type.String(),
  seq: Type.Integer({ minimum: 0 }),
  /** Inclusive packet index range carried by this car. */
  firstPacket: Type.Integer({ minimum: 0 }),
  lastPacket: Type.Integer({ minimum: 0 }),
  bytes: Type.Integer({ minimum: 1 }),
});

export const PacketizeResponseSchema = Type.Object({
  totalBytes: Type.Integer({ minimum: 1 }),
  packetSizeBytes: Type.Integer({ minimum: 1 }),
  packetCount: Type.Integer({ minimum: 1 }),
  cars: Type.Array(CarSchema),
});

/** `POST /api/upload`: what the server measured, then the car plan for that size. */
export const UploadResponseSchema = Type.Object({
  /** From the optional `X-File-Name` header; display only, never logged or stored. */
  fileName: Type.Union([Type.String(), Type.Null()]),
  bytesReceived: Type.Integer({ minimum: 1 }),
  /** Human-readable size, e.g. "1.05 MB". */
  size: Type.String(),
  limitBytes: Type.Integer(),
  /** Always true on 200; over-limit uploads get 413. */
  underLimit: Type.Boolean(),
  sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  receivedAt: Type.String({ format: 'date-time' }),
  region: Type.Literal('oregon'),
  packetSizeBytes: Type.Integer({ minimum: 1 }),
  packetCount: Type.Integer({ minimum: 1 }),
  carCount: Type.Integer({ minimum: 1 }),
  cars: Type.Array(CarSchema),
  /** One-line summary, e.g. "essay.pdf is 1.05 MB (under the 10 MB limit): 700 packets in 3 cars." */
  summary: Type.String(),
});

export const HealthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  uptimeSeconds: Type.Number(),
  version: Type.String(),
});

export const WelcomeResponseSchema = Type.Object({
  message: Type.String(),
  docs: Type.String(),
  health: Type.String(),
});

export const ApiErrorSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});

export type NodeKind = Static<typeof NodeKindSchema>;
export type NetworkNode = Static<typeof NetworkNodeSchema>;
export type NetworkLink = Static<typeof NetworkLinkSchema>;
export type Network = Static<typeof NetworkSchema>;
export type RouteRequest = Static<typeof RouteRequestSchema>;
export type RoutingAlgorithm = Static<typeof RoutingAlgorithmSchema>;
export type BfsStep = Static<typeof BfsStepSchema>;
export type RouteResponse = Static<typeof RouteResponseSchema>;
export type PacketizeRequest = Static<typeof PacketizeRequestSchema>;
export type Car = Static<typeof CarSchema>;
export type PacketizeResponse = Static<typeof PacketizeResponseSchema>;
export type UploadResponse = Static<typeof UploadResponseSchema>;
export type HealthResponse = Static<typeof HealthResponseSchema>;
export type WelcomeResponse = Static<typeof WelcomeResponseSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ID'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';
