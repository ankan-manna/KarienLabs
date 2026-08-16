import { Router } from 'express';
import type Redis from 'ioredis';

import { logger } from '../../config/logger';
import { redis } from '../../config/redis';

import { INVENTORY_EVENTS_CHANNEL } from './inventory-events';

export const inventoryEventsRouter = Router();

const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Part 16/21/30 — anonymous, read-only, customer-safe (the only payload
 * that ever crosses this channel is `{productId, inStock, updatedAt}` —
 * see inventory-events.ts's doc comment for why that's deliberately not a
 * raw quantity). No auth required, same trust level as `GET /products`
 * itself; nothing here is per-user or per-order.
 *
 * A dedicated `redis.duplicate()` connection per connected browser tab is
 * required because ioredis puts a connection in a special subscriber mode
 * once `.subscribe()` is called — it can no longer run ordinary commands,
 * so it must never be the same shared client `config/redis.ts` exports for
 * everything else in this process.
 */
inventoryEventsRouter.get('/inventory-events', (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx-specific: disables response buffering so events aren't held
    // back until the proxy's buffer fills (infra/nginx already proxies
    // /api/v1/* — this is a no-op, harmless header for any other proxy).
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');

  const subscriber: Redis = redis.duplicate();
  let closed = false;

  subscriber.on('error', (err) => {
    logger.error({ err }, 'Inventory SSE subscriber Redis connection error');
  });

  subscriber.subscribe(INVENTORY_EVENTS_CHANNEL).catch((err: unknown) => {
    logger.error({ err }, 'Failed to subscribe to inventory events channel');
  });

  subscriber.on('message', (_channel, message) => {
    if (closed) return;
    res.write(`event: inventory.updated\ndata: ${message}\n\n`);
  });

  // Keeps intermediate proxies/load balancers from timing out an idle SSE
  // connection; a comment line (`:`) is invisible to EventSource's
  // `onmessage`/named-event listeners, so it never triggers app logic.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL_MS);

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    subscriber.unsubscribe().catch(() => undefined);
    subscriber.quit().catch(() => undefined);
  }

  req.on('close', cleanup);
  res.on('error', cleanup);
});
