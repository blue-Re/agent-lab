import { randomUUID } from 'node:crypto'
import type {
  AgentRole,
  AgentRunRequest,
  AgentRunResult,
  LoopIteration,
  ToolCallResult,
  ToolCallSpec,
  ToolRun,
} from '@agent-lab/shared'
import { config } from '../config/env.ts'
import {
  deepSeekClient,
  estimateUsdCost,
  type DeepSeekChatMessage,
} from '../llm/deepseek.client.ts'
import { toolRegistry } from '../tools/tool-registry.ts'

const MAX_ITERATIONS = 5
const MAX_TOOL_CALLS_PER_ITERATION = 4

const SYSTEM_PROMPT = `你是 AgentLab 的研发 Agent，负责理解前端代码库需求并输出工程化可审查的方案。
你可以多轮调用工具（listFiles / searchCode / readFile / summarizeProject / runLint）逐步收集上下文。
工作流：
1. 先 summarizeProject 与 listFiles 建立鸟瞰。
2. 用 searchCode + readFile 钻取与需求最相关的关键文件，最多 ${MAX_ITERATIONS} 轮，每轮最多 ${MAX_TOOL_CALLS_PER_ITERATION} 个工具调用。
3. 当上下文足够（你能写出可执行 plan + diff + review）时调用 finish 工具。
4. finish 之后会进入最终输出阶段，请用严格 JSON 输出 {"summary","plan":[],"diff":"unified diff","review":[]}。
约束：
- diff 必须是 unified diff（以 "diff --git a/... b/..." 开头）。
- 只修改 / 新增与需求强相关的文件，禁止大规模重构。
- review 至少 2 条，指出风险与后续动作。`

type CostMeta = {
  stage: 'loop' | 'final' | 'eval' | 'qa'
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  promptCostUsd: number
  completionCostUsd: number
  totalCostUsd: number
  latencyMs: number
}

export type ToolLoopEvent =
  | { type: 'role'; role: AgentRole; description: string }
  | { type: 'iteration_started'; index: number }
  | { type: 'reasoning'; index: number; content: string }
  | { type: 'tool_call'; index: number; call: ToolCallSpec }
  | { type: 'tool_result'; index: number; result: ToolCallResult }
  | { type: 'iteration_finished'; iteration: LoopIteration }
  | { type: 'cost'; cost: CostMeta }
  | { type: 'final_started' }
  | { type: 'final_completed'; result: AgentRunResult }
  | { type: 'warning'; message: string }

export type ToolLoopHooks = {
  emit: (event: ToolLoopEvent) => void
}

export type ToolLoopOutput = {
  result: AgentRunResult
  iterations: LoopIteration[]
  totalCostUsd: number
  totalLatencyMs: number
}

function safeParseJson<T>(content: string, fallback: T): T {
  try {
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function buildUserSeed(payload: AgentRunRequest) {
  return {
    requirement: payload.requirement,
    project: {
      name: payload.project.name,
      stack: payload.project.stack,
      rootPath: payload.project.rootPath,
      filesPreview: payload.project.files.slice(0, 40).map((file) => ({
        path: file.path,
        kind: file.kind,
        summary: file.summary,
      })),
      totalFiles: payload.project.files.length,
    },
    hints: [
      '请先调用 summarizeProject 和 listFiles 拿到全局视图，再决定后续步骤。',
      '使用 readFile 时务必传相对路径。',
    ],
  }
}

function describeRole(iterationIndex: number): { role: AgentRole; description: string } {
  if (iterationIndex === 0) {
    return { role: 'Planner', description: '拆解需求、规划检索路径。' }
  }
  if (iterationIndex === 1) {
    return { role: 'Researcher', description: '检索关键文件、补充上下文。' }
  }
  if (iterationIndex >= MAX_ITERATIONS - 1) {
    return { role: 'Reviewer', description: '在生成最终方案前做最后审查。' }
  }
  return { role: 'Coder', description: '基于上下文设计修改方案。' }
}

export class ToolLoopOrchestrator {
  async execute(payload: AgentRunRequest, hooks: ToolLoopHooks): Promise<ToolLoopOutput> {
    if (!deepSeekClient.hasApiKey()) {
      throw new Error('DEEPSEEK_API_KEY missing, cannot run tool loop')
    }

    const messages: DeepSeekChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(buildUserSeed(payload)) },
    ]

    const iterations: LoopIteration[] = []
    let totalCostUsd = 0
    let totalLatencyMs = 0
    let finished = false

    for (let index = 0; index < MAX_ITERATIONS; index += 1) {
      const { role, description } = describeRole(index)
      hooks.emit({ type: 'role', role, description })
      hooks.emit({ type: 'iteration_started', index })

      const completion = await deepSeekClient.chatCompletion({
        messages,
        tools: toolRegistry.schemas(),
        toolChoice: 'auto',
        temperature: 0.2,
      })

      const cost = estimateUsdCost(deepSeekClient.getModel(), completion.usage)
      const costMeta: CostMeta = {
        stage: 'loop',
        ...cost,
        latencyMs: completion.latencyMs,
      }
      totalCostUsd += cost.totalCostUsd
      totalLatencyMs += completion.latencyMs
      hooks.emit({ type: 'cost', cost: costMeta })

      const reasoning = completion.message.content?.trim() ?? ''
      if (reasoning) hooks.emit({ type: 'reasoning', index, content: reasoning })

      const rawCalls = completion.message.tool_calls ?? []

      if (!rawCalls.length) {
        const iteration: LoopIteration = {
          index,
          role,
          reasoning,
          toolCalls: [],
          toolResults: [],
          finished: true,
        }
        iterations.push(iteration)
        hooks.emit({ type: 'iteration_finished', iteration })
        break
      }

      const limitedCalls = rawCalls.slice(0, MAX_TOOL_CALLS_PER_ITERATION)
      if (rawCalls.length > MAX_TOOL_CALLS_PER_ITERATION) {
        hooks.emit({
          type: 'warning',
          message: `本轮工具调用 ${rawCalls.length} 个，超过限制 ${MAX_TOOL_CALLS_PER_ITERATION}，已截断。`,
        })
      }

      messages.push({
        role: 'assistant',
        content: reasoning,
        tool_calls: limitedCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: call.function,
        })),
      })

      const toolCalls: ToolCallSpec[] = []
      const toolResults: ToolCallResult[] = []

      for (const call of limitedCalls) {
        const args = safeParseJson<Record<string, unknown>>(call.function.arguments || '{}', {})
        const spec: ToolCallSpec = {
          id: call.id,
          name: call.function.name,
          arguments: args,
        }
        toolCalls.push(spec)
        hooks.emit({ type: 'tool_call', index, call: spec })

        const result = await toolRegistry.execute(payload, spec)
        toolResults.push(result)
        hooks.emit({ type: 'tool_result', index, result })

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.status === 'success' ? result.output : result.error ?? 'tool failed',
        })

        if (spec.name === 'finish') {
          finished = true
        }
      }

      const iteration: LoopIteration = {
        index,
        role,
        reasoning,
        toolCalls,
        toolResults,
        finished,
      }
      iterations.push(iteration)
      hooks.emit({ type: 'iteration_finished', iteration })

      if (finished) break
    }

    hooks.emit({ type: 'final_started' })

    const finalMessages: DeepSeekChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content:
          '现在请基于以上工具结果输出最终方案，必须是严格 JSON：{"summary","plan":["string"],"diff":"unified diff","review":["string"]}。不要再调用工具。',
      },
    ]

    const finalCompletion = await deepSeekClient.chatCompletion({
      messages: finalMessages,
      responseFormat: 'json_object',
      temperature: 0.2,
    })

    const finalCost = estimateUsdCost(deepSeekClient.getModel(), finalCompletion.usage)
    totalCostUsd += finalCost.totalCostUsd
    totalLatencyMs += finalCompletion.latencyMs

    hooks.emit({
      type: 'cost',
      cost: {
        stage: 'final',
        ...finalCost,
        latencyMs: finalCompletion.latencyMs,
      },
    })

    const raw = finalCompletion.message.content ?? '{}'
    const parsed = safeParseJson<Record<string, unknown>>(raw, {})

    const allToolRuns: ToolRun[] = iterations.flatMap((iteration) =>
      toolRegistry.asLegacyToolRuns(iteration.toolResults),
    )

    const result: AgentRunResult = {
      mode: 'deepseek',
      modelUsed: config.deepseek.model,
      status: 'completed',
      summary: String(parsed.summary ?? ''),
      plan: stringArray(parsed.plan),
      tools: allToolRuns,
      diff: String(parsed.diff ?? ''),
      review: stringArray(parsed.review),
    }

    hooks.emit({ type: 'final_completed', result })

    return {
      result,
      iterations,
      totalCostUsd,
      totalLatencyMs,
    }
  }

  ensureId(call: { id?: string }): string {
    return call.id || randomUUID()
  }
}

export const toolLoopOrchestrator = new ToolLoopOrchestrator()
