import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrentProject, useRunStore, useUiStore } from '../../stores'
import type { ProjectSnapshot } from '../../lib/agent'
import './index.css'

const EXAMPLES = [
  '给这个 React 项目增加登录弹窗，并复用现有 Button 组件样式。',
  '分析商品列表组件，补充空状态和加载状态。',
  '把项目里的 API 错误处理统一成 toast 提示。',
]

export function TaskInputPanel() {
  const navigate = useNavigate()
  const project = useCurrentProject()
  const templates = useStoreTemplates()
  const startTask = useRunStore((state) => state.startTask)
  const cancelActiveRun = useRunStore((state) => state.cancelActiveRun)
  const isStreaming = useRunStore((state) => state.isStreaming)
  const isCompleted = useRunStore((state) => state.isCompleted)
  const pushToast = useUiStore((state) => state.pushToast)
  const setNotice = useUiStore((state) => state.setNotice)

  const [requirement, setRequirement] = useState(EXAMPLES[0])

  const isRunning = isStreaming && !isCompleted

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requirement.trim() || !project) {
      pushToast('请先选择或导入项目，再描述任务。', 'warning')
      return
    }

    try {
      const startedRun = await startTask({
        requirement: requirement.trim(),
        project,
        projectId: project.id,
      })
      setNotice('Agent 任务已提交，SSE 正在实时推送事件。')
      pushToast(`Run ${startedRun.runId.slice(0, 8)} 已启动`, 'success')
      navigate('/workspace/live')
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'startTask failed', 'error')
    }
  }

  return (
    <section className="task-input-panel">
      <header>
        <p className="eyebrow">Input</p>
        <h3>任务需求</h3>
      </header>

      <form onSubmit={handleSubmit} className="task-form">
        <label htmlFor="requirement">你希望 Agent 完成什么？</label>
        <textarea
          id="requirement"
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          rows={6}
          placeholder="例如：给项目增加登录弹窗，并复用现有按钮组件。"
        />

        <div className="prompt-list">
          {(templates.length ? templates.slice(0, 4) : EXAMPLES).map((prompt) => (
            <button type="button" key={prompt} onClick={() => setRequirement(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <div className="task-actions">
          <button type="submit" disabled={isRunning || !project} className="run">
            {isRunning ? 'Agent 执行中...' : '运行 Agent'}
          </button>
          {isRunning ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                void cancelActiveRun()
                pushToast('已发送取消请求', 'info')
              }}
            >
              取消
            </button>
          ) : null}
        </div>
      </form>
    </section>
  )
}

function buildPrompts(project: ProjectSnapshot | null): string[] {
  if (!project) return []
  const stack = project.stack.join(' / ')
  const hasStyle = project.files.some((file) => file.kind === 'style')
  const hasApi = project.files.some((file) => file.kind === 'api')
  return [
    `分析 ${project.name} 的整体架构，并指出组件边界问题。`,
    hasApi
      ? '检查项目 API 调用链路，统一错误处理和加载状态。'
      : '为项目补充 API 请求层，并设计错误处理规范。',
    hasStyle
      ? '审查样式系统，提取可复用设计 token 和组件规范。'
      : '为项目建立基础样式规范和组件视觉层级。',
    `基于 ${stack || '当前技术栈'} 生成一次可执行的重构计划。`,
  ]
}

function useStoreTemplates() {
  const project = useCurrentProject()
  return useMemo(() => buildPrompts(project), [project])
}
