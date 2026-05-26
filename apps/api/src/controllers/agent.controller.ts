import type { Context } from 'koa'
import { agentRunRequestSchema } from '@agent-lab/shared'
import { patchService } from '../services/patch.service.ts'
import { frontendCodeAgentService } from '../services/frontend-code-agent.service.ts'

export class AgentController {
  async listRuns(ctx: Context) {
    const limit = Number(ctx.query.limit ?? 10)
    ctx.body = {
      runs: frontendCodeAgentService.listRuns(Number.isFinite(limit) ? limit : 10),
    }
  }

  queue(ctx: Context) {
    ctx.body = frontendCodeAgentService.queueStatus()
  }

  async getRun(ctx: Context) {
    const run = frontendCodeAgentService.getRun(ctx.params.runId)

    if (!run) {
      ctx.status = 404
      ctx.body = { error: 'Agent run not found' }
      return
    }

    ctx.body = run
  }

  report(ctx: Context) {
    const report = frontendCodeAgentService.getReport(ctx.params.runId)

    if (!report) {
      ctx.status = 404
      ctx.body = { error: 'Agent run not found' }
      return
    }

    ctx.body = report
  }

  async run(ctx: Context) {
    const parsed = agentRunRequestSchema.safeParse(ctx.request.body)

    if (!parsed.success) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid agent run request',
        details: parsed.error.flatten(),
      }
      return
    }

    ctx.body = await frontendCodeAgentService.run(parsed.data)
  }

  async startRun(ctx: Context) {
    const parsed = agentRunRequestSchema.safeParse(ctx.request.body)

    if (!parsed.success) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid agent run request',
        details: parsed.error.flatten(),
      }
      return
    }

    ctx.status = 202
    ctx.body = frontendCodeAgentService.startRun(parsed.data)
  }

  events(ctx: Context) {
    ctx.body = {
      events: frontendCodeAgentService.listEvents(ctx.params.runId),
    }
  }

  retry(ctx: Context) {
    const run = frontendCodeAgentService.retryRun(ctx.params.runId)

    if (!run) {
      ctx.status = 404
      ctx.body = { error: 'Agent run not found' }
      return
    }

    ctx.status = 202
    ctx.body = run
  }

  cancel(ctx: Context) {
    const run = frontendCodeAgentService.cancelRun(ctx.params.runId)

    if (!run) {
      ctx.status = 404
      ctx.body = { error: 'Running agent run not found' }
      return
    }

    ctx.body = run
  }

  async preparePatch(ctx: Context) {
    ctx.body = await patchService.prepare(ctx.params.runId)
  }

  async applyPatch(ctx: Context) {
    ctx.body = await patchService.apply(ctx.params.runId)
  }

  async rollbackPatch(ctx: Context) {
    ctx.body = await patchService.rollback(ctx.params.runId)
  }
}

export const agentController = new AgentController()
