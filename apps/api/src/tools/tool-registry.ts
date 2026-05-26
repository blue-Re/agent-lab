import { performance } from 'node:perf_hooks'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { AgentRunRequest, ToolRun } from '@agent-lab/shared'

async function measure(
  name: string,
  input: string,
  handler: () => Promise<string> | string,
): Promise<ToolRun> {
  const startedAt = performance.now()
  const output = await handler()

  return {
    name,
    input,
    output,
    status: 'success',
    durationMs: Math.round(performance.now() - startedAt),
  }
}

function assertProjectRoot(rootPath?: string) {
  if (!rootPath) {
    throw new Error('Project rootPath is required for real tool execution')
  }

  return path.resolve(rootPath)
}

function resolveInsideProject(rootPath: string, relativePath: string) {
  const absolutePath = path.resolve(rootPath, relativePath)

  if (!absolutePath.startsWith(rootPath)) {
    throw new Error('Tool path is outside project sandbox')
  }

  return absolutePath
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      timeout: 20_000,
    })
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

export class ToolRegistry {
  listFiles(payload: AgentRunRequest) {
    return measure('listFiles', payload.project.name, () =>
      `发现 ${payload.project.files.length} 个候选文件：${payload.project.files
        .map((file) => file.path)
        .join(', ')}`,
    )
  }

  searchCode(payload: AgentRunRequest) {
    return measure('searchCode', payload.requirement, async () => {
      const keywords = payload.requirement
        .toLowerCase()
        .split(/\s+|，|。|、/)
        .filter(Boolean)

      const rootPath = payload.project.rootPath
      const matched: string[] = []

      for (const file of payload.project.files.slice(0, 80)) {
        const content = rootPath
          ? await fs
              .readFile(resolveInsideProject(path.resolve(rootPath), file.path), 'utf8')
              .catch(() => '')
          : ''
        const haystack = `${file.path} ${file.summary} ${content}`.toLowerCase()

        if (keywords.some((keyword) => haystack.includes(keyword))) {
          matched.push(`${file.path}(${file.kind})`)
        }
      }

      const candidates = matched.length
        ? matched
        : payload.project.files.slice(0, 3).map((file) => `${file.path}(${file.kind})`)

      return `候选上下文：${candidates.slice(0, 8).join(', ')}`
    })
  }

  summarizeProject(payload: AgentRunRequest) {
    return measure('summarizeProject', payload.project.name, () => {
      const byKind = payload.project.files.reduce<Record<string, number>>(
        (result, file) => {
          result[file.kind] = (result[file.kind] ?? 0) + 1
          return result
        },
        {},
      )

      return `技术栈：${payload.project.stack.join(' / ')}；文件分布：${JSON.stringify(
        byKind,
      )}`
    })
  }

  readRelevantFiles(payload: AgentRunRequest) {
    return measure('readFile', 'top relevant project files', async () => {
      const rootPath = payload.project.rootPath
      const files = payload.project.files.slice(0, 4)
      const snippets = await Promise.all(
        files.map(async (file) => {
          const content = rootPath
            ? await fs
                .readFile(resolveInsideProject(path.resolve(rootPath), file.path), 'utf8')
                .catch(() => file.summary)
            : file.summary
          return `### ${file.path}\n${content.slice(0, 1200)}`
        }),
      )

      return snippets.join('\n\n').slice(0, 5000)
    })
  }

  writePatchDraft(payload: AgentRunRequest) {
    return measure('writePatch', 'draft patch only', () => {
      const firstFile = payload.project.files[0]?.path ?? 'src/App.tsx'
      return `diff --git a/${firstFile} b/${firstFile}\n--- a/${firstFile}\n+++ b/${firstFile}\n@@\n+// Agent requirement: ${payload.requirement}`
    })
  }

  runLint(payload: AgentRunRequest) {
    return measure('runLint', 'pnpm lint --if-present', async () => {
      const rootPath = assertProjectRoot(payload.project.rootPath)
      return runCommand('pnpm', ['lint', '--if-present'], rootPath)
    })
  }

  getToolDecisions(payload: AgentRunRequest) {
    const requirement = payload.requirement.toLowerCase()
    const decisions = [
      { tool: 'listFiles', reason: '先获取项目文件边界。' },
      { tool: 'searchCode', reason: '根据需求检索候选上下文。' },
      { tool: 'readFile', reason: '读取关键文件片段供模型推理。' },
      { tool: 'summarizeProject', reason: '压缩项目结构与技术栈。' },
    ]

    if (/patch|diff|代码|实现|新增|修改|修复|component|组件/.test(requirement)) {
      decisions.push({ tool: 'writePatch', reason: '需求涉及代码变更，需要生成补丁草案。' })
    }
    if (/lint|build|test|验证|检查|质量/.test(requirement)) {
      decisions.push({ tool: 'runLint', reason: '需求涉及质量验证，需要执行检查命令。' })
    }
    if (payload.project.files.some((file) => file.path === 'package.json')) {
      decisions.push({ tool: 'runLint', reason: '项目包含 package.json，可执行 npm 脚本验证。' })
    }

    return decisions.filter(
      (decision, index, all) =>
        all.findIndex((item) => item.tool === decision.tool) === index,
    )
  }

  async runContextTools(payload: AgentRunRequest) {
    const selectedTools = new Set(this.getToolDecisions(payload).map((decision) => decision.tool))
    const tools: ToolRun[] = []

    if (selectedTools.has('listFiles')) tools.push(await this.listFiles(payload))
    if (selectedTools.has('searchCode')) tools.push(await this.searchCode(payload))
    if (selectedTools.has('readFile')) tools.push(await this.readRelevantFiles(payload))
    if (selectedTools.has('summarizeProject')) tools.push(await this.summarizeProject(payload))
    if (selectedTools.has('writePatch')) tools.push(await this.writePatchDraft(payload))
    if (selectedTools.has('runLint')) tools.push(await this.runLint(payload))

    return tools
  }
}

export const toolRegistry = new ToolRegistry()
