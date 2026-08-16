import mongoose from 'mongoose';
import type { AnyKeys, FilterQuery, Model, QueryOptions, UpdateQuery } from 'mongoose';

import { parseSort } from '../utils/pagination';

export interface PaginateOptions {
  page?: number;
  limit?: number;
  sort?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Deliberately `Record<string, unknown>`, not `Partial<TSchema>`. Two reasons:
 * (1) `InferSchemaType<typeof schema>` can't see fields `auditPlugin()` adds
 * afterward via `schema.add()` (createdBy/updatedBy/deletedBy/version), and
 * (2) callers pass Zod-validated `string` ids from the request body, while
 * Mongoose's inferred ref fields type as `Types.ObjectId` — Mongoose casts
 * strings to ObjectId at runtime regardless, so forcing the stricter type here
 * only adds friction, not safety (Zod already validated the id shape upstream).
 */
type MutationInput = Record<string, unknown>;

/** Generic CRUD + pagination + soft-delete + bulk operations, shared by every domain repository. */
export class BaseRepository<TSchema> {
  constructor(protected readonly model: Model<TSchema>) {}

  create(data: MutationInput) {
    return this.model.create(data as AnyKeys<TSchema>);
  }

  /**
   * Bulk-insert for Excel import: `ordered: false` so one bad row (duplicate key,
   * failed validator) doesn't abort the rest of the batch. Returns per-row success/
   * failure so the caller (e.g. the generic `/import/excel` route) can report a
   * partial-success summary instead of an all-or-nothing failure.
   */
  async bulkCreate(
    rows: MutationInput[],
  ): Promise<{ inserted: number; failed: { row: number; error: string }[] }> {
    if (rows.length === 0) return { inserted: 0, failed: [] };
    try {
      const result = await this.model.insertMany(rows as AnyKeys<TSchema>[], {
        ordered: false,
        rawResult: true,
      });
      const failed: { row: number; error: string }[] = [];
      const writeErrors = (result as unknown as { mongoose?: { validationErrors?: unknown[] } })
        .mongoose?.validationErrors;
      const insertedCount = result.insertedCount ?? 0;
      if (Array.isArray(writeErrors) && writeErrors.length > 0) {
        for (const err of writeErrors) {
          failed.push({ row: -1, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { inserted: insertedCount, failed };
    } catch (err) {
      const bulkErr = err as {
        insertedDocs?: unknown[];
        writeErrors?: { index: number; errmsg?: string; err?: { errmsg?: string } }[];
        message?: string;
      };
      if (Array.isArray(bulkErr.writeErrors)) {
        return {
          inserted: bulkErr.insertedDocs?.length ?? 0,
          failed: bulkErr.writeErrors.map((we) => ({
            row: we.index,
            error: we.errmsg ?? we.err?.errmsg ?? 'Insert failed',
          })),
        };
      }
      // Non-bulk-write error (e.g. all rows failed schema cast before hitting Mongo).
      return {
        inserted: 0,
        failed: rows.map((_, index) => ({ row: index, error: bulkErr.message ?? 'Insert failed' })),
      };
    }
  }

  findById(id: string, options: QueryOptions = {}) {
    return this.model.findById(id, null, options).lean();
  }

  /**
   * Prompt 23 Part 14/21 — SEO-friendly product/category URLs need to resolve
   * by `slug`, while every pre-existing bookmark/internal link still uses the
   * raw Mongo `_id`. Rather than adding a second route (which would fragment
   * "how do I look up a product" across the codebase), this ONE lookup tries
   * both: a syntactically valid ObjectId is tried as `_id` first (existing
   * behavior, zero regression), otherwise (or if that misses) it falls back
   * to `slug`. `deletedAt: null` is implicit via Mongoose's `find`/`findOne`
   * query middleware (auditPlugin), same as every other read in this class.
   */
  async findByIdOrSlug(idOrSlug: string, options: QueryOptions = {}) {
    if (mongoose.isValidObjectId(idOrSlug)) {
      const byId = await this.model.findById(idOrSlug, null, options).lean();
      if (byId) return byId;
    }
    return this.model.findOne({ slug: idOrSlug } as FilterQuery<TSchema>, null, options).lean();
  }

  findOne(filter: FilterQuery<TSchema>, options: QueryOptions = {}) {
    return this.model.findOne(filter, null, options).lean();
  }

  find(filter: FilterQuery<TSchema> = {}, options: QueryOptions = {}) {
    return this.model.find(filter, null, options).lean();
  }

  async paginate(
    filter: FilterQuery<TSchema>,
    options: PaginateOptions = {},
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;
    const sort = parseSort(options.sort) ?? { createdAt: -1 };

    const [items, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);

    return {
      items: items as Record<string, unknown>[],
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  updateById(id: string, data: MutationInput) {
    return this.model.findByIdAndUpdate(id, data as UpdateQuery<TSchema>, {
      new: true,
      runValidators: true,
    });
  }

  async softDeleteById(id: string, userId?: string | null): Promise<boolean> {
    const result = await this.model.updateOne(
      { _id: id, deletedAt: null } as FilterQuery<TSchema>,
      {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
      } as UpdateQuery<TSchema>,
    );
    return result.modifiedCount > 0;
  }

  async bulkSoftDelete(ids: string[], userId?: string | null) {
    return this.model.updateMany(
      { _id: { $in: ids } } as FilterQuery<TSchema>,
      {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
      } as UpdateQuery<TSchema>,
    );
  }

  bulkUpdate(ids: string[], data: MutationInput) {
    return this.model.updateMany(
      { _id: { $in: ids } } as FilterQuery<TSchema>,
      data as UpdateQuery<TSchema>,
    );
  }

  count(filter: FilterQuery<TSchema> = {}) {
    return this.model.countDocuments(filter);
  }
}
