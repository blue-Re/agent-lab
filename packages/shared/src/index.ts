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

export type AgentEventType =
  | 'prompt'
  | 'model'
  | 'tool'
  | 'tool_call'
  | 'tool_result'
  | 'state'
  | 'role'
  | 'reasoning'
  | 'token'
  | 'cost'
  | 'error'
  | 'evaluation'
  | 'memory'
  | 'iteration'
  | 'final'

export type AgentEvent = {
  id?: string
  runId: string
  type: AgentEventType
  title: string
  payload: unknown
  createdAt: string
}

export type AgentRole = 'Planner' | 'Researcher' | 'Coder' | 'Reviewer'

export type ToolCallSpec = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ToolCallResult = {
  id: string
  name: string
  status: 'success' | 'error'
  durationMs: number
  output: string
  error?: string
}

export type LoopIteration = {
  index: number
  role: AgentRole
  reasoning: string
  toolCalls: ToolCallSpec[]
  toolResults: ToolCallResult[]
  finished: boolean
}

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type CostBreakdown = {
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  promptCostUsd: number
  completionCostUsd: number
  totalCostUsd: number
  latencyMs: number
}

export type CostEntry = CostBreakdown & {
  id: string
  runId: string
  stage: 'loop' | 'final' | 'eval' | 'qa'
  createdAt: string
}

export type CostSummary = {
  totalRuns: number
  totalCostUsd: number
  totalTokens: number
  avgCostPerRun: number
  avgLatencyMs: number
  byDay: Array<{
    day: string
    runs: number
    costUsd: number
    tokens: number
  }>
  byModel: Array<{
    model: string
    runs: number
    costUsd: number
    tokens: number
  }>
  recent: CostEntry[]
}

export type ToolSchema = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
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
  status: 'prepared' | 'applied' | 'skipped' | 'failed' | 'rolled_back' | 'partial'
  message: string
  patchPath?: string
  touchedFiles: string[]
  verification?: {
    lint?: string
    build?: string
  }
  appliedHunks?: string[]
  skippedHunks?: string[]
}

export type PatchHunkChange = {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

export type PatchHunk = {
  id: string
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  changes: PatchHunkChange[]
}

export type PatchFileDiff = {
  id: string
  filePath: string
  oldPath: string
  newPath: string
  isNewFile: boolean
  isDeletedFile: boolean
  hunks: PatchHunk[]
}

export type PatchPlan = {
  runId: string
  files: PatchFileDiff[]
  raw: string
}

export type PatchApplyRequest = {
  selectedHunkIds?: string[]
}

export type EvalCase = {
  id: string
  title: string
  requirement: string
  category: 'analysis' | 'refactor' | 'quality' | 'feature'
  expectations: {
    minPlanItems?: number
    minReviewItems?: number
    requireDiff?: boolean
    requireKeywords?: string[]
  }
}

export type EvalCaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type EvalCaseResult = {
  caseId: string
  title: string
  status: EvalCaseStatus
  runId: string | null
  score: number
  verdict: 'pass' | 'warn' | 'fail'
  checks: Array<{ name: string; passed: boolean; message: string }>
  costUsd: number
  latencyMs: number
}

export type EvalRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type EvalRunSummary = {
  id: string
  projectName: string
  status: EvalRunStatus
  startedAt: string
  finishedAt: string | null
  currentIndex: number
  totalCount: number
  averageScore: number
  passRate: number
  totalCostUsd: number
  totalLatencyMs: number
  cases: EvalCaseResult[]
  message?: string
}

export type EvalStreamEvent =
  | { type: 'snapshot'; summary: EvalRunSummary }
  | { type: 'case_started'; caseId: string; index: number; total: number }
  | { type: 'case_finished'; caseId: string; index: number; result: EvalCaseResult }
  | { type: 'case_failed'; caseId: string; index: number; result: EvalCaseResult; error: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; timestamp: string }
  | { type: 'completed'; summary: EvalRunSummary }
  | { type: 'failed'; summary: EvalRunSummary; error: string }

export type SystemStreamEvent =
  | { type: 'queue:updated'; queue: QueueStatus }
  | { type: 'runs:updated' }
  | { type: 'cost:updated' }
  | { type: 'eval:runs:updated' }
  | { type: 'eval:active:updated'; active: EvalRunSummary | null }

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
