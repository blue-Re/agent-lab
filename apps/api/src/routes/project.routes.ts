import Router from '@koa/router'
import type { Context } from 'koa'
import { projectController } from '../controllers/project.controller.ts'

export const projectRoutes = new Router({ prefix: '/api/projects' })

projectRoutes.get('/', (ctx: Context) => projectController.list(ctx))
projectRoutes.get('/:projectId', (ctx: Context) => projectController.get(ctx))
projectRoutes.get('/:projectId/dashboard', (ctx: Context) =>
  projectController.dashboard(ctx),
)
projectRoutes.get('/:projectId/files/content', (ctx: Context) =>
  projectController.fileContent(ctx),
)
projectRoutes.get('/:projectId/templates', (ctx: Context) =>
  projectController.templates(ctx),
)
projectRoutes.get('/:projectId/memories', (ctx: Context) =>
  projectController.memories(ctx),
)
projectRoutes.post('/:projectId/ask', (ctx: Context) => projectController.ask(ctx))
projectRoutes.post('/import', (ctx: Context) => projectController.import(ctx))
