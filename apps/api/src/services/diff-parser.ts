import { createHash } from 'node:crypto'
import type { PatchFileDiff, PatchHunk, PatchHunkChange } from '@agent-lab/shared'

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function hashId(...parts: string[]) {
  return createHash('sha1').update(parts.join('::')).digest('hex').slice(0, 12)
}

export function parseUnifiedDiff(raw: string): PatchFileDiff[] {
  if (!raw?.trim()) return []

  const lines = raw.split('\n')
  const files: PatchFileDiff[] = []

  let currentFile: PatchFileDiff | null = null
  let currentHunk: PatchHunk | null = null
  let oldLineCursor = 0
  let newLineCursor = 0

  function pushHunk() {
    if (currentFile && currentHunk) {
      currentFile.hunks.push(currentHunk)
    }
    currentHunk = null
  }

  function pushFile() {
    if (currentFile) {
      pushHunk()
      files.push(currentFile)
    }
    currentFile = null
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      pushFile()
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      const oldPath = match?.[1] ?? ''
      const newPath = match?.[2] ?? oldPath
      currentFile = {
        id: hashId(oldPath, newPath),
        filePath: newPath || oldPath,
        oldPath,
        newPath,
        isNewFile: false,
        isDeletedFile: false,
        hunks: [],
      }
      continue
    }

    if (!currentFile) continue

    if (line.startsWith('new file mode')) {
      currentFile.isNewFile = true
      continue
    }
    if (line.startsWith('deleted file mode')) {
      currentFile.isDeletedFile = true
      continue
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('index ')) {
      continue
    }

    const hunkMatch = line.match(HUNK_HEADER)
    if (hunkMatch) {
      pushHunk()
      const oldStart = Number(hunkMatch[1])
      const oldLines = Number(hunkMatch[2] ?? '1')
      const newStart = Number(hunkMatch[3])
      const newLines = Number(hunkMatch[4] ?? '1')
      currentHunk = {
        id: hashId(currentFile.id, line),
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        changes: [],
      }
      oldLineCursor = oldStart
      newLineCursor = newStart
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const change: PatchHunkChange = {
        type: 'add',
        content: line.slice(1),
        newLine: newLineCursor,
      }
      currentHunk.changes.push(change)
      newLineCursor += 1
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.changes.push({
        type: 'remove',
        content: line.slice(1),
        oldLine: oldLineCursor,
      })
      oldLineCursor += 1
    } else if (line.startsWith(' ')) {
      currentHunk.changes.push({
        type: 'context',
        content: line.slice(1),
        oldLine: oldLineCursor,
        newLine: newLineCursor,
      })
      oldLineCursor += 1
      newLineCursor += 1
    } else if (line === '') {
      currentHunk.changes.push({
        type: 'context',
        content: '',
        oldLine: oldLineCursor,
        newLine: newLineCursor,
      })
      oldLineCursor += 1
      newLineCursor += 1
    }
  }

  pushFile()
  return files
}

export function applyHunksToContent(originalContent: string, hunks: PatchHunk[]): string {
  if (!hunks.length) return originalContent

  const original = originalContent.split('\n')
  const orderedHunks = [...hunks].sort((a, b) => a.oldStart - b.oldStart)
  const result: string[] = []
  let cursor = 1

  for (const hunk of orderedHunks) {
    while (cursor < hunk.oldStart) {
      result.push(original[cursor - 1] ?? '')
      cursor += 1
    }

    for (const change of hunk.changes) {
      if (change.type === 'context') {
        result.push(original[cursor - 1] ?? change.content)
        cursor += 1
      } else if (change.type === 'remove') {
        cursor += 1
      } else if (change.type === 'add') {
        result.push(change.content)
      }
    }
  }

  while (cursor <= original.length) {
    result.push(original[cursor - 1] ?? '')
    cursor += 1
  }

  return result.join('\n')
}

export function contentFromNewFile(hunks: PatchHunk[]): string {
  return hunks
    .flatMap((hunk) => hunk.changes.filter((change) => change.type === 'add').map((change) => change.content))
    .join('\n')
    .concat('\n')
}
