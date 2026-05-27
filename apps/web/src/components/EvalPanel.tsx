import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchEvalCases,
  fetchEvalRuns,
  startEvalRun,
  type EvalCase,
  type EvalRunSummary,
} from '../lib/agent'
import './EvalPanel.css'

type Props = {
  projectId?: string
  onRefreshed?: () => void
}

export function EvalPanel({ projectId, onRefreshed }: Props) {
  const [cases, setCases] = useState<EvalCase[]>([])
  const [runs, setRuns] = useState<EvalRunSummary[]>([])
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  const refreshAll = async () => {
    const [c, r] = await Promise.all([fetchEvalCases(), fetchEvalRuns()])
    setCases(c)
    setRuns(r)
    if (r.length && !activeRunId) {
      setActiveRunId(r[0].id)
    }
    onRefreshed?.()
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAll()
    // refreshAll captures activeRunId, but we only need to fetch once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null,
    [runs, activeRunId],
  )

  const trend = useMemo(
    () =>
      [...runs]
        .sort((a, b) => (a.startedAt > b.startedAt ? 1 : -1))
        .map((run, index) => ({
          name: `#${index + 1}`,
          score: run.averageScore,
          passRate: Math.round(run.passRate * 100),
          cost: Number(run.totalCostUsd.toFixed(6)),
          startedAt: run.startedAt,
        })),
    [runs],
  )

  const handleToggle = (id: string) => {
    setSelectedCases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRun = async () => {
    setRunning(true)
    try {
      const result = await startEvalRun({
        projectId,
        caseIds: selectedCases.size ? [...selectedCases] : undefined,
      })
      setActiveRunId(result.id)
      await refreshAll()
    } finally {
      setRunning(false)
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
            disabled={running || !cases.length}
          >
            {running ? '评测中...' : `运行 (${selectedCases.size || cases.length} 个用例)`}
          </button>
          <button type="button" onClick={refreshAll} className="ghost-btn" disabled={running}>
            刷新
          </button>
        </div>
      </header>

      <section className="eval-cases">
        {cases.map((evalCase) => (
          <label key={evalCase.id} className="eval-case">
            <input
              type="checkbox"
              checked={selectedCases.has(evalCase.id)}
              onChange={() => handleToggle(evalCase.id)}
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
            <small>{runs.length} 次评测</small>
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

      {activeRun ? (
        <section className="eval-detail">
          <header>
            <div>
              <p className="eyebrow">最近评测详情</p>
              <strong>
                平均分 {activeRun.averageScore} · 通过率 {(activeRun.passRate * 100).toFixed(0)}%
              </strong>
              <small>
                总成本 ${activeRun.totalCostUsd.toFixed(6)} · 总耗时 {activeRun.totalLatencyMs} ms
              </small>
            </div>
            <select
              value={activeRunId ?? ''}
              onChange={(event) => setActiveRunId(event.target.value)}
            >
              {runs.map((run, index) => (
                <option key={run.id} value={run.id}>
                  #{runs.length - index} · {new Date(run.startedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </header>
          <ul className="eval-cases-result">
            {activeRun.cases.map((caseResult) => (
              <li key={caseResult.caseId} className={`verdict-${caseResult.verdict}`}>
                <header>
                  <strong>{caseResult.title}</strong>
                  <span>{caseResult.score}</span>
                </header>
                <small>
                  {caseResult.verdict} · ${caseResult.costUsd.toFixed(6)} ·{' '}
                  {caseResult.latencyMs} ms
                </small>
                <ul>
                  {caseResult.checks.map((check) => (
                    <li key={check.name} className={check.passed ? 'pass' : 'fail'}>
                      {check.passed ? '✓' : '✗'} {check.name}: {check.message}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
