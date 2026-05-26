import { randomUUID } from 'node:crypto'
import type { ProjectFile, ProjectSnapshot } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'

type ProjectRow = {
  id: string
  name: string
  root_path: string
  stack_json: string
  updated_at: string
}

type ProjectFileRow = {
  id: string
  path: string
  kind: ProjectFile['kind']
  summary: string
  size: number
  hash: string
}

export class ProjectRepository {
  upsertProject(input: {
    name: string
    rootPath: string
    stack: string[]
    files: Array<Omit<ProjectFile, 'id'>>
  }) {
    const db = getDatabase()
    const now = new Date().toISOString()
    const existing = db
      .prepare(`SELECT id FROM projects WHERE root_path = @rootPath`)
      .get({ rootPath: input.rootPath }) as { id: string } | undefined
    const projectId = existing?.id ?? randomUUID()

    if (existing) {
      db.prepare(`
        UPDATE projects
        SET name = @name,
            stack_json = @stackJson,
            updated_at = @updatedAt
        WHERE id = @projectId
      `).run({
        projectId,
        name: input.name,
        stackJson: JSON.stringify(input.stack),
        updatedAt: now,
      })
      db.prepare(`DELETE FROM project_files WHERE project_id = @projectId`).run({
        projectId,
      })
    } else {
      db.prepare(`
        INSERT INTO projects (id, name, root_path, stack_json, created_at, updated_at)
        VALUES (@projectId, @name, @rootPath, @stackJson, @createdAt, @updatedAt)
      `).run({
        projectId,
        name: input.name,
        rootPath: input.rootPath,
        stackJson: JSON.stringify(input.stack),
        createdAt: now,
        updatedAt: now,
      })
    }

    const insertFile = db.prepare(`
      INSERT INTO project_files (
        id, project_id, path, kind, summary, size, hash, updated_at
      )
      VALUES (
        @id, @projectId, @path, @kind, @summary, @size, @hash, @updatedAt
      )
    `)

    const transaction = db.transaction((files: Array<Omit<ProjectFile, 'id'>>) => {
      for (const file of files) {
        insertFile.run({
          id: randomUUID(),
          projectId,
          path: file.path,
          kind: file.kind,
          summary: file.summary,
          size: file.size ?? 0,
          hash: file.hash ?? '',
          updatedAt: now,
        })
      }
    })

    transaction(input.files)

    return this.findById(projectId)
  }

  listProjects() {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
      .all() as ProjectRow[]

    return rows.map((row) => this.serializeProject(row))
  }

  findById(projectId: string): ProjectSnapshot | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT * FROM projects WHERE id = @projectId`)
      .get({ projectId }) as ProjectRow | undefined

    return row ? this.serializeProject(row) : null
  }

  private serializeProject(row: ProjectRow): ProjectSnapshot {
    const db = getDatabase()
    const files = db
      .prepare(`SELECT * FROM project_files WHERE project_id = @projectId ORDER BY path`)
      .all({ projectId: row.id }) as ProjectFileRow[]

    return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      stack: JSON.parse(row.stack_json) as string[],
      files: files.map((file) => ({
        id: file.id,
        path: file.path,
        kind: file.kind,
        summary: file.summary,
        size: file.size,
        hash: file.hash,
      })),
      updatedAt: row.updated_at,
    }
  }
}

export const projectRepository = new ProjectRepository()
