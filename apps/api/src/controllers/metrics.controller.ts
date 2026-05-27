import type { Context } from 'koa'
import { costRepository } from '../repositories/cost.repository.ts'

export class MetricsController {
  cost(ctx: Context) {
    ctx.body = costRepository.summary()
  }

  costByRun(ctx: Context) {
    ctx.body = { entries: costRepository.listByRun(ctx.params.runId) }
  }
}

export const metricsController = new MetricsController()
