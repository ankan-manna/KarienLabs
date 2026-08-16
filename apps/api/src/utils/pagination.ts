import { z } from 'zod';

/**
 * Standard list-query contract every paginated endpoint validates against.
 * `filter[status]=pending&filter[categoryId]=...` arrives as `req.query.filter`
 * (Express's default `qs` parser handles the bracket notation), passed straight
 * into the repository as a Mongo filter — callers narrow it further per-endpoint.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  search: z.string().trim().optional(),
  filter: z.record(z.string(), z.string()).optional().default({}),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** Converts "-createdAt,name" into { createdAt: -1, name: 1 }. */
export function parseSort(sort?: string): Record<string, 1 | -1> | undefined {
  if (!sort) return undefined;
  const result: Record<string, 1 | -1> = {};
  for (const field of sort.split(',')) {
    const trimmed = field.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('-')) result[trimmed.slice(1)] = -1;
    else result[trimmed] = 1;
  }
  return Object.keys(result).length ? result : undefined;
}
