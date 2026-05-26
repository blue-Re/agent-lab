import Router from '@koa/router'
import type { Context } from 'koa'
import { agentController } from '../controllers/agent.controller.ts'

export const agentRoutes = new Router({ prefix: '/api/agent' })

agentRoutes.get('/runs', (ctx: Context) => agentController.listRuns(ctx))
agentRoutes.get('/queue', (ctx: Context) => agentController.queue(ctx))
agentRoutes.get('/runs/:runId', (ctx: Context) => agentController.getRun(ctx))
agentRoutes.get('/runs/:runId/report', (ctx: Context) => agentController.report(ctx))
agentRoutes.get('/runs/:runId/events', (ctx: Context) => agentController.events(ctx))
agentRoutes.post('/runs/:runId/retry', (ctx: Context) => agentController.retry(ctx))
agentRoutes.post('/runs/:runId/cancel', (ctx: Context) => agentController.cancel(ctx))
agentRoutes.post('/runs/:runId/patch/prepare', (ctx: Context) =>
  agentController.preparePatch(ctx),
)
agentRoutes.post('/runs/:runId/patch/apply', (ctx: Context) =>
  agentController.applyPatch(ctx),
)
agentRoutes.post('/runs/:runId/patch/rollback', (ctx: Context) =>
  agentController.rollbackPatch(ctx),
)
agentRoutes.post('/runs', (ctx: Context) => agentController.startRun(ctx))
agentRoutes.post('/run', (ctx: Context) => agentController.run(ctx))
