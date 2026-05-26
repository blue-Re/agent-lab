import {
  buildAgentPrompt,
  evaluateAgentResult,
  extractProjectMemories,
} from '@agent-lab/agent-core'
import type { AgentRunRequest, AgentRunResult, RunReport, ToolRun } from '@agent-lab/shared'
import { config } from '../config/env.ts'
import { deepSeekClient } from '../llm/deepseek.client.ts'
import { agentEventRepository } from '../repositories/agent-event.repository.ts'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { memoryRepository } from '../repositories/memory.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'
import { toolRegistry } from '../tools/tool-registry.ts'
import { workerQueueService } from './worker-queue.service.ts'

type ModelResult = {
  summary?: unknown
  plan?: unknown
  diff?: unknown
  review?: unknown
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : []
}

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

    if (!run) {
      return null
    }

    const project = projectRepository
      .listProjects()
      .find((item) => item.name === run.projectName)

    if (!project) {
      throw new Error('Cannot retry run because the indexed project was not found')
    }

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

    if (!run) {
      return null
    }

    const events = agentEventRepository.listByRun(runId)
    const toolEvents = events.filter((event) => event.type === 'tool')

    return {
      runId,
      title: `${run.projectName} · ${run.requirement}`,
      summary: run.summary || '本次运行尚未生成总结。',
      status: run.status,
      sections: [
        {
          title: '任务目标',
          content: run.requirement,
        },
        {
          title: '执行计划',
          content: run.plan.length ? run.plan.map((item, index) => `${index + 1}. ${item}`).join('\n') : '暂无计划。',
        },
        {
          title: '工具调用',
          content: toolEvents.length
            ? toolEvents.map((event) => `- ${event.title}`).join('\n')
            : '暂无工具调用。',
        },
        {
          title: '审查结论',
          content: run.review.length ? run.review.map((item) => `- ${item}`).join('\n') : '暂无审查结论。',
        },
        {
          title: 'Patch 摘要',
          content: run.diff ? run.diff.slice(0, 3000) : '暂无 patch。',
        },
      ],
    }
  }

  private resolveProjectPayload(payload: AgentRunRequest): AgentRunRequest {
    if (!payload.projectId) {
      return payload
    }

    const project = projectRepository.findById(payload.projectId)

    if (!project) {
      throw new Error('Project not found')
    }

    return {
      ...payload,
      project,
    }
  }

  private async executeRun(runId: string, payload: AgentRunRequest) {
    agentEventRepository.create({
      runId,
      type: 'state',
      title: '任务开始',
      payload: { requirement: payload.requirement, project: payload.project.name },
    })

    const roles = [
      {
        role: 'Planner',
        task: '拆解用户需求，决定任务路径。',
      },
      {
        role: 'Researcher',
        task: '检索项目文件和上下文。',
      },
      {
        role: 'Coder',
        task: '根据上下文生成补丁方案。',
      },
      {
        role: 'Reviewer',
        task: '审查输出风险并生成评测信号。',
      },
    ]

    for (const role of roles) {
      agentEventRepository.create({
        runId,
        type: 'state',
        title: `${role.role} 角色启动`,
        payload: role,
      })
    }

    const toolDecisions = toolRegistry.getToolDecisions(payload)
    for (const decision of toolDecisions) {
      agentEventRepository.create({
        runId,
        type: 'tool',
        title: `Tool Decision: ${decision.tool}`,
        payload: decision,
      })
    }

    const toolResults = await toolRegistry.runContextTools(payload)
    for (const tool of toolResults) {
      agentEventRepository.create({
        runId,
        type: 'tool',
        title: tool.name,
        payload: tool,
      })
    }

    agentEventRepository.create({
      runId,
      type: 'prompt',
      title: '模型输入',
      payload: buildAgentPrompt(payload, toolResults),
    })

    const result = await this.generateResult(payload, toolResults)
    const evaluation = evaluateAgentResult(result)
    const resultWithEvaluation = { ...result, evaluation }

    agentRunRepository.complete(runId, resultWithEvaluation)
    memoryRepository.saveEvaluation(runId, evaluation)
    agentEventRepository.create({
      runId,
      type: 'model',
      title: '模型输出',
      payload: resultWithEvaluation,
    })
    agentEventRepository.create({
      runId,
      type: 'evaluation',
      title: '自动评测',
      payload: evaluation,
    })

    if (payload.project.id) {
      const memories = extractProjectMemories(payload.project.id, resultWithEvaluation)
      memoryRepository.addProjectMemories(memories)
      agentEventRepository.create({
        runId,
        type: 'memory',
        title: '长期记忆',
        payload: { count: memories.length },
      })
    }

    return resultWithEvaluation
  }

  private async generateResult(
    payload: AgentRunRequest,
    toolResults: ToolRun[],
  ): Promise<AgentRunResult> {
    try {
      const modelResult = await deepSeekClient.generateAgentResult({
        payload,
        toolResults,
      })

      return this.normalizeModelResult(modelResult, toolResults)
    } catch (error) {
      return this.createFallbackResult(
        payload,
        toolResults,
        error instanceof Error ? error.message : 'Unknown model error',
      )
    }
  }

  private normalizeModelResult(
    modelResult: ModelResult,
    toolResults: ToolRun[],
  ): AgentRunResult {
    return {
      mode: 'deepseek',
      modelUsed: config.deepseek.model,
      status: 'completed',
      summary: String(modelResult.summary ?? ''),
      plan: stringArray(modelResult.plan),
      tools: toolResults,
      diff: String(modelResult.diff ?? ''),
      review: stringArray(modelResult.review),
    }
  }

  private createFallbackResult(
    payload: AgentRunRequest,
    toolResults: ToolRun[],
    error: string,
  ): AgentRunResult {
    const firstComponent =
      payload.project.files.find((file) => file.kind === 'component')?.path ??
      'src/App.tsx'

    return {
      mode: 'mock',
      modelUsed: 'fallback-agent',
      status: 'completed_with_fallback',
      summary: `已完成 Agent 执行链路，但模型调用不可用，当前返回本地兜底结果。建议围绕 ${firstComponent} 做最小实现。`,
      plan: [
        '基于项目快照识别入口、组件、样式和 API 模块。',
        '通过工具结果收敛候选上下文，优先读取和需求直接相关的组件。',
        '生成可审查 diff，保持改动边界清晰。',
        '写入前执行 lint/build，并把运行记录保存到 SQLite。',
      ],
      tools: toolResults,
      diff: `diff --git a/${firstComponent} b/${firstComponent}
--- a/${firstComponent}
+++ b/${firstComponent}
@@
+// AgentLab fallback patch preview:
+// ${payload.requirement}`,
      review: [
        `模型调用失败，已使用兜底结果：${error}`,
        '后续可以把工具从快照模拟升级为真实文件系统工具。',
        'SQLite 已记录本次运行，后续可用于任务回放、评测和长期记忆。',
      ],
      error,
    }
  }
}

export const frontendCodeAgentService = new FrontendCodeAgentService()
