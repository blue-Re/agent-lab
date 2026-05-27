import type { Context } from 'koa'
import type { PassThrough } from 'node:stream'
import { PassThrough as NodeStream } from 'node:stream'
import { evalService } from '../services/eval.service.ts'

function write(stream: PassThrough, event: string, data: unknown) {
  stream.write(`event: ${event}\n`)
  stream.write(`data: ${JSON.stringify(data)}\n\n`)
}

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

  active(ctx: Context) {
    const summary = evalService.getActive()
    ctx.body = { active: summary ?? null }
  }

  start(ctx: Context) {
    const body = (ctx.request.body ?? {}) as { projectId?: string; caseIds?: string[] }
    try {
      const summary = evalService.start({
        projectId: body.projectId,
        caseIds: body.caseIds,
      })
      ctx.status = 202
      ctx.body = summary
    } catch (error) {
      ctx.status = 400
      ctx.body = { error: error instanceof Error ? error.message : 'start eval failed' }
    }
  }

  streamEval(ctx: Context) {
    const id = ctx.params.id as string
    const summary = evalService.getRun(id)
    if (!summary) {
      ctx.status = 404
      ctx.body = { error: 'Eval run not found' }
      return
    }

    ctx.set('Content-Type', 'text/event-stream')
    ctx.set('Cache-Control', 'no-cache, no-transform')
    ctx.set('Connection', 'keep-alive')
    ctx.set('X-Accel-Buffering', 'no')
    ctx.status = 200

    const stream = new NodeStream()
    ctx.body = stream

    write(stream, 'snapshot', { type: 'snapshot', summary })

    if (summary.status !== 'running') {
      write(stream, 'completed', {
        type: summary.status === 'failed' ? 'failed' : 'completed',
        summary,
      })
    }

    const unsubscribe = evalService.subscribe(id, (event) => {
      write(stream, event.type, event)
      if (event.type === 'completed' || event.type === 'failed') {
        finalize()
      }
    })

    const heartbeat = setInterval(() => {
      try {
        stream.write(`:hb ${Date.now()}\n\n`)
      } catch {
        finalize()
      }
    }, 15_000)

    const finalize = () => {
      clearInterval(heartbeat)
      unsubscribe()
      try {
        stream.end()
      } catch {
        // ignore
      }
    }

    ctx.req.on('close', finalize)
    ctx.req.on('error', finalize)
  }
}

export const evalController = new EvalController()
