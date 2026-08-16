import { Router } from 'express';

import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { NotFoundError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';
import { resolveProductAvailability } from '../catalog/bundle.service';
import { getConfiguration } from '../platform/configuration.service';

import { BannerModel } from './models/banner.model';
import { BlogModel } from './models/blog.model';
import { FaqModel } from './models/faq.model';
import { HomeSectionModel } from './models/home-section.model';
import { PageModel } from './models/page.model';

/**
 * Anonymous-readable CMS surface — separate from `cms.routes.ts` (the admin CRUD,
 * built on `createCrudRouter`, which requires auth on every route including reads).
 * Public storefront pages (About Us, Blog, FAQ, Privacy Policy, homepage banners)
 * need to fetch this content without a logged-in session, so these are bespoke
 * read-only handlers scoped to published/active content only — never exposes
 * drafts, and never mutates anything.
 */
export const publicCmsRouter = Router();

publicCmsRouter.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const placement = typeof req.query.placement === 'string' ? req.query.placement : undefined;
    const filter: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    };
    if (placement) filter.placement = placement;
    const banners = await BannerModel.find(filter).sort({ order: 1 }).lean();
    return sendSuccess(res, banners);
  }),
);

publicCmsRouter.get(
  '/home-sections',
  asyncHandler(async (_req, res) => {
    const sections = await HomeSectionModel.find({ isActive: true, deletedAt: null })
      .sort({ order: 1 })
      .populate('productIds', 'name slug basePrice mrp images ratingAvg ratingCount')
      .populate('categoryIds', 'name slug')
      .lean();

    // Combo-catalog fix (Part 11) — CMS-curated "featured products" must
    // report the SAME authoritative, bundle-aware `inStock` flag every other
    // storefront surface does (never fabricated as always-true here; an
    // admin-featured product/combo genuinely can sell out).
    const productIds = sections.flatMap((s) =>
      (s.productIds as unknown as { _id: unknown }[]).map((p) => String(p._id)),
    );
    const availabilityMap = await resolveProductAvailability(productIds);
    const sectionsWithStock = sections.map((section) => ({
      ...section,
      productIds: (section.productIds as unknown as { _id: unknown }[]).map((p) => ({
        ...p,
        inStock: (availabilityMap.get(String(p._id)) ?? 0) > 0,
      })),
    }));

    return sendSuccess(res, sectionsWithStock);
  }),
);

publicCmsRouter.get(
  '/faqs',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const filter: Record<string, unknown> = { isActive: true, deletedAt: null };
    if (category) filter.category = category;
    const faqs = await FaqModel.find(filter).sort({ category: 1, order: 1 }).lean();
    return sendSuccess(res, faqs);
  }),
);

publicCmsRouter.get(
  '/pages/:slug',
  asyncHandler(async (req, res) => {
    const page = await PageModel.findOne({
      slug: req.params.slug,
      isPublished: true,
      deletedAt: null,
    }).lean();
    if (!page) throw new NotFoundError('Page');
    return sendSuccess(res, page);
  }),
);

publicCmsRouter.get(
  '/blogs',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, filter, search } = req.query as unknown as ListQuery;
    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = { ...filter, isPublished: true, deletedAt: null };
    if (search) query.$text = { $search: search };

    const [items, total] = await Promise.all([
      BlogModel.find(query)
        .select('-content')
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogModel.countDocuments(query),
    ]);
    return sendPaginated(res, items, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

publicCmsRouter.get(
  '/blogs/:slug',
  asyncHandler(async (req, res) => {
    const blog = await BlogModel.findOne({
      slug: req.params.slug,
      isPublished: true,
      deletedAt: null,
    })
      .populate('authorId', 'name')
      .lean();
    if (!blog) throw new NotFoundError('Blog post');
    return sendSuccess(res, blog);
  }),
);

/**
 * Footer/site-wide settings (footer content + global SEO defaults) — stored in the
 * Configuration Engine under the 'cms' namespace (see configuration.service.ts).
 * Anonymous-readable so the public storefront Footer can render configured quick
 * links/social links without an authenticated session.
 */
publicCmsRouter.get(
  '/site-settings',
  asyncHandler(async (_req, res) => {
    const value = await getConfiguration('cms');
    return sendSuccess(res, value);
  }),
);
