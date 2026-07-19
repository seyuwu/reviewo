"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export interface NotificationToastItem {
  actionEvent?: string;
  body?: string;
  ctaLabel?: string;
  href?: string;
  id: string;
  title: string;
}

interface NotificationToastsContextValue {
  dismiss: (id: string) => void;
  push: (toast: Omit<NotificationToastItem, "id"> & { id?: string }) => void;
  toasts: NotificationToastItem[];
}

const NotificationToastsContext = createContext<NotificationToastsContextValue | null>(null);

const AUTO_HIDE_MS = 5_000;
const MAX_VISIBLE = 4;

export function NotificationToastsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<NotificationToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timerId = timersRef.current.get(id);

    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<NotificationToastItem, "id"> & { id?: string }) => {
      const id = toast.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setToasts((current) => {
        const withoutDup = current.filter((item) => item.id !== id);
        return [{ ...toast, id }, ...withoutDup].slice(0, MAX_VISIBLE);
      });

      const existing = timersRef.current.get(id);

      if (existing !== undefined) {
        window.clearTimeout(existing);
      }

      const timerId = window.setTimeout(() => {
        dismiss(id);
      }, AUTO_HIDE_MS);
      timersRef.current.set(id, timerId);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ dismiss, push, toasts }), [dismiss, push, toasts]);

  return (
    <NotificationToastsContext.Provider value={value}>{children}</NotificationToastsContext.Provider>
  );
}

export function useNotificationToasts(): NotificationToastsContextValue {
  const context = useContext(NotificationToastsContext);

  if (!context) {
    return {
      dismiss: () => undefined,
      push: () => undefined,
      toasts: []
    };
  }

  return context;
}
