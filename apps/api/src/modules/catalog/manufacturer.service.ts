import { ConflictError, NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { slugify } from '../../utils/slugify';

import { manufacturerRepository } from './manufacturer.repository';

interface CreateManufacturerInput {
  name: string;
  slug?: string;
  licenseNumber?: string;
  address?: string;
  isActive?: boolean;
}

export async function createManufacturer(input: CreateManufacturerInput, actorId: string) {
  const slug = slugify(input.slug ?? input.name);
  if (await manufacturerRepository.findBySlug(slug)) {
    throw new ConflictError(`Manufacturer slug "${slug}" already exists`);
  }
  return manufacturerRepository.create({ ...input, slug, createdBy: actorId });
}

export async function updateManufacturer(
  id: string,
  input: Partial<CreateManufacturerInput>,
  actorId: string,
) {
  const patch = { ...input, updatedBy: actorId } as Record<string, unknown>;
  if (input.slug) patch.slug = slugify(input.slug);
  const updated = await manufacturerRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Manufacturer');
  return updated;
}

export async function deleteManufacturer(id: string, actorId: string) {
  const deleted = await manufacturerRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Manufacturer');
}

export async function getManufacturerById(id: string) {
  const manufacturer = await manufacturerRepository.findById(id);
  if (!manufacturer) throw new NotFoundError('Manufacturer');
  return manufacturer;
}

export function listManufacturers(query: ListQuery) {
  return manufacturerRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}
