import { config } from '../src/config/env.ts'
import { initDatabase } from '../src/db/database.ts'
import { evalService } from '../src/services/eval.service.ts'

async function main() {
  initDatabase()

  console.log(`[eval] database: ${config.databasePath}`)
  console.log('[eval] running golden cases...')

  const summary = await evalService.run({})

  console.log('[eval] finished:')
  console.log(`  average score: ${summary.averageScore}`)
  console.log(`  pass rate:     ${(summary.passRate * 100).toFixed(1)}%`)
  console.log(`  total cost:    $${summary.totalCostUsd.toFixed(6)}`)
  console.log(`  total latency: ${summary.totalLatencyMs}ms`)
  console.log('[eval] per-case:')
  for (const item of summary.cases) {
    console.log(`  - ${item.title} -> ${item.verdict} (${item.score})`)
  }
}

main().catch((error: unknown) => {
  console.error('[eval] failed:', error)
  process.exit(1)
})
