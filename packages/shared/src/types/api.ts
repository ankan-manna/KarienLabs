export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  } | null;
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
