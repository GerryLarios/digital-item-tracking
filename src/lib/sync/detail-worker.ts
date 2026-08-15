import "@/lib/server-only"

import {
  processNextDetailSyncItem,
  recoverInterruptedDetailSync,
} from "@/lib/sync/detail-queue"

const DETAIL_WORKER_INTERVAL_MS = 1_000

declare global {
  var __registeredBacklogDetailWorkerStarted: boolean | undefined
}

export function startDetailSyncWorker() {
  if (globalThis.__registeredBacklogDetailWorkerStarted) return true

  globalThis.__registeredBacklogDetailWorkerStarted = true
  recoverInterruptedDetailSync()

  let processing = false
  const processOne = async () => {
    if (processing) return
    processing = true
    try {
      await processNextDetailSyncItem()
    } catch (error) {
      console.error("Bulk item detail worker failed", error)
    } finally {
      processing = false
    }
  }

  const timer = setInterval(() => void processOne(), DETAIL_WORKER_INTERVAL_MS)
  timer.unref?.()
  void processOne()
  return true
}

export function isDetailSyncWorkerStarted() {
  return Boolean(globalThis.__registeredBacklogDetailWorkerStarted)
}
