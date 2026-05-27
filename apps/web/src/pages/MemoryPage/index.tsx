import { useEffect } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { useCurrentProject, useProjectStore } from '../../stores'
import { fetchCapabilities, type CapabilityItem } from '../../lib/agent'
import { useState } from 'react'
import './index.css'

export function MemoryPage() {
  const project = useCurrentProject()
  const memories = useProjectStore((state) => state.memories)
  const refreshMemories = useProjectStore((state) => state.refreshMemories)
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([])

  useEffect(() => {
    void refreshMemories()
    void fetchCapabilities().then(setCapabilities)
  }, [refreshMemories, project?.id])

  return (
    <>
      <PageHeader
        eyebrow="Memory"
        title="项目长期记忆 & 能力清单"
        description="每次运行后沉淀的决策、教训、技术栈记忆，以及后端当前能力状态。"
        actions={
          <button type="button" onClick={() => refreshMemories()}>
            刷新记忆
          </button>
        }
      />

      <section className="memory-section">
        <header>
          <p className="eyebrow">Project Memory</p>
          <small>{memories.length} 条</small>
        </header>
        {memories.length ? (
          <div className="memory-grid">
            {memories.slice(0, 12).map((memory) => (
              <article key={memory.id} className={`memory-card kind-${memory.kind}`}>
                <header>
                  <strong>{memory.kind}</strong>
                  <span>{new Date(memory.createdAt).toLocaleString()}</span>
                </header>
                <p>{memory.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="memory-empty">项目运行后会自动沉淀记忆。</p>
        )}
      </section>

      <section className="memory-section">
        <header>
          <p className="eyebrow">Capabilities</p>
          <small>{capabilities.length} 项</small>
        </header>
        <div className="capability-grid">
          {capabilities.map((item) => (
            <article key={item.id} className={`capability-card status-${item.status}`}>
              <header>
                <span>{item.status}</span>
                <strong>{item.title}</strong>
              </header>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
