import type { Context } from 'koa'
import type { PassThrough } from 'node:stream'
import { PassThrough as NodeStream } from 'node:stream'
import { evalService } from '../services/eval.service.ts'
import { frontendCodeAgentService } from '../services/frontend-code-agent.service.ts'
import { systemEventsService } from '../services/system-events.service.ts'

function write(stream: PassThrough, event: string, data: unknown) {
  stream.write(`event: ${event}\n`)
  stream.write(`data: ${JSON.stringify(data)}\n\n`)
}

export class SystemStreamController {
  /**
   * 全局系统事件 SSE 通道。
   *
   * 前端在 AppShell 启动时建立唯一一条连接，按事件类型分发到对应 store，
   * 用于消除"被动一次性拉取"的伪轮询。
   */
  stream(ctx: Context) {
    ctx.set('Content-Type', 'text/event-stream')
    ctx.set('Cache-Control', 'no-cache, no-transform')
    ctx.set('Connection', 'keep-alive')
    ctx.set('X-Accel-Buffering', 'no')
    ctx.status = 200

    const stream = new NodeStream()
    ctx.body = stream

    write(stream, 'snapshot', {
      type: 'snapshot',
      queue: frontendCodeAgentService.queueStatus(),
      active: evalService.getActive(),
    })

    const unsubscribe = systemEventsService.subscribe((event) => {
      write(stream, event.type, event)
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

export const systemStreamController = new SystemStreamController()
