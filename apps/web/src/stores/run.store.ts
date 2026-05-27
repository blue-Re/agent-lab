import { create } from 'zustand'
import {
  cancelAgentRun,
  fetchAgentEvents,
  fetchAgentRun,
  fetchAgentRuns,
  fetchQueueStatus,
  fetchRunReport,
  retryAgentRun,
  startAgentTask,
  subscribeRunStream,
  type AgentEvent,
  type AgentRunHistoryItem,
  type AgentRunRequest,
  type QueueStatus,
  type RunReport,
} from '../lib/agent'

type State = {
  history: AgentRunHistoryItem[]
  activeRunId: string | null
  activeRun: AgentRunHistoryItem | null
  events: AgentEvent[]
  queueStatus: QueueStatus
  isStreaming: boolean
  isCompleted: boolean
  report: RunReport | null
  closeStream: (() => void) | null
}

type Actions = {
  refreshHistory: () => Promise<void>
  refreshQueue: () => Promise<void>
  startTask: (payload: AgentRunRequest) => Promise<AgentRunHistoryItem>
  cancelActiveRun: () => Promise<void>
  retryActiveRun: () => Promise<void>
  setActiveRunId: (runId: string | null) => void
  subscribe: (runId: string) => void
  loadReport: () => Promise<RunReport | null>
}

const INITIAL: State = {
  history: [],
  activeRunId: null,
  activeRun: null,
  events: [],
  queueStatus: { queued: 0, running: 0, activeRunId: null, queuedRunIds: [] },
  isStreaming: false,
  isCompleted: false,
  report: null,
  closeStream: null,
}

function isAgentEvent(payload: unknown): payload is AgentEvent {
  if (!payload || typeof payload !== 'object') return false
  const candidate = payload as Partial<AgentEvent>
  return Boolean(candidate.type && candidate.title && candidate.runId && candidate.createdAt)
}

export const useRunStore = create<State & Actions>((set, get) => ({
  ...INITIAL,

  refreshHistory: async () => {
    const history = await fetchAgentRuns()
    set({ history })
  },

  refreshQueue: async () => {
    const queueStatus = await fetchQueueStatus()
    set({ queueStatus })
  },

  startTask: async (payload) => {
    const startedRun = await startAgentTask(payload)
    set({
      activeRunId: startedRun.runId,
      activeRun: startedRun,
      events: [],
      report: null,
      isStreaming: true,
      isCompleted: false,
    })
    get().subscribe(startedRun.runId)
    void get().refreshQueue()
    return startedRun
  },

  cancelActiveRun: async () => {
    const runId = get().activeRunId
    if (!runId) return
    const cancelled = await cancelAgentRun(runId)
    if (cancelled) {
      set({ activeRun: cancelled, isStreaming: false, isCompleted: true })
      void get().refreshHistory()
      void get().refreshQueue()
    }
  },

  retryActiveRun: async () => {
    const runId = get().activeRunId
    if (!runId) return
    const retried = await retryAgentRun(runId)
    if (retried) {
      set({
        activeRunId: retried.runId,
        activeRun: retried,
        events: [],
        report: null,
        isStreaming: true,
        isCompleted: false,
      })
      get().subscribe(retried.runId)
    }
  },

  setActiveRunId: (runId) => {
    const currentRunId = get().activeRunId
    if (currentRunId === runId) return

    const closer = get().closeStream
    closer?.()
    set({
      activeRunId: runId,
      activeRun: null,
      events: [],
      report: null,
      isStreaming: false,
      isCompleted: false,
      closeStream: null,
    })
    if (runId) get().subscribe(runId)
  },

  subscribe: (runId) => {
    const closer = get().closeStream
    closer?.()

    void Promise.all([fetchAgentRun(runId), fetchAgentEvents(runId)]).then(([run, events]) => {
      if (get().activeRunId !== runId) return
      set({
        activeRun: run,
        events,
        isCompleted: run ? run.status !== 'running' : false,
        isStreaming: run ? run.status === 'running' : false,
      })
    })

    const handle = subscribeRunStream(runId, (message) => {
      if (get().activeRunId !== runId) return

      if (message.type === 'snapshot') {
        const payload = message.data as { run?: AgentRunHistoryItem; events?: AgentEvent[] }
        set({
          activeRun: payload.run ?? get().activeRun,
          events: payload.events ?? get().events,
          isStreaming: true,
        })
        return
      }

      if (message.type === 'run_completed') {
        const payload = message.data as AgentRunHistoryItem
        set({
          activeRun: payload,
          isStreaming: false,
          isCompleted: true,
        })
        void get().refreshHistory()
        return
      }

      if (!isAgentEvent(message.data)) return
      const event = message.data
      set((state) => {
        const exists = state.events.some((existing) => existing.id && existing.id === event.id)
        return exists ? state : { events: [...state.events, event] }
      })

      if (event.type === 'state' && /运行成本汇总|任务取消/.test(event.title)) {
        void fetchAgentRun(runId).then((run) => {
          if (get().activeRunId !== runId) return
          set({
            activeRun: run ?? get().activeRun,
            isStreaming: false,
            isCompleted: true,
          })
        })
      }
    })

    set({ closeStream: handle.close, isStreaming: true })
  },

  loadReport: async () => {
    const runId = get().activeRunId
    if (!runId) return null
    const report = await fetchRunReport(runId)
    set({ report })
    return report
  },
}))
