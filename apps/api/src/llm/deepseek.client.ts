import type { TokenUsage, ToolSchema } from '@agent-lab/shared'
import { config } from '../config/env.ts'

type DeepSeekJsonResult = Record<string, unknown>

type DeepSeekChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

type DeepSeekToolDefinition = {
  type: 'function'
  function: ToolSchema
}

type DeepSeekChatCompletion = {
  id: string
  model: string
  choices: Array<{
    finish_reason: string
    message: DeepSeekChatMessage
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export type ChatCompletionInput = {
  messages: DeepSeekChatMessage[]
  tools?: ToolSchema[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  responseFormat?: 'text' | 'json_object'
  temperature?: number
}

export type ChatCompletionResult = {
  message: DeepSeekChatMessage
  usage: TokenUsage
  latencyMs: number
  finishReason: string
}

const DEEPSEEK_PRICES_PER_MTOK: Record<string, { prompt: number; completion: number }> = {
  'deepseek-chat': { prompt: 0.27, completion: 1.1 },
  'deepseek-reasoner': { prompt: 0.55, completion: 2.19 },
}

export function estimateUsdCost(model: string, usage: TokenUsage) {
  const price = DEEPSEEK_PRICES_PER_MTOK[model] ?? DEEPSEEK_PRICES_PER_MTOK['deepseek-chat']
  const promptCostUsd = (usage.promptTokens / 1_000_000) * price.prompt
  const completionCostUsd = (usage.completionTokens / 1_000_000) * price.completion
  return {
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    promptCostUsd,
    completionCostUsd,
    totalCostUsd: promptCostUsd + completionCostUsd,
  }
}

export class DeepSeekClient {
  hasApiKey() {
    return Boolean(config.deepseek.apiKey)
  }

  getModel() {
    return config.deepseek.model
  }

  async chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
    if (!this.hasApiKey()) {
      throw new Error('DEEPSEEK_API_KEY is missing')
    }

    const startedAt = Date.now()

    const body: Record<string, unknown> = {
      model: config.deepseek.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
    }

    if (input.responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' }
    }

    if (input.tools?.length) {
      body.tools = input.tools.map<DeepSeekToolDefinition>((tool) => ({
        type: 'function',
        function: tool,
      }))
      body.tool_choice = input.toolChoice ?? 'auto'
    }

    const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`DeepSeek API failed with ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as DeepSeekChatCompletion
    const choice = data.choices?.[0]

    if (!choice) {
      throw new Error('DeepSeek returned no choices')
    }

    const usage: TokenUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    }

    return {
      message: choice.message,
      usage,
      latencyMs: Date.now() - startedAt,
      finishReason: choice.finish_reason,
    }
  }

  async generateJson(systemContent: string, input: unknown): Promise<{
    result: unknown
    usage: TokenUsage
    latencyMs: number
  }> {
    const completion = await this.chatCompletion({
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: JSON.stringify(input) },
      ],
    })

    const content = completion.message.content ?? '{}'

    return {
      result: JSON.parse(content) as DeepSeekJsonResult,
      usage: completion.usage,
      latencyMs: completion.latencyMs,
    }
  }
}

export const deepSeekClient = new DeepSeekClient()

export type { DeepSeekChatMessage, DeepSeekToolDefinition }
