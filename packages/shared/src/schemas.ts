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
  /** Layout position in a 1000x600 viewBox. Owned by the backend so every client renders the same picture. */
  x: Type.Number(),
  y: Type.Number(),
});

export const NetworkLinkSchema = Type.Object({
  id: Id,
  source: Id,
  target: Id,
});

export const NetworkSchema = Type.Object({
  nodes: Type.Array(NetworkNodeSchema),
  links: Type.Array(NetworkLinkSchema),
  clientId: Id,
  serverId: Id,
});

export const RouteRequestSchema = Type.Object(
  {
    message: Type.String({ minLength: 1, maxLength: LIMITS.messageMaxLength }),
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

export const PacketSchema = Type.Object({
  id: Type.String(),
  seq: Type.Integer({ minimum: 0 }),
  payload: Type.String(),
});

export const RouteResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('routed'), Type.Literal('unreachable')]),
  /** Order in which BFS dequeued nodes. Drives the "search" visualization. */
  visitOrder: Type.Array(BfsStepSchema),
  /** Node IDs from client to server. Empty when unreachable. */
  path: Type.Array(Id),
  /** Link IDs along `path` (length = path.length - 1). */
  linkPath: Type.Array(Id),
  packets: Type.Array(PacketSchema),
});

export const HealthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  uptimeSeconds: Type.Number(),
  version: Type.String(),
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
export type Packet = Static<typeof PacketSchema>;
export type RouteResponse = Static<typeof RouteResponseSchema>;
export type HealthResponse = Static<typeof HealthResponseSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;

export type ApiErrorCode = 'VALIDATION_ERROR' | 'UNKNOWN_ID' | 'NOT_FOUND' | 'INTERNAL_ERROR';
