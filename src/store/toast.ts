import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toast: ToastItem | null;
  show: (message: string, variant?: ToastVariant) => void;
  hide: () => void;
}

let nextId = 0;

// Global toast store — mirrors the role of `sonner` on the web app.
// A single active toast at a time is enough for this app's flows
// (one mutation result at a time); queuing isn't needed yet.
export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (message, variant = "info") => {
    set({ toast: { id: ++nextId, message, variant } });
  },
  hide: () => set({ toast: null }),
}));

// Convenience API matching the web's `notify.success()` / `notify.error()`
// shape, so screens read the same regardless of platform.
export const notify = {
  success: (message: string) => useToastStore.getState().show(message, "success"),
  error:   (message: string) => useToastStore.getState().show(message, "error"),
  info:    (message: string) => useToastStore.getState().show(message, "info"),
};
