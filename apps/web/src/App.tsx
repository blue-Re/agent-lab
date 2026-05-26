import { type FormEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  askProject,
  applyPatch,
  cancelAgentRun,
  defaultSteps,
  fetchCapabilities,
  fetchDirectories,
  fetchAgentEvents,
  fetchAgentRun,
  fetchAgentRuns,
  fetchQueueStatus,
  fetchProjectDashboard,
  fetchProjectFileContent,
  fetchProjectMemories,
  fetchProjects,
  fetchRunReport,
  fetchTaskTemplates,
  importProject,
  preparePatch,
  retryAgentRun,
  rollbackPatch,
  startAgentTask,
  type AgentEvent,
  type AgentRunHistoryItem,
  type AgentRunResult,
  type AgentStep,
  type CapabilityItem,
  type DirectoryEntry,
  type PatchActionResult,
  type ProjectFile,
  type ProjectDashboard,
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

type ConsolePanel = 'overview' | 'tools' | 'patch' | 'observe' | 'memory'

const consolePanels: Array<{ id: ConsolePanel; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'tools', label: '工具' },
  { id: 'patch', label: '补丁' },
  { id: 'observe', label: '观测' },
  { id: 'memory', label: '记忆' },
]

const agentCoreAbilities = [
  {
    title: '理解真实代码库',
    description: '导入任意本机项目目录，服务端扫描文件、识别技术栈并建立索引。',
  },
  {
    title: '自主选择工具',
    description: '根据需求调用搜索、读文件、lint、patch 等工具，而不是只做聊天回复。',
  },
  {
    title: '生成可审查补丁',
    description: '输出 diff、保存 patch，并在安全条件下应用新文件变更。',
  },
  {
    title: '可观测与可学习',
    description: '记录 prompt、模型响应、工具调用、评测结果和长期记忆。',
  },
]

const agentWorkflow = ['导入项目', '提出需求', '检索上下文', '调用工具', '生成补丁', '评测记忆']

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function App() {
  const [requirement, setRequirement] = useState(examplePrompts[0])
  const [steps, setSteps] = useState<AgentStep[]>(defaultSteps)
  const [result, setResult] = useState<AgentRunResult | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [history, setHistory] = useState<AgentRunHistoryItem[]>([])
  const [projects, setProjects] = useState<ProjectSnapshot[]>([])
  const [currentProject, setCurrentProject] = useState<ProjectSnapshot | null>(null)
  const [projectRoot, setProjectRoot] = useState('/Users/guozhen/Desktop/demo/agent-lab')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [memories, setMemories] = useState<ProjectMemory[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([])
  const [patchAction, setPatchAction] = useState<PatchActionResult | null>(null)
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
  const [activePanel, setActivePanel] = useState<ConsolePanel>('overview')
  const [isRunning, setIsRunning] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([])
  const [directoryParent, setDirectoryParent] = useState<DirectoryEntry | null>(null)
  const [directoryPath, setDirectoryPath] = useState('')
  const [fileSearch, setFileSearch] = useState('')
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showProjectDetails, setShowProjectDetails] = useState(false)
  const [showSuggestedTasks, setShowSuggestedTasks] = useState(false)

  const toolDuration = useMemo(
    () => result?.tools.reduce((total, tool) => total + tool.durationMs, 0) ?? 0,
    [result],
  )

  const eventTypes = useMemo(
    () => [...new Set(events.map((event) => event.type))],
    [events],
  )

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

  useEffect(() => {
    if (!currentProject?.id) return

    fetchProjectDashboard(currentProject.id).then(setDashboard)
    fetchTaskTemplates(currentProject.id).then(setTaskTemplates)
  }, [currentProject])

  useEffect(() => {
    if (!currentProject?.id || !selectedFilePath) return

    fetchProjectFileContent(currentProject.id, selectedFilePath).then(setFileContent)
  }, [currentProject, selectedFilePath])

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

  const visibleConsolePanels = useMemo(
    () =>
      showAdvanced
        ? consolePanels
        : consolePanels.filter((panel) => panel.id === 'overview' || panel.id === 'patch'),
    [showAdvanced],
  )

  const refreshHistory = async () => {
    const runs = await fetchAgentRuns()
    setHistory(runs)
  }

  const refreshProjects = async () => {
    const nextProjects = await fetchProjects()
    setProjects(nextProjects)

    if (nextProjects.length && !currentProject) {
      setCurrentProject(nextProjects[0])
    }
  }

  useEffect(() => {
    let ignore = false

    Promise.all([
      fetchAgentRuns(),
      fetchProjects(),
      fetchCapabilities(),
      fetchQueueStatus(),
    ]).then(
      ([runs, nextProjects, nextCapabilities, nextQueueStatus]) => {
        if (!ignore) {
          setHistory(runs)
          setProjects(nextProjects)
          setCapabilities(nextCapabilities)
          setQueueStatus(nextQueueStatus)
          if (nextProjects[0]) {
            setCurrentProject(nextProjects[0])
            setNotice('项目已从服务端加载，可以开始运行 Agent。')
          }
        }
      },
    )

    return () => {
      ignore = true
    }
  }, [])

  const runDemo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!requirement.trim() || !currentProject) {
      setNotice('请先导入并选择一个服务端项目，再运行 Agent。')
      return
    }

    setIsRunning(true)
    setResult(null)
    setEvents([])
    setPatchAction(null)
    setActiveRunId(null)
    setActivePanel('overview')
    setNotice('Agent 任务已提交，正在等待服务端执行。')
    setSteps(defaultSteps.map((step) => ({ ...step, status: 'waiting' })))

    for (const step of defaultSteps) {
      setSteps((currentSteps) =>
        currentSteps.map((item) =>
          item.id === step.id ? { ...item, status: 'running' } : item,
        ),
      )
      await new Promise((resolve) => setTimeout(resolve, 260))
      setSteps((currentSteps) =>
        currentSteps.map((item) =>
          item.id === step.id ? { ...item, status: 'done' } : item,
        ),
      )
    }

    const startedRun = await startAgentTask({
      requirement: requirement.trim(),
      project: currentProject,
      projectId: currentProject.id,
    })

    setActiveRunId(startedRun.runId)
    setResult(startedRun)
    setQueueStatus(await fetchQueueStatus())

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      const latestRun = await fetchAgentRun(startedRun.runId)
      const latestEvents = await fetchAgentEvents(startedRun.runId)
      const latestQueueStatus = await fetchQueueStatus()
      setQueueStatus(latestQueueStatus)

      if (latestEvents.length) {
        setEvents(latestEvents)
      }
      if (latestRun) {
        setResult(latestRun)
      }
      if (latestRun?.status && latestRun.status !== 'running') {
        setNotice(`Agent 任务已结束：${latestRun.status}`)
        break
      }
    }

    if (currentProject.id) {
      setMemories(await fetchProjectMemories(currentProject.id))
    }
    await refreshHistory()
    setQueueStatus(await fetchQueueStatus())
    setIsRunning(false)
  }

  const retryActiveRun = async () => {
    if (!activeRunId) return

    setIsRunning(true)
    const retriedRun = await retryAgentRun(activeRunId)
    if (retriedRun) {
      setActiveRunId(retriedRun.runId)
      setResult(retriedRun)
      await refreshHistory()
    }
    setIsRunning(false)
  }

  const cancelActiveRun = async () => {
    if (!activeRunId) return
    const cancelledRun = await cancelAgentRun(activeRunId)
    if (cancelledRun) {
      setResult(cancelledRun)
      setNotice('已向服务端发送取消任务请求。')
      await refreshHistory()
      setQueueStatus(await fetchQueueStatus())
    }
  }

  const prepareActivePatch = async () => {
    if (!activeRunId) return
    const action = await preparePatch(activeRunId)
    setPatchAction(action)
    setNotice(action.message)
  }

  const applyActivePatch = async () => {
    if (!activeRunId) return
    const action = await applyPatch(activeRunId)
    setPatchAction(action)
    setNotice(action.message)
  }

  const rollbackActivePatch = async () => {
    if (!activeRunId) return
    const action = await rollbackPatch(activeRunId)
    setPatchAction(action)
    setNotice(action.message)
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

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">AgentLab</p>
          <h1>导入项目，让 Agent 帮你分析和修改代码</h1>
          <p className="hero-description">
            选择一个本机前端项目，描述你想完成的任务。Agent 会读取代码、检索上下文、
            调用工具、生成补丁，并给出验证结果。
          </p>
          <div className="hero-actions">
            <a href="#workspace" className="primary-link">
              开始使用
            </a>
            <span className="status-pill">{notice}</span>
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => {
                setShowAdvanced((value) => !value)
                setActivePanel('overview')
              }}
            >
              {showAdvanced ? '隐藏高级调试' : '显示高级调试'}
            </button>
          </div>
        </div>

        {showAdvanced ? (
          <div className="signal-card metrics-card" aria-label="Agent execution metrics">
            <span>
              <strong>{formatCount(projectStats.files)}</strong>
              Files indexed
            </span>
            <span>
              <strong>{result?.tools.length ?? 0}</strong>
              Tool calls
            </span>
            <span>
              <strong>{events.length}</strong>
              Events
            </span>
            <span>
              <strong>{result?.evaluation?.score ?? '--'}</strong>
              Eval score
            </span>
            <span>
              <strong>{queueStatus.queued + queueStatus.running}</strong>
              Queue
            </span>
          </div>
        ) : (
          <div className="quick-start-card">
            <p className="eyebrow">How it works</p>
            <ol>
              <li>选择或导入本机项目</li>
              <li>描述你想让 Agent 完成的任务</li>
              <li>查看方案、补丁和验证结果</li>
            </ol>
          </div>
        )}
      </section>

      {showAdvanced ? (
        <section className="agent-story">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Agent Core</p>
            <h2>这不是聊天框，而是一个代码任务执行 Agent</h2>
          </div>
          <span className="mode-badge">DeepSeek + Tools + Memory</span>
        </div>
        <div className="workflow-strip">
          {agentWorkflow.map((item, index) => (
            <span key={item}>
              {index + 1}. {item}
            </span>
          ))}
        </div>
        <div className="ability-grid">
          {agentCoreAbilities.map((ability) => (
            <article key={ability.title}>
              <strong>{ability.title}</strong>
              <p>{ability.description}</p>
            </article>
          ))}
        </div>
      </section>
      ) : null}

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
                <button
                  type="button"
                  key={prompt}
                  onClick={() => setRequirement(prompt)}
                >
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
                可以输入你电脑上的任意前端项目绝对路径，例如
                <code>/Users/you/project</code>。服务端会读取该目录并建立项目索引。
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
                    <span key={kind}>
                      {kind}: {count}
                    </span>
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
                            onClick={() => {
                              setFileContent(null)
                              setSelectedFilePath(file.path)
                            }}
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
                        <pre className="file-preview">{fileContent.content}</pre>
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
                <button type="button" onClick={askCurrentProject}>
                  提问
                </button>
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
              <p className="eyebrow">Execution</p>
              <h2>Agent 执行轨迹</h2>
            </div>
            <span className="mode-badge">{result?.mode ?? 'standby'}</span>
          </div>

          <div className="console-tabs">
            {visibleConsolePanels.map((panel) => (
              <button
                type="button"
                key={panel.id}
                className={activePanel === panel.id ? 'active' : ''}
                onClick={() => setActivePanel(panel.id)}
              >
                {panel.label}
              </button>
            ))}
          </div>

          {showAdvanced ? (
            <div className="step-grid">
            {steps.map((step) => (
              <article className={`step-card ${step.status}`} key={step.id}>
                <span>{step.status}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
          ) : null}

          {result ? (
            <div className="result-grid">
              {activePanel === 'overview' ? (
                <>
                  <section className="result-card wide">
                <p className="eyebrow">Summary</p>
                <h3>{result.summary}</h3>
                <small>
                  Model: {result.modelUsed}
                  {result.runId ? ` · Run: ${result.runId.slice(0, 8)}` : ''}
                  {result.evaluation ? ` · Score: ${result.evaluation.score}` : ''}
                </small>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={loadRunReport}
                  disabled={!activeRunId}
                >
                  生成运行报告
                </button>
              </section>

              <section className="result-card">
                <p className="eyebrow">Plan</p>
                <ol>
                  {result.plan.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </section>

              <section className="result-card">
                <p className="eyebrow">Run Health</p>
                <div className="health-grid">
                  <span>工具耗时 {toolDuration}ms</span>
                  <span>事件类型 {eventTypes.length}</span>
                  <span>长期记忆 {memories.length}</span>
                  <span>项目文件 {currentProject?.files.length ?? 0}</span>
                </div>
              </section>
                </>
              ) : null}

              {showAdvanced && activePanel === 'tools' ? (
                <section className="result-card wide">
                  <p className="eyebrow">Tool Runtime</p>
                  <div className="tool-list">
                    {result.tools.map((tool) => (
                      <article key={`${tool.name}-${tool.durationMs}-${tool.input}`}>
                        <div>
                          <strong>{tool.name}</strong>
                          <span>{tool.durationMs}ms</span>
                        </div>
                        <code>{tool.input}</code>
                        <p>{tool.output}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activePanel === 'patch' ? (
                <>
                  <section className="result-card wide">
                <p className="eyebrow">Patch Preview</p>
                <pre>{result.diff}</pre>
                <div className="patch-actions">
                  <button type="button" onClick={prepareActivePatch} disabled={!activeRunId}>
                    保存 Patch
                  </button>
                  <button type="button" onClick={applyActivePatch} disabled={!activeRunId}>
                    安全应用
                  </button>
                  <button type="button" onClick={rollbackActivePatch} disabled={!activeRunId}>
                    回滚
                  </button>
                </div>
                {patchAction ? (
                  <div className={`patch-status ${patchAction.status}`}>
                    <strong>{patchAction.status}</strong>
                    <p>{patchAction.message}</p>
                    {patchAction.patchPath ? <code>{patchAction.patchPath}</code> : null}
                    {patchAction.verification ? (
                      <div className="verification-grid">
                        <div>
                          <strong>lint</strong>
                          <pre>{patchAction.verification.lint}</pre>
                        </div>
                        <div>
                          <strong>build</strong>
                          <pre>{patchAction.verification.build}</pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="result-card wide">
                <p className="eyebrow">Self Review</p>
                <ul className="review-list">
                  {result.review.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
                </>
              ) : null}

              {showAdvanced && activePanel === 'observe' && events.length ? (
                <section className="result-card wide">
                  <p className="eyebrow">Observability</p>
                  <div className="event-summary">
                    {eventTypes.map((type) => (
                      <span key={type}>{type}</span>
                    ))}
                  </div>
                  <div className="event-list">
                    {events.map((event) => (
                      <article key={event.id ?? `${event.type}-${event.createdAt}`}>
                        <strong>{event.title}</strong>
                        <span>{event.type}</span>
                        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {showAdvanced && activePanel === 'observe' && result.evaluation ? (
                <section className="result-card wide">
                  <p className="eyebrow">Evaluation</p>
                  <h3>
                    {result.evaluation.verdict} · {result.evaluation.score}
                  </h3>
                  <ul className="review-list">
                    {result.evaluation.checks.map((check) => (
                      <li key={check.name}>
                        {check.name}: {check.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {showAdvanced && activePanel === 'memory' ? (
                <section className="result-card wide">
                  <p className="eyebrow">Next Capabilities</p>
                  <h3>项目继续做大还缺这些能力</h3>
                  <div className="capability-grid">
                    {capabilities.map((item) => (
                      <article key={item.id} className={item.status}>
                        <span>{item.status}</span>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </article>
                    ))}
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={retryActiveRun}
                    disabled={!activeRunId || isRunning}
                  >
                    重试当前任务
                  </button>
                </section>
              ) : null}
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
          ) : (
            <div className="empty-state">
              <h3>{currentProject ? '等待任务输入' : '先导入一个项目'}</h3>
              <p>
                {currentProject
                  ? '运行后会展示 Agent 的计划、工具调用、diff、自我审查、评测和记忆。'
                  : '左侧输入任意本机项目路径并点击导入，Agent 才能读取真实代码并执行分析。'}
              </p>
            </div>
          )}

          {showAdvanced ? (
            <section className="history-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Memory</p>
                <h2>最近运行记录</h2>
              </div>
              <button type="button" onClick={refreshHistory}>
                刷新
              </button>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((run) => (
                  <article key={run.runId}>
                    <div>
                      <strong>{run.requirement}</strong>
                      <span>{run.status}</span>
                    </div>
                    <p>{run.summary || '运行中...'}</p>
                    <small>
                      {run.projectName} · {run.modelUsed} ·{' '}
                      {new Date(run.createdAt).toLocaleString()}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="history-empty">还没有持久化的运行记录。</p>
            )}
          </section>
          ) : null}

          {showAdvanced ? (
            <section className="history-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Learning Memory</p>
                <h2>项目长期记忆</h2>
              </div>
            </div>
            {memories.length ? (
              <div className="history-list">
                {memories.slice(0, 6).map((memory) => (
                  <article key={memory.id}>
                    <div>
                      <strong>{memory.kind}</strong>
                      <span>{new Date(memory.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{memory.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="history-empty">项目运行后会沉淀记忆。</p>
            )}
          </section>
          ) : null}
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
              <button type="button" onClick={() => setIsPickerOpen(false)}>
                关闭
              </button>
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
