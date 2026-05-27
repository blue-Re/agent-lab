import { lazy } from 'react'
import { PageFallback } from '../../components/PageFallback'
import { PageHeader } from '../../components/PageHeader'
import { useCurrentProject } from '../../stores'

const EvalPanel = lazy(() =>
  import('../../components/EvalPanel').then((m) => ({ default: m.EvalPanel })),
)

export function EvalPage() {
  const project = useCurrentProject()

  return (
    <>
      <PageHeader
        eyebrow="Quality"
        title="Golden 回归评测"
        description="对 4 个固定用例跑回归，记录质量趋势、通过率与成本。"
      />
      <PageFallback>
        <EvalPanel projectId={project?.id} />
      </PageFallback>
    </>
  )
}
