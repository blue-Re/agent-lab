import { create } from 'zustand'
import {
  fetchProjectDashboard,
  fetchProjectFileContent,
  fetchProjectMemories,
  fetchProjects,
  fetchTaskTemplates,
  importProject,
  type ProjectDashboard,
  type ProjectFileContent,
  type ProjectMemory,
  type ProjectSnapshot,
  type TaskTemplate,
} from '../lib/agent'

type State = {
  projects: ProjectSnapshot[]
  currentProjectId: string | null
  dashboard: ProjectDashboard | null
  memories: ProjectMemory[]
  templates: TaskTemplate[]
  fileContent: ProjectFileContent | null
  selectedFilePath: string | null
  isImporting: boolean
  isLoading: boolean
}

type Actions = {
  loadProjects: () => Promise<ProjectSnapshot[]>
  setCurrentProject: (projectId: string | null) => void
  refreshActiveProject: () => Promise<void>
  selectFile: (path: string | null) => Promise<void>
  importByPath: (rootPath: string) => Promise<ProjectSnapshot>
  refreshMemories: () => Promise<void>
}

const INITIAL: State = {
  projects: [],
  currentProjectId: null,
  dashboard: null,
  memories: [],
  templates: [],
  fileContent: null,
  selectedFilePath: null,
  isImporting: false,
  isLoading: false,
}

export const useProjectStore = create<State & Actions>((set, get) => ({
  ...INITIAL,

  loadProjects: async () => {
    set({ isLoading: true })
    try {
      const projects = await fetchProjects()
      set((state) => ({
        projects,
        currentProjectId:
          state.currentProjectId &&
          projects.find((project) => project.id === state.currentProjectId)
            ? state.currentProjectId
            : projects[0]?.id ?? null,
      }))
      return projects
    } finally {
      set({ isLoading: false })
    }
  },

  setCurrentProject: (projectId) => {
    set({
      currentProjectId: projectId,
      dashboard: null,
      memories: [],
      templates: [],
      selectedFilePath: null,
      fileContent: null,
    })
    void get().refreshActiveProject()
  },

  refreshActiveProject: async () => {
    const id = get().currentProjectId
    if (!id) return

    const [dashboard, templates, memories] = await Promise.all([
      fetchProjectDashboard(id),
      fetchTaskTemplates(id),
      fetchProjectMemories(id),
    ])

    set({ dashboard, templates, memories })
  },

  selectFile: async (path) => {
    const id = get().currentProjectId
    set({ selectedFilePath: path, fileContent: null })
    if (!id || !path) return
    const content = await fetchProjectFileContent(id, path)
    if (get().selectedFilePath === path) {
      set({ fileContent: content })
    }
  },

  importByPath: async (rootPath) => {
    set({ isImporting: true })
    try {
      const project = await importProject({ rootPath })
      const projects = await fetchProjects()
      set({
        projects,
        currentProjectId: project.id ?? null,
      })
      if (project.id) {
        await get().refreshActiveProject()
      }
      return project
    } finally {
      set({ isImporting: false })
    }
  },

  refreshMemories: async () => {
    const id = get().currentProjectId
    if (!id) return
    const memories = await fetchProjectMemories(id)
    set({ memories })
  },
}))

export function useCurrentProject(): ProjectSnapshot | null {
  return useProjectStore((state) => {
    const id = state.currentProjectId
    return id ? state.projects.find((project) => project.id === id) ?? null : null
  })
}
