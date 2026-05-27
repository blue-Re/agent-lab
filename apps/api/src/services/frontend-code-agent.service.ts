import {
  evaluateAgentResult,
  extractProjectMemories,
} from '@agent-lab/agent-core'
import type {
  AgentRunRequest,
  AgentRunResult,
  RunReport,
  ToolRun,
} from '@agent-lab/shared'
import { deepSeekClient } from '../llm/deepseek.client.ts'
import { agentEventRepository } from '../repositories/agent-event.repository.ts'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { costRepository } from '../repositories/cost.repository.ts'
import { memoryRepository } from '../repositories/memory.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'
import { toolLoopOrchestrator } from './tool-loop.service.ts'
import { workerQueueService } from './worker-queue.service.ts'

export class FrontendCodeAgentService {
  async run(payload: AgentRunRequest) {
    const normalizedPayload = this.resolveProjectPayload(payload)
    const runId = agentRunRepository.create({
      requirement: normalizedPayload.requirement,
      projectName: normalizedPayload.project.name,
    })

    try {
      const result = await this.executeRun(runId, normalizedPayload)
      return {
        runId,
        createdAt: agentRunRepository.findById(runId)?.createdAt,
        ...result,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown agent error'
      agentRunRepository.fail(runId, message)
      throw error
    }
  }

  startRun(payload: AgentRunRequest) {
    const normalizedPayload = this.resolveProjectPayload(payload)
    const runId = agentRunRepository.create({
      requirement: normalizedPayload.requirement,
      projectName: normalizedPayload.project.name,
    })

    workerQueueService.enqueue(runId, async () => {
      this.executeRun(runId, normalizedPayload).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown agent error'
        agentRunRepository.fail(runId, message)
        agentEventRepository.create({
          runId,
          type: 'error',
          title: '异步任务失败',
          payload: { message },
        })
      })
    })

    return agentRunRepository.findById(runId)
  }

  listRuns(limit: number) {
    return agentRunRepository.list(limit)
  }

  getRun(runId: string) {
    return agentRunRepository.findById(runId)
  }

  listEvents(runId: string) {
    return agentEventRepository.listByRun(runId)
  }

  retryRun(runId: string) {
    const run = agentRunRepository.findById(runId)
    if (!run) return null

    const project = projectRepository.listProjects().find((item) => item.name === run.projectName)
    if (!project) throw new Error('Cannot retry run because the indexed project was not found')

    return this.startRun({
      requirement: run.requirement,
      project,
      projectId: project.id,
    })
  }

  cancelRun(runId: string) {
    workerQueueService.cancelQueued(runId)
    const cancelledRun = agentRunRepository.cancel(runId)

    if (cancelledRun) {
      agentEventRepository.create({
        runId,
        type: 'state',
        title: '任务取消',
        payload: { status: cancelledRun.status },
      })
    }

    return cancelledRun
  }

  queueStatus() {
    return workerQueueService.status()
  }

  getReport(runId: string): RunReport | null {
    const run = agentRunRepository.findById(runId)
    if (!run) return null

    const events = agentEventRepository.listByRun(runId)
    const toolEvents = events.filter((event) => event.type === 'tool_result' || event.type === 'tool')
    const costEntries = costRepository.listByRun(runId)
    const totalCostUsd = costEntries.reduce((acc, entry) => acc + entry.totalCostUsd, 0)
    const totalTokens = costEntries.reduce((acc, entry) => acc + entry.totalTokens, 0)

    return {
      runId,
      title: `${run.projectName} · ${run.requirement}`,
      summary: run.summary || '本次运行尚未生成总结。',
      status: run.status,
      sections: [
        { title: '任务目标', content: run.requirement },
        {
          title: '执行计划',
          content: run.plan.length
            ? run.plan.map((item, index) => `${index + 1}. ${item}`).join('\n')
            : '暂无计划。',
        },
        {
          title: '工具调用',
          content: toolEvents.length
            ? toolEvents.map((event) => `- ${event.title}`).join('\n')
            : '暂无工具调用。',
        },
        {
          title: '审查结论',
          content: run.review.length
            ? run.review.map((item) => `- ${item}`).join('\n')
            : '暂无审查结论。',
        },
        {
          title: 'Patch 摘要',
          content: run.diff ? run.diff.slice(0, 3000) : '暂无 patch。',
        },
        {
          title: '成本与延迟',
          content: `总成本 $${totalCostUsd.toFixed(6)} · 总 token ${totalTokens} · 调用次数 ${costEntries.length}`,
        },
      ],
    }
  }

  private resolveProjectPayload(payload: AgentRunRequest): AgentRunRequest {
    if (!payload.projectId) return payload

    const project = projectRepository.findById(payload.projectId)
    if (!project) throw new Error('Project not found')

    return { ...payload, project }
  }

  private async executeRun(runId: string, payload: AgentRunRequest): Promise<AgentRunResult> {
    agentEventRepository.create({
      runId,
      type: 'state',
      title: '任务开始',
      payload: { requirement: payload.requirement, project: payload.project.name },
    })

    if (!deepSeekClient.hasApiKey()) {
      const fallback = this.createFallbackResult(payload, '缺少 DEEPSEEK_API_KEY')
      const evaluation = evaluateAgentResult(fallback)
      const withEval = { ...fallback, evaluation }
      agentRunRepository.complete(runId, withEval)
      memoryRepository.saveEvaluation(runId, evaluation)
      agentEventRepository.create({
        runId,
        type: 'model',
        title: '模型输出（fallback）',
        payload: withEval,
      })
      agentEventRepository.create({
        runId,
        type: 'evaluation',
        title: '自动评测',
        payload: evaluation,
      })
      return withEval
    }

    try {
      const { result, iterations, totalCostUsd, totalLatencyMs } =
        await toolLoopOrchestrator.execute(payload, {
          emit: (event) => {
            switch (event.type) {
              case 'role':
                agentEventRepository.create({
                  runId,
                  type: 'role',
                  title: `${event.role} 角色启动`,
                  payload: event,
                })
                break
              case 'iteration_started':
                agentEventRepository.create({
                  runId,
                  type: 'iteration',
                  title: `第 ${event.index + 1} 轮思考开始`,
                  payload: event,
                })
                break
              case 'reasoning':
                if (event.content.trim()) {
                  agentEventRepository.create({
                    runId,
                    type: 'reasoning',
                    title: `第 ${event.index + 1} 轮推理`,
                    payload: { content: event.content },
                  })
                }
                break
              case 'tool_call':
                agentEventRepository.create({
                  runId,
                  type: 'tool_call',
                  title: `Tool Call: ${event.call.name}`,
                  payload: event.call,
                })
                break
              case 'tool_result':
                agentEventRepository.create({
                  runId,
                  type: 'tool_result',
                  title: `Tool Result: ${event.result.name}`,
                  payload: event.result,
                })
                break
              case 'iteration_finished':
                agentEventRepository.create({
                  runId,
                  type: 'iteration',
                  title: `第 ${event.iteration.index + 1} 轮完成`,
                  payload: event.iteration,
                })
                break
              case 'cost': {
                const entry = costRepository.record({
                  runId,
                  stage: event.cost.stage,
                  model: event.cost.model,
                  promptTokens: event.cost.promptTokens,
                  completionTokens: event.cost.completionTokens,
                  totalTokens: event.cost.totalTokens,
                  promptCostUsd: event.cost.promptCostUsd,
                  completionCostUsd: event.cost.completionCostUsd,
                  totalCostUsd: event.cost.totalCostUsd,
                  latencyMs: event.cost.latencyMs,
                })
                agentEventRepository.create({
                  runId,
                  type: 'cost',
                  title: `成本 +$${event.cost.totalCostUsd.toFixed(6)}`,
                  payload: entry,
                })
                break
              }
              case 'final_started':
                agentEventRepository.create({
                  runId,
                  type: 'state',
                  title: '生成最终方案',
                  payload: {},
                })
                break
              case 'final_completed':
                agentEventRepository.create({
                  runId,
                  type: 'final',
                  title: '最终方案已生成',
                  payload: {
                    summary: event.result.summary,
                    plan: event.result.plan,
                    review: event.result.review,
                    diffLength: event.result.diff.length,
                  },
                })
                break
              case 'warning':
                agentEventRepository.create({
                  runId,
                  type: 'state',
                  title: '执行警告',
                  payload: { message: event.message },
                })
                break
            }
          },
        })

      const evaluation = evaluateAgentResult(result)
      const withEval = { ...result, evaluation }
      agentRunRepository.complete(runId, withEval)
      memoryRepository.saveEvaluation(runId, evaluation)
      agentEventRepository.create({
        runId,
        type: 'evaluation',
        title: '自动评测',
        payload: evaluation,
      })
      agentEventRepository.create({
        runId,
        type: 'state',
        title: '运行成本汇总',
        payload: {
          iterations: iterations.length,
          totalCostUsd,
          totalLatencyMs,
        },
      })

      if (payload.project.id) {
        const memories = extractProjectMemories(payload.project.id, withEval)
        memoryRepository.addProjectMemories(memories)
        agentEventRepository.create({
          runId,
          type: 'memory',
          title: '长期记忆',
          payload: { count: memories.length },
        })
      }

      return withEval
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      agentEventRepository.create({
        runId,
        type: 'error',
        title: 'Tool loop 执行失败',
        payload: { message },
      })
      const fallback = this.createFallbackResult(payload, message)
      const evaluation = evaluateAgentResult(fallback)
      const withEval = { ...fallback, evaluation }
      agentRunRepository.complete(runId, withEval)
      memoryRepository.saveEvaluation(runId, evaluation)
      return withEval
    }
  }

  private createFallbackResult(payload: AgentRunRequest, error: string): AgentRunResult {
    const firstComponent =
      payload.project.files.find((file) => file.kind === 'component')?.path ?? 'src/App.tsx'
    const placeholderTool: ToolRun = {
      name: 'fallback',
      input: payload.requirement,
      output: error,
      status: 'warning',
      durationMs: 0,
    }

    return {
      mode: 'mock',
      modelUsed: 'fallback-agent',
      status: 'completed_with_fallback',
      summary: `Agent 链路完成，但模型不可用，返回本地兜底建议。建议先围绕 ${firstComponent} 做最小实现。`,
      plan: [
        '基于项目快照识别入口、组件、样式和 API 模块。',
        '优先复用现有组件，避免引入不必要依赖。',
        '生成可审查 diff，保持改动边界清晰。',
        '应用前执行 lint/build，并把记录写入 SQLite。',
      ],
      tools: [placeholderTool],
      diff: `diff --git a/${firstComponent} b/${firstComponent}
--- a/${firstComponent}
+++ b/${firstComponent}
@@
+// AgentLab fallback patch preview:
+// ${payload.requirement}`,
      review: [
        `模型调用失败，已使用兜底结果：${error}`,
        '建议配置 DEEPSEEK_API_KEY 后重新运行。',
        '当前运行已写入数据库，可用于评测和长期记忆。',
      ],
      error,
    }
  }
}

export const frontendCodeAgentService = new FrontendCodeAgentService()
