import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { registerRoutes } from './routes/index.js';
import { env } from './env.js';
import { sanitizeRequestUrl } from './lib/request-url.js';

const app = express();

// CSP fallback chain for the Auth0 domain. No hardcoded tenant fallback: in
// production AUTH0_DOMAIN is required non-empty, and in dev-skip mode an empty
// value simply omits the Auth0 CSP entries — a misconfiguration should surface
// as a visible CSP block, not be masked by someone else's tenant.
const auth0Domain = env.PUBLIC_AUTH0_DOMAIN || env.VITE_AUTH0_DOMAIN || env.AUTH0_DOMAIN;
const auth0CspSources = auth0Domain ? [`https://${auth0Domain}`] : [];

// Trust proxy — required behind cloudflared for correct client IP.
//
// Deliberately a hop count, NOT `true`. Trusting every hop makes `req.ip`
// resolve to the leftmost X-Forwarded-For entry, which is client-supplied, so
// every rate limiter keyed on it became trivially bypassable by rotating a fake
// XFF value. express-rate-limit flags that configuration as
// ERR_ERL_PERMISSIVE_TRUST_PROXY. Abuse controls key on `rateLimitKey()`
// (CF-Connecting-IP) rather than `req.ip`; see lib/client-ip.ts.
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://use.typekit.net", "https://p.typekit.net"],
      fontSrc: ["'self'", "https://use.typekit.net", "https://p.typekit.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...auth0CspSources],
      frameSrc: ["'self'", ...auth0CspSources],
    },
  },
}));
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customProps: (req) => ({ safePath: sanitizeRequestUrl(req.url) }),
  })
);
app.use(
  cors({
    origin: env.NODE_ENV === 'production'
      ? env.CORS_ORIGIN
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Register API routes
await registerRoutes(app);

// Unmatched API paths must 404 as JSON. Without this they fall through to the
// SPA catch-all below and return index.html with HTTP 200, so a renamed or
// removed endpoint surfaces to the client as an opaque JSON-parse error and
// uptime probes cannot distinguish a live route from a dead one.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// In production, serve the built frontend
if (env.NODE_ENV === 'production') {
  const { resolve } = await import('path');
  const webDist = resolve(process.cwd(), 'packages/web/dist');
  app.use(express.static(webDist));
  // Express 5 requires named wildcards; '/*splat' is the old '*' catch-all.
  app.get('/*splat', (_req, res) => {
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

export default app;
