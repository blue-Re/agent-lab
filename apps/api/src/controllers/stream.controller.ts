import type { Context } from 'koa'
import type { PassThrough } from 'node:stream'
import { PassThrough as NodeStream } from 'node:stream'
import { agentEventRepository } from '../repositories/agent-event.repository.ts'
import { agentRunRepository } from '../repositories/agent-run.repository.ts'
import { eventBusService } from '../services/event-bus.service.ts'

function write(stream: PassThrough, event: string, data: unknown) {
  stream.write(`event: ${event}\n`)
  stream.write(`data: ${JSON.stringify(data)}\n\n`)
}

export class StreamController {
  async streamRun(ctx: Context) {
    const runId = ctx.params.runId as string
    const run = agentRunRepository.findById(runId)

    if (!run) {
      ctx.status = 404
      ctx.body = { error: 'Agent run not found' }
      return
    }

    ctx.set('Content-Type', 'text/event-stream')
    ctx.set('Cache-Control', 'no-cache, no-transform')
    ctx.set('Connection', 'keep-alive')
    ctx.set('X-Accel-Buffering', 'no')
    ctx.status = 200

    const stream = new NodeStream()
    ctx.body = stream

    write(stream, 'snapshot', {
      run,
      events: agentEventRepository.listByRun(runId),
    })

    const unsubscribe = eventBusService.subscribe(runId, (event) => {
      write(stream, event.type, event)

      if (event.type === 'state' && /运行成本汇总|任务取消/.test(event.title)) {
        finalize()
      }
      if (event.type === 'final') {
        const latest = agentRunRepository.findById(runId)
        if (latest) write(stream, 'run_completed', latest)
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

export const streamController = new StreamController()
