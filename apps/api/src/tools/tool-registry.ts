import { performance } from 'node:perf_hooks'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type {
  AgentRunRequest,
  ToolCallResult,
  ToolRun,
  ToolSchema,
} from '@agent-lab/shared'

type ToolHandler = (
  payload: AgentRunRequest,
  args: Record<string, unknown>,
) => Promise<string>

type ToolDefinition = {
  schema: ToolSchema
  handler: ToolHandler
}

function assertProjectRoot(rootPath?: string) {
  if (!rootPath) {
    throw new Error('Project rootPath is required for tool execution')
  }
  return path.resolve(rootPath)
}

function resolveInsideProject(rootPath: string, relativePath: string) {
  const absolutePath = path.resolve(rootPath, relativePath)
  if (!absolutePath.startsWith(rootPath)) {
    throw new Error(`Tool path is outside project sandbox: ${relativePath}`)
  }
  return absolutePath
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, timeout: 20_000 })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    child.on('close', (code) => {
      resolve(`exit=${code}\n${output.slice(0, 4000)}`)
    })
    child.on('error', (error) => {
      resolve(`command failed: ${error.message}`)
    })
  })
}

function stringArg(args: Record<string, unknown>, key: string, fallback = '') {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberArg(args: Record<string, unknown>, key: string, fallback: number) {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  constructor() {
    this.register({
      schema: {
        name: 'listFiles',
        description:
          '列出项目索引文件（path / kind / summary）。当你需要建立项目鸟瞰图时调用。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '返回多少条文件，默认 60' },
            kind: { type: 'string', description: '可选过滤 kind: component / route / style / config / api' },
          },
        },
      },
      handler: async (payload, args) => {
        const limit = numberArg(args, 'limit', 60)
        const kind = stringArg(args, 'kind')
        const files = payload.project.files.filter((file) => (kind ? file.kind === kind : true)).slice(0, limit)
        const lines = files.map((file) => `${file.path} [${file.kind}] - ${file.summary}`)
        return `共 ${files.length} 个候选文件：\n${lines.join('\n') || '(无)'}`
      },
    })

    this.register({
      schema: {
        name: 'searchCode',
        description: '基于关键词在项目文件（路径 / 摘要 / 内容）里搜索候选位置。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词，可包含多个空格分隔的词' },
            limit: { type: 'number', description: '返回数量上限，默认 12' },
          },
          required: ['query'],
        },
      },
      handler: async (payload, args) => {
        const query = stringArg(args, 'query', payload.requirement)
        const limit = numberArg(args, 'limit', 12)
        const keywords = query.toLowerCase().split(/\s+|，|。|、/).filter(Boolean)
        const rootPath = payload.project.rootPath
        const matched: string[] = []

        for (const file of payload.project.files.slice(0, 120)) {
          const content = rootPath
            ? await fs
                .readFile(resolveInsideProject(path.resolve(rootPath), file.path), 'utf8')
                .catch(() => '')
            : ''
          const haystack = `${file.path} ${file.summary} ${content}`.toLowerCase()
          if (keywords.some((keyword) => haystack.includes(keyword))) {
            matched.push(`${file.path} [${file.kind}]`)
            if (matched.length >= limit) break
          }
        }

        if (!matched.length) {
          return `没有匹配到 "${query}"，建议先调用 listFiles 看项目结构。`
        }

        return `匹配到 ${matched.length} 个候选：\n${matched.join('\n')}`
      },
    })

    this.register({
      schema: {
        name: 'readFile',
        description: '读取项目里指定相对路径文件的内容（最多 6000 字符）。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '相对项目根的文件路径' },
            maxChars: { type: 'number', description: '最多读取字符数，默认 6000' },
          },
          required: ['path'],
        },
      },
      handler: async (payload, args) => {
        const target = stringArg(args, 'path')
        if (!target) return 'readFile 需要 path 参数。'
        const max = numberArg(args, 'maxChars', 6000)
        const rootPath = assertProjectRoot(payload.project.rootPath)
        const absolutePath = resolveInsideProject(rootPath, target)
        try {
          const content = await fs.readFile(absolutePath, 'utf8')
          return `### ${target}\n${content.slice(0, max)}`
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown'
          return `读取 ${target} 失败：${message}`
        }
      },
    })

    this.register({
      schema: {
        name: 'summarizeProject',
        description: '汇总项目的技术栈与文件类型分布，用于建立全局认知。',
        parameters: { type: 'object', properties: {} },
      },
      handler: async (payload) => {
        const byKind = payload.project.files.reduce<Record<string, number>>((acc, file) => {
          acc[file.kind] = (acc[file.kind] ?? 0) + 1
          return acc
        }, {})
        return `技术栈：${payload.project.stack.join(' / ') || '未知'}；文件分布：${JSON.stringify(
          byKind,
        )}；总文件 ${payload.project.files.length}`
      },
    })

    this.register({
      schema: {
        name: 'runLint',
        description: '在项目根目录执行 pnpm lint --if-present 做静态检查。',
        parameters: { type: 'object', properties: {} },
      },
      handler: async (payload) => {
        const rootPath = assertProjectRoot(payload.project.rootPath)
        return runCommand('pnpm', ['lint', '--if-present'], rootPath)
      },
    })

    this.register({
      schema: {
        name: 'finish',
        description:
          '当你已经收集到足够上下文、准备产出最终 plan/diff/review 时调用，loop 立即终止并进入最终响应阶段。',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: '准备结束循环的理由' },
          },
        },
      },
      handler: async (_payload, args) => {
        return `loop finish: ${stringArg(args, 'reason', 'context sufficient')}`
      },
    })
  }

  register(tool: ToolDefinition) {
    this.tools.set(tool.schema.name, tool)
  }

  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((tool) => tool.schema)
  }

  has(name: string) {
    return this.tools.has(name)
  }

  async execute(
    payload: AgentRunRequest,
    call: { id: string; name: string; arguments: Record<string, unknown> },
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(call.name)
    const startedAt = performance.now()

    if (!tool) {
      return {
        id: call.id,
        name: call.name,
        status: 'error',
        durationMs: 0,
        output: '',
        error: `Unknown tool: ${call.name}`,
      }
    }

    try {
      const output = await tool.handler(payload, call.arguments)
      return {
        id: call.id,
        name: call.name,
        status: 'success',
        durationMs: Math.round(performance.now() - startedAt),
        output,
      }
    } catch (error) {
      return {
        id: call.id,
        name: call.name,
        status: 'error',
        durationMs: Math.round(performance.now() - startedAt),
        output: '',
        error: error instanceof Error ? error.message : 'unknown tool error',
      }
    }
  }

  asLegacyToolRuns(results: ToolCallResult[]): ToolRun[] {
    return results.map((result) => ({
      name: result.name,
      input: JSON.stringify(result),
      output: result.output || result.error || '',
      status: result.status === 'success' ? 'success' : 'warning',
      durationMs: result.durationMs,
    }))
  }
}

export const toolRegistry = new ToolRegistry()
