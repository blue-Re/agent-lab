import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEvalStore, useUiStore } from '../../stores'
import type { EvalCaseResult } from '../../lib/agent'
import './index.css'

type Props = {
  projectId?: string
}

const VERDICT_LABEL: Record<string, string> = {
  pass: '通过',
  warn: '警告',
  fail: '失败',
}

const STATUS_LABEL: Record<EvalCaseResult['status'], string> = {
  pending: '待运行',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export function EvalPanel({ projectId }: Props) {
  const cases = useEvalStore((state) => state.cases)
  const history = useEvalStore((state) => state.history)
  const active = useEvalStore((state) => state.active)
  const activeId = useEvalStore((state) => state.activeId)
  const logs = useEvalStore((state) => state.logs)
  const isStreaming = useEvalStore((state) => state.isStreaming)
  const isStarting = useEvalStore((state) => state.isStarting)
  const loadCases = useEvalStore((state) => state.loadCases)
  const loadHistory = useEvalStore((state) => state.loadHistory)
  const hydrateActive = useEvalStore((state) => state.hydrateActive)
  const setActive = useEvalStore((state) => state.setActive)
  const start = useEvalStore((state) => state.start)
  const pushToast = useUiStore((state) => state.pushToast)

  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set())
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadCases()
    void loadHistory()
    void hydrateActive()
  }, [loadCases, loadHistory, hydrateActive])

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs.length])

  const detailed = active ?? history.find((run) => run.id === activeId) ?? history[0] ?? null

  const trend = useMemo(
    () =>
      [...history]
        .filter((run) => run.status === 'completed' || run.status === 'failed')
        .sort((a, b) => (a.startedAt > b.startedAt ? 1 : -1))
        .map((run, index) => ({
          name: `#${index + 1}`,
          score: run.averageScore,
          passRate: Math.round(run.passRate * 100),
          startedAt: run.startedAt,
        })),
    [history],
  )

  const progress = active
    ? {
        current: Math.min(active.currentIndex, active.totalCount),
        total: active.totalCount,
        percent: active.totalCount
          ? Math.round((Math.min(active.currentIndex, active.totalCount) / active.totalCount) * 100)
          : 0,
      }
    : null

  const handleToggle = (id: string) => {
    setSelectedCases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRun = async () => {
    try {
      const summary = await start({
        projectId,
        caseIds: selectedCases.size ? [...selectedCases] : undefined,
      })
      if (summary) {
        pushToast(`Eval ${summary.id.slice(0, 8)} 已启动，${summary.totalCount} 个用例后台运行中`, 'success')
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'start eval failed', 'error')
    }
  }

  return (
    <div className="eval-panel">
      <header className="eval-toolbar">
        <div>
          <p className="eyebrow">Golden Eval</p>
          <h3>跑一次回归评测，对比模型质量与成本</h3>
        </div>
        <div className="eval-toolbar-actions">
          <button
            type="button"
            className="primary"
            onClick={handleRun}
            disabled={isStarting || isStreaming || !cases.length}
          >
            {isStarting
              ? '提交中...'
              : isStreaming
                ? '评测进行中...'
                : `运行 (${selectedCases.size || cases.length} 个用例)`}
          </button>
          <button
            type="button"
            onClick={() => {
              void loadHistory()
            }}
            className="ghost-btn"
          >
            刷新历史
          </button>
        </div>
      </header>

      {progress ? (
        <section className="eval-progress" aria-live="polite">
          <div className="eval-progress-meta">
            <strong>
              进度 {progress.current}/{progress.total} · {progress.percent}%
            </strong>
            <span className={`status-pill status-${active?.status}`}>
              {active?.status === 'running'
                ? '运行中'
                : active?.status === 'completed'
                  ? '已完成'
                  : active?.status === 'failed'
                    ? '失败'
                    : active?.status}
            </span>
          </div>
          <div
            className="eval-progress-bar"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <small>{active?.message}</small>
        </section>
      ) : null}

      <section className="eval-cases">
        {cases.map((evalCase) => (
          <label key={evalCase.id} className="eval-case">
            <input
              type="checkbox"
              checked={selectedCases.has(evalCase.id)}
              onChange={() => handleToggle(evalCase.id)}
              disabled={isStreaming}
            />
            <div>
              <strong>{evalCase.title}</strong>
              <small>{evalCase.requirement}</small>
              <span className={`tag tag-${evalCase.category}`}>{evalCase.category}</span>
            </div>
          </label>
        ))}
      </section>

      {trend.length ? (
        <section className="eval-chart">
          <header>
            <p className="eyebrow">质量趋势</p>
            <small>{trend.length} 次评测</small>
          </header>
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#9aa3b5" fontSize={11} />
                <YAxis
                  yAxisId="left"
                  stroke="#9aa3b5"
                  fontSize={11}
                  domain={[0, 100]}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#9aa3b5"
                  fontSize={11}
                  domain={[0, 100]}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: '#11131a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#7c5cff"
                  strokeWidth={2}
                  yAxisId="left"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  stroke="#20d9ba"
                  strokeWidth={2}
                  yAxisId="right"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      {logs.length ? (
        <section className="eval-logs">
          <header>
            <p className="eyebrow">实时日志</p>
            <small>{logs.length} 行</small>
          </header>
          <div className="eval-logs-body" ref={logRef}>
            {logs.map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className={`log-line log-${log.level}`}>
                <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {detailed ? (
        <section className="eval-detail">
          <header>
            <div>
              <p className="eyebrow">评测详情</p>
              <strong>
                平均分 {detailed.averageScore} · 通过率 {(detailed.passRate * 100).toFixed(0)}%
              </strong>
              <small>
                总成本 ${detailed.totalCostUsd.toFixed(6)} · 总耗时 {detailed.totalLatencyMs} ms ·{' '}
                <span className={`status-pill status-${detailed.status}`}>{detailed.status}</span>
              </small>
            </div>
            <select
              value={detailed.id}
              onChange={(event) => {
                void setActive(event.target.value)
              }}
            >
              {(active ? [active, ...history.filter((run) => run.id !== active.id)] : history).map(
                (run, index) => (
                  <option key={run.id} value={run.id}>
                    #{(active ? 0 : 1) + index === 0 ? 'active' : index} ·{' '}
                    {new Date(run.startedAt).toLocaleString()} · {run.status}
                  </option>
                ),
              )}
            </select>
          </header>
          <ul className="eval-cases-result">
            {detailed.cases.map((caseResult) => (
              <li
                key={caseResult.caseId}
                className={`verdict-${caseResult.verdict} state-${caseResult.status}`}
              >
                <header>
                  <strong>{caseResult.title}</strong>
                  <span>
                    {caseResult.status === 'running'
                      ? '...'
                      : caseResult.status === 'pending'
                        ? '—'
                        : caseResult.score}
                  </span>
                </header>
                <small>
                  <span className={`state-pill state-${caseResult.status}`}>
                    {STATUS_LABEL[caseResult.status]}
                  </span>
                  {caseResult.status === 'completed' ? (
                    <>
                      {' · '}
                      {VERDICT_LABEL[caseResult.verdict]} · ${caseResult.costUsd.toFixed(6)} ·{' '}
                      {caseResult.latencyMs} ms
                    </>
                  ) : null}
                </small>
                {caseResult.checks.length ? (
                  <ul>
                    {caseResult.checks.map((check) => (
                      <li key={check.name} className={check.passed ? 'pass' : 'fail'}>
                        {check.passed ? '✓' : '✗'} {check.name}: {check.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
