import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { getPublicSiteSettings } from '../../api/public-cms.api';
import { toast } from '../../utils/toast';

const POLICY_LINKS = [
  { label: 'Privacy Policy', to: '/privacy-policy' },
  { label: 'Terms & Conditions', to: '/terms' },
  { label: 'Return Policy', to: '/return-policy' },
  { label: 'Shipping Policy', to: '/shipping-policy' },
  { label: 'Cancellation Policy', to: '/cancellation-policy' },
  { label: 'Refund Policy', to: '/refund-policy' },
];

const QUICK_LINKS = [
  { label: 'About Us', to: '/about' },
  { label: 'Contact Us', to: '/contact' },
  // Prompt 32 — deliberately its own link, distinct from "Contact Us" above
  // (Part 3/59: a separate feature, never merged into it).
  { label: 'Bulk Purchase / Distributor Enquiry', to: '/bulk-purchase' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Blog', to: '/blog' },
  { label: 'Offers', to: '/offers' },
  { label: 'Brands', to: '/brands' },
  { label: 'Manufacturers', to: '/manufacturers' },
];

const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://facebook.com', icon: '📘' },
  { label: 'Instagram', href: 'https://instagram.com', icon: '📷' },
  { label: 'Twitter', href: 'https://twitter.com', icon: '🐦' },
];

/**
 * Newsletter form has no backend endpoint yet (no NewsletterSubscriber model in
 * this build) — submission is client-only, shows a success toast, and is
 * disclosed here as a placeholder for a future `/newsletter/subscribe` route.
 */
function NewsletterForm() {
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    toast.success("Subscribed! We'll keep you posted on offers and new arrivals.");
    setEmail('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      <button
        type="submit"
        className="whitespace-nowrap rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Subscribe
      </button>
    </form>
  );
}

/**
 * Footer content (quick links, social URLs, company description) is sourced from
 * the CMS Configuration Engine ('cms' namespace) via a public, unauthenticated
 * endpoint (`GET /public/cms/site-settings`) so it renders without a session.
 * `QUICK_LINKS`/`SOCIAL_LINKS`/the default description above remain in place as a
 * fallback: if the config hasn't been set yet (empty `{}`) or the fetch fails for
 * any reason, the storefront still renders a fully-populated footer.
 */
export function Footer() {
  const { data: settings } = useQuery({
    queryKey: ['public-site-settings'],
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const quickLinks =
    settings?.footer?.quickLinks && settings.footer.quickLinks.length > 0
      ? settings.footer.quickLinks.map((l) => ({ label: l.label, to: l.path }))
      : QUICK_LINKS;

  const companyDescription =
    settings?.footer?.companyDescription?.trim() ||
    'Genuine medicines, delivered fast from verified pharmacies.';

  const socialLinks = settings?.footer?.socialLinks;
  const resolvedSocialLinks = SOCIAL_LINKS.map((s) => ({
    ...s,
    href:
      (s.label === 'Facebook' && socialLinks?.facebook) ||
      (s.label === 'Instagram' && socialLinks?.instagram) ||
      (s.label === 'Twitter' && socialLinks?.twitter) ||
      s.href,
  }));

  return (
    <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" aria-label="KarienLabs" className="inline-flex items-center">
              <img src="/logo.jpg" alt="KarienLabs" className="h-8 w-auto rounded" />
            </Link>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{companyDescription}</p>
            <div className="mt-3 flex gap-3">
              {resolvedSocialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="text-lg hover:opacity-70"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Quick Links
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {quickLinks.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-gray-600 hover:text-brand-600 dark:text-gray-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Policies
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {POLICY_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-gray-600 hover:text-brand-600 dark:text-gray-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Stay Updated
            </h3>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Subscribe for offers and health tips.
            </p>
            <div className="mt-2">
              <NewsletterForm />
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-6 text-center text-xs text-gray-400 dark:border-gray-800">
          © {new Date().getFullYear()} KarienLabs. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
