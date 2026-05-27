import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { AgentTimeline } from './components/AgentTimeline'
import { CostDashboard } from './components/CostDashboard'
import { DiffReview } from './components/DiffReview'
import { EvalPanel } from './components/EvalPanel'
import { MonacoPreview } from './components/MonacoPreview'
import { useRunStream } from './hooks/useRunStream'
import {
  applyPatch,
  askProject,
  cancelAgentRun,
  fetchAgentRuns,
  fetchCapabilities,
  fetchDirectories,
  fetchPatchPlan,
  fetchProjectDashboard,
  fetchProjectFileContent,
  fetchProjectMemories,
  fetchProjects,
  fetchQueueStatus,
  fetchRunReport,
  fetchTaskTemplates,
  importProject,
  preparePatch,
  retryAgentRun,
  rollbackPatch,
  startAgentTask,
  type AgentRunHistoryItem,
  type CapabilityItem,
  type DirectoryEntry,
  type PatchActionResult,
  type PatchPlan,
  type ProjectDashboard,
  type ProjectFile,
  type ProjectFileContent,
  type ProjectMemory,
  type ProjectQuestionAnswer,
  type ProjectSnapshot,
  type QueueStatus,
  type RunReport,
  type TaskTemplate,
} from './lib/agent'

const examplePrompts = [
  '给这个 React 项目增加登录弹窗，并复用现有 Button 组件样式。',
  '分析商品列表组件，补充空状态和加载状态。',
  '把项目里的 API 错误处理统一成 toast 提示。',
]

type ConsolePanel = 'live' | 'patch' | 'cost' | 'eval' | 'memory'

const consolePanels: Array<{ id: ConsolePanel; label: string; description: string }> = [
  { id: 'live', label: '实时执行', description: 'SSE 流式推送 Tool-Calling Loop 思考链' },
  { id: 'patch', label: '补丁审批', description: 'Diff Viewer + hunk 复选框 + 快照回滚' },
  { id: 'cost', label: '成本仪表盘', description: 'Token / Cost / Latency 实时落库' },
  { id: 'eval', label: '回归评测', description: 'Golden 用例自动评测与质量趋势' },
  { id: 'memory', label: '项目记忆', description: '长期沉淀的项目知识' },
]

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function App() {
  const [requirement, setRequirement] = useState(examplePrompts[0])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [history, setHistory] = useState<AgentRunHistoryItem[]>([])
  const [projects, setProjects] = useState<ProjectSnapshot[]>([])
  const [currentProject, setCurrentProject] = useState<ProjectSnapshot | null>(null)
  const [projectRoot, setProjectRoot] = useState('/Users/guozhen/Desktop/demo/agent-lab')
  const [memories, setMemories] = useState<ProjectMemory[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([])
  const [patchAction, setPatchAction] = useState<PatchActionResult | null>(null)
  const [patchPlan, setPatchPlan] = useState<PatchPlan | null>(null)
  const [patchBusy, setPatchBusy] = useState(false)
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null)
  const [fileContent, setFileContent] = useState<ProjectFileContent | null>(null)
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [projectQuestion, setProjectQuestion] = useState('这个项目的入口文件在哪里？')
  const [projectAnswer, setProjectAnswer] = useState<ProjectQuestionAnswer | null>(null)
  const [runReport, setRunReport] = useState<RunReport | null>(null)
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    queued: 0,
    running: 0,
    activeRunId: null,
    queuedRunIds: [],
  })
  const [notice, setNotice] = useState('请先从服务端导入一个真实项目。')
  const [activePanel, setActivePanel] = useState<ConsolePanel>('live')
  const [isImporting, setIsImporting] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([])
  const [directoryParent, setDirectoryParent] = useState<DirectoryEntry | null>(null)
  const [directoryPath, setDirectoryPath] = useState('')
  const [fileSearch, setFileSearch] = useState('')
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [showProjectDetails, setShowProjectDetails] = useState(false)
  const [showSuggestedTasks, setShowSuggestedTasks] = useState(false)
  const [costRefreshKey, setCostRefreshKey] = useState(0)

  const { run: liveRun, events, isStreaming, isCompleted } = useRunStream(activeRunId)
  const isRunning = isStreaming && !isCompleted

  const projectStats = useMemo(() => {
    const filesByKind = (currentProject?.files ?? []).reduce<Record<string, number>>(
      (acc, file) => {
        acc[file.kind] = (acc[file.kind] ?? 0) + 1
        return acc
      },
      {},
    )

    return {
      files: currentProject?.files.length ?? 0,
      stack: currentProject?.stack.length ?? 0,
      filesByKind,
    }
  }, [currentProject])

  const filteredFiles = useMemo(() => {
    const query = fileSearch.trim().toLowerCase()
    const files = currentProject?.files ?? []
    return query
      ? files.filter((file) =>
          `${file.path} ${file.kind} ${file.summary}`.toLowerCase().includes(query),
        )
      : files
  }, [currentProject, fileSearch])

  const filesByKind = useMemo(
    () =>
      filteredFiles.reduce<Record<string, ProjectFile[]>>((acc, file) => {
        acc[file.kind] = [...(acc[file.kind] ?? []), file]
        return acc
      }, {}),
    [filteredFiles],
  )

  const selectedFile = useMemo(
    () => currentProject?.files.find((file) => file.path === selectedFilePath) ?? null,
    [currentProject, selectedFilePath],
  )

  const suggestedTasks = useMemo(() => {
    if (!currentProject) return []
    const hasStyle = currentProject.files.some((file) => file.kind === 'style')
    const hasApi = currentProject.files.some((file) => file.kind === 'api')
    const stack = currentProject.stack.join(' / ')

    return [
      `分析 ${currentProject.name} 的整体架构，并指出组件边界问题。`,
      hasApi
        ? '检查项目 API 调用链路，统一错误处理和加载状态。'
        : '为项目补充 API 请求层，并设计错误处理规范。',
      hasStyle
        ? '审查样式系统，提取可复用设计 token 和组件规范。'
        : '为项目建立基础样式规范和组件视觉层级。',
      `基于 ${stack || '当前技术栈'} 生成一次可执行的重构计划。`,
    ]
  }, [currentProject])

  const refreshHistory = useCallback(async () => {
    const runs = await fetchAgentRuns()
    setHistory(runs)
  }, [])

  const refreshProjects = useCallback(async () => {
    const next = await fetchProjects()
    setProjects(next)
    if (next.length && !currentProject) {
      setCurrentProject(next[0])
    }
  }, [currentProject])

  useEffect(() => {
    let ignore = false
    Promise.all([
      fetchAgentRuns(),
      fetchProjects(),
      fetchCapabilities(),
      fetchQueueStatus(),
    ]).then(([runs, nextProjects, nextCapabilities, nextQueueStatus]) => {
      if (ignore) return
      setHistory(runs)
      setProjects(nextProjects)
      setCapabilities(nextCapabilities)
      setQueueStatus(nextQueueStatus)
      if (nextProjects[0]) {
        setCurrentProject(nextProjects[0])
        setNotice('项目已从服务端加载，可以开始运行 Agent。')
      }
    })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!currentProject?.id) return
    void fetchProjectDashboard(currentProject.id).then(setDashboard)
    void fetchTaskTemplates(currentProject.id).then(setTaskTemplates)
    void fetchProjectMemories(currentProject.id).then(setMemories)
  }, [currentProject])

  useEffect(() => {
    if (!currentProject?.id || !selectedFilePath) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFileContent(null)
    void fetchProjectFileContent(currentProject.id, selectedFilePath).then(setFileContent)
  }, [currentProject, selectedFilePath])

  useEffect(() => {
    if (!activeRunId || !isCompleted) return
    void fetchPatchPlan(activeRunId).then(setPatchPlan)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCostRefreshKey((value) => value + 1)
    if (currentProject?.id) {
      void fetchProjectMemories(currentProject.id).then(setMemories)
    }
    void refreshHistory()
    void fetchQueueStatus().then(setQueueStatus)
  }, [activeRunId, isCompleted, currentProject, refreshHistory])

  const runDemo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requirement.trim() || !currentProject) {
      setNotice('请先导入并选择一个服务端项目，再运行 Agent。')
      return
    }

    setPatchAction(null)
    setPatchPlan(null)
    setRunReport(null)
    setActivePanel('live')
    setNotice('Agent 任务已提交，SSE 正在实时推送事件...')

    const startedRun = await startAgentTask({
      requirement: requirement.trim(),
      project: currentProject,
      projectId: currentProject.id,
    })

    setActiveRunId(startedRun.runId)
    setQueueStatus(await fetchQueueStatus())
  }

  const retryActiveRun = async () => {
    if (!activeRunId) return
    const retried = await retryAgentRun(activeRunId)
    if (retried) setActiveRunId(retried.runId)
  }

  const cancelActiveRun = async () => {
    if (!activeRunId) return
    const cancelled = await cancelAgentRun(activeRunId)
    if (cancelled) {
      setNotice('已向服务端发送取消任务请求。')
      await refreshHistory()
      setQueueStatus(await fetchQueueStatus())
    }
  }

  const prepareActivePatch = async () => {
    if (!activeRunId) return
    setPatchBusy(true)
    try {
      const action = await preparePatch(activeRunId)
      setPatchAction(action)
      setNotice(action.message)
      const plan = await fetchPatchPlan(activeRunId)
      setPatchPlan(plan)
    } finally {
      setPatchBusy(false)
    }
  }

  const applyActivePatch = async (selectedHunkIds: string[]) => {
    if (!activeRunId) return
    setPatchBusy(true)
    try {
      const action = await applyPatch(activeRunId, { selectedHunkIds })
      setPatchAction(action)
      setNotice(action.message)
    } finally {
      setPatchBusy(false)
    }
  }

  const rollbackActivePatch = async () => {
    if (!activeRunId) return
    setPatchBusy(true)
    try {
      const action = await rollbackPatch(activeRunId)
      setPatchAction(action)
      setNotice(action.message)
    } finally {
      setPatchBusy(false)
    }
  }

  const askCurrentProject = async () => {
    if (!currentProject?.id || !projectQuestion.trim()) return
    const answer = await askProject(currentProject.id, projectQuestion.trim())
    setProjectAnswer(answer)
  }

  const loadRunReport = async () => {
    if (!activeRunId) return
    const report = await fetchRunReport(activeRunId)
    setRunReport(report)
    if (report) setNotice('已生成本次运行报告。')
  }

  const importCurrentProject = async () => {
    setIsImporting(true)
    try {
      const project = await importProject({ rootPath: projectRoot })
      setCurrentProject(project)
      setNotice(`已导入 ${project.name}，共 ${project.files.length} 个文件。`)
      await refreshProjects()
      if (project.id) {
        setMemories(await fetchProjectMemories(project.id))
        setDashboard(await fetchProjectDashboard(project.id))
        setTaskTemplates(await fetchTaskTemplates(project.id))
      }
    } finally {
      setIsImporting(false)
    }
  }

  const useCurrentWorkspace = () => {
    setProjectRoot('/Users/guozhen/Desktop/demo/agent-lab')
  }

  const openDirectoryPicker = async (path?: string) => {
    const result = await fetchDirectories(path || projectRoot)
    setDirectoryPath(result.currentPath)
    setDirectoryParent(result.parent)
    setDirectoryEntries(result.directories)
    setIsPickerOpen(true)
  }

  const chooseDirectory = async (path: string) => {
    setProjectRoot(path)
    const result = await fetchDirectories(path)
    setDirectoryPath(result.currentPath)
    setDirectoryParent(result.parent)
    setDirectoryEntries(result.directories)
  }

  const lastEvaluation = liveRun?.evaluation ?? null
  const toolEvents = useMemo(
    () => events.filter((event) => event.type === 'tool_result' || event.type === 'tool_call'),
    [events],
  )
  const costEvents = useMemo(() => events.filter((event) => event.type === 'cost'), [events])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">AgentLab · v2</p>
          <h1>真 Tool-Calling Loop · 流式可观测 · 行级 Patch 审批</h1>
          <p className="hero-description">
            导入本机项目，用一次任务体验 ReAct 多轮 Agent：模型自主决定工具调用、SSE 实时推送思考与成本、
            Diff Viewer 行级审批、Golden 用例自动回归评测。
          </p>
          <div className="hero-actions">
            <a href="#workspace" className="primary-link">开始使用</a>
            <span className="status-pill">{notice}</span>
          </div>
        </div>

        <div className="signal-card metrics-card" aria-label="Agent runtime metrics">
          <span><strong>{formatCount(projectStats.files)}</strong>Files indexed</span>
          <span><strong>{toolEvents.length}</strong>Tool calls</span>
          <span><strong>{events.length}</strong>Stream events</span>
          <span><strong>{lastEvaluation?.score ?? '--'}</strong>Eval score</span>
          <span><strong>{queueStatus.queued + queueStatus.running}</strong>Queue</span>
        </div>
      </section>

      <section className="workspace" id="workspace">
        <aside className="task-panel">
          <div className="panel-heading">
            <p className="eyebrow">Input</p>
            <h2>任务需求</h2>
          </div>

          <form onSubmit={runDemo} className="task-form">
            <label htmlFor="requirement">你希望 Agent 完成什么？</label>
            <textarea
              id="requirement"
              value={requirement}
              onChange={(event) => setRequirement(event.target.value)}
              rows={7}
              placeholder="例如：给项目增加登录弹窗，并复用现有按钮组件。"
            />

            <div className="prompt-list">
              {(taskTemplates.length
                ? taskTemplates.slice(0, 4).map((template) => template.prompt)
                : examplePrompts
              ).map((prompt) => (
                <button type="button" key={prompt} onClick={() => setRequirement(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>

            <button className="run-button" type="submit" disabled={isRunning || !currentProject}>
              {isRunning ? 'Agent 执行中...' : '运行 Agent'}
            </button>
            {isRunning ? (
              <button className="secondary-button compact" type="button" onClick={cancelActiveRun}>
                取消任务
              </button>
            ) : null}
          </form>

          <div className="project-card project-import-card">
            <div>
              <p className="eyebrow">Project Import</p>
              <h3>{currentProject?.name ?? '未导入项目'}</h3>
              <p className="project-hint">
                输入电脑上的任意前端项目绝对路径，例如 <code>/Users/you/project</code>。
              </p>
            </div>
            <div className="import-row">
              <input
                value={projectRoot}
                onChange={(event) => setProjectRoot(event.target.value)}
                placeholder="输入本地项目目录"
              />
              <button type="button" onClick={importCurrentProject} disabled={isImporting}>
                {isImporting ? '导入中...' : '导入'}
              </button>
            </div>
            <button className="text-button" type="button" onClick={() => openDirectoryPicker()}>
              选择本机项目目录
            </button>
            <button className="text-button" type="button" onClick={useCurrentWorkspace}>
              使用当前 AgentLab 项目路径
            </button>
            {projects.length ? (
              <select
                value={currentProject?.id ?? ''}
                onChange={(event) => {
                  const project = projects.find((item) => item.id === event.target.value)
                  if (project) setCurrentProject(project)
                }}
              >
                {projects.map((project) => (
                  <option key={project.id ?? project.name} value={project.id ?? project.name}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="stack-list">
              {(currentProject?.stack ?? []).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            {currentProject ? (
              <div className="project-summary">
                <span>{formatCount(currentProject.files.length)} files</span>
                <span>{currentProject.stack.join(' / ') || 'Unknown stack'}</span>
              </div>
            ) : null}
            {currentProject ? (
              <button
                className="text-button"
                type="button"
                onClick={() => setShowProjectDetails((value) => !value)}
              >
                {showProjectDetails ? '收起项目详情' : '查看项目详情'}
              </button>
            ) : null}
            {showProjectDetails ? (
              <>
                <div className="project-stats">
                  {Object.entries(projectStats.filesByKind).map(([kind, count]) => (
                    <span key={kind}>{kind}: {count}</span>
                  ))}
                </div>
                {dashboard ? (
                  <div className="dashboard-card">
                    <p className="eyebrow">Project Dashboard</p>
                    <div className="health-grid">
                      <span>文件 {formatCount(dashboard.totalFiles)}</span>
                      <span>体积 {formatCount(dashboard.totalSize)} bytes</span>
                      <span>入口 {dashboard.likelyEntryFiles.length}</span>
                      <span>风险 {dashboard.risks.length}</span>
                    </div>
                    {dashboard.risks.length ? (
                      <ul className="risk-list">
                        {dashboard.risks.map((risk) => (
                          <li key={risk}>{risk}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <div className="file-explorer">
                  <input
                    value={fileSearch}
                    onChange={(event) => setFileSearch(event.target.value)}
                    placeholder="搜索文件、类型或摘要"
                  />
                  <div className="file-groups">
                    {Object.entries(filesByKind).map(([kind, files]) => (
                      <details key={kind}>
                        <summary>
                          {kind} <span>{files.length}</span>
                        </summary>
                        {files.slice(0, 10).map((file) => (
                          <button
                            type="button"
                            key={file.path}
                            className={selectedFilePath === file.path ? 'selected' : ''}
                            onClick={() => setSelectedFilePath(file.path)}
                          >
                            <strong>{file.path}</strong>
                            <small>{file.summary}</small>
                          </button>
                        ))}
                      </details>
                    ))}
                  </div>
                  {selectedFile ? (
                    <div className="file-detail">
                      <p className="eyebrow">File Detail</p>
                      <strong>{selectedFile.path}</strong>
                      <p>{selectedFile.summary}</p>
                      <small>
                        {selectedFile.kind}
                        {selectedFile.size ? ` · ${formatCount(selectedFile.size)} bytes` : ''}
                      </small>
                      {fileContent ? (
                        <MonacoPreview
                          path={fileContent.path}
                          content={fileContent.content}
                          language={fileContent.language}
                          height={320}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {currentProject ? (
            <div className="project-card suggested-card">
              <button
                className="text-button flush"
                type="button"
                onClick={() => setShowSuggestedTasks((value) => !value)}
              >
                {showSuggestedTasks ? '收起推荐任务' : '不知道问什么？查看推荐任务'}
              </button>
              {showSuggestedTasks ? (
                <>
                  <p className="eyebrow">Suggested Tasks</p>
                  <h3>可以直接让 Agent 做这些</h3>
                  <div className="prompt-list">
                    {suggestedTasks.map((task) => (
                      <button type="button" key={task} onClick={() => setRequirement(task)}>
                        {task}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {currentProject ? (
            <div className="project-card">
              <p className="eyebrow">Project Q&A</p>
              <h3>直接问项目问题</h3>
              <div className="qa-box">
                <input
                  value={projectQuestion}
                  onChange={(event) => setProjectQuestion(event.target.value)}
                  placeholder="例如：这个项目的入口文件在哪里？"
                />
                <button type="button" onClick={askCurrentProject}>提问</button>
              </div>
              {projectAnswer ? (
                <div className="qa-answer">
                  <p>{projectAnswer.answer}</p>
                  {projectAnswer.references.length ? (
                    <small>参考：{projectAnswer.references.join('、')}</small>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section className="agent-console">
          <div className="panel-heading console-heading">
            <div>
              <p className="eyebrow">Execution Console</p>
              <h2>Agent 实时控制台</h2>
            </div>
            <span className="mode-badge">
              {liveRun?.modelUsed ?? 'idle'}
              {isRunning ? ' · streaming' : isCompleted ? ' · done' : ''}
            </span>
          </div>

          <div className="console-tabs">
            {consolePanels.map((panel) => (
              <button
                type="button"
                key={panel.id}
                className={activePanel === panel.id ? 'active' : ''}
                onClick={() => setActivePanel(panel.id)}
                title={panel.description}
              >
                {panel.label}
              </button>
            ))}
          </div>

          {activePanel === 'live' ? (
            <div className="result-grid">
              <section className="result-card wide">
                <p className="eyebrow">Summary</p>
                <h3>{liveRun?.summary || (isRunning ? 'Agent 正在思考...' : '等待任务输入')}</h3>
                <small>
                  Model: {liveRun?.modelUsed ?? '--'}
                  {activeRunId ? ` · Run: ${activeRunId.slice(0, 8)}` : ''}
                  {lastEvaluation ? ` · Score: ${lastEvaluation.score}` : ''}
                </small>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={loadRunReport}
                    disabled={!activeRunId}
                  >
                    生成运行报告
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={retryActiveRun}
                    disabled={!activeRunId || isRunning}
                  >
                    重试当前任务
                  </button>
                </div>
              </section>

              {liveRun?.plan?.length ? (
                <section className="result-card">
                  <p className="eyebrow">Plan</p>
                  <ol>
                    {liveRun.plan.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {liveRun?.review?.length ? (
                <section className="result-card">
                  <p className="eyebrow">Self Review</p>
                  <ul className="review-list">
                    {liveRun.review.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="result-card wide">
                <p className="eyebrow">Stream · Tool-Calling Loop</p>
                <AgentTimeline
                  events={events}
                  emptyHint={
                    activeRunId
                      ? 'SSE 已连接，正在等待 Agent 推送事件...'
                      : '运行任务后，这里会按时间轴展示推理 / 工具 / 成本事件。'
                  }
                />
              </section>

              {runReport ? (
                <section className="result-card wide">
                  <p className="eyebrow">Run Report</p>
                  <h3>{runReport.title}</h3>
                  <p>{runReport.summary}</p>
                  <div className="report-sections">
                    {runReport.sections.map((section) => (
                      <article key={section.title}>
                        <strong>{section.title}</strong>
                        <pre>{section.content}</pre>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {activePanel === 'patch' ? (
            <div className="result-grid">
              <section className="result-card wide">
                <DiffReview
                  plan={patchPlan}
                  patchAction={patchAction}
                  busy={patchBusy || isRunning}
                  onPrepare={prepareActivePatch}
                  onApply={applyActivePatch}
                  onRollback={rollbackActivePatch}
                />
              </section>
            </div>
          ) : null}

          {activePanel === 'cost' ? (
            <div className="result-grid">
              <section className="result-card wide">
                <CostDashboard refreshKey={costRefreshKey + costEvents.length} />
              </section>
            </div>
          ) : null}

          {activePanel === 'eval' ? (
            <div className="result-grid">
              <section className="result-card wide">
                <EvalPanel
                  projectId={currentProject?.id}
                  onRefreshed={() => setCostRefreshKey((value) => value + 1)}
                />
              </section>
            </div>
          ) : null}

          {activePanel === 'memory' ? (
            <div className="result-grid">
              <section className="result-card wide">
                <p className="eyebrow">Project Memory</p>
                <h3>项目长期记忆</h3>
                {memories.length ? (
                  <div className="memory-list">
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
                  <p className="history-empty">项目运行后会沉淀记忆。</p>
                )}
              </section>

              <section className="result-card wide">
                <p className="eyebrow">Capabilities</p>
                <h3>当前后端能力清单</h3>
                <div className="capability-grid">
                  {capabilities.map((item) => (
                    <article key={item.id} className={item.status}>
                      <span>{item.status}</span>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          <section className="history-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Memory</p>
                <h2>最近运行记录</h2>
              </div>
              <button type="button" onClick={refreshHistory}>刷新</button>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((run) => (
                  <article
                    key={run.runId}
                    className={activeRunId === run.runId ? 'active' : ''}
                    onClick={() => setActiveRunId(run.runId)}
                  >
                    <div>
                      <strong>{run.requirement}</strong>
                      <span>{run.status}</span>
                    </div>
                    <p>{run.summary || '运行中...'}</p>
                    <small>
                      {run.projectName} · {run.modelUsed} · {new Date(run.createdAt).toLocaleString()}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="history-empty">还没有持久化的运行记录。</p>
            )}
          </section>
        </section>
      </section>

      {isPickerOpen ? (
        <div className="picker-backdrop" role="dialog" aria-modal="true">
          <section className="picker-modal">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Local Directory Picker</p>
                <h2>选择要分析的项目目录</h2>
              </div>
              <button type="button" onClick={() => setIsPickerOpen(false)}>关闭</button>
            </div>
            <code className="picker-path">{directoryPath}</code>
            <div className="picker-actions">
              {directoryParent ? (
                <button type="button" onClick={() => chooseDirectory(directoryParent.path)}>
                  返回上级
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setProjectRoot(directoryPath)
                  setIsPickerOpen(false)
                }}
              >
                使用此目录
              </button>
            </div>
            <div className="directory-list">
              {directoryEntries.map((entry) => (
                <button type="button" key={entry.path} onClick={() => chooseDirectory(entry.path)}>
                  {entry.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
