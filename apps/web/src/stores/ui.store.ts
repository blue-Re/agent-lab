import { create } from 'zustand'

type ToastTone = 'info' | 'success' | 'warning' | 'error'

export type ToastItem = {
  id: string
  message: string
  tone: ToastTone
  createdAt: number
}

type UiState = {
  notice: string
  toasts: ToastItem[]
  setNotice: (message: string) => void
  pushToast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  notice: '请先从服务端导入一个真实项目。',
  toasts: [],
  setNotice: (message) => set({ notice: message }),
  pushToast: (message, tone = 'info') =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          message,
          tone,
          createdAt: Date.now(),
        },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}))
