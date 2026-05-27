import Editor from '@monaco-editor/react'
import './index.css'

type Props = {
  path: string
  content: string
  language?: string
  height?: number | string
}

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  vue: 'html',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  yml: 'yaml',
  yaml: 'yaml',
}

function detectLanguage(path: string, override?: string) {
  if (override) return override
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return LANG_BY_EXT[ext] ?? 'plaintext'
}

export function MonacoPreview({ path, content, language, height = 360 }: Props) {
  const lang = detectLanguage(path, language)

  return (
    <div className="monaco-preview">
      <header>
        <strong>{path}</strong>
        <small>{lang}</small>
      </header>
      <Editor
        height={height}
        defaultLanguage={lang}
        language={lang}
        value={content}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          renderLineHighlight: 'gutter',
          smoothScrolling: true,
          wordWrap: 'on',
        }}
      />
    </div>
  )
}
