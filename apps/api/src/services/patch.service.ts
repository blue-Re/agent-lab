import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type {
  PatchActionResult,
  PatchApplyRequest,
  PatchFileDiff,
  PatchPlan,
} from '@agent-lab/shared'
import { agentEventRepository } from '../repositories/agent-event.repository.ts'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'
import {
  applyHunksToContent,
  contentFromNewFile,
  parseUnifiedDiff,
} from './diff-parser.ts'

const SAFE_ROOT = '.agent-lab'

function runProjectCommand(cwd: string, command: string, args: string[]) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, timeout: 30_000 })
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

function patchDir(projectRoot: string) {
  return path.join(projectRoot, SAFE_ROOT, 'patches')
}

function snapshotDir(projectRoot: string, runId: string) {
  return path.join(projectRoot, SAFE_ROOT, 'snapshots', runId)
}

function rollbackPath(projectRoot: string, runId: string) {
  return path.join(patchDir(projectRoot), `${runId}.rollback.json`)
}

function ensureInside(rootPath: string, target: string) {
  const absolute = path.resolve(rootPath, target)
  if (!absolute.startsWith(path.resolve(rootPath))) {
    throw new Error(`Target outside project sandbox: ${target}`)
  }
  return absolute
}

type RollbackMetadata = {
  createdFiles: string[]
  modifiedFiles: Array<{ filePath: string; snapshotPath: string }>
  deletedFiles: Array<{ filePath: string; snapshotPath: string }>
}

export class PatchService {
  async getPlan(runId: string): Promise<PatchPlan> {
    const run = agentRunRepository.findById(runId)
    if (!run) throw new Error('Agent run not found')
    return {
      runId,
      files: parseUnifiedDiff(run.diff),
      raw: run.diff,
    }
  }

  async prepare(runId: string): Promise<PatchActionResult> {
    const { run, project } = this.resolveContext(runId)

    const directory = patchDir(project.rootPath)
    const patchPath = path.join(directory, `${runId}.diff`)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(patchPath, run.diff, 'utf8')

    const files = parseUnifiedDiff(run.diff)

    return {
      runId,
      status: 'prepared',
      message: 'Patch 已保存到 .agent-lab/patches，可以逐文件 / 逐 hunk 审批。',
      patchPath,
      touchedFiles: files.map((file) => file.filePath),
    }
  }

  async apply(runId: string, request?: PatchApplyRequest): Promise<PatchActionResult> {
    const { run, project } = this.resolveContext(runId)
    const prepared = await this.prepare(runId)
    const files = parseUnifiedDiff(run.diff)

    if (!files.length) {
      return {
        ...prepared,
        status: 'skipped',
        message: '当前 diff 没有可识别的文件块，请检查 diff 格式。',
        verification: await verifyProject(project.rootPath),
      }
    }

    const selectedSet = request?.selectedHunkIds?.length ? new Set(request.selectedHunkIds) : null
    const rollback: RollbackMetadata = {
      createdFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
    }
    const appliedHunks: string[] = []
    const skippedHunks: string[] = []
    const touchedFiles = new Set<string>()
    const snapshotsRoot = snapshotDir(project.rootPath, runId)

    for (const file of files) {
      const targetFile = file.filePath
      const hunks = selectedSet
        ? file.hunks.filter((hunk) => selectedSet.has(hunk.id))
        : file.hunks

      if (!hunks.length) {
        for (const hunk of file.hunks) skippedHunks.push(hunk.id)
        continue
      }

      const absoluteTarget = ensureInside(project.rootPath, targetFile)
      const exists = await this.fileExists(absoluteTarget)

      if (file.isNewFile) {
        if (exists) {
          for (const hunk of hunks) skippedHunks.push(hunk.id)
          agentEventRepository.create({
            runId,
            type: 'state',
            title: `跳过 ${targetFile}`,
            payload: { reason: 'new file but already exists' },
          })
          continue
        }
        const content = contentFromNewFile(hunks)
        await fs.mkdir(path.dirname(absoluteTarget), { recursive: true })
        await fs.writeFile(absoluteTarget, content, 'utf8')
        rollback.createdFiles.push(targetFile)
        touchedFiles.add(targetFile)
        for (const hunk of hunks) appliedHunks.push(hunk.id)
        continue
      }

      if (file.isDeletedFile) {
        if (!exists) {
          for (const hunk of hunks) skippedHunks.push(hunk.id)
          continue
        }
        const snapshotFile = await this.snapshotFile(snapshotsRoot, targetFile, absoluteTarget)
        await fs.rm(absoluteTarget, { force: true })
        rollback.deletedFiles.push({ filePath: targetFile, snapshotPath: snapshotFile })
        touchedFiles.add(targetFile)
        for (const hunk of hunks) appliedHunks.push(hunk.id)
        continue
      }

      if (!exists) {
        for (const hunk of hunks) skippedHunks.push(hunk.id)
        agentEventRepository.create({
          runId,
          type: 'state',
          title: `跳过 ${targetFile}`,
          payload: { reason: 'target file missing on disk' },
        })
        continue
      }

      const original = await fs.readFile(absoluteTarget, 'utf8')
      const snapshotFile = await this.snapshotFile(snapshotsRoot, targetFile, absoluteTarget, original)
      const next = applyHunksToContent(original, hunks)

      if (next === original) {
        for (const hunk of hunks) skippedHunks.push(hunk.id)
        continue
      }

      await fs.writeFile(absoluteTarget, next, 'utf8')
      rollback.modifiedFiles.push({ filePath: targetFile, snapshotPath: snapshotFile })
      touchedFiles.add(targetFile)
      for (const hunk of hunks) appliedHunks.push(hunk.id)
    }

    await fs.writeFile(rollbackPath(project.rootPath, runId), JSON.stringify(rollback, null, 2), 'utf8')

    const verification = await verifyProject(project.rootPath)
    const status: PatchActionResult['status'] =
      appliedHunks.length === 0 ? 'skipped' : skippedHunks.length ? 'partial' : 'applied'

    return {
      runId,
      status,
      message:
        status === 'applied'
          ? '所有选中的 hunk 已应用，已写入快照供回滚。'
          : status === 'partial'
            ? '已应用部分 hunk，其余被跳过，未应用部分保持原样。'
            : '没有可应用的 hunk。',
      patchPath: prepared.patchPath,
      touchedFiles: [...touchedFiles],
      appliedHunks,
      skippedHunks,
      verification,
    }
  }

  async rollback(runId: string): Promise<PatchActionResult> {
    const { project } = this.resolveContext(runId)

    const metadataPath = rollbackPath(project.rootPath, runId)
    let metadata: RollbackMetadata

    try {
      const raw = await fs.readFile(metadataPath, 'utf8')
      metadata = JSON.parse(raw) as RollbackMetadata
    } catch {
      return {
        runId,
        status: 'skipped',
        message: '没有找到 rollback 元数据，可能未应用过 patch。',
        touchedFiles: [],
        verification: await verifyProject(project.rootPath),
      }
    }

    const restored: string[] = []

    for (const created of metadata.createdFiles ?? []) {
      const target = ensureInside(project.rootPath, created)
      await fs.rm(target, { force: true })
      restored.push(created)
    }

    for (const modified of metadata.modifiedFiles ?? []) {
      const target = ensureInside(project.rootPath, modified.filePath)
      const snapshot = await fs.readFile(modified.snapshotPath, 'utf8')
      await fs.writeFile(target, snapshot, 'utf8')
      restored.push(modified.filePath)
    }

    for (const deleted of metadata.deletedFiles ?? []) {
      const target = ensureInside(project.rootPath, deleted.filePath)
      const snapshot = await fs.readFile(deleted.snapshotPath, 'utf8')
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, snapshot, 'utf8')
      restored.push(deleted.filePath)
    }

    return {
      runId,
      status: 'rolled_back',
      message: restored.length ? `已回滚 ${restored.length} 个文件。` : '没有需要回滚的文件。',
      touchedFiles: restored,
      verification: await verifyProject(project.rootPath),
    }
  }

  private resolveContext(runId: string) {
    const run = agentRunRepository.findById(runId)
    if (!run) throw new Error('Agent run not found')

    const project = projectRepository.listProjects().find((item) => item.name === run.projectName)
    if (!project?.rootPath) throw new Error('Indexed project rootPath not found')

    return { run, project: { ...project, rootPath: path.resolve(project.rootPath) } }
  }

  private async fileExists(absolutePath: string) {
    try {
      await fs.stat(absolutePath)
      return true
    } catch {
      return false
    }
  }

  private async snapshotFile(
    snapshotsRoot: string,
    relativePath: string,
    absolutePath: string,
    contentHint?: string,
  ) {
    const targetSnapshot = path.join(snapshotsRoot, relativePath)
    await fs.mkdir(path.dirname(targetSnapshot), { recursive: true })
    const content = contentHint ?? (await fs.readFile(absolutePath, 'utf8').catch(() => ''))
    await fs.writeFile(targetSnapshot, content, 'utf8')
    return targetSnapshot
  }
}

export const patchService = new PatchService()

export type { PatchFileDiff }
