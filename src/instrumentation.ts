import type { Instrumentation } from "next"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDetailSyncWorker } = await import("@/lib/sync/detail-worker")
    startDetailSyncWorker()
    const { startProviderSyncWorker } = await import("@/lib/sync/provider-worker")
    startProviderSyncWorker()
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  console.error("Next.js request error", {
    error,
    request,
    context,
  })
}
