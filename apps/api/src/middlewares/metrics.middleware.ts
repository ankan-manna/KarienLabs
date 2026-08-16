import type { NextFunction, Request, Response } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics endpoint (Monitoring spec item — "Future Ready:
 * Prometheus, Grafana", see infra/monitoring/). Exposes standard Node.js
 * process metrics (CPU, memory, event-loop lag, GC) plus two app-level
 * metrics: request count and request duration, both labeled by route/method/
 * status so p95/error-rate dashboards and alerts can be built directly from
 * `medcommerce_http_request_duration_seconds` in Grafana without any other
 * code changes.
 */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'medcommerce_' });

const httpRequestsTotal = new Counter({
  name: 'medcommerce_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

const httpRequestDuration = new Histogram({
  name: 'medcommerce_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/** Route label uses the matched Express route pattern (e.g. `/orders/:id`), not the raw URL, so per-endpoint cardinality stays bounded regardless of how many distinct order IDs get requested. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
}
