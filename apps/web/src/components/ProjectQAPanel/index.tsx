import { useState } from 'react'
import { useCurrentProject, useUiStore } from '../../stores'
import { askProject, type ProjectQuestionAnswer } from '../../lib/agent'
import './index.css'

export function ProjectQAPanel() {
  const project = useCurrentProject()
  const pushToast = useUiStore((state) => state.pushToast)
  const [question, setQuestion] = useState('这个项目的入口文件在哪里？')
  const [answer, setAnswer] = useState<ProjectQuestionAnswer | null>(null)
  const [loading, setLoading] = useState(false)

  const ask = async () => {
    if (!project?.id || !question.trim()) return
    setLoading(true)
    try {
      const result = await askProject(project.id, question.trim())
      setAnswer(result)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'ask failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="project-qa-panel">
      <header>
        <p className="eyebrow">Project Q&amp;A</p>
        <h3>直接问项目问题</h3>
      </header>

      <div className="qa-input">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：这个项目的入口文件在哪里？"
        />
        <button type="button" onClick={ask} disabled={loading}>
          {loading ? '...' : '提问'}
        </button>
      </div>

      {answer ? (
        <article className="qa-answer">
          <p>{answer.answer}</p>
          {answer.references.length ? (
            <small>参考：{answer.references.join('、')}</small>
          ) : null}
        </article>
      ) : null}
    </section>
  )
}
