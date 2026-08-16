import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

/** Matches the shape every admin list endpoint returns (see BaseRepository.paginate on the backend). */
export interface ListResult<T> {
  items: T[];
  meta: PaginatedMeta;
}

/** One factory backing every simple admin CRUD module (Category/Brand/Manufacturer/Warehouse/Supplier/Coupon/...) — mirrors the backend's BaseRepository pattern on the frontend. */
export function createCrudApi<T, TCreateInput = Partial<T>, TUpdateInput = Partial<T>>(
  basePath: string,
) {
  async function list(params: ListQueryParams): Promise<ListResult<T>> {
    const { data } = await httpClient.get<ApiResponse<T[]>>(basePath, { params });
    if (!data.success) throw new Error(data.error.message);
    return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
  }

  async function getById(id: string): Promise<T> {
    const { data } = await httpClient.get<ApiResponse<T>>(`${basePath}/${id}`);
    return unwrap(data);
  }

  async function create(input: TCreateInput): Promise<T> {
    const { data } = await httpClient.post<ApiResponse<T>>(basePath, input);
    return unwrap(data);
  }

  async function update(id: string, input: TUpdateInput): Promise<T> {
    const { data } = await httpClient.patch<ApiResponse<T>>(`${basePath}/${id}`, input);
    return unwrap(data);
  }

  async function remove(id: string): Promise<void> {
    const { data } = await httpClient.delete<ApiResponse<{ deleted: boolean }>>(
      `${basePath}/${id}`,
    );
    unwrap(data);
  }

  interface BulkResult {
    requested: number;
    succeeded: number;
    failed: number;
  }

  /** Backed by the generic `createCrudRouter` factory on the backend (or the equivalent hand-written bulk endpoints on Products) — not every entity mounts these, only call from pages that know their API supports it. */
  async function bulkDelete(ids: string[]): Promise<BulkResult> {
    const { data } = await httpClient.post<ApiResponse<BulkResult>>(`${basePath}/bulk-delete`, {
      ids,
    });
    return unwrap(data);
  }

  async function bulkEdit(ids: string[], patch: Record<string, unknown>): Promise<BulkResult> {
    const { data } = await httpClient.post<ApiResponse<BulkResult>>(`${basePath}/bulk-edit`, {
      ids,
      patch,
    });
    return unwrap(data);
  }

  /** Triggers a browser download of the server-generated .xlsx — returns the Blob for callers that want to name/save it themselves. */
  async function exportExcel(): Promise<Blob> {
    const { data } = await httpClient.get(`${basePath}/export/excel`, { responseType: 'blob' });
    return data as Blob;
  }

  interface ImportResult {
    inserted: number;
    failed: { row: number; error: string }[];
  }

  /** Uploads an .xlsx to the generic `POST /import/excel` route (only mounted when the backend module passes `excelColumns` to `createCrudRouter`). */
  async function importExcel(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await httpClient.post<ApiResponse<ImportResult>>(
      `${basePath}/import/excel`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(data);
  }

  return { list, getById, create, update, remove, bulkDelete, bulkEdit, exportExcel, importExcel };
}
