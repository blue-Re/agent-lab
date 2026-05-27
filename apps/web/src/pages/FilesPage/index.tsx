import { lazy, useMemo, useState } from 'react'
import { PageFallback } from '../../components/PageFallback'
import { PageHeader } from '../../components/PageHeader'
import { useCurrentProject, useProjectStore } from '../../stores'
import type { ProjectFile } from '../../lib/agent'
import './index.css'

const MonacoPreview = lazy(() =>
  import('../../components/MonacoPreview').then((m) => ({ default: m.MonacoPreview })),
)

export function FilesPage() {
  const project = useCurrentProject()
  const dashboard = useProjectStore((state) => state.dashboard)
  const fileContent = useProjectStore((state) => state.fileContent)
  const selectedFilePath = useProjectStore((state) => state.selectedFilePath)
  const selectFile = useProjectStore((state) => state.selectFile)
  const [search, setSearch] = useState('')

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    const files = project?.files ?? []
    return query
      ? files.filter((file) =>
          `${file.path} ${file.kind} ${file.summary}`.toLowerCase().includes(query),
        )
      : files
  }, [project, search])

  const filesByKind = useMemo(
    () =>
      filteredFiles.reduce<Record<string, ProjectFile[]>>((acc, file) => {
        acc[file.kind] = [...(acc[file.kind] ?? []), file]
        return acc
      }, {}),
    [filteredFiles],
  )

  const selectedFile = useMemo(
    () => project?.files.find((file) => file.path === selectedFilePath) ?? null,
    [project, selectedFilePath],
  )

  if (!project) {
    return (
      <>
        <PageHeader eyebrow="Files" title="项目文件浏览" />
        <p className="files-empty">请先在左侧导入或选择一个项目。</p>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Files"
        title={`项目文件 · ${project.name}`}
        description={`共 ${project.files.length} 个文件 · ${project.stack.join(' / ') || 'Unknown'}`}
      />

      {dashboard ? (
        <section className="files-dashboard">
          <article>
            <small>总文件</small>
            <strong>{dashboard.totalFiles}</strong>
          </article>
          <article>
            <small>总体积</small>
            <strong>{dashboard.totalSize} B</strong>
          </article>
          <article>
            <small>入口</small>
            <strong>{dashboard.likelyEntryFiles.length}</strong>
          </article>
          <article>
            <small>风险</small>
            <strong>{dashboard.risks.length}</strong>
          </article>
        </section>
      ) : null}

      <section className="files-layout">
        <aside className="files-tree">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索文件、类型或摘要"
            aria-label="搜索文件"
          />
          <div className="files-tree-groups">
            {Object.entries(filesByKind).map(([kind, files]) => (
              <details key={kind} open>
                <summary>
                  {kind} <span>{files.length}</span>
                </summary>
                {files.slice(0, 30).map((file) => (
                  <button
                    type="button"
                    key={file.path}
                    className={selectedFilePath === file.path ? 'selected' : ''}
                    onClick={() => selectFile(file.path)}
                  >
                    <strong>{file.path}</strong>
                    <small>{file.summary}</small>
                  </button>
                ))}
              </details>
            ))}
          </div>
        </aside>

        <section className="files-viewer">
          {selectedFile ? (
            <>
              <header>
                <p className="eyebrow">{selectedFile.kind}</p>
                <h3>{selectedFile.path}</h3>
                <small>{selectedFile.summary}</small>
              </header>
              {fileContent ? (
                <PageFallback>
                  <MonacoPreview
                    path={fileContent.path}
                    content={fileContent.content}
                    language={fileContent.language}
                    height={520}
                  />
                </PageFallback>
              ) : (
                <p className="files-empty">正在加载文件...</p>
              )}
            </>
          ) : (
            <p className="files-empty">点击左侧文件查看 Monaco 预览。</p>
          )}
        </section>
      </section>
    </>
  )
}
