import { useEffect } from 'react'
import { useUiStore } from '../../stores'
import './index.css'

export function ToastTray() {
  const toasts = useUiStore((state) => state.toasts)
  const dismissToast = useUiStore((state) => state.dismissToast)

  useEffect(() => {
    if (!toasts.length) return
    const timers = toasts.map((toast) =>
      setTimeout(() => dismissToast(toast.id), 4200),
    )
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [toasts, dismissToast])

  if (!toasts.length) return null

  return (
    <div className="toast-tray" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast-${toast.tone}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </article>
      ))}
    </div>
  )
}
