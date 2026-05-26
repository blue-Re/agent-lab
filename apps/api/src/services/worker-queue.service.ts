type QueueTask = {
  runId: string
  execute: () => Promise<void>
}

export class WorkerQueueService {
  private queue: QueueTask[] = []
  private activeRunId: string | null = null

  enqueue(runId: string, execute: () => Promise<void>) {
    this.queue.push({ runId, execute })
    void this.drain()
  }

  cancelQueued(runId: string) {
    const before = this.queue.length
    this.queue = this.queue.filter((task) => task.runId !== runId)
    return before !== this.queue.length
  }

  status() {
    return {
      queued: this.queue.length,
      running: this.activeRunId ? 1 : 0,
      activeRunId: this.activeRunId,
      queuedRunIds: this.queue.map((task) => task.runId),
    }
  }

  private async drain() {
    if (this.activeRunId || !this.queue.length) return

    const task = this.queue.shift()
    if (!task) return

    this.activeRunId = task.runId
    try {
      await task.execute()
    } finally {
      this.activeRunId = null
      void this.drain()
    }
  }
}

export const workerQueueService = new WorkerQueueService()
