import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import hpp from 'hpp';
import pinoHttp from 'pino-http';

import { logger } from './config/logger';
import { blockedIpGate } from './middlewares/blocked-ip.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.middleware';
import { maintenanceModeGate } from './middlewares/maintenance-mode.middleware';
import { metricsHandler, metricsMiddleware } from './middlewares/metrics.middleware';
import { noStoreMiddleware } from './middlewares/no-store.middleware';
import { globalRateLimiter, webhookRateLimiter } from './middlewares/rate-limit.middleware';
import { requestContextMiddleware } from './middlewares/request-context.middleware';
import { requestId } from './middlewares/request-id.middleware';
import { applySecurityMiddleware } from './middlewares/security.middleware';
import { webhookRouter } from './modules/payments/webhook.routes';
import { sitemapRouter } from './modules/sitemap/sitemap.routes';
import { v1Router } from './routes';
import { healthRouter } from './routes/health.routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(requestContextMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Bugfix (Human-Readable API Logging) Part 2/3/11 — the root cause of
      // "the completion log shows headers/statusCode but not the actual
      // response/error": pino-http has no visibility into the JSON body a
      // route handler sends, only the raw `res` object (headers/statusCode).
      // `sendSuccess`/`errorHandler` now stash a small, pre-known-safe
      // summary on `res.locals.logOutcome` right before writing the
      // response (see api-response.ts / error-handler.middleware.ts);
      // `customSuccessObject`/`customErrorObject` merge it straight into
      // pino-http's OWN auto-generated completion line — same requestId,
      // same method/statusCode/responseTime pino-http already provides, now
      // with `outcome`/`errorCode`/`message` alongside. Falls back to a
      // status-code-derived outcome for the handful of routes that write
      // the response directly (file downloads, exports) rather than through
      // `sendSuccess`, so every request still gets an `outcome` field.
      //
      // Deliberately NOT `customProps`: pino-http calls that hook TWICE —
      // once in its request middleware (before the route handler runs, so
      // `res.locals.logOutcome` isn't set yet and `res.statusCode` is still
      // the default 200) to bind a child logger, and again at completion.
      // Both bindings end up serialized into the same line, producing
      // duplicate `outcome`/`method`/`url` keys (the correct, later value
      // wins on `JSON.parse`, but the raw line is confusing to read).
      // `customSuccessObject`/`customErrorObject` are only invoked once,
      // inside pino-http's completion handler, so this can't happen.
      customSuccessObject: (req, res, successObject) => ({
        ...(successObject as Record<string, unknown>),
        method: req.method,
        url: (req as express.Request).originalUrl,
        ...(res.locals.logOutcome ?? { outcome: res.statusCode < 400 ? 'success' : 'error' }),
      }),
      customErrorObject: (req, res, _err, errorObject) => ({
        ...(errorObject as Record<string, unknown>),
        method: req.method,
        url: (req as express.Request).originalUrl,
        ...(res.locals.logOutcome ?? { outcome: 'error' }),
      }),
    }),
  );

  applySecurityMiddleware(app);
  app.use(metricsMiddleware);

  // Mounted before express.json() — webhook signature verification needs the raw request bytes.
  // Rate-limited (Part 2) since this router sits ahead of globalRateLimiter below.
  app.use('/api/v1/webhooks', webhookRateLimiter, webhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(hpp());
  app.use(cookieParser());

  // Part 49/50/51 — liveness (`/health`, `/health/live`) never depends on
  // Mongo/Redis; readiness (`/health/ready`) does. See health.routes.ts.
  app.use(healthRouter);
  // Not proxied externally by nginx (see infra/nginx/conf.d/default.conf) —
  // Prometheus scrapes this directly over the internal Docker network at
  // api:5000/metrics, same trust boundary as /health.
  app.get('/metrics', metricsHandler);
  app.use(sitemapRouter);

  app.use('/api/v1', noStoreMiddleware, globalRateLimiter, blockedIpGate, maintenanceModeGate, v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
