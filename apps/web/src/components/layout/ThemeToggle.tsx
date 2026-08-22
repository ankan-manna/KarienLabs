import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';

/** `className` is optional and purely additive — every existing caller (e.g. the Admin Topbar) that doesn't pass one keeps the exact same default styling. */
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
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
