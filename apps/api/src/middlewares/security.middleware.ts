import compression from 'compression';
import cors from 'cors';
import type { Express } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';

import { env } from '../config/env';

/** Wires baseline security middleware. Called once from app.ts before routes are mounted. */
export function applySecurityMiddleware(app: Express) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );

  app.use(compression());
  app.use(mongoSanitize());
  app.disable('x-powered-by');
}
