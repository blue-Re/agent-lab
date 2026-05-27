import { randomUUID } from 'node:crypto'
import type {
  EvalCase,
  EvalCaseResult,
  EvalRunSummary,
  EvalStreamEvent,
  ProjectSnapshot,
} from '@agent-lab/shared'
import { goldenCases } from '../eval/golden-cases.ts'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { costRepository } from '../repositories/cost.repository.ts'
import { evalRepository } from '../repositories/eval.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'
import { eventBusService } from './event-bus.service.ts'
import { frontendCodeAgentService } from './frontend-code-agent.service.ts'

function evaluate(
  evalCase: EvalCase,
  payload: { plan: string[]; review: string[]; diff: string },
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

function evalChannel(id: string) {
  return `eval:${id}`
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

  getActive(): EvalRunSummary | null {
    return evalRepository.findRunning()
  }

  /** 立即返回 summary（status=running），后台跑 cases。 */
  start(options: { projectId?: string; caseIds?: string[] }): EvalRunSummary {
    const project = this.resolveProject(options.projectId)
    const cases = options.caseIds?.length
      ? goldenCases.filter((item) => options.caseIds?.includes(item.id))
      : goldenCases

    if (!cases.length) {
      throw new Error('请至少选择一个评测用例。')
    }

    const id = randomUUID()
    const startedAt = new Date().toISOString()
    const initialCases: EvalCaseResult[] = cases.map((evalCase) => ({
      caseId: evalCase.id,
      title: evalCase.title,
      status: 'pending',
      runId: null,
      score: 0,
      verdict: 'fail',
      checks: [],
      costUsd: 0,
      latencyMs: 0,
    }))

    const summary: EvalRunSummary = {
      id,
      projectName: project.name,
      status: 'running',
      startedAt,
      finishedAt: null,
      currentIndex: 0,
      totalCount: cases.length,
      averageScore: 0,
      passRate: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
      cases: initialCases,
      message: `准备运行 ${cases.length} 个用例 · 项目 ${project.name}`,
    }

    evalRepository.create(summary)
    this.log('info', id, `▶︎ Eval ${id.slice(0, 8)} started · ${cases.length} cases · project=${project.name}`)
    this.publish(id, { type: 'snapshot', summary })

    void this.executeCases(summary, cases, project)
    return summary
  }

  private async executeCases(
    summary: EvalRunSummary,
    cases: EvalCase[],
    project: ProjectSnapshot,
  ) {
    let totalCostUsd = 0
    let totalLatencyMs = 0

    for (let index = 0; index < cases.length; index += 1) {
      const evalCase = cases[index]
      summary.currentIndex = index
      summary.cases[index].status = 'running'
      summary.message = `运行第 ${index + 1}/${cases.length} 个用例：${evalCase.title}`
      evalRepository.updateProgress(summary)
      this.log('info', summary.id, `  · case ${index + 1}/${cases.length} START · ${evalCase.title}`)
      this.publish(summary.id, {
        type: 'case_started',
        caseId: evalCase.id,
        index,
        total: cases.length,
      })

      const startedTs = Date.now()

      try {
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

        const caseResult: EvalCaseResult = {
          caseId: evalCase.id,
          title: evalCase.title,
          status: 'completed',
          runId,
          score: evalResult.score,
          verdict: evalResult.verdict,
          checks: evalResult.checks,
          costUsd: cost,
          latencyMs: latency,
        }
        summary.cases[index] = caseResult
        summary.totalCostUsd = totalCostUsd
        summary.totalLatencyMs = totalLatencyMs
        evalRepository.updateProgress(summary)
        this.log(
          'info',
          summary.id,
          `  · case ${index + 1}/${cases.length} DONE · ${evalResult.verdict.toUpperCase()} (${evalResult.score}) · $${cost.toFixed(6)} · ${latency}ms`,
        )
        this.publish(summary.id, {
          type: 'case_finished',
          caseId: evalCase.id,
          index,
          result: caseResult,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error'
        const caseResult: EvalCaseResult = {
          caseId: evalCase.id,
          title: evalCase.title,
          status: 'failed',
          runId: null,
          score: 0,
          verdict: 'fail',
          checks: [
            { name: 'Agent 执行', passed: false, message },
          ],
          costUsd: 0,
          latencyMs: Date.now() - startedTs,
        }
        summary.cases[index] = caseResult
        evalRepository.updateProgress(summary)
        this.log('error', summary.id, `  · case ${index + 1}/${cases.length} FAIL · ${message}`)
        this.publish(summary.id, {
          type: 'case_failed',
          caseId: evalCase.id,
          index,
          result: caseResult,
          error: message,
        })
      }
    }

    const completedCases = summary.cases.filter((item) => item.status === 'completed')
    const averageScore = completedCases.length
      ? Math.round(completedCases.reduce((acc, item) => acc + item.score, 0) / completedCases.length)
      : 0
    const passCount = summary.cases.filter((item) => item.verdict === 'pass').length
    summary.averageScore = averageScore
    summary.passRate = summary.cases.length ? passCount / summary.cases.length : 0
    summary.finishedAt = new Date().toISOString()
    summary.currentIndex = summary.cases.length
    summary.status = summary.cases.some((item) => item.status === 'failed') && completedCases.length === 0
      ? 'failed'
      : 'completed'
    summary.message =
      summary.status === 'completed'
        ? `已完成 · 平均分 ${averageScore} · 通过率 ${(summary.passRate * 100).toFixed(0)}%`
        : `失败 · ${summary.cases.length} 个用例全部失败`

    evalRepository.updateProgress(summary)
    this.log(
      'info',
      summary.id,
      `✔ Eval ${summary.id.slice(0, 8)} ${summary.status.toUpperCase()} · avg=${averageScore} · pass=${(summary.passRate * 100).toFixed(0)}% · $${totalCostUsd.toFixed(6)} · ${totalLatencyMs}ms`,
    )
    this.publish(summary.id, {
      type: summary.status === 'completed' ? 'completed' : 'failed',
      summary,
      ...(summary.status === 'failed' ? { error: summary.message ?? 'eval failed' } : {}),
    } as EvalStreamEvent)
  }

  private publish(id: string, event: EvalStreamEvent) {
    eventBusService.publishToChannel(evalChannel(id), event)
  }

  private log(
    level: 'info' | 'warn' | 'error',
    id: string,
    message: string,
  ) {
    const tag = `[eval ${id.slice(0, 8)}]`
    const fullMessage = `${tag} ${message}`
    if (level === 'error') console.error(fullMessage)
    else if (level === 'warn') console.warn(fullMessage)
    else console.log(fullMessage)

    this.publish(id, {
      type: 'log',
      level,
      message,
      timestamp: new Date().toISOString(),
    })
  }

  /** 给 SSE controller 用：直接订阅指定 eval id 的频道。 */
  subscribe(id: string, listener: (event: EvalStreamEvent) => void) {
    return eventBusService.subscribeChannel<EvalStreamEvent>(evalChannel(id), listener)
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
