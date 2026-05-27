import { EventEmitter } from 'node:events'
import type { AgentEvent } from '@agent-lab/shared'

type AgentListener = (event: AgentEvent) => void
type ChannelListener<T = unknown> = (payload: T) => void

class EventBusService {
  private emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(0)
  }

  /** Agent run 专用，保留原 API。 */
  publish(event: AgentEvent) {
    this.emitter.emit(`run:${event.runId}`, event)
    this.emitter.emit('run:*', event)
  }

  subscribe(runId: string, listener: AgentListener) {
    const channel = `run:${runId}`
    this.emitter.on(channel, listener)
    return () => {
      this.emitter.off(channel, listener)
    }
  }

  /** 通用 channel 推送，evalRun / 其他领域复用。 */
  publishToChannel<T>(channel: string, payload: T) {
    this.emitter.emit(channel, payload)
  }

  subscribeChannel<T>(channel: string, listener: ChannelListener<T>) {
    this.emitter.on(channel, listener as ChannelListener)
    return () => {
      this.emitter.off(channel, listener as ChannelListener)
    }
  }
}

export const eventBusService = new EventBusService()
