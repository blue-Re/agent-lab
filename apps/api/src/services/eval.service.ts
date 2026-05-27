import { randomUUID } from 'node:crypto'
import type {
  EvalCase,
  EvalCaseResult,
  EvalRunSummary,
  ProjectSnapshot,
} from '@agent-lab/shared'
import { goldenCases } from '../eval/golden-cases.ts'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { costRepository } from '../repositories/cost.repository.ts'
import { evalRepository } from '../repositories/eval.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'
import { frontendCodeAgentService } from './frontend-code-agent.service.ts'

function evaluate(
  evalCase: EvalCase,
  payload: {
    plan: string[]
    review: string[]
    diff: string
  },
): { score: number; verdict: EvalCaseResult['verdict']; checks: EvalCaseResult['checks'] } {
  const checks: EvalCaseResult['checks'] = []

  const minPlan = evalCase.expectations.minPlanItems ?? 0
  checks.push({
    name: '计划完整性',
    passed: payload.plan.length >= minPlan,
    message: `期望 plan ≥ ${minPlan} 条，实际 ${payload.plan.length}`,
  })

  const minReview = evalCase.expectations.minReviewItems ?? 0
  checks.push({
    name: '审查完整性',
    passed: payload.review.length >= minReview,
    message: `期望 review ≥ ${minReview} 条，实际 ${payload.review.length}`,
  })

  if (evalCase.expectations.requireDiff) {
    const hasDiff = /diff --git/.test(payload.diff)
    checks.push({
      name: 'Diff 输出',
      passed: hasDiff,
      message: hasDiff ? '已生成 diff' : '缺少 diff',
    })
  }

  for (const keyword of evalCase.expectations.requireKeywords ?? []) {
    const haystack = `${payload.plan.join(' ')}\n${payload.review.join(' ')}\n${payload.diff}`.toLowerCase()
    const passed = haystack.includes(keyword.toLowerCase())
    checks.push({
      name: `关键词 "${keyword}"`,
      passed,
      message: passed ? '命中' : '未命中',
    })
  }

  const passed = checks.filter((check) => check.passed).length
  const score = checks.length ? Math.round((passed / checks.length) * 100) : 0
  const verdict: EvalCaseResult['verdict'] = score >= 80 ? 'pass' : score >= 50 ? 'warn' : 'fail'
  return { score, verdict, checks }
}

export class EvalService {
  listCases(): EvalCase[] {
    return goldenCases
  }

  listRuns(limit = 20): EvalRunSummary[] {
    return evalRepository.list(limit)
  }

  getRun(id: string): EvalRunSummary | null {
    return evalRepository.findById(id)
  }

  async run(options: { projectId?: string; caseIds?: string[] }): Promise<EvalRunSummary> {
    const project = this.resolveProject(options.projectId)
    const cases = options.caseIds?.length
      ? goldenCases.filter((item) => options.caseIds?.includes(item.id))
      : goldenCases

    const startedAt = new Date().toISOString()
    const caseResults: EvalCaseResult[] = []
    let totalCostUsd = 0
    let totalLatencyMs = 0

    for (const evalCase of cases) {
      try {
        const startedTs = Date.now()
        const runResult = await frontendCodeAgentService.run({
          requirement: evalCase.requirement,
          project,
          projectId: project.id,
        })

        const runId = runResult.runId ?? ''
        const persisted = runId ? agentRunRepository.findById(runId) : null
        const evalResult = evaluate(evalCase, {
          plan: persisted?.plan ?? runResult.plan,
          review: persisted?.review ?? runResult.review,
          diff: persisted?.diff ?? runResult.diff,
        })
        const costEntries = runId ? costRepository.listByRun(runId) : []
        const cost = costEntries.reduce((acc, entry) => acc + entry.totalCostUsd, 0)
        const latency = Date.now() - startedTs
        totalCostUsd += cost
        totalLatencyMs += latency

        caseResults.push({
          caseId: evalCase.id,
          title: evalCase.title,
          runId,
          score: evalResult.score,
          verdict: evalResult.verdict,
          checks: evalResult.checks,
          costUsd: cost,
          latencyMs: latency,
        })
      } catch (error) {
        caseResults.push({
          caseId: evalCase.id,
          title: evalCase.title,
          runId: null,
          score: 0,
          verdict: 'fail',
          checks: [
            {
              name: 'Agent 执行',
              passed: false,
              message: error instanceof Error ? error.message : 'unknown',
            },
          ],
          costUsd: 0,
          latencyMs: 0,
        })
      }
    }

    const finishedAt = new Date().toISOString()
    const averageScore = caseResults.length
      ? Math.round(caseResults.reduce((acc, item) => acc + item.score, 0) / caseResults.length)
      : 0
    const passCount = caseResults.filter((item) => item.verdict === 'pass').length
    const passRate = caseResults.length ? passCount / caseResults.length : 0

    const summary: EvalRunSummary = {
      id: randomUUID(),
      projectName: project.name,
      startedAt,
      finishedAt,
      averageScore,
      passRate,
      totalCostUsd,
      totalLatencyMs,
      cases: caseResults,
    }

    evalRepository.save(summary)
    return summary
  }

  private resolveProject(projectId?: string): ProjectSnapshot {
    const projects = projectRepository.listProjects()
    if (!projects.length) {
      throw new Error('请先导入至少一个项目再运行评测。')
    }
    if (projectId) {
      const target = projectRepository.findById(projectId)
      if (target) return target
    }
    return projects[0]
  }
}

export const evalService = new EvalService()
