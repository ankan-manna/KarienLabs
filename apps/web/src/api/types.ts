export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  filter?: Record<string, string>;
}
