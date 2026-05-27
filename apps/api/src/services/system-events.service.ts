import type { EvalRunSummary, QueueStatus, SystemStreamEvent } from '@agent-lab/shared'
import { eventBusService } from './event-bus.service.ts'

const SYSTEM_CHANNEL = 'system'

/**
 * 全局系统事件广播服务。
 *
 * 用于把"需要让所有前端页面感知"的写入事件以 SSE 形式推送出去，替代前端的伪轮询。
 * 调用方应位于 service 层，禁止从 repository 层直接调用，以保持分层约束。
 */
export class SystemEventsService {
  emitQueueUpdated(queue: QueueStatus) {
    this.publish({ type: 'queue:updated', queue })
  }

  emitRunsUpdated() {
    this.publish({ type: 'runs:updated' })
  }

  emitCostUpdated() {
    this.publish({ type: 'cost:updated' })
  }

  emitEvalRunsUpdated() {
    this.publish({ type: 'eval:runs:updated' })
  }

  emitEvalActiveUpdated(active: EvalRunSummary | null) {
    this.publish({ type: 'eval:active:updated', active })
  }

  subscribe(listener: (event: SystemStreamEvent) => void) {
    return eventBusService.subscribeChannel<SystemStreamEvent>(SYSTEM_CHANNEL, listener)
  }

  private publish(event: SystemStreamEvent) {
    eventBusService.publishToChannel(SYSTEM_CHANNEL, event)
  }
}

export const systemEventsService = new SystemEventsService()
