import { LIMITS } from './limits.js';
import type { Car, PacketizeResponse } from './schemas.js';

/**
 * Bytes one car carries before another car is needed: the 10 MB limit spread over 24 cars
 * (≈ 416,667 B). A file at the limit fills all 24 cars; smaller files use proportionally fewer.
 */
export const BYTES_PER_CAR = LIMITS.fileMaxBytes / LIMITS.maxCars;

/** Number of cars for a transfer of `totalBytes`: ceil(size / BYTES_PER_CAR), clamped to 1–24. */
export function carCountFor(totalBytes: number): number {
  return Math.min(LIMITS.maxCars, Math.max(1, Math.ceil(totalBytes / BYTES_PER_CAR)));
}

/**
 * Splits `totalBytes` into 1,500-byte packets and bundles them into `carCountFor(totalBytes)`
 * cars, as evenly as possible (the first `packetCount mod carCount` cars carry one extra packet).
 * Only the last packet can be short, so car `bytes` always sum to `totalBytes`. Pure; shared by
 * `POST /api/upload` and the browser so both always agree.
 */
export function toCarPlan(totalBytes: number): PacketizeResponse {
  if (!Number.isInteger(totalBytes) || totalBytes < 1) {
    throw new RangeError('totalBytes must be a positive integer');
  }
  const size = LIMITS.packetSizeBytes;
  const packetCount = Math.ceil(totalBytes / size);
  const carCount = Math.min(packetCount, carCountFor(totalBytes));
  const base = Math.floor(packetCount / carCount);
  const extra = packetCount % carCount;
  const cars: Car[] = [];
  let first = 0;
  for (let seq = 0; seq < carCount; seq++) {
    const last = first + base + (seq < extra ? 1 : 0) - 1;
    const bytes = Math.min(totalBytes, (last + 1) * size) - first * size;
    cars.push({ id: `car-${seq}`, seq, firstPacket: first, lastPacket: last, bytes });
    first = last + 1;
  }
  return { totalBytes, packetSizeBytes: size, packetCount, cars };
}

/** "1.05 MB", "12 KB", "512 B" (decimal units, like the 10 MB limit). */
export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2).replace(/\.?0+$/, '')} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1).replace(/\.0$/, '')} KB`;
  return `${bytes} B`;
}
