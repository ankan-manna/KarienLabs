import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

/** Computed from the shared RESOURCES x ACTIONS vocabulary — always in sync, no separate seed step to maintain. */
export const listPermissionsHandler = asyncHandler(async (_req, res) => {
  const catalog = Object.values(RESOURCES).flatMap((resource) =>
    Object.values(ACTIONS).map((action) => ({
      resource,
      action,
      key: permission(resource, action),
    })),
  );
  return sendSuccess(res, catalog);
});
