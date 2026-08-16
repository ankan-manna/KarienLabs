import { Button } from '../../components/common/Button';

export default function ServerErrorPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-6xl font-bold text-gray-400">500</p>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Something went wrong
      </h1>
      <p className="max-w-sm text-sm text-gray-500">
        An unexpected error occurred. Please try again, or come back later if the problem persists.
      </p>
      <Button className="mt-2" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </div>
  );
}
