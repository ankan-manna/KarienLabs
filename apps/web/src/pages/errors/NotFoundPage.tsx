import { Link } from 'react-router-dom';

import { Button } from '../../components/common/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-6xl font-bold text-brand-500">404</p>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Page not found</h1>
      <p className="max-w-sm text-sm text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link to="/">
        <Button className="mt-2">Back to home</Button>
      </Link>
    </div>
  );
}
