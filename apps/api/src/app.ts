import cors from '@koa/cors'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import { capabilityService } from './services/capability.service.ts'
import { fileSystemService } from './services/file-system.service.ts'
import { deepSeekClient } from './llm/deepseek.client.ts'
import { agentRoutes, evalRoutes, metricsRoutes, systemRoutes } from './routes/agent.routes.ts'
import { projectRoutes } from './routes/project.routes.ts'

export function createApp() {
  const app = new Koa()

  app.use(async (ctx, next) => {
    try {
      await next()
    } catch (error) {
      console.error(error)
      ctx.status = 500
      ctx.body = {
        error: error instanceof Error ? error.message : 'Internal server error',
      }
    }
  })

  app.use(cors())
  app.use(bodyParser({ jsonLimit: '2mb' }))

  app.use(async (ctx, next) => {
    if (ctx.path === '/api/capabilities') {
      ctx.body = { capabilities: capabilityService.list() }
      return
    }

    if (ctx.path === '/api/fs/directories') {
      const targetPath = typeof ctx.query.path === 'string' ? ctx.query.path : undefined
      ctx.body = await fileSystemService.listDirectories(targetPath)
      return
    }

    if (ctx.path !== '/api/health') {
      await next()
      return
    }

    ctx.body = {
      ok: true,
      framework: 'koa2',
      deepseekConnected: deepSeekClient.hasApiKey(),
      storage: 'sqlite',
    }
  })

  app.use(agentRoutes.routes())
  app.use(agentRoutes.allowedMethods())
  app.use(projectRoutes.routes())
  app.use(projectRoutes.allowedMethods())
  app.use(metricsRoutes.routes())
  app.use(metricsRoutes.allowedMethods())
  app.use(evalRoutes.routes())
  app.use(evalRoutes.allowedMethods())
  app.use(systemRoutes.routes())
  app.use(systemRoutes.allowedMethods())

  return app
}
