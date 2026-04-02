import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { registerRoutes } from './routes/index.js';

const app = express();

// Trust proxy — required behind cloudflared for correct client IP
app.set('trust proxy', true);

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://use.typekit.net", "https://p.typekit.net"],
      fontSrc: ["'self'", "https://use.typekit.net", "https://p.typekit.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", `https://${process.env.VITE_AUTH0_DOMAIN || 'harvard.eu.auth0.com'}`],
      frameSrc: ["'self'", "https://challenges.cloudflare.com"],
    },
  },
}));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.CORS_ORIGIN
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Register API routes
registerRoutes(app);

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const { resolve } = await import('path');
  const webDist = resolve(process.cwd(), 'packages/web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

export default app;
