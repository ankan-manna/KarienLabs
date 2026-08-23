import { NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';

import { dynamicMenuRepository } from './dynamic-menu.repository';

interface MenuTreeNode extends Record<string, unknown> {
  _id: string;
  children: MenuTreeNode[];
}

function buildFilter(placement?: string): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (placement) filter.placement = placement;
  return filter;
}

/** Empty-string parentId (the "None (top-level)" select option) means top-level, not "unset". */
function normalizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  if (normalized.parentId === '') normalized.parentId = null;
  for (const key of ['requiredPermission', 'requiredRole', 'requiredFeatureFlag'] as const) {
    if (normalized[key] === '') normalized[key] = null;
  }
  return normalized;
}

/**
 * Real pagination (-24-style bug fix — this previously returned the
 * FULL unpaginated list via a plain `sendSuccess(res, items)`, which left
 * `meta: null` in the response envelope; the admin table page's generic
 * ConfigEntityPage always reads `data.meta.total` unconditionally, exactly
 * like every other CRUD module's list endpoint, so it crashed with
 * "Cannot read properties of null (reading 'total')"). `findAllSorted` (used
 * by getDynamicMenuTree above) is untouched — the tree view still needs the
 * FULL set to link parents/children, that's a separate, deliberately
 * unpaginated code path.
 */
export function listDynamicMenu(query: ListQuery & { placement?: string }) {
  const filter = buildFilter(query.placement);
  return dynamicMenuRepository.paginate(filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort || 'order,createdAt',
  });
}

/** Nests the flat, order-sorted list into parent/children arrays server-side. */
export async function getDynamicMenuTree(placement?: string): Promise<MenuTreeNode[]> {
  const items = await dynamicMenuRepository.findAllSorted(buildFilter(placement));

  const byId = new Map<string, MenuTreeNode>();
  for (const item of items) {
    const record = item as unknown as Record<string, unknown> & { _id: unknown };
    byId.set(String(record._id), { ...record, _id: String(record._id), children: [] });
  }

  const roots: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parentId ? String(node.parentId) : null;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getDynamicMenuById(id: string) {
  const item = await dynamicMenuRepository.findById(id);
  if (!item) throw new NotFoundError('Menu item');
  return item;
}

export function createDynamicMenu(input: Record<string, unknown>, actorId: string) {
  return dynamicMenuRepository.create({ ...normalizeInput(input), createdBy: actorId });
}

export async function updateDynamicMenu(
  id: string,
  input: Record<string, unknown>,
  actorId: string,
) {
  const updated = await dynamicMenuRepository.updateById(id, {
    ...normalizeInput(input),
    updatedBy: actorId,
  });
  if (!updated) throw new NotFoundError('Menu item');
  return updated;
}

export async function deleteDynamicMenu(id: string, actorId: string) {
  const deleted = await dynamicMenuRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Menu item');
}

export async function reorderDynamicMenu(items: { id: string; order: number }[]) {
  const succeeded = await dynamicMenuRepository.bulkReorder(items);
  return { requested: items.length, succeeded, failed: items.length - succeeded };
}

export async function bulkDeleteDynamicMenu(ids: string[], actorId: string) {
  const result = await dynamicMenuRepository.bulkSoftDelete(ids, actorId);
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

export async function bulkUpdateDynamicMenu(
  ids: string[],
  patch: Record<string, unknown>,
  actorId: string,
) {
  const result = await dynamicMenuRepository.bulkUpdate(ids, {
    ...normalizeInput(patch),
    updatedBy: actorId,
  });
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}
