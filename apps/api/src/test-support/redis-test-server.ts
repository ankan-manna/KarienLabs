import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import Redis from 'ioredis';

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address !== 'object') {
        server.close();
        reject(new Error('Could not allocate a free port for the test Redis instance'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForReady(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new Redis(url, { lazyConnect: true, retryStrategy: () => null });
    try {
      await client.connect();
      await client.ping();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      client.disconnect();
    }
  }
  throw new Error(`Test redis-server did not become ready in time: ${String(lastError)}`);
}

/**
 * Spins up a REAL `redis-server` process (not a mock) on an ephemeral port —
 * every route under test goes through globalRateLimiter/blockedIpGate/
 * maintenanceModeGate, all of which hit Redis on every request via the app's
 * real ioredis client (see config/redis.ts), so a mock client would leave
 * those middlewares untested. Requires `redis-server` on PATH (already true
 * for anyone running the existing docker-compose dev stack locally; CI
 * installs it via apt — see .github/workflows/ci-cd.yml).
 */
export async function startTestRedis(): Promise<{ url: string; stop: () => Promise<void> }> {
  const port = await getFreePort();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'medcommerce-test-redis-'));
  const url = `redis://127.0.0.1:${port}`;

  const proc: ChildProcess = spawn(
    'redis-server',
    ['--port', String(port), '--dir', dir, '--save', '', '--appendonly', 'no', '--daemonize', 'no'],
    { stdio: 'ignore' },
  );

  const spawnError = new Promise<never>((_resolve, reject) => {
    proc.once('error', (err) => {
      reject(
        new Error(
          `Failed to spawn redis-server for tests — is it installed and on PATH? Original error: ${err.message}`,
        ),
      );
    });
  });

  await Promise.race([waitForReady(url), spawnError]);

  return {
    url,
    async stop() {
      await new Promise<void>((resolve) => {
        proc.once('exit', () => resolve());
        proc.kill('SIGTERM');
      });
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
