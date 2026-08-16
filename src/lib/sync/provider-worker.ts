import "@/lib/server-only"

import {
  processNextProviderRun,
  recoverInterruptedProviderSync,
} from "@/lib/sync/provider-run"

const PROVIDER_WORKER_INTERVAL_MS = 1_000

declare global {
  var __registeredBacklogProviderSyncWorkerStarted: boolean | undefined
}

export function startProviderSyncWorker() {
  if (globalThis.__registeredBacklogProviderSyncWorkerStarted) return true

  globalThis.__registeredBacklogProviderSyncWorkerStarted = true
  recoverInterruptedProviderSync()

  let processing = false
  const processOne = async () => {
    if (processing) return
    processing = true
    try {
      await processNextProviderRun()
    } catch (error) {
      console.error("Provider sync worker failed", error)
    } finally {
      processing = false
    }
  }

  const timer = setInterval(() => void processOne(), PROVIDER_WORKER_INTERVAL_MS)
  timer.unref?.()
  void processOne()
  return true
}

export function isProviderSyncWorkerStarted() {
  return Boolean(globalThis.__registeredBacklogProviderSyncWorkerStarted)
}
