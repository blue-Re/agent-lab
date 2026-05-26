import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DirectoryEntry } from '@agent-lab/shared'

export class FileSystemService {
  async listDirectories(targetPath?: string) {
    const currentPath = path.resolve(targetPath || os.homedir())
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    const directories: DirectoryEntry[] = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(currentPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const parentPath = path.dirname(currentPath)

    return {
      currentPath,
      parent:
        parentPath !== currentPath
          ? {
              name: '..',
              path: parentPath,
              isParent: true,
            }
          : null,
      directories,
    }
  }
}

export const fileSystemService = new FileSystemService()
