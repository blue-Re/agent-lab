import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { useRunStore } from '../../stores'
import './index.css'

export function HistoryPage() {
  const navigate = useNavigate()
  const history = useRunStore((state) => state.history)
  const activeRunId = useRunStore((state) => state.activeRunId)
  const setActiveRunId = useRunStore((state) => state.setActiveRunId)
  const refreshHistory = useRunStore((state) => state.refreshHistory)

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="历史运行"
        description="所有持久化的 Agent run，点卡片切换 active run 后即可在实时控制台 / 补丁审批里继续。"
        actions={
          <button type="button" onClick={() => refreshHistory()}>
            刷新
          </button>
        }
      />

      <section className="history-grid">
        {history.length ? (
          history.map((run) => (
            <article
              key={run.runId}
              className={`history-card status-${run.status} ${activeRunId === run.runId ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveRunId(run.runId)
                navigate('/workspace/live')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  setActiveRunId(run.runId)
                  navigate('/workspace/live')
                }
              }}
            >
              <header>
                <strong>{run.requirement}</strong>
                <span className="status-pill">{run.status}</span>
              </header>
              <p>{run.summary || '运行中...'}</p>
              <footer>
                <small>{run.projectName}</small>
                <small>{run.modelUsed}</small>
                <small>{new Date(run.createdAt).toLocaleString()}</small>
              </footer>
            </article>
          ))
        ) : (
          <p className="history-empty">还没有持久化的运行记录。</p>
        )}
      </section>
    </>
  )
}
