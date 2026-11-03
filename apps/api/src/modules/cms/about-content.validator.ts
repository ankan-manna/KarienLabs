import { z } from 'zod';

/**
 * Icon choices are a closed enum (not free-text/HTML) so the admin-authored
 * "About Us" block can never inject arbitrary markup/SVG — the frontend
 * looks each key up against a fixed, hand-authored icon component map and
 * falls back to a generic icon for anything unrecognized.
 */
const iconKeySchema = z.enum(['values', 'compass', 'rx', 'lock', 'verified', 'truck', 'heart', 'shield']);

const contentBlockSchema = z.object({
  iconKey: iconKeySchema,
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(400),
});

export const aboutContentSchema = z.object({
  tagline: z.string().trim().max(80).default(''),
  heading: z.string().trim().max(160).default(''),
  description: z.string().trim().max(1000).default(''),
  mainImageUrl: z.string().trim().url().or(z.literal('')).default(''),
  mainImagePublicId: z.string().nullable().default(null),
  mainImageAlt: z.string().trim().max(200).default(''),
  blocks: z.array(contentBlockSchema).max(8).default([]),
  highlightsTagline: z.string().trim().max(80).default(''),
  highlightsHeading: z.string().trim().max(160).default(''),
  highlightsDescription: z.string().trim().max(1000).default(''),
  highlightsImageUrl: z.string().trim().url().or(z.literal('')).default(''),
  highlightsImagePublicId: z.string().nullable().default(null),
  highlightsImageAlt: z.string().trim().max(200).default(''),
  highlights: z.array(contentBlockSchema).max(8).default([]),
});

export type AboutContentInput = z.infer<typeof aboutContentSchema>;
