import { ProjectImportPanel } from '../../components/ProjectImportPanel'
import { TaskInputPanel } from '../../components/TaskInputPanel'
import { ProjectQAPanel } from '../../components/ProjectQAPanel'
import { useCurrentProject } from '../../stores'
import './index.css'

export function AppSidebar() {
  const project = useCurrentProject()

  return (
    <aside className="app-sidebar" aria-label="Workspace controls">
      <TaskInputPanel />
      <ProjectImportPanel />
      {project ? <ProjectQAPanel /> : null}
    </aside>
  )
}
