import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const bannerSchema = new Schema({
  title: { type: String, required: true },
  // Website Design (Storefront Management) — hero carousel needs more than
  // a bare title: a supporting line, and a CTA whose LABEL is admin-editable
  // (previously the storefront hardcoded "Shop medicines" regardless of
  // what the banner was promoting).
  subtitle: { type: String, default: '' },
  // A short eyebrow/label shown above the title (e.g. "New" or "Limited time")
  // — optional, purely decorative, never required for a slide to render.
  badge: { type: String, default: '' },
  imageUrl: { type: String, required: true },
  // Meaningful alt text for the hero image — falls back to `title` at the
  // render layer when unset, but an admin can override it with something
  // more descriptive of the image itself (accessibility requirement).
  imageAlt: { type: String, default: '' },
  // The Cloudinary public_id for `imageUrl`, when it was uploaded through
  // the admin's Cloudinary upload widget (vs. a hand-pasted external URL,
  // which has no Cloudinary asset to manage). Required for safe deletion —
  // without it there is no way to ever destroy the old asset when an image
  // is replaced, so it would leak forever. `null`, never empty string, so
  // "no known Cloudinary asset" is unambiguous.
  imagePublicId: { type: String, default: null },
  linkUrl: { type: String, default: '' },
  ctaText: { type: String, default: '' },
  // Optional second CTA (e.g. primary "Shop now" + secondary "Learn more").
  // Both fields are required together in practice, but stored independently
  // so a half-filled pair just renders no secondary button rather than erroring.
  secondaryCtaText: { type: String, default: '' },
  secondaryCtaLink: { type: String, default: '' },
  placement: { type: String, enum: ['hero', 'category', 'checkout'], default: 'hero' },
  order: { type: Number, default: 0 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  // Per-banner override for how long this slide stays on screen in the hero
  // carousel before auto-advancing; `null` means "use the carousel's own
  // default duration" (see HeroCarousel.tsx).
  slideDurationMs: { type: Number, default: null },
  isActive: { type: Boolean, default: true, index: true },
});

bannerSchema.index({ placement: 1, isActive: 1, order: 1 });

auditPlugin(bannerSchema);

export type BannerDocument = InferSchemaType<typeof bannerSchema>;
export const BannerModel = model('Banner', bannerSchema);
