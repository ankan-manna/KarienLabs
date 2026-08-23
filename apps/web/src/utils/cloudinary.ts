/**
 *  (Product Image Management) Part 29 — "Do not load every
 * high-resolution sub-image on Home/All Products... use appropriate
 * Cloudinary transformations/resizing." Cloudinary supports URL-based
 * transformations (no SDK/API call needed) by inserting a transformation
 * segment right after `/upload/` in the delivery URL — this just does that
 * string insertion, so product cards/thumbnails request an appropriately
 * sized, auto-format/auto-quality image instead of the original upload.
 * Falls back to the original URL untouched if it doesn't look like a
 * Cloudinary delivery URL (e.g. missing/legacy data) — never throws.
 */
export function cloudinaryUrl(url: string | null | undefined, transformation: string): string {
  if (!url) return '';
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}${transformation}/${url.slice(insertAt)}`;
}

/** `c_fill` crops to an exact box (product cards — uniform grid cells); `c_fit` scales down without cropping (galleries — never crops product detail). `q_auto,f_auto` let Cloudinary pick the best quality/format (WebP/AVIF where supported) automatically. */
export const CLOUDINARY_PRESETS = {
  cardThumbnail: 'w_400,h_400,c_fill,q_auto,f_auto',
  galleryThumbnail: 'w_160,h_160,c_fill,q_auto,f_auto',
  galleryMain: 'w_1000,h_1000,c_fit,q_auto,f_auto',
} as const;
