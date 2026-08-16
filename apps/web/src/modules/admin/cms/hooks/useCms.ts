import { bannerApi, blogApi, faqApi, homeSectionApi, pageApi } from '../../../../api/cms.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const bannerHooks = createCrudHooks('cms-banners', bannerApi);
export const homeSectionHooks = createCrudHooks('cms-home-sections', homeSectionApi);
export const faqHooks = createCrudHooks('cms-faqs', faqApi);
export const pageHooks = createCrudHooks('cms-pages', pageApi);
export const blogHooks = createCrudHooks('cms-blogs', blogApi);
