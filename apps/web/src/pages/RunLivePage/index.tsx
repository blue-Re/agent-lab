import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { AgentTimeline } from '../../components/AgentTimeline'
import { PageHeader } from '../../components/PageHeader'
import { useRunStore } from '../../stores'
import './index.css'

export function RunLivePage() {
  const params = useParams<{ runId?: string }>()
  const activeRunId = useRunStore((state) => state.activeRunId)
  const setActiveRunId = useRunStore((state) => state.setActiveRunId)
  const activeRun = useRunStore((state) => state.activeRun)
  const events = useRunStore((state) => state.events)
  const isStreaming = useRunStore((state) => state.isStreaming)
  const isCompleted = useRunStore((state) => state.isCompleted)
  const report = useRunStore((state) => state.report)
  const loadReport = useRunStore((state) => state.loadReport)
  const retryActiveRun = useRunStore((state) => state.retryActiveRun)

  useEffect(() => {
    if (params.runId && params.runId !== activeRunId) {
      setActiveRunId(params.runId)
    }
  }, [params.runId, activeRunId, setActiveRunId])

  return (
    <>
      <PageHeader
        eyebrow="Live Stream"
        title="Agent 实时控制台"
        description="SSE 推送 Tool-Calling Loop 的角色切换、推理、工具调用与成本事件。"
        actions={
          <>
            <button
              type="button"
              onClick={() => loadReport()}
              disabled={!activeRunId}
            >
              生成运行报告
            </button>
            <button
              type="button"
              onClick={() => retryActiveRun()}
              disabled={!activeRunId || isStreaming}
              className="primary"
            >
              重试当前任务
            </button>
          </>
        }
      />

      <section className="run-summary">
        <article>
          <p className="eyebrow">Summary</p>
          <h3>
            {activeRun?.summary ||
              (isStreaming ? 'Agent 正在思考...' : '等待新任务输入')}
          </h3>
          <small>
            Model: {activeRun?.modelUsed ?? '--'}
            {activeRunId ? ` · Run: ${activeRunId.slice(0, 8)}` : ''}
            {activeRun?.evaluation ? ` · Score: ${activeRun.evaluation.score}` : ''}
            {isCompleted ? ' · done' : isStreaming ? ' · streaming' : ''}
          </small>
        </article>

        {activeRun?.plan?.length ? (
          <article>
            <p className="eyebrow">Plan</p>
            <ol>
              {activeRun.plan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        ) : null}

        {activeRun?.review?.length ? (
          <article>
            <p className="eyebrow">Self Review</p>
            <ul>
              {activeRun.review.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ) : null}
      </section>

      <section className="run-timeline-card">
        <header>
          <p className="eyebrow">Tool-Calling Loop</p>
          <small>{events.length} events</small>
        </header>
        <AgentTimeline
          events={events}
          emptyHint={
            activeRunId
              ? 'SSE 已连接，正在等待 Agent 推送事件...'
              : '运行一次任务后，这里会按时间线展示思考 / 工具 / 成本事件。'
          }
        />
      </section>

      {report ? (
        <section className="run-report">
          <header>
            <p className="eyebrow">Run Report</p>
            <h3>{report.title}</h3>
          </header>
          <p>{report.summary}</p>
          <div className="report-sections">
            {report.sections.map((section) => (
              <article key={section.title}>
                <strong>{section.title}</strong>
                <pre>{section.content}</pre>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
