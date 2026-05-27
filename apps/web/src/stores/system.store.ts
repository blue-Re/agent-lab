import { create } from 'zustand'
import {
  subscribeSystemStream,
  type EvalRunSummary,
  type QueueStatus,
  type SystemStreamHandle,
} from '../lib/agent'
import { useEvalStore } from './eval.store'
import { useRunStore } from './run.store'

type State = {
  costVersion: number
  evalRunsVersion: number
  isConnected: boolean
  handle: SystemStreamHandle | null
}

type Actions = {
  connect: () => void
  disconnect: () => void
}

const INITIAL: State = {
  costVersion: 0,
  evalRunsVersion: 0,
  isConnected: false,
  handle: null,
}

/**
 * 全局系统事件 Store。
 *
 * 负责维护单条 `/api/system/stream` SSE 连接，把后端推送的领域信号分发到对应 store：
 * - queue:updated     → run store 直接覆盖 queueStatus
 * - runs:updated      → run store 重新拉历史列表
 * - eval:active/runs  → eval store 同步当前/历史
 * - cost:updated      → 自增 `costVersion`，由 CostDashboard 监听依赖刷新
 */
export const useSystemStore = create<State & Actions>((set, get) => ({
  ...INITIAL,

  connect: () => {
    if (get().handle) return

    const handle = subscribeSystemStream((message) => {
      switch (message.type) {
        case 'snapshot':
          applyQueue(message.queue)
          applyEvalActive(message.active)
          break
        case 'queue:updated':
          applyQueue(message.queue)
          break
        case 'runs:updated':
          void useRunStore.getState().refreshHistory()
          void useRunStore.getState().refreshQueue()
          break
        case 'cost:updated':
          set((state) => ({ costVersion: state.costVersion + 1 }))
          break
        case 'eval:runs:updated':
          set((state) => ({ evalRunsVersion: state.evalRunsVersion + 1 }))
          void useEvalStore.getState().loadHistory()
          break
        case 'eval:active:updated':
          applyEvalActive(message.active)
          break
      }
    })

    set({ handle, isConnected: true })
  },

  disconnect: () => {
    const handle = get().handle
    if (handle) handle.close()
    set({ handle: null, isConnected: false })
  },
}))

function applyQueue(queue: QueueStatus) {
  useRunStore.setState({ queueStatus: queue })
}

function applyEvalActive(active: EvalRunSummary | null) {
  const store = useEvalStore.getState()
  if (active) {
    if (store.activeId !== active.id) {
      store.unsubscribe()
      useEvalStore.setState({
        activeId: active.id,
        active,
        isStreaming: active.status === 'running',
      })
      if (active.status === 'running') {
        store.subscribe(active.id)
      }
    } else {
      useEvalStore.setState({
        active,
        isStreaming: active.status === 'running',
      })
    }
    return
  }

  if (store.active?.status === 'running') {
    useEvalStore.setState({ isStreaming: false })
  }
}
