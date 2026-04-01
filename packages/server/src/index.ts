import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root BEFORE any other imports
config({ path: resolve(import.meta.dirname, '../../../.env') });

// Now import everything else
const { env } = await import('./env.js');
const { logger } = await import('./lib/logger.js');
const { default: app } = await import('./app.js');

logger.info({ mode: env.NODE_ENV }, 'Starting server');

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server running');
});
