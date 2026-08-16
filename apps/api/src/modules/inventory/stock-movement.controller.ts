import { sendPaginated } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';
import { parseSort } from '../../utils/pagination';

import { StockMovementModel } from './models/stock-movement.model';

export const listStockMovementsHandler = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sort, filter = {} } = req.query as unknown as ListQuery;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    StockMovementModel.find(filter)
      .sort(parseSort(sort) ?? { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockMovementModel.countDocuments(filter),
  ]);

  return sendPaginated(res, items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});
