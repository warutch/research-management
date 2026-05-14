'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// Toast = แจ้งเตือนสั้น ๆ มุมขวาล่าง — แทน alert() เพื่อไม่ block UI
// แต่ละ toast มี 4 ประเภท: success, error, info, warning
// optional action ใช้เป็นปุ่ม "เลิกทำ" ได้ (เช่น undo delete)

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number; // ms — 0 = ไม่ auto-dismiss
  action?: { label: string; onClick: () => void };
}

type ToastInput = { type: ToastType; message: string; duration?: number; action?: Toast['action'] };

interface ToastStore {
  toasts: Toast[];
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (input) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const t: Toast = { duration: 4000, ...input, id };
    set((state) => ({ toasts: [...state.toasts, t] }));
    if (t.duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((x) => x.id !== id) }));
      }, t.duration);
    }
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Public API
export const toast = {
  success: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) =>
    useToastStore.getState().show({ type: 'success', message, duration: 3000, ...opts }),
  error: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) =>
    useToastStore.getState().show({ type: 'error', message, duration: 5000, ...opts }),
  info: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) =>
    useToastStore.getState().show({ type: 'info', message, duration: 3500, ...opts }),
  warning: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) =>
    useToastStore.getState().show({ type: 'warning', message, duration: 4000, ...opts }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

const TYPE_CONFIG: Record<ToastType, { icon: typeof CheckCircle2; iconColor: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2, iconColor: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  error: { icon: XCircle, iconColor: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  info: { icon: Info, iconColor: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  warning: { icon: AlertTriangle, iconColor: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const cfg = TYPE_CONFIG[t.type];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 ${cfg.bg} ${cfg.border} border rounded-lg shadow-lg p-3 pr-2 animate-slide-in-right`}
            role="alert"
          >
            <Icon size={18} className={`${cfg.iconColor} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 text-sm text-gray-800 whitespace-pre-line">{t.message}</div>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-white/60 flex-shrink-0"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-white/60 flex-shrink-0"
              aria-label="ปิด"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Hook สำหรับ unmount toast container กรณีต้องใช้
export function useToasts() {
  return useToastStore((s) => s.toasts);
}

// Confirm dialog แทน window.confirm() — แสดงเป็น toast ที่มีปุ่ม "ยืนยัน" + "ยกเลิก"
// Returns: Promise<boolean>
export function confirmAction(message: string, options?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const { confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false } = options || {};
    const id = useToastStore.getState().show({
      type: danger ? 'warning' : 'info',
      message,
      duration: 0, // sticky
      action: {
        label: confirmLabel,
        onClick: () => resolve(true),
      },
    });
    // เพิ่ม cancel button ผ่าน DOM event — ใช้ trick ผ่าน custom event ก็ได้
    // แต่จะใช้แค่ปุ่ม X เป็น cancel ก่อน
    // ถ้าผู้ใช้ปิด toast ทาง X → ถือเป็น cancel
    const checkInterval = setInterval(() => {
      const stillThere = useToastStore.getState().toasts.find((t) => t.id === id);
      if (!stillThere) {
        clearInterval(checkInterval);
        resolve(false); // dismissed without action = cancel
      }
    }, 100);
    // cancelLabel currently unused — could expand toast to accept secondary action
    void cancelLabel;
  });
}

// Helper สำหรับ useEffect cleanup
export function useToastCleanup() {
  useEffect(() => {
    return () => useToastStore.getState().clear();
  }, []);
}
