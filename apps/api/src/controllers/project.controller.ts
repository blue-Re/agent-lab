import type { Context } from 'koa'
import {
  projectImportRequestSchema,
  projectQuestionRequestSchema,
} from '@agent-lab/shared'
import { memoryRepository } from '../repositories/memory.repository.ts'
import { projectAssistantService } from '../services/project-assistant.service.ts'
import { projectIndexService } from '../services/project-index.service.ts'

export class ProjectController {
  list(ctx: Context) {
    ctx.body = { projects: projectIndexService.listProjects() }
  }

  get(ctx: Context) {
    const project = projectIndexService.getProject(ctx.params.projectId)

    if (!project) {
      ctx.status = 404
      ctx.body = { error: 'Project not found' }
      return
    }

    ctx.body = project
  }

  async import(ctx: Context) {
    const parsed = projectImportRequestSchema.safeParse(ctx.request.body)

    if (!parsed.success) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid project import request',
        details: parsed.error.flatten(),
      }
      return
    }

    ctx.body = await projectIndexService.importProject(parsed.data)
  }

  memories(ctx: Context) {
    ctx.body = {
      memories: memoryRepository.listProjectMemories(ctx.params.projectId),
    }
  }

  dashboard(ctx: Context) {
    ctx.body = projectIndexService.getDashboard(ctx.params.projectId)
  }

  async fileContent(ctx: Context) {
    const filePath = typeof ctx.query.path === 'string' ? ctx.query.path : ''

    if (!filePath) {
      ctx.status = 400
      ctx.body = { error: 'Missing file path' }
      return
    }

    ctx.body = await projectIndexService.getFileContent(ctx.params.projectId, filePath)
  }

  async ask(ctx: Context) {
    const parsed = projectQuestionRequestSchema.safeParse(ctx.request.body)

    if (!parsed.success) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid project question request',
        details: parsed.error.flatten(),
      }
      return
    }

    ctx.body = await projectAssistantService.answerQuestion(
      ctx.params.projectId,
      parsed.data.question,
    )
  }

  templates(ctx: Context) {
    ctx.body = {
      templates: projectAssistantService.listTemplates(ctx.params.projectId),
    }
  }
}

export const projectController = new ProjectController()
