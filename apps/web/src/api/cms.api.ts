import { createCrudApi } from './createCrudApi';

export interface Banner {
  _id: string;
  title: string;
  subtitle: string;
  badge: string;
  imageUrl: string;
  imageAlt: string;
  imagePublicId: string | null;
  linkUrl: string;
  ctaText: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  placement: 'hero' | 'category' | 'checkout';
  order: number;
  startsAt: string | null;
  endsAt: string | null;
  slideDurationMs: number | null;
  isActive: boolean;
}

export const bannerApi = createCrudApi<Banner>('/cms/banners');

export interface HomeSection {
  _id: string;
  title: string;
  type: 'product_grid' | 'category_grid' | 'banner_carousel';
  sourceType: 'manual' | 'category' | 'tag' | 'query';
  order: number;
  isActive: boolean;
}

export const homeSectionApi = createCrudApi<HomeSection>('/cms/home-sections');

export interface Faq {
  _id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  isActive: boolean;
}

export const faqApi = createCrudApi<Faq>('/cms/faqs');

export interface CmsPage {
  _id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
}

export const pageApi = createCrudApi<CmsPage>('/cms/pages');

export interface Blog {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  isPublished: boolean;
  tags: string[];
}

export const blogApi = createCrudApi<Blog>('/cms/blogs');
