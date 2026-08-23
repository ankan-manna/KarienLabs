import type { ApiResponse } from '@medcommerce/shared';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * The access token lives only in memory (module-scoped variable), never
 * localStorage/sessionStorage — reduces the XSS token-theft blast radius per the
 * auth architecture. It's lost on hard refresh by design; `bootstrapAuth()`
 * (called once on app mount) silently calls /auth/refresh using the httpOnly cookie
 * to re-establish it.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  withCredentials: true,
});

/** Non-axios, browser-navigation endpoints (Google OAuth redirect) need the plain base URL, not a configured axios instance. */
export function apiBaseUrl(): string {
  return (httpClient.defaults.baseURL as string) ?? '/api/v1';
}

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
      `${httpClient.defaults.baseURL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    if (data.success) {
      setAccessToken(data.data.accessToken);
      return data.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const isAuthRoute = originalRequest?.url?.includes('/auth/');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retried &&
      !isAuthRoute
    ) {
      originalRequest._retried = true;

      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });

      const newToken = await refreshPromise;
      if (newToken) {
        originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
        return httpClient(originalRequest);
      }

      setAccessToken(null);
      onUnauthorized?.();
    }

    // Every `.api.ts` file's `unwrap()` reads `response.error.message` for a
    // 2xx-with-`success:false` body, but axios REJECTS on any non-2xx status
    // before that code ever runs — so every `onError: (err) => err.message`
    // callsite across the app was silently getting axios's generic
    // "Request failed with status code 422" instead of the backend's actual,
    // specific validation message. Same structured `ApiResponse` shape,
    // same `error.message` field — just surfaced on the rejected error
    // itself instead of a successful response, so existing `err.message`
    // handlers everywhere start working without each one needing a change.
    const body = error.response?.data as { success?: boolean; error?: { message?: string } } | undefined;
    if (body?.success === false && typeof body.error?.message === 'string') {
      error.message = body.error.message;
    }

    return Promise.reject(error);
  },
);
