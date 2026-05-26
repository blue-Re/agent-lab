import { randomUUID } from 'node:crypto'
import type { AgentRunHistoryItem, AgentRunResult, AgentRunStatus } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'

type AgentRunRow = {
  id: string
  requirement: string
  project_name: string
  mode: 'deepseek' | 'mock'
  model_used: string
  status: AgentRunStatus
  summary: string
  plan_json: string
  tools_json: string
  diff: string
  review_json: string
  error: string | null
  created_at: string
  updated_at: string
}

type CreateRunInput = {
  requirement: string
  projectName: string
}

function serializeRun(row: AgentRunRow): AgentRunHistoryItem {
  return {
    runId: row.id,
    requirement: row.requirement,
    projectName: row.project_name,
    mode: row.mode,
    modelUsed: row.model_used,
    status: row.status,
    summary: row.summary,
    plan: JSON.parse(row.plan_json) as string[],
    tools: JSON.parse(row.tools_json) as AgentRunHistoryItem['tools'],
    diff: row.diff,
    review: JSON.parse(row.review_json) as string[],
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class AgentRunRepository {
  create(input: CreateRunInput) {
    const db = getDatabase()
    const now = new Date().toISOString()
    const runId = randomUUID()

    db.prepare(`
      INSERT INTO agent_runs (
        id, requirement, project_name, mode, model_used, status, summary,
        plan_json, tools_json, diff, review_json, error, created_at, updated_at
      )
      VALUES (
        @runId, @requirement, @projectName, @mode, @modelUsed, @status, @summary,
        @planJson, @toolsJson, @diff, @reviewJson, @error, @createdAt, @updatedAt
      )
    `).run({
      runId,
      requirement: input.requirement,
      projectName: input.projectName,
      mode: 'mock',
      modelUsed: 'pending',
      status: 'running',
      summary: '',
      planJson: '[]',
      toolsJson: '[]',
      diff: '',
      reviewJson: '[]',
      error: null,
      createdAt: now,
      updatedAt: now,
    })

    return runId
  }

  complete(runId: string, result: AgentRunResult) {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE agent_runs
      SET mode = @mode,
          model_used = @modelUsed,
          status = @status,
          summary = @summary,
          plan_json = @planJson,
          tools_json = @toolsJson,
          diff = @diff,
          review_json = @reviewJson,
          error = @error,
          updated_at = @updatedAt
      WHERE id = @runId
    `).run({
      runId,
      mode: result.mode,
      modelUsed: result.modelUsed,
      status: result.status,
      summary: result.summary,
      planJson: JSON.stringify(result.plan),
      toolsJson: JSON.stringify(result.tools),
      diff: result.diff,
      reviewJson: JSON.stringify(result.review),
      error: result.error ?? null,
      updatedAt: now,
    })
  }

  fail(runId: string, error: string) {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE agent_runs
      SET status = 'failed',
          error = @error,
          updated_at = @updatedAt
      WHERE id = @runId
    `).run({ runId, error, updatedAt: now })
  }

  cancel(runId: string) {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE agent_runs
      SET status = 'cancelled',
          updated_at = @updatedAt
      WHERE id = @runId AND status = 'running'
    `).run({ runId, updatedAt: now })

    return this.findById(runId)
  }

  list(limit = 10) {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT @limit`)
      .all({ limit }) as AgentRunRow[]

    return rows.map(serializeRun)
  }

  findById(runId: string) {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT * FROM agent_runs WHERE id = @runId`)
      .get({ runId }) as AgentRunRow | undefined

    return row ? serializeRun(row) : null
  }
}

export const agentRunRepository = new AgentRunRepository()
