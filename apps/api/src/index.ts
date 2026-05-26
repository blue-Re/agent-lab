import { createApp } from './app.ts'
import { config } from './config/env.ts'
import { initDatabase } from './db/database.ts'

initDatabase()

const app = createApp()

app.listen(config.port, () => {
  console.log(`AgentLab Koa2 API server listening on http://localhost:${config.port}`)
})
