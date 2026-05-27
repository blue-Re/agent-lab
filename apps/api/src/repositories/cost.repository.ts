import { randomUUID } from 'node:crypto'
import type { CostEntry, CostSummary } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'

type CostRow = {
  id: string
  run_id: string
  stage: CostEntry['stage']
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cost_usd: number
  completion_cost_usd: number
  total_cost_usd: number
  latency_ms: number
  created_at: string
}

function serializeRow(row: CostRow): CostEntry {
  return {
    id: row.id,
    runId: row.run_id,
    stage: row.stage,
    model: row.model,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    promptCostUsd: row.prompt_cost_usd,
    completionCostUsd: row.completion_cost_usd,
    totalCostUsd: row.total_cost_usd,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }
}

export class CostRepository {
  record(input: Omit<CostEntry, 'id' | 'createdAt'>): CostEntry {
    const db = getDatabase()
    const entry: CostEntry = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }

    db.prepare(`
      INSERT INTO cost_entries (
        id, run_id, stage, model,
        prompt_tokens, completion_tokens, total_tokens,
        prompt_cost_usd, completion_cost_usd, total_cost_usd,
        latency_ms, created_at
      ) VALUES (
        @id, @runId, @stage, @model,
        @promptTokens, @completionTokens, @totalTokens,
        @promptCostUsd, @completionCostUsd, @totalCostUsd,
        @latencyMs, @createdAt
      )
    `).run({
      id: entry.id,
      runId: entry.runId,
      stage: entry.stage,
      model: entry.model,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      totalTokens: entry.totalTokens,
      promptCostUsd: entry.promptCostUsd,
      completionCostUsd: entry.completionCostUsd,
      totalCostUsd: entry.totalCostUsd,
      latencyMs: entry.latencyMs,
      createdAt: entry.createdAt,
    })

    return entry
  }

  listByRun(runId: string): CostEntry[] {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT * FROM cost_entries WHERE run_id = @runId ORDER BY created_at`)
      .all({ runId }) as CostRow[]
    return rows.map(serializeRow)
  }

  summary(limit = 14): CostSummary {
    const db = getDatabase()
    const allRows = db
      .prepare(`SELECT * FROM cost_entries ORDER BY created_at DESC`)
      .all() as CostRow[]
    const entries = allRows.map(serializeRow)

    const runIds = new Set(entries.map((entry) => entry.runId))
    const totalCostUsd = entries.reduce((acc, entry) => acc + entry.totalCostUsd, 0)
    const totalTokens = entries.reduce((acc, entry) => acc + entry.totalTokens, 0)
    const totalLatency = entries.reduce((acc, entry) => acc + entry.latencyMs, 0)

    const dayMap = new Map<string, { runs: Set<string>; costUsd: number; tokens: number }>()
    for (const entry of entries) {
      const day = entry.createdAt.slice(0, 10)
      const bucket = dayMap.get(day) ?? { runs: new Set<string>(), costUsd: 0, tokens: 0 }
      bucket.runs.add(entry.runId)
      bucket.costUsd += entry.totalCostUsd
      bucket.tokens += entry.totalTokens
      dayMap.set(day, bucket)
    }

    const byDay = [...dayMap.entries()]
      .map(([day, value]) => ({
        day,
        runs: value.runs.size,
        costUsd: value.costUsd,
        tokens: value.tokens,
      }))
      .sort((a, b) => (a.day > b.day ? 1 : -1))
      .slice(-limit)

    const modelMap = new Map<string, { runs: Set<string>; costUsd: number; tokens: number }>()
    for (const entry of entries) {
      const bucket = modelMap.get(entry.model) ?? {
        runs: new Set<string>(),
        costUsd: 0,
        tokens: 0,
      }
      bucket.runs.add(entry.runId)
      bucket.costUsd += entry.totalCostUsd
      bucket.tokens += entry.totalTokens
      modelMap.set(entry.model, bucket)
    }

    const byModel = [...modelMap.entries()].map(([model, value]) => ({
      model,
      runs: value.runs.size,
      costUsd: value.costUsd,
      tokens: value.tokens,
    }))

    return {
      totalRuns: runIds.size,
      totalCostUsd,
      totalTokens,
      avgCostPerRun: runIds.size ? totalCostUsd / runIds.size : 0,
      avgLatencyMs: entries.length ? Math.round(totalLatency / entries.length) : 0,
      byDay,
      byModel,
      recent: entries.slice(0, 20),
    }
  }
}

export const costRepository = new CostRepository()
