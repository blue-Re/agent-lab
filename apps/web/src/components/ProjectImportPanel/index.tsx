import { useState } from 'react'
import { useCurrentProject, useProjectStore, useUiStore } from '../../stores'
import { fetchDirectories, type DirectoryEntry } from '../../lib/agent'
import './index.css'

const DEFAULT_ROOT = '/Users/guozhen/Desktop/demo/agent-lab'

export function ProjectImportPanel() {
  const projects = useProjectStore((state) => state.projects)
  const currentProjectId = useProjectStore((state) => state.currentProjectId)
  const dashboard = useProjectStore((state) => state.dashboard)
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject)
  const importByPath = useProjectStore((state) => state.importByPath)
  const isImporting = useProjectStore((state) => state.isImporting)
  const project = useCurrentProject()
  const pushToast = useUiStore((state) => state.pushToast)

  const [rootPath, setRootPath] = useState(DEFAULT_ROOT)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([])
  const [directoryParent, setDirectoryParent] = useState<DirectoryEntry | null>(null)
  const [directoryPath, setDirectoryPath] = useState('')

  const openPicker = async (target?: string) => {
    const result = await fetchDirectories(target || rootPath)
    setDirectoryPath(result.currentPath)
    setDirectoryParent(result.parent)
    setDirectoryEntries(result.directories)
    setIsPickerOpen(true)
  }

  const chooseDirectory = async (path: string) => {
    setRootPath(path)
    const result = await fetchDirectories(path)
    setDirectoryPath(result.currentPath)
    setDirectoryParent(result.parent)
    setDirectoryEntries(result.directories)
  }

  const importCurrent = async () => {
    try {
      const imported = await importByPath(rootPath)
      pushToast(`已导入 ${imported.name}（${imported.files.length} 文件）`, 'success')
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'import failed', 'error')
    }
  }

  return (
    <section className="project-import-panel">
      <header>
        <p className="eyebrow">Project</p>
        <h3>{project?.name ?? '未选择项目'}</h3>
        <small>导入本机任意前端项目，AgentLab 会读取并建立索引。</small>
      </header>

      <div className="import-row">
        <input
          value={rootPath}
          onChange={(event) => setRootPath(event.target.value)}
          placeholder="/Users/you/project"
        />
        <button type="button" onClick={importCurrent} disabled={isImporting}>
          {isImporting ? '导入中...' : '导入'}
        </button>
      </div>

      <div className="import-tools">
        <button type="button" className="text-button" onClick={() => openPicker()}>
          选择本机目录
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setRootPath(DEFAULT_ROOT)}
        >
          使用 AgentLab 自身
        </button>
      </div>

      {projects.length ? (
        <select
          value={currentProjectId ?? ''}
          onChange={(event) => setCurrentProject(event.target.value || null)}
          aria-label="切换项目"
        >
          {projects.map((item) => (
            <option key={item.id ?? item.name} value={item.id ?? ''}>
              {item.name}
            </option>
          ))}
        </select>
      ) : null}

      {project ? (
        <>
          <div className="project-summary">
            <span>{project.files.length} files</span>
            <span>{project.stack.join(' / ') || 'Unknown stack'}</span>
            {dashboard ? <span>风险 {dashboard.risks.length}</span> : null}
          </div>

          <div className="stack-chips">
            {(project.stack ?? []).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : null}

      {isPickerOpen ? (
        <div className="picker-backdrop" role="dialog" aria-modal="true">
          <section className="picker-modal">
            <header>
              <div>
                <p className="eyebrow">Picker</p>
                <h3>选择项目目录</h3>
              </div>
              <button type="button" onClick={() => setIsPickerOpen(false)} aria-label="关闭">
                ×
              </button>
            </header>
            <code className="picker-path">{directoryPath}</code>
            <div className="picker-actions">
              {directoryParent ? (
                <button type="button" onClick={() => chooseDirectory(directoryParent.path)}>
                  返回上级
                </button>
              ) : null}
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setRootPath(directoryPath)
                  setIsPickerOpen(false)
                }}
              >
                使用此目录
              </button>
            </div>
            <div className="directory-grid">
              {directoryEntries.map((entry) => (
                <button
                  type="button"
                  key={entry.path}
                  onClick={() => chooseDirectory(entry.path)}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
