import { cn } from '../../utils/cn';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function Avatar({
  name,
  src,
  size = 'md',
}: {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = { sm: 'h-6 w-6 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }[
    size
  ];

  if (src) {
    return <img src={src} alt={name} className={cn('rounded-full object-cover', sizeClass)} />;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-brand-500 font-medium text-white',
        sizeClass,
      )}
    >
      {initials(name)}
    </span>
  );
}
