import type {
  AgentRunRequest,
  AgentRunResult,
  EvaluationResult,
  ProjectMemory,
  ToolRun,
} from '@agent-lab/shared'

export type AgentStage =
  | 'understand'
  | 'plan'
  | 'retrieve'
  | 'execute'
  | 'review'
  | 'evaluate'
  | 'remember'

export type AgentStageSnapshot = {
  stage: AgentStage
  title: string
  status: 'queued' | 'running' | 'completed' | 'failed'
}

export const defaultAgentStages: AgentStageSnapshot[] = [
  { stage: 'understand', title: '理解需求', status: 'queued' },
  { stage: 'plan', title: '任务规划', status: 'queued' },
  { stage: 'retrieve', title: '检索上下文', status: 'queued' },
  { stage: 'execute', title: '执行工具与生成补丁', status: 'queued' },
  { stage: 'review', title: '自我审查', status: 'queued' },
  { stage: 'evaluate', title: '质量评测', status: 'queued' },
  { stage: 'remember', title: '沉淀记忆', status: 'queued' },
]

export function buildAgentPrompt(payload: AgentRunRequest, toolResults: ToolRun[]) {
  return {
    requirement: payload.requirement,
    project: payload.project,
    toolResults,
    outputContract: {
      summary: 'string',
      plan: ['string'],
      diff: 'unified diff string',
      review: ['string'],
    },
  }
}

export function evaluateAgentResult(result: AgentRunResult): EvaluationResult {
  const checks = [
    {
      name: '生成计划',
      passed: result.plan.length > 0,
      message: result.plan.length > 0 ? '已生成计划' : '缺少可执行计划',
    },
    {
      name: '使用工具',
      passed: result.tools.length > 0,
      message: result.tools.length > 0 ? '已记录工具调用' : '缺少工具调用记录',
    },
    {
      name: '生成补丁',
      passed: result.diff.includes('diff --git'),
      message: result.diff.includes('diff --git') ? '补丁格式可识别' : '补丁格式不完整',
    },
    {
      name: '自我审查',
      passed: result.review.length > 0,
      message: result.review.length > 0 ? '已输出审查建议' : '缺少自我审查',
    },
  ]

  const passedCount = checks.filter((check) => check.passed).length
  const score = Math.round((passedCount / checks.length) * 100)

  return {
    score,
    verdict: score >= 80 ? 'pass' : score >= 50 ? 'warn' : 'fail',
    checks,
  }
}

export function extractProjectMemories(
  projectId: string,
  result: AgentRunResult,
): Omit<ProjectMemory, 'id' | 'createdAt'>[] {
  const memories: Omit<ProjectMemory, 'id' | 'createdAt'>[] = []

  if (result.summary) {
    memories.push({
      projectId,
      kind: 'lesson',
      content: result.summary,
    })
  }

  for (const review of result.review.slice(0, 3)) {
    memories.push({
      projectId,
      kind: 'decision',
      content: review,
    })
  }

  return memories
}
