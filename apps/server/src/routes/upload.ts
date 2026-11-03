import type { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  LIMITS,
  UploadResponseSchema,
  formatSize,
  toCarPlan,
  type UploadResponse,
} from '@netsim/shared';
import { HttpError } from '../errors.js';

export interface UploadRoutesOptions {
  /** Uploads allowed per IP per minute. */
  perMinute?: number;
}

const tooLarge = () =>
  new HttpError(
    413,
    'PAYLOAD_TOO_LARGE',
    `File is over the ${formatSize(LIMITS.uploadMaxBytes)} limit (${LIMITS.uploadMaxBytes.toLocaleString('en-US')} bytes).`,
  );

/** `X-File-Name` is URI-encoded by the client (headers are ASCII). Display only. */
function fileNameFrom(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    name = raw;
  }
  name = name.trim().slice(0, LIMITS.fileNameMaxLength);
  return name || null;
}

/**
 * `POST /api/upload`: streams raw bytes into SHA-256 and a byte counter, then discards them (no
 * disk, no database, no logging of contents or file name). Replies with the measured size and the
 * car plan for that size: 10 MB fills 24 cars, smaller files proportionally fewer.
 */
export const uploadRoutes: FastifyPluginAsync<UploadRoutesOptions> = async (app, opts) => {
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) =>
      new HttpError(429, 'RATE_LIMITED', `Too many uploads. Try again in ${ctx.after}.`),
  });

  // Hand the raw request stream to the handler instead of buffering it.
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) =>
    done(null, payload),
  );

  app.post<{ Reply: UploadResponse }>(
    '/upload',
    {
      bodyLimit: LIMITS.uploadMaxBytes,
      config: { rateLimit: { max: opts.perMinute ?? 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['upload'],
        summary: 'Upload a file (≤ 10 MB, octet-stream): hashed, discarded, split into cars',
        description:
          'Send the raw bytes with `Content-Type: application/octet-stream` and an optional URI-encoded `X-File-Name` header. Nothing is stored.',
        response: { 200: UploadResponseSchema },
      },
    },
    async (req) => {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > LIMITS.uploadMaxBytes) throw tooLarge();

      const hash = createHash('sha256');
      let bytes = 0;
      const stream = req.body as Readable;
      for await (const chunk of stream) {
        const buf = chunk as Buffer;
        bytes += buf.length;
        if (bytes > LIMITS.uploadMaxBytes) {
          stream.destroy();
          throw tooLarge();
        }
        hash.update(buf);
      }
      if (bytes === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Upload body is empty.');

      const fileName = fileNameFrom(req.headers['x-file-name']);
      const plan = toCarPlan(bytes);
      const size = formatSize(bytes);
      const carCount = plan.cars.length;
      return {
        fileName,
        bytesReceived: bytes,
        size,
        limitBytes: LIMITS.uploadMaxBytes,
        underLimit: true,
        sha256: hash.digest('hex'),
        receivedAt: new Date().toISOString(),
        region: 'oregon',
        packetSizeBytes: plan.packetSizeBytes,
        packetCount: plan.packetCount,
        carCount,
        cars: plan.cars,
        summary: `${fileName ?? 'Your file'} is ${size} (under the ${formatSize(LIMITS.uploadMaxBytes)} limit): ${plan.packetCount.toLocaleString('en-US')} packet${plan.packetCount === 1 ? '' : 's'} in ${carCount} car${carCount === 1 ? '' : 's'}.`,
      };
    },
  );
};
