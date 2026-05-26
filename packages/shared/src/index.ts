import { z } from 'zod'

export type ToolRun = {
  name: string
  input: string
  output: string
  status: 'success' | 'warning'
  durationMs: number
}

export type ProjectFile = {
  id?: string
  path: string
  kind: 'component' | 'route' | 'style' | 'config' | 'api'
  summary: string
  size?: number
  hash?: string
}

export type ProjectSnapshot = {
  id?: string
  name: string
  stack: string[]
  files: ProjectFile[]
  rootPath?: string
  updatedAt?: string
}

export type AgentRunRequest = {
  requirement: string
  project: ProjectSnapshot
  projectId?: string
}

export type AgentRunStatus =
  | 'running'
  | 'completed'
  | 'completed_with_fallback'
  | 'failed'
  | 'cancelled'

export type AgentRunResult = {
  mode: 'deepseek' | 'mock'
  modelUsed: string
  runId?: string
  status?: AgentRunStatus
  createdAt?: string
  summary: string
  plan: string[]
  tools: ToolRun[]
  diff: string
  review: string[]
  error?: string
  events?: AgentEvent[]
  evaluation?: EvaluationResult
}

export type AgentRunHistoryItem = AgentRunResult & {
  runId: string
  requirement: string
  projectName: string
  status: AgentRunStatus
  createdAt: string
  updatedAt: string
}

export type ProjectImportRequest = {
  rootPath: string
  name?: string
}

export type AgentEvent = {
  id?: string
  runId: string
  type: 'prompt' | 'model' | 'tool' | 'state' | 'error' | 'evaluation' | 'memory'
  title: string
  payload: unknown
  createdAt: string
}

export type EvaluationResult = {
  score: number
  verdict: 'pass' | 'warn' | 'fail'
  checks: Array<{
    name: string
    passed: boolean
    message: string
  }>
}

export type ProjectMemory = {
  id: string
  projectId: string
  kind: 'stack' | 'component' | 'preference' | 'decision' | 'lesson'
  content: string
  createdAt: string
}

export type PatchActionResult = {
  runId: string
  status: 'prepared' | 'applied' | 'skipped' | 'failed' | 'rolled_back'
  message: string
  patchPath?: string
  touchedFiles: string[]
  verification?: {
    lint?: string
    build?: string
  }
}

export type CapabilityItem = {
  id: string
  title: string
  description: string
  status: 'available' | 'partial' | 'missing'
}

export type DirectoryEntry = {
  name: string
  path: string
  isParent?: boolean
}

export type QueueStatus = {
  queued: number
  running: number
  activeRunId: string | null
  queuedRunIds: string[]
}

export type ProjectDashboard = {
  projectId: string
  name: string
  rootPath?: string
  totalFiles: number
  totalSize: number
  filesByKind: Record<string, number>
  largestFiles: Array<{
    path: string
    size: number
  }>
  likelyEntryFiles: string[]
  risks: string[]
}

export type ProjectFileContent = {
  path: string
  content: string
  size: number
  language: string
}

export type ProjectQuestionRequest = {
  question: string
}

export type ProjectQuestionAnswer = {
  answer: string
  references: string[]
}

export type TaskTemplate = {
  id: string
  title: string
  prompt: string
  category: 'analysis' | 'refactor' | 'quality' | 'feature'
}

export type RunReport = {
  runId: string
  title: string
  summary: string
  status: AgentRunStatus
  sections: Array<{
    title: string
    content: string
  }>
}

const projectFileSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['component', 'route', 'style', 'config', 'api']),
  summary: z.string().min(1),
})

const projectSnapshotSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  stack: z.array(z.string().min(1)),
  files: z.array(projectFileSchema),
  rootPath: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const agentRunRequestSchema = z.object({
  requirement: z.string().min(1),
  project: projectSnapshotSchema,
  projectId: z.string().optional(),
})

export const projectImportRequestSchema = z.object({
  rootPath: z.string().min(1),
  name: z.string().min(1).optional(),
})

export const projectQuestionRequestSchema = z.object({
  question: z.string().min(1),
})
