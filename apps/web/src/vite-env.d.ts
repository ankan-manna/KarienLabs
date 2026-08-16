/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Prompt 34 Part 13/17 — GA4 Measurement ID (e.g. `G-XXXXXXXXXX`). Public,
   * client-side build config, never a secret (Part 17: "GA measurement ID
   * is public client-side config"), so it is safe to bake into the built
   * bundle like `VITE_API_BASE_URL` already is. Optional: `apps/web/src/
   * lib/analytics.ts` no-ops entirely when this is unset.
   */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
