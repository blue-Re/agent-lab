import { create } from 'zustand'
import {
  fetchActiveEval,
  fetchEvalCases,
  fetchEvalRun,
  fetchEvalRuns,
  startEvalRun,
  subscribeEvalStream,
  type EvalCase,
  type EvalRunSummary,
} from '../lib/agent'

export type EvalLogEntry = {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

type State = {
  cases: EvalCase[]
  history: EvalRunSummary[]
  activeId: string | null
  active: EvalRunSummary | null
  logs: EvalLogEntry[]
  isStreaming: boolean
  isStarting: boolean
  closeStream: (() => void) | null
}

type Actions = {
  loadCases: () => Promise<void>
  loadHistory: () => Promise<void>
  hydrateActive: () => Promise<void>
  setActive: (id: string | null) => Promise<void>
  start: (payload: { projectId?: string; caseIds?: string[] }) => Promise<EvalRunSummary | null>
  subscribe: (id: string) => void
  unsubscribe: () => void
}

const INITIAL: State = {
  cases: [],
  history: [],
  activeId: null,
  active: null,
  logs: [],
  isStreaming: false,
  isStarting: false,
  closeStream: null,
}

const MAX_LOGS = 200

function appendLog(prev: EvalLogEntry[], entry: EvalLogEntry): EvalLogEntry[] {
  const next = [...prev, entry]
  return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
}

function summaryDone(summary: EvalRunSummary | null) {
  return summary?.status === 'completed' || summary?.status === 'failed' || summary?.status === 'cancelled'
}

export const useEvalStore = create<State & Actions>((set, get) => ({
  ...INITIAL,

  loadCases: async () => {
    const cases = await fetchEvalCases()
    set({ cases })
  },

  loadHistory: async () => {
    const history = await fetchEvalRuns()
    set({ history })
  },

  hydrateActive: async () => {
    const running = await fetchActiveEval()
    if (running) {
      set({
        activeId: running.id,
        active: running,
        isStreaming: running.status === 'running',
        logs: [],
      })
      if (running.status === 'running') {
        get().subscribe(running.id)
      }
    }
  },

  setActive: async (id) => {
    if (get().activeId === id) return

    get().unsubscribe()

    if (!id) {
      set({ activeId: null, active: null, logs: [], isStreaming: false })
      return
    }

    set({ activeId: id, active: null, logs: [], isStreaming: false })
    const summary = await fetchEvalRun(id)
    if (summary) {
      set({
        active: summary,
        isStreaming: summary.status === 'running',
      })
      if (summary.status === 'running') {
        get().subscribe(id)
      }
    }
  },

  start: async (payload) => {
    if (get().isStarting || get().isStreaming) return null
    set({ isStarting: true })
    try {
      const summary = await startEvalRun(payload)
      get().unsubscribe()
      set({
        activeId: summary.id,
        active: summary,
        logs: [],
        isStreaming: summary.status === 'running',
      })
      if (summary.status === 'running') {
        get().subscribe(summary.id)
      }
      void get().loadHistory()
      return summary
    } finally {
      set({ isStarting: false })
    }
  },

  subscribe: (id) => {
    get().unsubscribe()

    const handle = subscribeEvalStream(id, (event) => {
      if (get().activeId !== id) return

      switch (event.type) {
        case 'snapshot':
          set({ active: event.summary, isStreaming: event.summary.status === 'running' })
          break
        case 'case_started': {
          const current = get().active
          if (!current) return
          const cases = current.cases.map((item, index) =>
            index === event.index ? { ...item, status: 'running' as const } : item,
          )
          set({
            active: {
              ...current,
              currentIndex: event.index,
              cases,
              message: `运行第 ${event.index + 1}/${event.total} 个用例：${cases[event.index]?.title}`,
            },
          })
          break
        }
        case 'case_finished':
        case 'case_failed': {
          const current = get().active
          if (!current) return
          const cases = current.cases.map((item, index) =>
            index === event.index ? event.result : item,
          )
          const completed = cases.filter((item) => item.status === 'completed')
          const passCount = cases.filter((item) => item.verdict === 'pass').length
          const averageScore = completed.length
            ? Math.round(completed.reduce((acc, item) => acc + item.score, 0) / completed.length)
            : 0
          const totalCostUsd = cases.reduce((acc, item) => acc + item.costUsd, 0)
          const totalLatencyMs = cases.reduce((acc, item) => acc + item.latencyMs, 0)
          set({
            active: {
              ...current,
              cases,
              averageScore,
              passRate: cases.length ? passCount / cases.length : 0,
              totalCostUsd,
              totalLatencyMs,
              currentIndex: event.index + 1,
            },
          })
          break
        }
        case 'log':
          set((state) => ({
            logs: appendLog(state.logs, {
              level: event.level,
              message: event.message,
              timestamp: event.timestamp,
            }),
          }))
          break
        case 'completed':
        case 'failed':
          set({
            active: event.summary,
            isStreaming: false,
          })
          get().unsubscribe()
          void get().loadHistory()
          break
      }
    })

    set({ closeStream: handle.close, isStreaming: true })
  },

  unsubscribe: () => {
    const close = get().closeStream
    if (close) {
      close()
      set({ closeStream: null })
    }
    if (summaryDone(get().active)) {
      set({ isStreaming: false })
    }
  },
}))
