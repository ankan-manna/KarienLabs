import { BaseRepository } from '../../repositories/base.repository';

import { DynamicMenuModel, type DynamicMenuDocument } from './models/dynamic-menu.model';

export class DynamicMenuRepository extends BaseRepository<DynamicMenuDocument> {
  constructor() {
    super(DynamicMenuModel);
  }

  findAllSorted(filter: Record<string, unknown> = {}) {
    return this.model.find(filter).sort({ order: 1, createdAt: 1 }).lean();
  }

  /** Bulk order update for the reorder endpoint — one round trip regardless of item count. */
  async bulkReorder(items: { id: string; order: number }[]): Promise<number> {
    if (items.length === 0) return 0;
    const result = await this.model.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item.id },
          update: { $set: { order: item.order } },
        },
      })),
    );
    return result.modifiedCount ?? 0;
  }
}

export const dynamicMenuRepository = new DynamicMenuRepository();
