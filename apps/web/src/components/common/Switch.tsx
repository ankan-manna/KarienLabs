import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-1',
          )}
        />
      </button>
      {label}
    </label>
  );
}
