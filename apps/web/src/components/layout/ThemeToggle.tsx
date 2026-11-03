import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4M15.6 15.6l-1.4-1.4M5.8 5.8 4.4 4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M17 11.3A7 7 0 0 1 8.7 3a7 7 0 1 0 8.3 8.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** `className` is optional and purely additive — every existing caller (e.g. the Admin Topbar) that doesn't pass one keeps the exact same default styling. Icons are inline SVG (not emoji) so rendering is consistent across OS/fonts and matches the line-icon style used elsewhere (Header/Footer search, cart, social icons) — this swap is deliberately identical for both the storefront and the Admin Topbar, since it only changes the glyph, not any color/token. */
export function ThemeToggle({ className }: { className?: string } = {}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={cn(
        'rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
        className,
      )}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
