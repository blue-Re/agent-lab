import { create } from 'zustand'
import {
  applyPatch,
  fetchPatchPlan,
  preparePatch,
  rollbackPatch,
  type PatchActionResult,
  type PatchPlan,
} from '../lib/agent'

type State = {
  plan: PatchPlan | null
  action: PatchActionResult | null
  loading: boolean
  loadedRunId: string | null
}

type Actions = {
  loadPlan: (runId: string) => Promise<void>
  prepare: (runId: string) => Promise<PatchActionResult | null>
  apply: (runId: string, selectedHunkIds: string[]) => Promise<PatchActionResult | null>
  rollback: (runId: string) => Promise<PatchActionResult | null>
  reset: () => void
}

const INITIAL: State = {
  plan: null,
  action: null,
  loading: false,
  loadedRunId: null,
}

export const usePatchStore = create<State & Actions>((set, get) => ({
  ...INITIAL,

  reset: () => set({ ...INITIAL }),

  loadPlan: async (runId) => {
    if (get().loadedRunId === runId && get().plan) return
    set({ loading: true })
    try {
      const plan = await fetchPatchPlan(runId)
      set({ plan, loadedRunId: runId })
    } finally {
      set({ loading: false })
    }
  },

  prepare: async (runId) => {
    set({ loading: true })
    try {
      const action = await preparePatch(runId)
      const plan = await fetchPatchPlan(runId)
      set({ action, plan, loadedRunId: runId })
      return action
    } finally {
      set({ loading: false })
    }
  },

  apply: async (runId, selectedHunkIds) => {
    set({ loading: true })
    try {
      const action = await applyPatch(runId, { selectedHunkIds })
      set({ action })
      return action
    } finally {
      set({ loading: false })
    }
  },

  rollback: async (runId) => {
    set({ loading: true })
    try {
      const action = await rollbackPatch(runId)
      set({ action })
      return action
    } finally {
      set({ loading: false })
    }
  },
}))
