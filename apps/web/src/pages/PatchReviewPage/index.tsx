import { useEffect, lazy } from 'react'
import { PageFallback } from '../../components/PageFallback'
import { PageHeader } from '../../components/PageHeader'
import { usePatchStore, useRunStore, useUiStore } from '../../stores'

const DiffReview = lazy(() =>
  import('../../components/DiffReview').then((m) => ({ default: m.DiffReview })),
)

export function PatchReviewPage() {
  const activeRunId = useRunStore((state) => state.activeRunId)
  const isStreaming = useRunStore((state) => state.isStreaming)
  const isCompleted = useRunStore((state) => state.isCompleted)
  const plan = usePatchStore((state) => state.plan)
  const action = usePatchStore((state) => state.action)
  const loading = usePatchStore((state) => state.loading)
  const loadPlan = usePatchStore((state) => state.loadPlan)
  const prepare = usePatchStore((state) => state.prepare)
  const apply = usePatchStore((state) => state.apply)
  const rollback = usePatchStore((state) => state.rollback)
  const reset = usePatchStore((state) => state.reset)
  const pushToast = useUiStore((state) => state.pushToast)

  useEffect(() => {
    if (!activeRunId) {
      reset()
      return
    }
    if (!isCompleted) return
    void loadPlan(activeRunId)
  }, [activeRunId, isCompleted, loadPlan, reset])

  return (
    <>
      <PageHeader
        eyebrow="Patch Review"
        title="行级 / Hunk 级补丁审批"
        description="点 hunk 复选框逐块审批，已存在文件修改前自动快照，rollback 一键还原。"
      />

      <PageFallback>
        <DiffReview
          plan={plan}
          patchAction={action}
          busy={loading || isStreaming || !activeRunId}
          onPrepare={async () => {
            if (!activeRunId) return
            const result = await prepare(activeRunId)
            if (result) pushToast(result.message, 'success')
          }}
          onApply={async (ids) => {
            if (!activeRunId) return
            const result = await apply(activeRunId, ids)
            if (result) pushToast(result.message, result.status === 'failed' ? 'error' : 'success')
          }}
          onRollback={async () => {
            if (!activeRunId) return
            const result = await rollback(activeRunId)
            if (result) pushToast(result.message, 'warning')
          }}
        />
      </PageFallback>
    </>
  )
}
