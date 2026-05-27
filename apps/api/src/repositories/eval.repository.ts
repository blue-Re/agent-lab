import type { EvalRunSummary } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'

type EvalRow = {
  id: string
  project_name: string
  started_at: string
  finished_at: string
  average_score: number
  pass_rate: number
  total_cost_usd: number
  total_latency_ms: number
  cases_json: string
}

function serialize(row: EvalRow): EvalRunSummary {
  return {
    id: row.id,
    projectName: row.project_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    averageScore: row.average_score,
    passRate: row.pass_rate,
    totalCostUsd: row.total_cost_usd,
    totalLatencyMs: row.total_latency_ms,
    cases: JSON.parse(row.cases_json) as EvalRunSummary['cases'],
  }
}

export class EvalRepository {
  save(summary: EvalRunSummary) {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO eval_runs (
        id, project_name, started_at, finished_at,
        average_score, pass_rate, total_cost_usd, total_latency_ms, cases_json
      ) VALUES (
        @id, @projectName, @startedAt, @finishedAt,
        @averageScore, @passRate, @totalCostUsd, @totalLatencyMs, @casesJson
      )
    `).run({
      id: summary.id,
      projectName: summary.projectName,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      averageScore: summary.averageScore,
      passRate: summary.passRate,
      totalCostUsd: summary.totalCostUsd,
      totalLatencyMs: summary.totalLatencyMs,
      casesJson: JSON.stringify(summary.cases),
    })
  }

  list(limit = 20): EvalRunSummary[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT @limit`)
      .all({ limit }) as EvalRow[]
    return rows.map(serialize)
  }

  findById(id: string): EvalRunSummary | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT * FROM eval_runs WHERE id = @id`).get({ id }) as
      | EvalRow
      | undefined
    return row ? serialize(row) : null
  }
}

export const evalRepository = new EvalRepository()
