import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPublicSiteSettings } from '../../api/public-cms.api';
import { NewsletterForm } from '../common/NewsletterForm';

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
  // deliberately its own link, distinct from "Contact Us" above
  // (Part 3/59: a separate feature, never merged into it).
  { label: 'Bulk Purchase / Distributor Enquiry', to: '/bulk-purchase' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Blog', to: '/blog' },
  { label: 'Offers', to: '/offers' },
  { label: 'Brands', to: '/brands' },
  { label: 'Manufacturers', to: '/manufacturers' },
];

// Simple, monochrome inline SVG icons (no external icon library dependency) —
// `currentColor` so they inherit the same hover-to-accent treatment as every
// other footer link, rather than staying a fixed emoji color regardless of
// hover/theme state.
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.256 1.216.6 1.772 1.153a4.9 4.9 0 0 1 1.153 1.772c.247.637.415 1.363.465 2.428.048 1.066.06 1.405.06 4.122 0 2.717-.012 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.9 4.9 0 0 1-1.153 1.772 4.9 4.9 0 0 1-1.772 1.153c-.637.247-1.363.415-2.428.465-1.066.048-1.405.06-4.122.06-2.717 0-3.056-.012-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.9 4.9 0 0 1-1.772-1.153 4.9 4.9 0 0 1-1.153-1.772c-.247-.637-.415-1.363-.465-2.428C2.012 15.056 2 14.717 2 12c0-2.717.012-3.056.06-4.122.05-1.065.218-1.79.465-2.428a4.9 4.9 0 0 1 1.153-1.772A4.9 4.9 0 0 1 5.45 2.525c.637-.248 1.363-.415 2.428-.465C8.944 2.012 9.283 2 12 2Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.25a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5ZM17.5 6.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M21.8 8.001a2.75 2.75 0 0 0-1.94-1.946C18.148 5.6 12 5.6 12 5.6s-6.148 0-7.86.455A2.75 2.75 0 0 0 2.2 8.001C1.75 9.723 1.75 12 1.75 12s0 2.277.45 3.999a2.75 2.75 0 0 0 1.94 1.946c1.712.455 7.86.455 7.86.455s6.148 0 7.86-.455a2.75 2.75 0 0 0 1.94-1.946C22.25 14.277 22.25 12 22.25 12s0-2.277-.45-3.999ZM9.9 15.15V8.85L15.5 12l-5.6 3.15Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.83v1.64h.05c.53-1 1.85-2.06 3.8-2.06 4.07 0 4.82 2.68 4.82 6.16V21H18.5v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H10.6V9Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.507 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94Z" />
    </svg>
  );
}

// Exact, real KarienLabs accounts as supplied — no other social accounts are
// invented. `key` doubles as the `socialLinks` config field admin-configured
// URLs (if any) are looked up by.
const SOCIAL_LINKS = [
  { key: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/karien.labs/', Icon: InstagramIcon },
  { key: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/@KarienLabs', Icon: YoutubeIcon },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/karien-labs/',
    Icon: LinkedInIcon,
  },
  { key: 'twitter', label: 'X (Twitter)', href: 'https://x.com/Karienlabs', Icon: XIcon },
  {
    key: 'facebook',
    label: 'Facebook',
    href: 'https://www.facebook.com/profile.php?id=61592521003048',
    Icon: FacebookIcon,
  },
] as const;

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
    href: socialLinks?.[s.key] || s.href,
  }));

  return (
    <footer className="bg-ink">
      <div className="mx-auto max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" aria-label="KarienLabs" className="inline-flex items-center">
              <img src="/logo.jpg" alt="KarienLabs" className="h-8 w-auto rounded" />
            </Link>
            <p className="mt-2 text-xs text-white/60">{companyDescription}</p>
            <div className="mt-3 flex gap-3">
              {resolvedSocialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-white/70 transition-colors hover:text-accent"
                >
                  <s.Icon />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Quick Links
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {quickLinks.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-white/75 hover:text-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Policies
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {POLICY_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-white/75 hover:text-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Stay Updated
            </h3>
            <p className="mt-3 text-xs text-white/60">
              Subscribe for offers and health tips.
            </p>
            <div className="mt-2">
              <NewsletterForm variant="dark" />
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          © {new Date().getFullYear()} KarienLabs. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
