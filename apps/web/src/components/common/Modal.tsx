import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const SIZE_CLASSES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full rounded-lg bg-white shadow-xl dark:bg-gray-900',
          SIZE_CLASSES[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
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
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
