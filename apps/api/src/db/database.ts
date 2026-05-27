import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config/env.ts'

let connection: Database.Database | undefined

export function getDatabase() {
  if (!connection) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true })
    connection = new Database(config.databasePath)
    connection.pragma('journal_mode = WAL')
    connection.pragma('foreign_keys = ON')
  }

  return connection
}

export function initDatabase() {
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      requirement TEXT NOT NULL,
      project_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      model_used TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      tools_json TEXT NOT NULL,
      diff TEXT NOT NULL,
      review_json TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
      ON agent_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      stack_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, path)
    );

    CREATE INDEX IF NOT EXISTS idx_project_files_project_id
      ON project_files(project_id);

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_run_id
      ON agent_events(run_id, created_at);

    CREATE TABLE IF NOT EXISTS project_memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evaluation_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      checks_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cost_entries (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      prompt_cost_usd REAL NOT NULL,
      completion_cost_usd REAL NOT NULL,
      total_cost_usd REAL NOT NULL,
      latency_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cost_entries_run_id
      ON cost_entries(run_id);
    CREATE INDEX IF NOT EXISTS idx_cost_entries_created_at
      ON cost_entries(created_at DESC);

    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      average_score REAL NOT NULL,
      pass_rate REAL NOT NULL,
      total_cost_usd REAL NOT NULL,
      total_latency_ms INTEGER NOT NULL,
      cases_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_eval_runs_started_at
      ON eval_runs(started_at DESC);
  `)
}
