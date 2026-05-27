import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchCostSummary, type CostSummary } from '../../lib/agent'
import { useSystemStore } from '../../stores'
import './index.css'

const MODEL_COLORS = ['#7c5cff', '#20d9ba', '#ffc458', '#ff7c9d', '#5ec6ff']

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '$0.0000'
  if (value < 0.01) return `$${value.toFixed(6)}`
  return `$${value.toFixed(4)}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

export function CostDashboard({ refreshKey }: { refreshKey?: number }) {
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const costVersion = useSystemStore((state) => state.costVersion)

  useEffect(() => {
    let ignore = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetchCostSummary()
      .then((data) => {
        if (!ignore) setSummary(data)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [refreshKey, costVersion])

  const dayData = useMemo(() => summary?.byDay ?? [], [summary])
  const modelData = useMemo(() => summary?.byModel ?? [], [summary])

  if (!summary && loading) {
    return <div className="cost-empty">正在加载成本数据...</div>
  }

  if (!summary || summary.totalRuns === 0) {
    return (
      <div className="cost-empty">
        <h3>还没有成本数据</h3>
        <p>运行一次 Agent 任务，DeepSeek 调用的 token / cost / latency 会自动落库。</p>
      </div>
    )
  }

  return (
    <div className="cost-dashboard">
      <header className="cost-kpis">
        <article>
          <small>累计运行</small>
          <strong>{formatNumber(summary.totalRuns)}</strong>
        </article>
        <article>
          <small>累计花费</small>
          <strong>{formatUsd(summary.totalCostUsd)}</strong>
        </article>
        <article>
          <small>累计 token</small>
          <strong>{formatNumber(summary.totalTokens)}</strong>
        </article>
        <article>
          <small>单次平均</small>
          <strong>{formatUsd(summary.avgCostPerRun)}</strong>
        </article>
        <article>
          <small>平均延迟</small>
          <strong>{formatNumber(summary.avgLatencyMs)} ms</strong>
        </article>
      </header>

      <section className="cost-card">
        <header>
          <p className="eyebrow">每日花费 (USD)</p>
          <small>近 {dayData.length} 天</small>
        </header>
        <div className="cost-chart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dayData}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" stroke="#9aa3b5" fontSize={11} />
              <YAxis
                stroke="#9aa3b5"
                fontSize={11}
                tickFormatter={(value: number) => formatUsd(value)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: '#11131a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, key) => {
                  const numeric = typeof value === 'number' ? value : Number(value ?? 0)
                  if (key === 'costUsd') return [formatUsd(numeric), 'cost']
                  if (key === 'tokens') return [formatNumber(numeric), 'tokens']
                  return [String(value ?? ''), String(key ?? '')]
                }}
              />
              <Area
                type="monotone"
                dataKey="costUsd"
                stroke="#7c5cff"
                fill="url(#costFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="cost-card">
        <header>
          <p className="eyebrow">按模型分布</p>
          <small>{modelData.length} 个模型</small>
        </header>
        <div className="cost-chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={modelData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="model" stroke="#9aa3b5" fontSize={11} />
              <YAxis
                stroke="#9aa3b5"
                fontSize={11}
                tickFormatter={(value: number) => formatUsd(value)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: '#11131a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => formatUsd(typeof value === 'number' ? value : Number(value ?? 0))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="costUsd" name="cost" radius={[8, 8, 0, 0]}>
                {modelData.map((entry, index) => (
                  <Cell key={entry.model} fill={MODEL_COLORS[index % MODEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="cost-card">
        <header>
          <p className="eyebrow">最近 20 次模型调用</p>
        </header>
        <div className="cost-table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>阶段</th>
                <th>模型</th>
                <th>tokens</th>
                <th>cost</th>
                <th>latency</th>
              </tr>
            </thead>
            <tbody>
              {summary.recent.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={`stage-pill stage-${entry.stage}`}>{entry.stage}</span>
                  </td>
                  <td>{entry.model}</td>
                  <td>{formatNumber(entry.totalTokens)}</td>
                  <td>{formatUsd(entry.totalCostUsd)}</td>
                  <td>{entry.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
