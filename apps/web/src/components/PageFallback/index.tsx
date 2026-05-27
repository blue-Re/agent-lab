import { Suspense, type ReactNode } from 'react'

function Skeleton() {
  return (
    <div className="page-skeleton" role="status" aria-live="polite">
      <span className="page-skeleton-dot" />
      <span className="page-skeleton-dot" />
      <span className="page-skeleton-dot" />
      <small>正在加载页面...</small>
    </div>
  )
}

export function PageFallback({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton />}>{children}</Suspense>
}
