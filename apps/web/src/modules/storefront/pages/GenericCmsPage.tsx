import { useParams } from 'react-router-dom';

import { CmsPageView } from './CmsPageView';

/**
 * Catch-all for CMS pages beyond the 7 fixed policy slugs (About/Privacy/Terms/...),
 * which each get their own route so their canonical URLs read naturally
 * (`/about`, not `/page/about-us`). Any *other* page an admin creates in the CMS
 * Pages module ( 5) is reachable at `/page/:slug` — without this, a newly
 * created page would have no frontend route at all.
 */
export default function GenericCmsPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;
  return <CmsPageView slug={slug} />;
}
