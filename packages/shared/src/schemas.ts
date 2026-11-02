import { Type, type Static } from '@sinclair/typebox';
import { LIMITS } from './limits.js';

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

export const RouteRequestSchema = Type.Object(
  {
    /** Start node. Defaults to the client lot. Enables the live-reroute stretch goal. */
    fromNodeId: Type.Optional(Id),
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
});

export const RouteResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('routed'), Type.Literal('unreachable')]),
  /** Order in which BFS dequeued nodes. Drives the search visualization. */
  visitOrder: Type.Array(BfsStepSchema),
  /** Node IDs from start to server. Empty when unreachable. */
  path: Type.Array(Id),
  /** Link IDs along `path` (length = path.length - 1). */
  linkPath: Type.Array(Id),
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
export type BfsStep = Static<typeof BfsStepSchema>;
export type RouteResponse = Static<typeof RouteResponseSchema>;
export type PacketizeRequest = Static<typeof PacketizeRequestSchema>;
export type Car = Static<typeof CarSchema>;
export type PacketizeResponse = Static<typeof PacketizeResponseSchema>;
export type HealthResponse = Static<typeof HealthResponseSchema>;
export type WelcomeResponse = Static<typeof WelcomeResponseSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;

export type ApiErrorCode = 'VALIDATION_ERROR' | 'UNKNOWN_ID' | 'NOT_FOUND' | 'INTERNAL_ERROR';
