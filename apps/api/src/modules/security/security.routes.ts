import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  blockDeviceHandler,
  blockIpHandler,
  listBlockedIpsHandler,
  listDevicesHandler,
  unblockDeviceHandler,
  unblockIpHandler,
} from './security.controller';

// No dedicated `security` resource exists in packages/shared/src/constants/permissions.ts
// (confirmed) — AUDIT_LOGS is the closest fit (it's the other "platform security /
// compliance visibility" resource super_admin/admin already have), so this whole
// module is gated by audit_logs:update for writes and audit_logs:read for reads,
// consistent with logs.routes.ts's own gating.
const READ_PERMISSION = permission(RESOURCES.AUDIT_LOGS, ACTIONS.READ);
const WRITE_PERMISSION = permission(RESOURCES.AUDIT_LOGS, ACTIONS.UPDATE);

export const securityRouter = Router();

securityRouter.use(requireAuth);

const blockIpSchema = z.object({
  ipAddress: z
    .string()
    .trim()
    .min(1, 'IP address is required'),
  reason: z.string().trim().max(500).optional(),
});

const blockDeviceSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

securityRouter.get(
  '/blocked-ips',
  authorize(READ_PERMISSION),
  validate(listQuerySchema, 'query'),
  listBlockedIpsHandler,
);
securityRouter.post(
  '/blocked-ips',
  authorize(WRITE_PERMISSION),
  validate(blockIpSchema),
  blockIpHandler,
);
securityRouter.delete('/blocked-ips/:id', authorize(WRITE_PERMISSION), unblockIpHandler);

securityRouter.get(
  '/devices',
  authorize(READ_PERMISSION),
  validate(listQuerySchema, 'query'),
  listDevicesHandler,
);
securityRouter.patch(
  '/devices/:id/block',
  authorize(WRITE_PERMISSION),
  validate(blockDeviceSchema),
  blockDeviceHandler,
);
securityRouter.patch('/devices/:id/unblock', authorize(WRITE_PERMISSION), unblockDeviceHandler);
