import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '../../../..')

dotenv.config({ path: path.join(projectRoot, '.env') })

export const config = {
  projectRoot,
  port: Number(process.env.PORT ?? 8787),
  databasePath: process.env.DATABASE_URL?.startsWith('file:')
    ? process.env.DATABASE_URL.replace('file:', '')
    : path.join(projectRoot, 'data', 'agent-lab.sqlite'),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  },
}
