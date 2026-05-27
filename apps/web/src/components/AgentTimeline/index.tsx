import { useMemo, type CSSProperties } from 'react'
import type { AgentEvent } from '../../lib/agent'
import './index.css'

type Props = {
  events: AgentEvent[]
  emptyHint?: string
}

const ROLE_COLOR: Record<string, string> = {
  Planner: '#7c5cff',
  Researcher: '#20d9ba',
  Coder: '#ffc458',
  Reviewer: '#ff7c9d',
}

const TYPE_LABEL: Record<string, string> = {
  state: '状态',
  role: '角色',
  iteration: '轮次',
  reasoning: '推理',
  tool_call: '工具调用',
  tool_result: '工具结果',
  tool: '工具',
  cost: '成本',
  final: '最终',
  model: '模型',
  evaluation: '评测',
  memory: '记忆',
  error: '错误',
  prompt: 'Prompt',
  token: 'Token',
}

function lane(event: AgentEvent): { role: string; color: string } {
  if (event.type === 'role') {
    const role = (event.payload as { role?: string })?.role ?? 'Planner'
    return { role, color: ROLE_COLOR[role] ?? '#7c5cff' }
  }
  return { role: 'System', color: '#9aa3b5' }
}

function renderPayload(event: AgentEvent) {
  if (!event.payload) return null

  if (event.type === 'reasoning') {
    return <pre>{String((event.payload as { content?: string }).content ?? '')}</pre>
  }

  if (event.type === 'tool_call') {
    const payload = event.payload as { name?: string; arguments?: Record<string, unknown> }
    return (
      <div className="timeline-tool">
        <strong>{payload.name}</strong>
        <pre>{JSON.stringify(payload.arguments, null, 2)}</pre>
      </div>
    )
  }

  if (event.type === 'tool_result') {
    const payload = event.payload as {
      name?: string
      durationMs?: number
      status?: string
      output?: string
      error?: string
    }
    return (
      <div className="timeline-tool">
        <strong>
          {payload.name} · {payload.status} · {payload.durationMs}ms
        </strong>
        <pre>{payload.output || payload.error || ''}</pre>
      </div>
    )
  }

  if (event.type === 'cost') {
    const payload = event.payload as {
      model?: string
      totalCostUsd?: number
      totalTokens?: number
      latencyMs?: number
      stage?: string
    }
    return (
      <small>
        {payload.stage} · {payload.model} · ${(payload.totalCostUsd ?? 0).toFixed(6)} ·{' '}
        {payload.totalTokens} tok · {payload.latencyMs}ms
      </small>
    )
  }

  if (event.type === 'evaluation') {
    const payload = event.payload as { score?: number; verdict?: string }
    return (
      <small>
        verdict: {payload.verdict} · score {payload.score}
      </small>
    )
  }

  if (typeof event.payload === 'object') {
    return <pre>{JSON.stringify(event.payload, null, 2).slice(0, 400)}</pre>
  }

  return <small>{String(event.payload)}</small>
}

export function AgentTimeline({ events, emptyHint }: Props) {
  const sorted = useMemo(
    () =>
      [...events].sort((a, b) => {
        if (a.createdAt === b.createdAt) return 0
        return a.createdAt > b.createdAt ? 1 : -1
      }),
    [events],
  )

  if (!sorted.length) {
    return (
      <div className="timeline-empty">
        <h3>暂无运行事件</h3>
        <p>{emptyHint ?? '运行一次 Agent 任务后，这里会按时间线展示思考、工具调用和成本。'}</p>
      </div>
    )
  }

  return (
    <ol className="agent-timeline">
      {sorted.map((event, index) => {
        const meta = lane(event)
        const laneStyle = { '--lane-color': meta.color } as CSSProperties
        return (
          <li
            key={event.id ?? `${event.type}-${event.createdAt}-${index}`}
            className={`timeline-item type-${event.type}`}
            style={laneStyle}
          >
            <span className="timeline-dot" aria-hidden />
            <div className="timeline-body">
              <header>
                <span className="timeline-role">{meta.role}</span>
                <span className="timeline-type">{TYPE_LABEL[event.type] ?? event.type}</span>
                <span className="timeline-time">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
              </header>
              <strong>{event.title}</strong>
              {renderPayload(event)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
