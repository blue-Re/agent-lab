import { NavLink } from 'react-router-dom'
import { useRunStore, useUiStore } from '../../stores'
import './index.css'

const NAV_ITEMS = [
  { to: '/workspace/live', label: '实时执行' },
  { to: '/workspace/patch', label: '补丁审批' },
  { to: '/workspace/files', label: '项目文件' },
  { to: '/workspace/memory', label: '项目记忆' },
  { to: '/workspace/history', label: '历史运行' },
  { to: '/dashboard/cost', label: '成本仪表盘' },
  { to: '/dashboard/eval', label: '回归评测' },
]

export function TopBar() {
  const notice = useUiStore((state) => state.notice)
  const queueStatus = useRunStore((state) => state.queueStatus)
  const isStreaming = useRunStore((state) => state.isStreaming)

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-brand">
        <span className="brand-dot" aria-hidden />
        <div>
          <p className="brand-label">AgentLab</p>
          <small>Tool-Loop · Streaming · Reviewable</small>
        </div>
      </div>

      <nav className="top-bar-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? 'nav-link active' : 'nav-link'
            }
            end={false}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="top-bar-meta">
        <span className={`stream-pill ${isStreaming ? 'live' : ''}`}>
          {isStreaming ? '● streaming' : '○ idle'}
        </span>
        <span className="queue-pill">
          queue {queueStatus.queued} · running {queueStatus.running}
        </span>
        <span className="notice-pill" title={notice}>
          {notice}
        </span>
      </div>
    </header>
  )
}
