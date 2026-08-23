import { SEO_AUDIT_ACTIONS, type Role } from '@medcommerce/shared';

import { ConflictError, NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { slugify } from '../../utils/slugify';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';

import { categoryRepository } from './category.repository';

interface CreateCategoryInput {
  name: string;
  slug?: string;
  parentId?: string | null;
  description?: string;
  imageUrl?: string;
  order?: number;
  isExpirableDefault?: boolean;
  requiresPrescriptionDefault?: boolean;
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string };
  faq?: { question: string; answer: string }[];
}

export async function createCategory(input: CreateCategoryInput, actorId: string) {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  const existing = await categoryRepository.findBySlug(slug);
  if (existing) throw new ConflictError(`Category slug "${slug}" already exists`);

  return categoryRepository.create({ ...input, slug, createdBy: actorId });
}

export async function updateCategory(
  id: string,
  input: Partial<CreateCategoryInput>,
  actorId: string,
  actorRole?: Role,
) {
  const before = await categoryRepository.findById(id);

  const patch = { ...input, updatedBy: actorId } as Record<string, unknown>;
  if (input.slug) patch.slug = slugify(input.slug);

  const updated = await categoryRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Category');

  // Part 18/40/41 — same distinct SEO-change audit signal as
  // product.service.ts::updateProduct; categories previously had NO audit
  // trail at all on update, so this is the first one, scoped to just the
  // SEO/FAQ fields (the sensitive/reviewable surface this  adds).
  if (before && ('seo' in input || 'faq' in input)) {
    await recordAudit({
      actorId,
      actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
      action: SEO_AUDIT_ACTIONS.CATEGORY_SEO_UPDATED,
      resource: 'category_seo',
      resourceId: id,
      before: { seo: (before as { seo?: unknown }).seo, faq: (before as { faq?: unknown }).faq },
      after: { seo: (updated as { seo?: unknown }).seo, faq: (updated as { faq?: unknown }).faq },
    });
  }

  return updated;
}

export async function deleteCategory(id: string, actorId: string) {
  const children = await categoryRepository.findChildren(id);
  if (children.length > 0) {
    throw new ConflictError('Cannot delete a category that still has subcategories');
  }
  const deleted = await categoryRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Category');
}

/** Part 15/21 — public detail lookup, resolves by `_id` (existing links) or `slug` (SEO-friendly links) via `findByIdOrSlug`. This is only used by the public `GET /:id` route (confirmed: no admin code path calls it). */
export async function getCategoryById(idOrSlug: string) {
  const category = await categoryRepository.findByIdOrSlug(idOrSlug);
  if (!category) throw new NotFoundError('Category');
  return category;
}

/** Flat, paginated, searchable — for the admin CRUD table (see listCategoryTree() below for the public nav-tree shape the storefront consumes instead). */
export function listCategories(query: ListQuery) {
  return categoryRepository.paginate(query.filter, { page: query.page, limit: query.limit, sort: query.sort });
}

export async function listCategoryTree() {
  const all = await categoryRepository.find({}, { sort: { order: 1 } });
  const byParent = new Map<string, typeof all>();
  for (const cat of all) {
    const key = cat.parentId ? String(cat.parentId) : 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(cat);
  }

  function attachChildren(node: (typeof all)[number]): unknown {
    return { ...node, children: (byParent.get(String(node._id)) ?? []).map(attachChildren) };
  }

  return (byParent.get('root') ?? []).map(attachChildren);
}
