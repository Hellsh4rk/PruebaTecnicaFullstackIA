import { create } from 'zustand';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface UiState {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: string) => void;
}

export const useUi = create<UiState>((set) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), 4200);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
