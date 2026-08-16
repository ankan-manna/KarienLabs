import { useTheme } from '../context/ThemeContext';

/**
 * Recharts renders its own SVG/tooltip and doesn't see Tailwind's `dark:`
 * classes — `<Tooltip>`'s content box and `<CartesianGrid>`'s stroke need
 * actual color values, not utility classes. One shared hook instead of
 * duplicating this object in every chart page (Analytics, Reports, Search
 * Analytics, Dashboard all need it).
 */
export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return {
    gridClassName: 'stroke-gray-100 dark:stroke-gray-800',
    tooltipContentStyle: {
      backgroundColor: isDark ? '#111827' : '#ffffff', // gray-900 / white
      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`, // gray-700 / gray-200
      borderRadius: 8,
      color: isDark ? '#f3f4f6' : '#111827', // gray-100 / gray-900
    },
    tooltipLabelStyle: { color: isDark ? '#f3f4f6' : '#111827' },
    tooltipItemStyle: { color: isDark ? '#f3f4f6' : '#111827' },
  };
}
