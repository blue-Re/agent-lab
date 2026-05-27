import { EventEmitter } from 'node:events'
import type { AgentEvent } from '@agent-lab/shared'

type Listener = (event: AgentEvent) => void

class EventBusService {
  private emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(0)
  }

  publish(event: AgentEvent) {
    this.emitter.emit(`run:${event.runId}`, event)
    this.emitter.emit('run:*', event)
  }

  subscribe(runId: string, listener: Listener) {
    const channel = `run:${runId}`
    this.emitter.on(channel, listener)
    return () => {
      this.emitter.off(channel, listener)
    }
  }
}

export const eventBusService = new EventBusService()
