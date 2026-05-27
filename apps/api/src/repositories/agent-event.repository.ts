import { randomUUID } from 'node:crypto'
import type { AgentEvent } from '@agent-lab/shared'
import { getDatabase } from '../db/database.ts'
import { eventBusService } from '../services/event-bus.service.ts'

type AgentEventRow = {
  id: string
  run_id: string
  type: AgentEvent['type']
  title: string
  payload_json: string
  created_at: string
}

export class AgentEventRepository {
  create(input: Omit<AgentEvent, 'id' | 'createdAt'>) {
    const db = getDatabase()
    const event: AgentEvent = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }

    db.prepare(`
      INSERT INTO agent_events (id, run_id, type, title, payload_json, created_at)
      VALUES (@id, @runId, @type, @title, @payloadJson, @createdAt)
    `).run({
      id: event.id,
      runId: event.runId,
      type: event.type,
      title: event.title,
      payloadJson: JSON.stringify(event.payload),
      createdAt: event.createdAt,
    })

    eventBusService.publish(event)
    return event
  }

  listByRun(runId: string) {
    const db = getDatabase()
    const rows = db
      .prepare(`SELECT * FROM agent_events WHERE run_id = @runId ORDER BY created_at`)
      .all({ runId }) as AgentEventRow[]

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      type: row.type,
      title: row.title,
      payload: JSON.parse(row.payload_json) as unknown,
      createdAt: row.created_at,
    }))
  }
}

export const agentEventRepository = new AgentEventRepository()
