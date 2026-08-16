import { getConfiguration } from '../platform/configuration.service';

/**
 * Prompt (Product Image Management) Part 4 — "Maximum Sub Images must be
 * configurable by Super Admin... must not be hardcoded... enforced by the
 * BACKEND." Stored/edited through the EXISTING Configuration Engine
 * (superadmin ConfigurationPage -> PUT /platform/configuration/catalog),
 * mirroring address-verification-config.service.ts's simple
 * get-plus-defaults shape — not a parallel settings surface.
 */
export interface CatalogConfig {
  maxSubImages: number;
}

export const DEFAULT_CATALOG_CONFIG: CatalogConfig = {
  maxSubImages: 5,
};

export async function getCatalogConfig(): Promise<CatalogConfig> {
  const raw = (await getConfiguration('catalog')) as Partial<Record<keyof CatalogConfig, unknown>>;
  const n = Number(raw.maxSubImages);
  return {
    maxSubImages: Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CATALOG_CONFIG.maxSubImages,
  };
}
