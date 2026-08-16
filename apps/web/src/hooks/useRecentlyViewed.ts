import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mc_recently_viewed';
const MAX_ITEMS = 12;

/** Purely client-side (localStorage) — no backend model for this, matching how most storefronts implement "recently viewed" as a browser-local feature rather than synced account state. */
export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const recordView = useCallback((productId: string) => {
    setIds((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        try {
          setIds(e.newValue ? (JSON.parse(e.newValue) as string[]) : []);
        } catch {
          /* ignore malformed value from another tab */
        }
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { ids, recordView };
}
