import { LIMITS, type PacketizeRequest, type PacketizeResponse } from '@netsim/shared';

/**
 * Splits a declared size into packets and bundles them into at most `LIMITS.maxCars` cars.
 * Pure and client-side: `POST /api/packetize` does not exist yet. Same output shape as
 * `PacketizeResponseSchema`, so swapping in the API later changes only the caller.
 */
export function packetize(req: PacketizeRequest): PacketizeResponse {
  const totalBytes =
    req.source === 'file' ? req.sizeBytes : new TextEncoder().encode(req.message).length;
  if (req.source === 'file') {
    if (req.fileName.length < 1 || req.fileName.length > LIMITS.fileNameMaxLength) {
      throw new Error(`File name must be 1–${LIMITS.fileNameMaxLength} characters.`);
    }
    if (!Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > LIMITS.fileMaxBytes) {
      throw new Error('File size must be between 1 byte and 1 GiB.');
    }
  } else if (req.message.length < 1 || req.message.length > LIMITS.messageMaxLength) {
    throw new Error(`Message must be 1–${LIMITS.messageMaxLength} characters.`);
  }

  const size = LIMITS.packetSizeBytes;
  const packetCount = Math.ceil(totalBytes / size);
  const carCount = Math.min(packetCount, LIMITS.maxCars);
  const base = Math.floor(packetCount / carCount);
  const extra = packetCount % carCount;

  const cars: PacketizeResponse['cars'] = [];
  let first = 0;
  for (let seq = 0; seq < carCount; seq++) {
    const last = first + base + (seq < extra ? 1 : 0) - 1;
    // Only the final packet of the transfer can be short.
    const bytes = Math.min(totalBytes, (last + 1) * size) - first * size;
    cars.push({ id: `car-${seq}`, seq, firstPacket: first, lastPacket: last, bytes });
    first = last + 1;
  }
  return { totalBytes, packetSizeBytes: size, packetCount, cars };
}
