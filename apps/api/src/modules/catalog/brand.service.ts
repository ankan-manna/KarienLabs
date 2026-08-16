import { ConflictError, NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { slugify } from '../../utils/slugify';

import { brandRepository } from './brand.repository';

interface CreateBrandInput {
  name: string;
  slug?: string;
  logoUrl?: string;
  description?: string;
  isActive?: boolean;
}

export async function createBrand(input: CreateBrandInput, actorId: string) {
  const slug = slugify(input.slug ?? input.name);
  if (await brandRepository.findBySlug(slug))
    throw new ConflictError(`Brand slug "${slug}" already exists`);
  return brandRepository.create({ ...input, slug, createdBy: actorId });
}

export async function updateBrand(id: string, input: Partial<CreateBrandInput>, actorId: string) {
  const patch = { ...input, updatedBy: actorId } as Record<string, unknown>;
  if (input.slug) patch.slug = slugify(input.slug);
  const updated = await brandRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Brand');
  return updated;
}

export async function deleteBrand(id: string, actorId: string) {
  const deleted = await brandRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Brand');
}

export async function getBrandById(id: string) {
  const brand = await brandRepository.findById(id);
  if (!brand) throw new NotFoundError('Brand');
  return brand;
}

export function listBrands(query: ListQuery) {
  return brandRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}
