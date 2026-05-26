import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { PatchActionResult } from '@agent-lab/shared'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'

function extractTouchedFiles(diff: string) {
  return [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(
    (match) => match[2] ?? match[1] ?? '',
  )
}

function extractNewFileContent(diff: string) {
  const fileMatch = diff.match(/^diff --git a\/(.+?) b\/(.+)$/m)
  if (!fileMatch || !diff.includes('new file mode')) return null

  const filePath = fileMatch[2]
  const lines = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))

  return filePath ? { filePath, content: `${lines.join('\n')}\n` } : null
}

function runProjectCommand(cwd: string, command: string, args: string[]) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      timeout: 30_000,
    })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    child.on('close', (code) => {
      resolve(`exit=${code}\n${output.slice(0, 5000)}`)
    })
    child.on('error', (error) => {
      resolve(`command failed: ${error.message}`)
    })
  })
}

async function verifyProject(rootPath: string) {
  const packageJsonPath = path.join(rootPath, 'package.json')

  try {
    await fs.stat(packageJsonPath)
  } catch {
    return {
      lint: 'skipped: package.json not found',
      build: 'skipped: package.json not found',
    }
  }

  const lint = await runProjectCommand(rootPath, 'pnpm', ['lint', '--if-present'])
  const build = await runProjectCommand(rootPath, 'pnpm', ['build', '--if-present'])

  return { lint, build }
}

function rollbackPath(projectRoot: string, runId: string) {
  return path.join(projectRoot, '.agent-lab', 'patches', `${runId}.rollback.json`)
}

export class PatchService {
  async prepare(runId: string): Promise<PatchActionResult> {
    const run = agentRunRepository.findById(runId)

    if (!run) throw new Error('Agent run not found')

    const project = projectRepository
      .listProjects()
      .find((item) => item.name === run.projectName)

    if (!project?.rootPath) throw new Error('Indexed project rootPath not found')

    const patchDir = path.join(project.rootPath, '.agent-lab', 'patches')
    const patchPath = path.join(patchDir, `${runId}.diff`)
    await fs.mkdir(patchDir, { recursive: true })
    await fs.writeFile(patchPath, run.diff, 'utf8')

    return {
      runId,
      status: 'prepared',
      message: 'Patch 已保存到项目 .agent-lab/patches，等待用户审查后应用。',
      patchPath,
      touchedFiles: extractTouchedFiles(run.diff),
    }
  }

  async apply(runId: string): Promise<PatchActionResult> {
    const run = agentRunRepository.findById(runId)

    if (!run) throw new Error('Agent run not found')

    const project = projectRepository
      .listProjects()
      .find((item) => item.name === run.projectName)

    if (!project?.rootPath) throw new Error('Indexed project rootPath not found')

    const prepared = await this.prepare(runId)
    const newFile = extractNewFileContent(run.diff)

    if (!newFile) {
      return {
        ...prepared,
        status: 'skipped',
        message:
          '当前 diff 不是可安全自动应用的新文件补丁，已保存 patch 文件供人工审查。',
        verification: await verifyProject(project.rootPath),
      }
    }

    const targetPath = path.resolve(project.rootPath, newFile.filePath)
    const projectRoot = path.resolve(project.rootPath)

    if (!targetPath.startsWith(projectRoot)) {
      throw new Error('Patch target is outside project sandbox')
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true })

    try {
      await fs.stat(targetPath)
      return {
        ...prepared,
        status: 'skipped',
        message: '目标文件已存在，已跳过自动应用，避免覆盖用户代码。',
        verification: await verifyProject(project.rootPath),
      }
    } catch {
      await fs.writeFile(targetPath, newFile.content, 'utf8')
    }

    await fs.writeFile(
      rollbackPath(project.rootPath, runId),
      JSON.stringify({ createdFiles: [newFile.filePath] }, null, 2),
      'utf8',
    )

    return {
      ...prepared,
      status: 'applied',
      message: '新文件补丁已安全应用到项目目录。',
      touchedFiles: [newFile.filePath],
      verification: await verifyProject(project.rootPath),
    }
  }

  async rollback(runId: string): Promise<PatchActionResult> {
    const run = agentRunRepository.findById(runId)

    if (!run) throw new Error('Agent run not found')

    const project = projectRepository
      .listProjects()
      .find((item) => item.name === run.projectName)

    if (!project?.rootPath) throw new Error('Indexed project rootPath not found')

    const metadataPath = rollbackPath(project.rootPath, runId)
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as {
      createdFiles?: string[]
    }
    const removedFiles: string[] = []
    const projectRoot = path.resolve(project.rootPath)

    for (const file of metadata.createdFiles ?? []) {
      const targetPath = path.resolve(projectRoot, file)
      if (!targetPath.startsWith(projectRoot)) continue
      await fs.rm(targetPath, { force: true })
      removedFiles.push(file)
    }

    return {
      runId,
      status: 'rolled_back',
      message: removedFiles.length
        ? '已回滚自动应用的新文件补丁。'
        : '没有找到可回滚的自动应用文件。',
      touchedFiles: removedFiles,
      verification: await verifyProject(project.rootPath),
    }
  }
}

export const patchService = new PatchService()
