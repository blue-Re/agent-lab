import type {
  AgentEvent,
  AgentRunHistoryItem,
  AgentRunRequest,
  AgentRunResult,
  CapabilityItem,
  CostSummary,
  CostEntry,
  DirectoryEntry,
  EvalCase,
  EvalRunSummary,
  EvalStreamEvent,
  PatchActionResult,
  PatchApplyRequest,
  PatchPlan,
  ProjectImportRequest,
  ProjectDashboard,
  ProjectFileContent,
  ProjectMemory,
  ProjectSnapshot,
  QueueStatus,
  ProjectQuestionAnswer,
  RunReport,
  SystemStreamEvent,
  TaskTemplate,
} from '@agent-lab/shared'

export type {
  AgentRunHistoryItem,
  AgentRunRequest,
  AgentRunResult,
  AgentEvent,
  CapabilityItem,
  CostSummary,
  CostEntry,
  DirectoryEntry,
  EvalCase,
  EvalCaseResult,
  EvalCaseStatus,
  EvalRunStatus,
  EvalRunSummary,
  EvalStreamEvent,
  PatchActionResult,
  PatchApplyRequest,
  PatchFileDiff,
  PatchHunk,
  PatchHunkChange,
  PatchPlan,
  ProjectDashboard,
  ProjectFileContent,
  ProjectQuestionAnswer,
  ProjectImportRequest,
  ProjectMemory,
  ProjectFile,
  ProjectSnapshot,
  QueueStatus,
  RunReport,
  SystemStreamEvent,
  TaskTemplate,
  ToolRun,
} from '@agent-lab/shared'

export type AgentStepStatus = 'waiting' | 'running' | 'done'

export type AgentStep = {
  id: string
  title: string
  description: string
  status: AgentStepStatus
}

export const defaultSteps: AgentStep[] = [
  {
    id: 'understand',
    title: '理解需求',
    description: '提取用户目标、约束和交付物。',
    status: 'waiting',
  },
  {
    id: 'plan',
    title: '任务规划',
    description: '拆成可执行步骤，决定需要哪些工具。',
    status: 'waiting',
  },
  {
    id: 'retrieve',
    title: '检索上下文',
    description: '搜索相关文件、组件和样式规范。',
    status: 'waiting',
  },
  {
    id: 'execute',
    title: '生成变更',
    description: '基于上下文生成实现方案和代码 diff。',
    status: 'waiting',
  },
  {
    id: 'review',
    title: '自我审查',
    description: '检查风险、遗漏和验证建议。',
    status: 'waiting',
  },
]

export async function runAgentTask(payload: AgentRunRequest): Promise<AgentRunResult> {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Agent API failed with ${response.status}`)
  }

  return (await response.json()) as AgentRunResult
}

export async function startAgentTask(
  payload: AgentRunRequest,
): Promise<AgentRunHistoryItem> {
  const response = await fetch('/api/agent/runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Agent async run failed with ${response.status}`)
  }

  return (await response.json()) as AgentRunHistoryItem
}

export async function fetchAgentRun(runId: string): Promise<AgentRunHistoryItem | null> {
  const response = await fetch(`/api/agent/runs/${runId}`)

  if (!response.ok) {
    return null
  }

  return (await response.json()) as AgentRunHistoryItem
}

export async function retryAgentRun(runId: string): Promise<AgentRunHistoryItem | null> {
  const response = await fetch(`/api/agent/runs/${runId}/retry`, {
    method: 'POST',
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as AgentRunHistoryItem
}

export async function cancelAgentRun(runId: string): Promise<AgentRunHistoryItem | null> {
  const response = await fetch(`/api/agent/runs/${runId}/cancel`, {
    method: 'POST',
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as AgentRunHistoryItem
}

export async function fetchQueueStatus(): Promise<QueueStatus> {
  const response = await fetch('/api/agent/queue')

  if (!response.ok) {
    return { queued: 0, running: 0, activeRunId: null, queuedRunIds: [] }
  }

  return (await response.json()) as QueueStatus
}

export async function fetchAgentRuns(): Promise<AgentRunHistoryItem[]> {
  try {
    const response = await fetch('/api/agent/runs?limit=8')

    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as { runs: AgentRunHistoryItem[] }
    return data.runs
  } catch {
    return []
  }
}

export async function fetchProjects(): Promise<ProjectSnapshot[]> {
  const response = await fetch('/api/projects')

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as { projects: ProjectSnapshot[] }
  return data.projects
}

export async function importProject(
  payload: ProjectImportRequest,
): Promise<ProjectSnapshot> {
  const response = await fetch('/api/projects/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Project import failed with ${response.status}`)
  }

  return (await response.json()) as ProjectSnapshot
}

export async function fetchAgentEvents(runId: string): Promise<AgentEvent[]> {
  const response = await fetch(`/api/agent/runs/${runId}/events`)

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as { events: AgentEvent[] }
  return data.events
}

export async function fetchProjectMemories(projectId: string): Promise<ProjectMemory[]> {
  const response = await fetch(`/api/projects/${projectId}/memories`)

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as { memories: ProjectMemory[] }
  return data.memories
}

export async function fetchProjectDashboard(projectId: string): Promise<ProjectDashboard | null> {
  const response = await fetch(`/api/projects/${projectId}/dashboard`)

  if (!response.ok) {
    return null
  }

  return (await response.json()) as ProjectDashboard
}

export async function fetchProjectFileContent(
  projectId: string,
  path: string,
): Promise<ProjectFileContent | null> {
  const response = await fetch(
    `/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`,
  )

  if (!response.ok) {
    return null
  }

  return (await response.json()) as ProjectFileContent
}

export async function askProject(
  projectId: string,
  question: string,
): Promise<ProjectQuestionAnswer> {
  const response = await fetch(`/api/projects/${projectId}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  })

  if (!response.ok) {
    throw new Error(`Project question failed with ${response.status}`)
  }

  return (await response.json()) as ProjectQuestionAnswer
}

export async function fetchTaskTemplates(projectId: string): Promise<TaskTemplate[]> {
  const response = await fetch(`/api/projects/${projectId}/templates`)

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as { templates: TaskTemplate[] }
  return data.templates
}

export async function preparePatch(runId: string): Promise<PatchActionResult> {
  const response = await fetch(`/api/agent/runs/${runId}/patch/prepare`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Patch prepare failed with ${response.status}`)
  }

  return (await response.json()) as PatchActionResult
}

export async function applyPatch(
  runId: string,
  body?: PatchApplyRequest,
): Promise<PatchActionResult> {
  const response = await fetch(`/api/agent/runs/${runId}/patch/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

  if (!response.ok) {
    throw new Error(`Patch apply failed with ${response.status}`)
  }

  return (await response.json()) as PatchActionResult
}

export async function fetchPatchPlan(runId: string): Promise<PatchPlan | null> {
  const response = await fetch(`/api/agent/runs/${runId}/patch/plan`)
  if (!response.ok) return null
  return (await response.json()) as PatchPlan
}

export async function fetchCostSummary(): Promise<CostSummary> {
  const response = await fetch('/api/metrics/cost')
  if (!response.ok) {
    return {
      totalRuns: 0,
      totalCostUsd: 0,
      totalTokens: 0,
      avgCostPerRun: 0,
      avgLatencyMs: 0,
      byDay: [],
      byModel: [],
      recent: [],
    }
  }
  return (await response.json()) as CostSummary
}

export async function fetchRunCost(runId: string): Promise<CostEntry[]> {
  const response = await fetch(`/api/agent/runs/${runId}/cost`)
  if (!response.ok) return []
  const data = (await response.json()) as { entries: CostEntry[] }
  return data.entries
}

export async function fetchEvalCases(): Promise<EvalCase[]> {
  const response = await fetch('/api/eval/cases')
  if (!response.ok) return []
  const data = (await response.json()) as { cases: EvalCase[] }
  return data.cases
}

export async function fetchEvalRuns(): Promise<EvalRunSummary[]> {
  const response = await fetch('/api/eval/runs')
  if (!response.ok) return []
  const data = (await response.json()) as { runs: EvalRunSummary[] }
  return data.runs
}

export async function startEvalRun(
  payload: { projectId?: string; caseIds?: string[] } = {},
): Promise<EvalRunSummary> {
  const response = await fetch('/api/eval/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Eval run failed with ${response.status}: ${body}`)
  }
  return (await response.json()) as EvalRunSummary
}

export async function fetchActiveEval(): Promise<EvalRunSummary | null> {
  const response = await fetch('/api/eval/active')
  if (!response.ok) return null
  const text = await response.text()
  if (!text) return null
  try {
    const body = JSON.parse(text) as { active?: EvalRunSummary | null }
    return body.active ?? null
  } catch {
    return null
  }
}

export async function fetchEvalRun(id: string): Promise<EvalRunSummary | null> {
  const response = await fetch(`/api/eval/runs/${id}`)
  if (!response.ok) return null
  return (await response.json()) as EvalRunSummary
}

export type EvalStreamHandler = (event: EvalStreamEvent) => void

export type EvalStreamHandle = { close: () => void }

export function subscribeEvalStream(id: string, handler: EvalStreamHandler): EvalStreamHandle {
  const source = new EventSource(`/api/eval/runs/${id}/stream`)
  const events: Array<EvalStreamEvent['type']> = [
    'snapshot',
    'case_started',
    'case_finished',
    'case_failed',
    'log',
    'completed',
    'failed',
  ]
  for (const type of events) {
    source.addEventListener(type, (event: MessageEvent) => {
      try {
        handler(JSON.parse(event.data) as EvalStreamEvent)
      } catch {
        // ignore malformed payload
      }
    })
  }
  return { close: () => source.close() }
}

export type StreamHandler = (event: { type: string; data: unknown }) => void

export type RunStreamHandle = {
  close: () => void
}

export function subscribeRunStream(runId: string, handler: StreamHandler): RunStreamHandle {
  const source = new EventSource(`/api/agent/runs/${runId}/stream`)
  const forward = (type: string) => (event: MessageEvent) => {
    try {
      handler({ type, data: JSON.parse(event.data) })
    } catch {
      handler({ type, data: event.data })
    }
  }

  const types = [
    'snapshot',
    'state',
    'role',
    'iteration',
    'reasoning',
    'tool_call',
    'tool_result',
    'tool',
    'cost',
    'final',
    'model',
    'evaluation',
    'memory',
    'error',
    'prompt',
    'token',
    'run_completed',
  ]

  for (const type of types) {
    source.addEventListener(type, forward(type) as EventListener)
  }

  return {
    close: () => source.close(),
  }
}

export async function rollbackPatch(runId: string): Promise<PatchActionResult> {
  const response = await fetch(`/api/agent/runs/${runId}/patch/rollback`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Patch rollback failed with ${response.status}`)
  }

  return (await response.json()) as PatchActionResult
}

export async function fetchRunReport(runId: string): Promise<RunReport | null> {
  const response = await fetch(`/api/agent/runs/${runId}/report`)

  if (!response.ok) {
    return null
  }

  return (await response.json()) as RunReport
}

export async function fetchCapabilities(): Promise<CapabilityItem[]> {
  const response = await fetch('/api/capabilities')

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as { capabilities: CapabilityItem[] }
  return data.capabilities
}

export async function fetchDirectories(path?: string): Promise<{
  currentPath: string
  parent: DirectoryEntry | null
  directories: DirectoryEntry[]
}> {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  const response = await fetch(`/api/fs/directories${query}`)

  if (!response.ok) {
    throw new Error(`Directory listing failed with ${response.status}`)
  }

  return (await response.json()) as {
    currentPath: string
    parent: DirectoryEntry | null
    directories: DirectoryEntry[]
  }
}

export type SystemStreamSnapshot = {
  type: 'snapshot'
  queue: QueueStatus
  active: EvalRunSummary | null
}

export type SystemStreamMessage = SystemStreamEvent | SystemStreamSnapshot

export type SystemStreamHandler = (event: SystemStreamMessage) => void

export type SystemStreamHandle = { close: () => void }

export function subscribeSystemStream(handler: SystemStreamHandler): SystemStreamHandle {
  const source = new EventSource('/api/system/stream')
  const events: Array<SystemStreamMessage['type']> = [
    'snapshot',
    'queue:updated',
    'runs:updated',
    'cost:updated',
    'eval:runs:updated',
    'eval:active:updated',
  ]
  for (const type of events) {
    source.addEventListener(type, (event: MessageEvent) => {
      try {
        handler(JSON.parse(event.data) as SystemStreamMessage)
      } catch {
        // ignore malformed payload
      }
    })
  }
  return { close: () => source.close() }
}
