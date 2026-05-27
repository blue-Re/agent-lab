import { lazy, useState } from 'react'
import { PageFallback } from '../../components/PageFallback'
import { PageHeader } from '../../components/PageHeader'

const CostDashboard = lazy(() =>
  import('../../components/CostDashboard').then((m) => ({ default: m.CostDashboard })),
)

export function CostPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <PageHeader
        eyebrow="Metrics"
        title="Token / Cost / Latency 仪表盘"
        description="每次模型调用自动落库，按日趋势 + 按模型分布 + 最近调用明细。"
        actions={
          <button
            type="button"
            className="primary"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            刷新数据
          </button>
        }
      />
      <PageFallback>
        <CostDashboard refreshKey={refreshKey} />
      </PageFallback>
    </>
  )
}
