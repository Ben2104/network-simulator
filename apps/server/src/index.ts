import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp({
  corsOrigins: config.corsOrigins,
  logger: {
    level: config.logLevel,
    // Pretty by default (Render shows it too); LOG_FORMAT=json keeps raw JSON lines.
    ...(config.logFormat === 'pretty' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await app.listen({ port: config.port, host: config.host });
