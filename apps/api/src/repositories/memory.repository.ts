import { randomUUID } from 'node:crypto'
import type { EvaluationResult, ProjectMemory } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'

type MemoryRow = {
  id: string
  project_id: string
  kind: ProjectMemory['kind']
  content: string
  created_at: string
}

export class MemoryRepository {
  addProjectMemories(memories: Array<Omit<ProjectMemory, 'id' | 'createdAt'>>) {
    const db = getDatabase()
    const now = new Date().toISOString()
    const insert = db.prepare(`
      INSERT INTO project_memories (id, project_id, kind, content, created_at)
      VALUES (@id, @projectId, @kind, @content, @createdAt)
    `)

    for (const memory of memories) {
      insert.run({
        id: randomUUID(),
        projectId: memory.projectId,
        kind: memory.kind,
        content: memory.content,
        createdAt: now,
      })
    }
  }

  listProjectMemories(projectId: string) {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT * FROM project_memories WHERE project_id = @projectId ORDER BY created_at DESC LIMIT 50`,
      )
      .all({ projectId }) as MemoryRow[]

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      content: row.content,
      createdAt: row.created_at,
    }))
  }

  saveEvaluation(runId: string, evaluation: EvaluationResult) {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO evaluation_results (id, run_id, score, verdict, checks_json, created_at)
      VALUES (@id, @runId, @score, @verdict, @checksJson, @createdAt)
    `).run({
      id: randomUUID(),
      runId,
      score: evaluation.score,
      verdict: evaluation.verdict,
      checksJson: JSON.stringify(evaluation.checks),
      createdAt: new Date().toISOString(),
    })
  }
}

export const memoryRepository = new MemoryRepository()
