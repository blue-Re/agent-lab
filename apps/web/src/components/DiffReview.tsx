import { useMemo, useState } from 'react'
import { Diff, Hunk, parseDiff, type FileData, type HunkData } from 'react-diff-view'
import type { PatchActionResult, PatchPlan } from '../lib/agent'
import 'react-diff-view/style/index.css'
import './DiffReview.css'

type Props = {
  plan: PatchPlan | null
  patchAction: PatchActionResult | null
  busy: boolean
  onPrepare: () => void
  onApply: (selectedHunkIds: string[]) => void
  onRollback: () => void
}

type HunkRecord = {
  fileId: string
  hunkId: string
  filePath: string
  header: string
}

function HunkApprovalRow({
  record,
  checked,
  onToggle,
}: {
  record: HunkRecord
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="diff-hunk-row">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>
        <strong>{record.filePath}</strong>
        <code>{record.header}</code>
      </span>
    </label>
  )
}

export function DiffReview({ plan, patchAction, busy, onPrepare, onApply, onRollback }: Props) {
  const parsedFiles = useMemo<FileData[]>(() => {
    if (!plan?.raw) return []
    try {
      return parseDiff(plan.raw, { nearbySequences: 'zip' })
    } catch {
      return []
    }
  }, [plan])

  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const totalHunks = plan?.files.reduce((acc, file) => acc + file.hunks.length, 0) ?? 0
  const allHunkIds = useMemo(() => {
    if (!plan) return [] as string[]
    return plan.files.flatMap((file) => file.hunks.map((hunk) => hunk.id))
  }, [plan])
  const allChecked = allHunkIds.length > 0 && allHunkIds.every((id) => selected.has(id))

  if (!plan) {
    return (
      <div className="diff-review-empty">
        <h3>没有可审查的 patch</h3>
        <p>运行 Agent 完成后，这里会展示带 hunk 复选框的 diff 视图。</p>
      </div>
    )
  }

  if (!parsedFiles.length) {
    return (
      <div className="diff-review-empty">
        <h3>无法解析 diff</h3>
        <p>请确认模型输出的 diff 是合法的 unified diff 格式。</p>
        <pre className="diff-raw">{plan.raw}</pre>
      </div>
    )
  }

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allHunkIds))
    }
  }

  const handleApply = () => {
    const ids = [...selected]
    onApply(ids.length ? ids : allHunkIds)
  }

  return (
    <div className="diff-review">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="badge">{parsedFiles.length} files</span>
          <span className="badge ghost">{totalHunks} hunks</span>
          <span className="badge ghost">{selected.size} selected</span>
        </div>
        <div className="diff-toolbar-right">
          <button type="button" onClick={handleSelectAll} className="ghost-btn">
            {allChecked ? '取消全选' : '全选 hunks'}
          </button>
          <button type="button" onClick={onPrepare} disabled={busy}>
            保存 Patch
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy}
            className="primary"
          >
            应用选中 ({selected.size || totalHunks})
          </button>
          <button type="button" onClick={onRollback} disabled={busy} className="danger">
            回滚
          </button>
        </div>
      </div>

      {patchAction ? (
        <div className={`diff-status diff-status-${patchAction.status}`}>
          <strong>{patchAction.status}</strong>
          <span>{patchAction.message}</span>
          {patchAction.appliedHunks?.length ? (
            <small>已应用 {patchAction.appliedHunks.length} 个 hunk</small>
          ) : null}
          {patchAction.skippedHunks?.length ? (
            <small>跳过 {patchAction.skippedHunks.length} 个</small>
          ) : null}
        </div>
      ) : null}

      <div className="diff-files">
        {parsedFiles.map((file, fileIndex) => {
          const planFile = plan.files[fileIndex]
          if (!planFile) return null

          return (
            <article key={planFile.id} className="diff-file-card">
              <header>
                <div>
                  <strong>{planFile.filePath}</strong>
                  <span className="file-tag">
                    {planFile.isNewFile ? 'new' : planFile.isDeletedFile ? 'deleted' : 'modified'}
                  </span>
                </div>
                <small>{file.hunks.length} hunks</small>
              </header>

              <div className="diff-hunk-controls">
                {planFile.hunks.map((hunk) => (
                  <HunkApprovalRow
                    key={hunk.id}
                    record={{
                      fileId: planFile.id,
                      hunkId: hunk.id,
                      filePath: planFile.filePath,
                      header: hunk.header,
                    }}
                    checked={selected.has(hunk.id)}
                    onToggle={() => handleToggle(hunk.id)}
                  />
                ))}
                {planFile.hunks.length === 0 ? <small>该文件无可解析 hunk</small> : null}
              </div>

              <Diff
                viewType="split"
                diffType={file.type ?? 'modify'}
                hunks={file.hunks}
              >
                {(hunks: HunkData[]) =>
                  hunks.map((hunk: HunkData) => <Hunk key={hunk.content} hunk={hunk} />)
                }
              </Diff>
            </article>
          )
        })}
      </div>
    </div>
  )
}
