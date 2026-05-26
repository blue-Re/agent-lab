import type { AgentRunRequest, ToolRun } from '@agent-lab/shared'
import { config } from '../config/env.ts'

type DeepSeekJsonResult = {
  summary?: unknown
  plan?: unknown
  diff?: unknown
  review?: unknown
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const resultContract = `Return strict JSON only:
{
  "summary": "string",
  "plan": ["string"],
  "diff": "unified diff string",
  "review": ["string"]
}`

export class DeepSeekClient {
  hasApiKey() {
    return Boolean(config.deepseek.apiKey)
  }

  async generateAgentResult(input: {
    payload: AgentRunRequest
    toolResults: ToolRun[]
  }) {
    if (!this.hasApiKey()) {
      throw new Error('DEEPSEEK_API_KEY is missing')
    }

    const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              '你是 AgentLab 的研发 Agent。你的目标是为前端代码库任务生成工程化、可审查、可持续演进的方案。',
              '你必须尊重已有项目结构，优先复用组件和样式，不输出无关重构。',
              resultContract,
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`DeepSeek API failed with ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as DeepSeekResponse
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('DeepSeek returned empty content')
    }

    return JSON.parse(content) as DeepSeekJsonResult
  }

  async generateJson(systemContent: string, input: unknown) {
    if (!this.hasApiKey()) {
      throw new Error('DEEPSEEK_API_KEY is missing')
    }

    const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: JSON.stringify(input) },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`DeepSeek API failed with ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as DeepSeekResponse
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('DeepSeek returned empty content')
    }

    return JSON.parse(content) as unknown
  }
}

export const deepSeekClient = new DeepSeekClient()
