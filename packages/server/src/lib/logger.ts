import pino from 'pino';

// Deliberate process.env reads: the logger must be constructible regardless of
// env-module load order (env.ts reports its own validation failures via
// console.error precisely because the logger may not exist yet, and test files
// mock env.js and logger.js independently). LOG_LEVEL is still declared in the
// env schema, so an invalid value fails the boot loudly.
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["cf-access-jwt-assertion"]',
      'req.headers["x-api-key"]',
      'req.headers["x-auth-token"]',
      'req.url',
      'request.headers.authorization',
      'request.headers.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});
