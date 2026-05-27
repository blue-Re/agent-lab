import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from '../AppSidebar'
import { TopBar } from '../TopBar'
import { ToastTray } from '../ToastTray'
import { useProjectStore, useRunStore, useUiStore } from '../../stores'
import { fetchCapabilities } from '../../lib/agent'
import './index.css'

export function AppShell() {
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const refreshHistory = useRunStore((state) => state.refreshHistory)
  const refreshQueue = useRunStore((state) => state.refreshQueue)
  const setNotice = useUiStore((state) => state.setNotice)

  useEffect(() => {
    void Promise.all([loadProjects(), refreshHistory(), refreshQueue(), fetchCapabilities()]).then(
      ([projects]) => {
        if (projects.length) {
          setNotice('项目已加载，可以开始运行 Agent。')
        }
      },
    )
  }, [loadProjects, refreshHistory, refreshQueue, setNotice])

  return (
    <div className="app-shell-v2">
      <TopBar />
      <div className="app-shell-body">
        <AppSidebar />
        <main className="app-shell-main">
          <Outlet />
        </main>
      </div>
      <ToastTray />
    </div>
  )
}
