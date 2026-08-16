import { useTheme } from '../../context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
