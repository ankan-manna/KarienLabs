import { RESOURCES } from '@medcommerce/shared';
import { Router } from 'express';

import { createCrudRouter } from '../../utils/crud-router.factory';
import { slugify } from '../../utils/slugify';

import { bannerRepository } from './banner.repository';
import { blogRepository } from './blog.repository';
import {
  createBannerSchema,
  createBlogSchema,
  createFaqSchema,
  createHomeSectionSchema,
  createPageSchema,
} from './cms.validators';
import { faqRepository } from './faq.repository';
import { homeSectionRepository } from './home-section.repository';
import { pageRepository } from './page.repository';

/**
 * All CMS content (banners, homepage sections, FAQs, static pages, blog posts) is
 * simple config-style CRUD, so the whole module is built on the generic factory —
 * only slug generation for pages/blogs needs a custom `transformInput` hook.
 */
export const cmsRouter = Router();

cmsRouter.use(
  '/banners',
  createCrudRouter({
    resource: RESOURCES.CMS,
    repository: bannerRepository,
    createSchema: createBannerSchema,
    label: 'Banner',
    excelColumns: [
      { header: 'Title', key: 'title', width: 24 },
      { header: 'Placement', key: 'placement', width: 14 },
      { header: 'Order', key: 'order', width: 10 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

cmsRouter.use(
  '/home-sections',
  createCrudRouter({
    resource: RESOURCES.CMS,
    repository: homeSectionRepository,
    createSchema: createHomeSectionSchema,
    label: 'Home section',
    excelColumns: [
      { header: 'Title', key: 'title', width: 24 },
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Order', key: 'order', width: 10 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

cmsRouter.use(
  '/faqs',
  createCrudRouter({
    resource: RESOURCES.CMS,
    repository: faqRepository,
    createSchema: createFaqSchema,
    label: 'FAQ',
    excelColumns: [
      { header: 'Question', key: 'question', width: 40 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Order', key: 'order', width: 10 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

cmsRouter.use(
  '/pages',
  createCrudRouter({
    resource: RESOURCES.CMS,
    repository: pageRepository,
    createSchema: createPageSchema,
    label: 'Page',
    excelColumns: [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Slug', key: 'slug', width: 24 },
      { header: 'Published', key: 'isPublished', width: 12 },
    ],
    transformInput: (input) => {
      if (!input.slug && !input.title) return input;
      const slugSource = (input.slug as string | undefined) ?? (input.title as string);
      return { ...input, slug: slugify(slugSource) };
    },
  }),
);

cmsRouter.use(
  '/blogs',
  createCrudRouter({
    resource: RESOURCES.CMS,
    repository: blogRepository,
    createSchema: createBlogSchema,
    label: 'Blog post',
    excelColumns: [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Slug', key: 'slug', width: 24 },
      { header: 'Published', key: 'isPublished', width: 12 },
    ],
    transformInput: (input, ctx) => {
      const result = { ...input };
      if (input.slug || input.title) {
        const slugSource = (input.slug as string | undefined) ?? (input.title as string);
        result.slug = slugify(slugSource);
      }
      if (ctx.isCreate) result.authorId = ctx.user!.id;
      return result;
    },
  }),
);
