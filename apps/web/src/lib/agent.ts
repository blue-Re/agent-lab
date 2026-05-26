import type {
  AgentEvent,
  AgentRunHistoryItem,
  AgentRunRequest,
  AgentRunResult,
  CapabilityItem,
  DirectoryEntry,
  PatchActionResult,
  ProjectImportRequest,
  ProjectDashboard,
  ProjectFileContent,
  ProjectMemory,
  ProjectSnapshot,
  QueueStatus,
  ProjectQuestionAnswer,
  RunReport,
  TaskTemplate,
} from '@agent-lab/shared'

export type {
  AgentRunHistoryItem,
  AgentRunRequest,
  AgentRunResult,
  AgentEvent,
  CapabilityItem,
  DirectoryEntry,
  PatchActionResult,
  ProjectDashboard,
  ProjectFileContent,
  ProjectQuestionAnswer,
  ProjectImportRequest,
  ProjectMemory,
  ProjectFile,
  ProjectSnapshot,
  QueueStatus,
  RunReport,
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

export async function applyPatch(runId: string): Promise<PatchActionResult> {
  const response = await fetch(`/api/agent/runs/${runId}/patch/apply`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Patch apply failed with ${response.status}`)
  }

  return (await response.json()) as PatchActionResult
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
