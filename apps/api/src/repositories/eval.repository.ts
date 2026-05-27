import type { EvalRunStatus, EvalRunSummary } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'

type EvalRow = {
  id: string
  project_name: string
  status: EvalRunStatus
  started_at: string
  finished_at: string | null
  current_index: number
  total_count: number
  average_score: number
  pass_rate: number
  total_cost_usd: number
  total_latency_ms: number
  cases_json: string
  message: string | null
}

function serialize(row: EvalRow): EvalRunSummary {
  // running 状态时 finished_at 是 startedAt 占位，对外暴露为 null 更语义化
  const isFinalState = row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled'
  return {
    id: row.id,
    projectName: row.project_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: isFinalState ? row.finished_at : null,
    currentIndex: row.current_index,
    totalCount: row.total_count,
    averageScore: row.average_score,
    passRate: row.pass_rate,
    totalCostUsd: row.total_cost_usd,
    totalLatencyMs: row.total_latency_ms,
    cases: JSON.parse(row.cases_json) as EvalRunSummary['cases'],
    message: row.message ?? undefined,
  }
}

export class EvalRepository {
  create(summary: EvalRunSummary) {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO eval_runs (
        id, project_name, status, started_at, finished_at,
        current_index, total_count,
        average_score, pass_rate, total_cost_usd, total_latency_ms,
        cases_json, message
      ) VALUES (
        @id, @projectName, @status, @startedAt, @finishedAt,
        @currentIndex, @totalCount,
        @averageScore, @passRate, @totalCostUsd, @totalLatencyMs,
        @casesJson, @message
      )
    `).run({
      id: summary.id,
      projectName: summary.projectName,
      status: summary.status,
      startedAt: summary.startedAt,
      // 老库 finished_at 是 NOT NULL（迁移期无法 ALTER 约束），insert 时先用 startedAt 占位，
      // 完成后由 updateProgress 覆盖为真实结束时间。
      finishedAt: summary.finishedAt ?? summary.startedAt,
      currentIndex: summary.currentIndex,
      totalCount: summary.totalCount,
      averageScore: summary.averageScore,
      passRate: summary.passRate,
      totalCostUsd: summary.totalCostUsd,
      totalLatencyMs: summary.totalLatencyMs,
      casesJson: JSON.stringify(summary.cases),
      message: summary.message ?? null,
    })
  }

  updateProgress(summary: EvalRunSummary) {
    const db = getDatabase()
    db.prepare(`
      UPDATE eval_runs
      SET status = @status,
          finished_at = @finishedAt,
          current_index = @currentIndex,
          average_score = @averageScore,
          pass_rate = @passRate,
          total_cost_usd = @totalCostUsd,
          total_latency_ms = @totalLatencyMs,
          cases_json = @casesJson,
          message = @message
      WHERE id = @id
    `).run({
      id: summary.id,
      status: summary.status,
      // 同 create 注释：保持非空，未结束时用 startedAt 占位
      finishedAt: summary.finishedAt ?? summary.startedAt,
      currentIndex: summary.currentIndex,
      averageScore: summary.averageScore,
      passRate: summary.passRate,
      totalCostUsd: summary.totalCostUsd,
      totalLatencyMs: summary.totalLatencyMs,
      casesJson: JSON.stringify(summary.cases),
      message: summary.message ?? null,
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

  findRunning(): EvalRunSummary | null {
    const db = getDatabase()
    const row = db
      .prepare(`SELECT * FROM eval_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`)
      .get() as EvalRow | undefined
    return row ? serialize(row) : null
  }
}

export const evalRepository = new EvalRepository()
