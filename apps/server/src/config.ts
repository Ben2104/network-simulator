export interface Config {
  port: number;
  host: string;
  corsOrigins: string[];
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    corsOrigins: (env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
