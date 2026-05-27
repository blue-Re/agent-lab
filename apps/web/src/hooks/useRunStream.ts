import { useEffect, useRef, useState } from 'react'
import {
  fetchAgentEvents,
  fetchAgentRun,
  subscribeRunStream,
  type AgentEvent,
  type AgentRunHistoryItem,
} from '../lib/agent'

type State = {
  run: AgentRunHistoryItem | null
  events: AgentEvent[]
  isStreaming: boolean
  isCompleted: boolean
}

const INITIAL: State = {
  run: null,
  events: [],
  isStreaming: false,
  isCompleted: false,
}

type StreamMessage = {
  type: string
  data: unknown
}

function asAgentEvent(message: StreamMessage): AgentEvent | null {
  if (!message.data || typeof message.data !== 'object') return null
  const data = message.data as Partial<AgentEvent>
  if (!data.type || !data.title || !data.createdAt || !data.runId) return null
  return data as AgentEvent
}

export function useRunStream(runId: string | null) {
  const [state, setState] = useState<State>(INITIAL)
  const closeRef = useRef<() => void>(undefined)

  useEffect(() => {
    closeRef.current?.()
    closeRef.current = undefined

    if (!runId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(INITIAL)
      return
    }

    setState({ run: null, events: [], isStreaming: true, isCompleted: false })

    let cancelled = false

    Promise.all([fetchAgentRun(runId), fetchAgentEvents(runId)]).then(([run, events]) => {
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        run,
        events,
      }))
    })

    const handle = subscribeRunStream(runId, (message) => {
      if (message.type === 'snapshot') {
        const payload = message.data as { run?: AgentRunHistoryItem; events?: AgentEvent[] }
        setState((prev) => ({
          ...prev,
          run: payload.run ?? prev.run,
          events: payload.events ?? prev.events,
          isStreaming: true,
        }))
        return
      }

      if (message.type === 'run_completed') {
        const payload = message.data as AgentRunHistoryItem
        setState((prev) => ({
          ...prev,
          run: payload,
          isStreaming: false,
          isCompleted: true,
        }))
        return
      }

      const event = asAgentEvent(message)
      if (!event) return

      setState((prev) => {
        const exists = prev.events.some((existing) => existing.id && existing.id === event.id)
        const events = exists ? prev.events : [...prev.events, event]
        return {
          ...prev,
          events,
        }
      })

      if (event.type === 'state' && /运行成本汇总|任务取消/.test(event.title)) {
        void fetchAgentRun(runId).then((run) => {
          setState((prev) => ({
            ...prev,
            run: run ?? prev.run,
            isStreaming: false,
            isCompleted: true,
          }))
        })
      }
    })

    closeRef.current = handle.close

    return () => {
      cancelled = true
      handle.close()
    }
  }, [runId])

  return state
}
