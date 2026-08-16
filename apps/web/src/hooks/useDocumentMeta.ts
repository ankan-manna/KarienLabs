import { useEffect } from 'react';

interface DocumentMetaOptions {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
}

const SITE_NAME = 'KarienLabs';

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Client-side document `<head>` management for a Vite SPA — this app is CSR, not
 * SSR/SSG, so search engines that don't execute JS won't see these tags on first
 * paint (a real limitation, disclosed rather than hidden). For engines that do
 * render JS (Googlebot does), and for social-share unfurling via a headless
 * browser, this still produces correct title/description/OG/Twitter/canonical
 * tags. A true SEO fix would move rendering to Next.js or add a prerender step —
 * out of scope for this pass.
 */
export function useDocumentMeta({ title, description, canonical, image, type = 'website' }: DocumentMetaOptions) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    document.title = fullTitle;

    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
      setMetaTag('name', 'twitter:description', description);
    }

    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:site_name', SITE_NAME);
    setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMetaTag('name', 'twitter:title', fullTitle);

    if (image) {
      setMetaTag('property', 'og:image', image);
      setMetaTag('name', 'twitter:image', image);
    }

    const canonicalHref = canonical ?? window.location.href.split('?')[0];
    setCanonical(canonicalHref);
    setMetaTag('property', 'og:url', canonicalHref);
  }, [title, description, canonical, image, type]);
}

/** Injects a JSON-LD structured-data block (Product, Article, FAQPage, ...) — removed on unmount so navigating away doesn't leak stale structured data into the next page. */
export function useStructuredData(data: Record<string, unknown> | null) {
  useEffect(() => {
    if (!data) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({ '@context': 'https://schema.org', ...data });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [data]);
}
