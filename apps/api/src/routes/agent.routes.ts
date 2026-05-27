import Router from '@koa/router'
import type { Context } from 'koa'
import { agentController } from '../controllers/agent.controller.ts'
import { evalController } from '../controllers/eval.controller.ts'
import { metricsController } from '../controllers/metrics.controller.ts'
import { streamController } from '../controllers/stream.controller.ts'
import { systemStreamController } from '../controllers/system-stream.controller.ts'

export const agentRoutes = new Router({ prefix: '/api/agent' })

agentRoutes.get('/runs', (ctx: Context) => agentController.listRuns(ctx))
agentRoutes.get('/queue', (ctx: Context) => agentController.queue(ctx))
agentRoutes.get('/runs/:runId', (ctx: Context) => agentController.getRun(ctx))
agentRoutes.get('/runs/:runId/report', (ctx: Context) => agentController.report(ctx))
agentRoutes.get('/runs/:runId/events', (ctx: Context) => agentController.events(ctx))
agentRoutes.get('/runs/:runId/stream', (ctx: Context) => streamController.streamRun(ctx))
agentRoutes.get('/runs/:runId/patch/plan', (ctx: Context) => agentController.patchPlan(ctx))
agentRoutes.get('/runs/:runId/cost', (ctx: Context) => metricsController.costByRun(ctx))
agentRoutes.post('/runs/:runId/retry', (ctx: Context) => agentController.retry(ctx))
agentRoutes.post('/runs/:runId/cancel', (ctx: Context) => agentController.cancel(ctx))
agentRoutes.post('/runs/:runId/patch/prepare', (ctx: Context) => agentController.preparePatch(ctx))
agentRoutes.post('/runs/:runId/patch/apply', (ctx: Context) => agentController.applyPatch(ctx))
agentRoutes.post('/runs/:runId/patch/rollback', (ctx: Context) => agentController.rollbackPatch(ctx))
agentRoutes.post('/runs', (ctx: Context) => agentController.startRun(ctx))
agentRoutes.post('/run', (ctx: Context) => agentController.run(ctx))

export const metricsRoutes = new Router({ prefix: '/api/metrics' })
metricsRoutes.get('/cost', (ctx: Context) => metricsController.cost(ctx))

export const evalRoutes = new Router({ prefix: '/api/eval' })
evalRoutes.get('/cases', (ctx: Context) => evalController.cases(ctx))
evalRoutes.get('/runs', (ctx: Context) => evalController.runs(ctx))
evalRoutes.get('/active', (ctx: Context) => evalController.active(ctx))
evalRoutes.get('/runs/:id', (ctx: Context) => evalController.detail(ctx))
evalRoutes.get('/runs/:id/stream', (ctx: Context) => evalController.streamEval(ctx))
evalRoutes.post('/runs', (ctx: Context) => evalController.start(ctx))

export const systemRoutes = new Router({ prefix: '/api/system' })
systemRoutes.get('/stream', (ctx: Context) => systemStreamController.stream(ctx))
