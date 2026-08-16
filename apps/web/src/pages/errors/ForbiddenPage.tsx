import { Link } from 'react-router-dom';

import { Button } from '../../components/common/Button';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-6xl font-bold text-red-500">403</p>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Access denied</h1>
      <p className="max-w-sm text-sm text-gray-500">
        You don&apos;t have permission to view this page. Contact an administrator if you believe
        this is a mistake.
      </p>
      <Link to="/">
        <Button className="mt-2">Back to home</Button>
      </Link>
    </div>
  );
}
