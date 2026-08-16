import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../utils/cn';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const WIDTH_CLASSES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/** Slides in from the right — used for row-click "view/edit details" across every admin CRUD page. */
export function Drawer({ isOpen, onClose, title, children, width = 'md' }: DrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 flex h-full w-full flex-col bg-white shadow-xl dark:bg-gray-900',
          WIDTH_CLASSES[width],
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
