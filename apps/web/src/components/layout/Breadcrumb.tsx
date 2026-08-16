import { Link, useLocation } from 'react-router-dom';

function toLabel(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
      <ol className="flex items-center gap-1.5">
        <li>
          <Link to="/" className="hover:text-gray-700 dark:hover:text-gray-300">
            Home
          </Link>
        </li>
        {segments.map((segment, i) => {
          const path = '/' + segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          return (
            <li key={path} className="flex items-center gap-1.5">
              <span className="text-gray-300 dark:text-gray-700">/</span>
              {isLast ? (
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {toLabel(segment)}
                </span>
              ) : (
                <Link to={path} className="hover:text-gray-700 dark:hover:text-gray-300">
                  {toLabel(segment)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
