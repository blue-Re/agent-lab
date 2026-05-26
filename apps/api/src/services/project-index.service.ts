import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  ProjectDashboard,
  ProjectFile,
  ProjectFileContent,
  ProjectImportRequest,
} from '@agent-lab/shared'
import { projectRepository } from '../repositories/project.repository.ts'

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'data',
])

const supportedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.css',
  '.scss',
  '.json',
  '.md',
  '.html',
])

function detectKind(relativePath: string): ProjectFile['kind'] {
  const normalized = relativePath.toLowerCase()

  if (normalized.includes('api') || normalized.includes('service')) return 'api'
  if (normalized.endsWith('.css') || normalized.endsWith('.scss')) return 'style'
  if (normalized.includes('route') || normalized.includes('page') || normalized.includes('app.')) {
    return 'route'
  }
  if (normalized.endsWith('.json') || normalized.includes('config')) return 'config'
  return 'component'
}

function summarizeFile(relativePath: string, content: string) {
  const firstSignalLine =
    content
      .split('\n')
      .map((line) => line.trim())
      .find((line) =>
        /^(export|function|const|class|interface|type|import|#)/.test(line),
      ) ?? ''

  return firstSignalLine
    ? `${relativePath}：${firstSignalLine.slice(0, 120)}`
    : `${relativePath}：${content.slice(0, 120).replace(/\s+/g, ' ')}`
}

function detectStack(files: ProjectFile[]) {
  const paths = files.map((file) => file.path.toLowerCase())
  const stack = new Set<string>()

  if (paths.some((file) => file.endsWith('.tsx') || file.includes('react'))) {
    stack.add('React')
  }
  if (paths.some((file) => file.endsWith('.vue'))) stack.add('Vue')
  if (paths.some((file) => file.includes('vite.config'))) stack.add('Vite')
  if (paths.some((file) => file.includes('next.config'))) stack.add('Next.js')
  if (paths.some((file) => file.endsWith('.ts') || file.endsWith('.tsx'))) {
    stack.add('TypeScript')
  }
  if (paths.some((file) => file.includes('tailwind'))) stack.add('Tailwind CSS')

  return stack.size ? [...stack] : ['JavaScript']
}

async function walkDirectory(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue

    const absolutePath = path.join(currentPath, entry.name)

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue
      files.push(...(await walkDirectory(rootPath, absolutePath)))
      continue
    }

    if (!entry.isFile()) continue
    if (!supportedExtensions.has(path.extname(entry.name))) continue

    files.push(path.relative(rootPath, absolutePath))
  }

  return files
}

export class ProjectIndexService {
  async importProject(input: ProjectImportRequest) {
    const rootPath = path.resolve(input.rootPath)
    const stat = await fs.stat(rootPath)

    if (!stat.isDirectory()) {
      throw new Error('Project root must be a directory')
    }

    const relativeFiles = (await walkDirectory(rootPath)).slice(0, 300)
    const files: Array<Omit<ProjectFile, 'id'>> = []

    for (const relativePath of relativeFiles) {
      const absolutePath = path.join(rootPath, relativePath)
      const content = await fs.readFile(absolutePath, 'utf8')
      const fileStat = await fs.stat(absolutePath)

      files.push({
        path: relativePath,
        kind: detectKind(relativePath),
        summary: summarizeFile(relativePath, content),
        size: fileStat.size,
        hash: createHash('sha1').update(content).digest('hex'),
      })
    }

    return projectRepository.upsertProject({
      name: input.name ?? path.basename(rootPath),
      rootPath,
      stack: detectStack(files),
      files,
    })
  }

  listProjects() {
    return projectRepository.listProjects()
  }

  getProject(projectId: string) {
    return projectRepository.findById(projectId)
  }

  getDashboard(projectId: string): ProjectDashboard {
    const project = projectRepository.findById(projectId)

    if (!project) {
      throw new Error('Project not found')
    }

    const filesByKind = project.files.reduce<Record<string, number>>((result, file) => {
      result[file.kind] = (result[file.kind] ?? 0) + 1
      return result
    }, {})
    const largestFiles = [...project.files]
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, 5)
      .map((file) => ({ path: file.path, size: file.size ?? 0 }))
    const likelyEntryFiles = project.files
      .filter((file) =>
        /(^|\/)(main|index|app|page)\.(ts|tsx|js|jsx|vue)$/.test(file.path.toLowerCase()),
      )
      .map((file) => file.path)
      .slice(0, 8)
    const risks = [
      project.files.length >= 280 ? '索引文件接近上限，建议后续增加分批索引。' : '',
      largestFiles.some((file) => file.size > 50_000)
        ? '存在较大源码文件，Agent 读取前需要上下文压缩。'
        : '',
      !project.files.some((file) => file.path.includes('test') || file.path.includes('spec'))
        ? '未发现明显测试文件，建议补充测试策略。'
        : '',
      !project.files.some((file) => file.kind === 'api')
        ? '未发现明显 API/service 文件，可能需要人工确认数据层位置。'
        : '',
    ].filter(Boolean)

    return {
      projectId,
      name: project.name,
      rootPath: project.rootPath,
      totalFiles: project.files.length,
      totalSize: project.files.reduce((total, file) => total + (file.size ?? 0), 0),
      filesByKind,
      largestFiles,
      likelyEntryFiles,
      risks,
    }
  }

  async getFileContent(projectId: string, relativePath: string): Promise<ProjectFileContent> {
    const project = projectRepository.findById(projectId)

    if (!project?.rootPath) {
      throw new Error('Project rootPath not found')
    }

    const projectRoot = path.resolve(project.rootPath)
    const absolutePath = path.resolve(projectRoot, relativePath)

    if (!absolutePath.startsWith(projectRoot)) {
      throw new Error('File path is outside project sandbox')
    }

    const stat = await fs.stat(absolutePath)
    const content = await fs.readFile(absolutePath, 'utf8')

    return {
      path: relativePath,
      content: content.slice(0, 20_000),
      size: stat.size,
      language: path.extname(relativePath).replace('.', '') || 'text',
    }
  }
}

export const projectIndexService = new ProjectIndexService()
