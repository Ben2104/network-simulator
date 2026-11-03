import {
  LIMITS,
  formatSize,
  toCarPlan,
  type PacketizeRequest,
  type PacketizeResponse,
} from '@netsim/shared';

/**
 * Validates a Submit request, then applies the shared size-based car plan (`toCarPlan`): 10 MB
 * fills 24 cars, smaller sizes get proportionally fewer. `POST /api/upload` returns the same plan
 * for real files, so the browser and server always agree.
 */
export function packetize(req: PacketizeRequest): PacketizeResponse {
  const totalBytes =
    req.source === 'file' ? req.sizeBytes : new TextEncoder().encode(req.message).length;
  if (req.source === 'file') {
    if (req.fileName.length < 1 || req.fileName.length > LIMITS.fileNameMaxLength) {
      throw new Error(`File name must be 1–${LIMITS.fileNameMaxLength} characters.`);
    }
    if (!Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > LIMITS.fileMaxBytes) {
      throw new Error(`Files must be between 1 byte and ${formatSize(LIMITS.fileMaxBytes)}.`);
    }
  } else if (req.message.length < 1 || req.message.length > LIMITS.messageMaxLength) {
    throw new Error(`Message must be 1–${LIMITS.messageMaxLength} characters.`);
  }

  return toCarPlan(totalBytes);
}
