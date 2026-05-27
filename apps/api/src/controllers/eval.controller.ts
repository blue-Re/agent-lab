import type { Context } from 'koa'
import { evalService } from '../services/eval.service.ts'

export class EvalController {
  cases(ctx: Context) {
    ctx.body = { cases: evalService.listCases() }
  }

  runs(ctx: Context) {
    ctx.body = { runs: evalService.listRuns() }
  }

  detail(ctx: Context) {
    const summary = evalService.getRun(ctx.params.id)
    if (!summary) {
      ctx.status = 404
      ctx.body = { error: 'Eval run not found' }
      return
    }
    ctx.body = summary
  }

  async run(ctx: Context) {
    const body = (ctx.request.body ?? {}) as { projectId?: string; caseIds?: string[] }
    ctx.body = await evalService.run({
      projectId: body.projectId,
      caseIds: body.caseIds,
    })
  }
}

export const evalController = new EvalController()
