'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Modal = ครอบคลุม dialog ทั่วระบบ
// Features:
// - ปิดด้วย Escape
// - คลิก backdrop ปิด (toggle ได้ผ่าน `dismissOnBackdrop`)
// - lock body scroll
// - focus trap แบบ simple (โฟกัสกลับเมื่อปิด)
// - animation fade + scale
// - size variants

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE_CLS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  dismissOnBackdrop?: boolean;
  hideCloseButton?: boolean;
  headerClassName?: string;
  /** Render โดยไม่ครอบ container — สำหรับ modal ที่ต้องการ design ของตัวเองเต็มที่ */
  bare?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
  hideCloseButton = false,
  headerClassName,
  bare = false,
}: ModalProps) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // เก็บ focus เดิม + ล็อค scroll
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={dismissOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${SIZE_CLS[size]} max-h-[90vh] overflow-y-auto animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {bare ? children : (
          <>
            {(title || !hideCloseButton) && (
              <div className={`flex items-center justify-between p-5 border-b border-gray-100 ${headerClassName || ''}`}>
                <div>
                  {title && <h2 className="font-semibold text-gray-900">{title}</h2>}
                  {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                </div>
                {!hideCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-50"
                    aria-label="ปิด"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="p-5">{children}</div>
            {footer && <div className="flex justify-end gap-3 p-5 border-t border-gray-100">{footer}</div>}
          </>
        )}
      </div>
    </div>
  );
}
